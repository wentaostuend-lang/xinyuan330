const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('../modules/rendering-rule-engine');
const read = file => fs.readFileSync(require('node:path').join(__dirname, '..', file), 'utf8');

function runtime() {
  const posts = [];
  class Worker {
    constructor(url) { this.url = url; }
    postMessage(message) {
      posts.push(message);
      setImmediate(() => this.onmessage({ data: { id: message.id, result: engine.run(message.input, message.rules, message.chatId, message.meta, message.stage, message.preview) } }));
    }
    terminate() {}
  }
  const c = { window: { RenderingRuleEngine: engine }, Worker, URL, console, setTimeout, clearTimeout,
    location: { href: 'https://example.test/', protocol: 'https:' },
    document: { currentScript: { src: 'https://example.test/modules/rendering-rule-runtime.js?v=release' } } };
  vm.createContext(c); vm.runInContext(read('modules/rendering-rule-runtime.js'), c);
  return { r: c.window.RenderingRuleRuntime, posts };
}

test('50 条无规则消息和不适用规则不创建 Worker 任务', async () => {
  const { r, posts } = runtime();
  const rule = { isEnabled: true, chatId: ['other'], regex: '.', template: '', options: { matchMode: 'regex' } };
  for (let i = 0; i < 50; i++) {
    assert.equal((await r.run(`消息${i}`, [], 'chat')).content, `消息${i}`);
    assert.equal((await r.run(`消息${i}`, [rule], 'chat')).content, `消息${i}`);
  }
  assert.equal(posts.length, 0);
});

test('旧版规则同步返回，输出与旧替换表达式一致；新增正则继续隔离', async () => {
  const { r, posts } = runtime();
  const rule = { isEnabled: true, chatId: ['global'], regex: '你好', template: '您好' };
  for (const input of ['你好', '你好你好', '其他文字']) assert.equal((await r.run(input, [rule], 'chat')).content, input.replace(/你好/g, '您好'));
  assert.equal(posts.length, 0);
  assert.equal((await r.run('你好', [{ ...rule, options: { matchMode: 'regex' } }], 'chat')).content, '您好');
  assert.equal(posts.length, 1);
});

test('随机规则保持逐次执行，大文本缓存按容量淘汰', async () => {
  const { r, posts } = runtime();
  const rule = { isEnabled: true, chatId: ['global'], regex: 'a', template: 'b', options: { matchMode: 'regex' } };
  for (let i = 0; i < 40; i++) await r.run('a'.repeat(30000) + i, [rule], 'chat');
  await r.run('a'.repeat(30000) + 0, [rule], 'chat');
  assert.equal(posts.length, 41);
  const reroll = { ...rule, options: { ...rule.options, randomMode: 'reroll' } };
  await r.run('a', [reroll], 'chat'); await r.run('a', [reroll], 'chat');
  assert.equal(posts.length, 43);
});

test('规则编译缓存按容量淘汰大型配置，重新编译不改变结果', () => {
  const first = { isEnabled: true, chatId: ['global'], regex: '编译缓存0', template: '替换结果', options: { matchMode: 'text', samples: [{ input: 'x'.repeat(40000) }] } };
  const initial = engine.compileRule(first);
  assert.equal(engine.compileRule(first), initial);
  for (let index = 1; index <= 40; index++) engine.compileRule({ ...first, regex: `编译缓存${index}` });
  assert.notEqual(engine.compileRule(first), initial);
  assert.equal(engine.run('编译缓存0', [first], 'chat').content, '替换结果');
  const oversized = { ...first, options: { ...first.options, samples: [{ input: 'x'.repeat(1100000) }] } };
  assert.notEqual(engine.compileRule(oversized), engine.compileRule(oversized));
  assert.equal(engine.run('编译缓存0', [oversized], 'chat').content, '替换结果');
});

test('正文复制在点击任务中直接写剪贴板，不等待规则或数据库', async () => {
  const source = read('modules/message-actions.js');
  const fn = source.slice(source.indexOf('  async function copyMessageContent()'), source.indexOf('  async function copyMessageTimestamp()'));
  let written;
  const c = { activeMessageTimestamp: 1, state: { activeChatId: 'c', chats: { c: { history: [{ timestamp: 1, content: '原文' }] } } },
    window: { applyRenderingRulesForStage() { throw Error('不得调用'); } },
    navigator: { clipboard: { writeText(value) { written = value; return Promise.resolve(); } } },
    showCustomAlert: async () => {}, hideMessageActions() {} };
  vm.createContext(c); vm.runInContext(fn, c);
  const copying = c.copyMessageContent();
  assert.equal(written, '原文'); await copying;
});

test('旧 TimeAwareness 对象缺少新方法时，主请求使用基础时间', () => {
  const source = read('src/js-bundles/trigger-response/request-setup.jsfrag');
  const snippet = source.slice(source.indexOf('      const now = new Date();', source.indexOf('let callTranscriptContext')), source.indexOf('      let systemPrompt, messagesPayload;'));
  const c = { window: { TimeAwareness: { buildContext() {} } }, chat: { settings: { timeZone: 'Asia/Shanghai' } }, getTimeOfDayGreeting: () => '早上' };
  vm.createContext(c); vm.runInContext(snippet + '\nglobalThis.result = { currentTime, timeOfDayGreeting };', c);
  assert.ok(c.result.currentTime); assert.equal(c.result.timeOfDayGreeting, '早上');
});

test('设置保存成功和失败均解锁；事务排队超时后不发生迟到写入', async () => {
  let release, calls = 0;
  const writes = [];
  const table = { async put(record) { writes.push(record); } };
  const c = { setTimeout, clearTimeout, Dexie: { currentTransaction: { abort() {} } }, window: { db: {
    async transaction(mode, target, callback) {
      if (++calls === 1) await new Promise(resolve => { release = resolve; });
      return callback();
    }
  } } };
  vm.createContext(c); vm.runInContext(read('modules/data/settings-storage.js'), c);
  await assert.rejects(c.window.saveSettingsRecord(table, { value: 'old' }, 5), /超时/);
  await c.window.saveSettingsRecord(table, { value: 'new' });
  release(); await new Promise(setImmediate);
  assert.deepEqual(writes, [{ value: 'new' }]); assert.equal(c.window.activeSettingsWrites, 0);
});

test('更新切换即使 waiting 已清空，也等待原 Worker 激活后才刷新', async () => {
  let listener, reloaded = false;
  const worker = { state: 'installed', addEventListener(_, callback) { listener = callback; }, removeEventListener() {},
    postMessage(_, ports) {
      registration.waiting = null;
      this.state = 'activating';
      setImmediate(() => ports[0].onmessage({ data: { ok: true } }));
      setTimeout(() => { assert.equal(reloaded, false); this.state = 'activated'; listener?.(); }, 20);
    } };
  const registration = { waiting: worker };
  class MessageChannel { constructor() { this.port1 = { close() {} }; this.port2 = this.port1; } }
  const c = { window: { state: { chats: {} } }, document: { querySelector: () => null, getElementById: () => null },
    navigator: { serviceWorker: { getRegistration: async () => registration } }, MessageChannel, setTimeout, clearTimeout,
    location: { reload() { assert.equal(worker.state, 'activated'); reloaded = true; } } };
  vm.createContext(c);
  vm.runInContext(read('force-update.js').replace('return { checkUpdate };', 'return { checkUpdate, refreshUpdatedPage };') + '\nwindow.updater=ForceUpdater;', c);
  await c.window.updater.refreshUpdatedPage(); assert.equal(reloaded, true);
});

test('公开站点的自定义端口保留 PWA；本地预览只清理本应用缓存和作用域', async () => {
  const registered = [], deleted = [], removed = [];
  const c = { console: { log() {} }, URL, window: {}, document: { baseURI: 'https://app.example:8443/111/' },
    location: { hostname: 'app.example', protocol: 'https:', port: '8443' }, caches: { keys: async () => ['ephone-cache-old', 'other-app'], delete: name => deleted.push(name) },
    navigator: { serviceWorker: { register: async url => { registered.push(url); return { scope: 'https://app.example:8443/111/' }; },
      getRegistrations: async () => [{ scope: c.document.baseURI, unregister: () => removed.push('own') }, { scope: 'https://app.example:8443/other/', unregister: () => removed.push('other') }] } } };
  c.window.caches = c.caches;
  vm.createContext(c); vm.runInContext(read('modules/bootstrap/register-service-worker.js'), c);
  await new Promise(setImmediate); assert.equal(registered.length, 1); assert.equal(deleted.length, 0);
  c.location.hostname = '127.0.0.1'; vm.runInContext(read('modules/bootstrap/register-service-worker.js'), c);
  await new Promise(setImmediate); assert.deepEqual(deleted, ['ephone-cache-old']); assert.deepEqual(removed, ['own']);
});
