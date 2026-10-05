const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function fixture(settings = {}) {
  const nodes = new Map(), writes = [], requests = [], notices = [], presets = new Map();
  function element(id = '', tagName = 'DIV') {
    const values = new Map(), priorities = new Map();
    return {
      id, tagName, value: '', textContent: '', innerHTML: '', checked: false, disabled: false,
      dataset: {}, children: [], listeners: {}, isConnected: true,
      style: { getPropertyValue: key => values.get(key) || '', getPropertyPriority: key => priorities.get(key) || '',
        setProperty(key, value, priority = '') { values.set(key, value); priorities.set(key, priority); },
        removeProperty(key) { values.delete(key); } },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      async emit(type, extra = {}) { for (const fn of this.listeners[type] || []) await fn({ target: this, ...extra }); },
      appendChild(child) { child.remove(); child.isConnected = true; child.parentNode = this; this.children.push(child); return child; },
      append(...children) { children.forEach(child => this.appendChild(child)); },
      after(child) { this.derived = child; }, remove() {
        this.isConnected = false;
        if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        this.parentNode = null;
      },
      querySelectorAll: () => [], closest: () => null, click() {}
    };
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, element(id)); return nodes.get(id); };
  const scopes = ['homeScreen', 'qq', 'cphone', 'myphone', 'worldBook', 'douban', 'alipay', 'settings', 'other'].map(key => {
    const node = element(`scope-${key}`, 'INPUT'); node.dataset.scope = key; return node;
  });
  const table = {
    where() { return { equals() { return { toArray: async () => [...presets.values()] }; }, first: async () => undefined }; },
    async get(id) { return presets.get(id); }, async add(value) { presets.set(presets.size + 1, value); },
    async update(id, value) { Object.assign(presets.get(id), value); }, async delete(id) { presets.delete(id); }
  };
  const c = { console, URL, setTimeout, clearTimeout,
    state: { globalSettings: { id: 'main', unrelated: { keep: true }, ...settings } },
    db: { globalSettings: { async put(value) { writes.push(JSON.parse(JSON.stringify(value))); } }, appearancePresets: table },
    document: { body: element('body'), head: element('head'), baseURI: 'https://app.example/', styleSheets: [],
      getElementById: get, createElement: tag => element('', tag.toUpperCase()), querySelectorAll: selector => selector.includes('font-scope-list') ? scopes : [] },
    dynamicFontStyle: element('dynamic-font-style', 'STYLE'),
    async fetch(url) {
      requests.push(url);
      throw Error('字体保存不应发起下载请求');
    },
    FileReader: class { readAsDataURL(file) { this.result = file.data; queueMicrotask(() => this.onload()); } },
    showToast: (message, kind) => notices.push({ message, kind }),
    showCustomPrompt: async () => '字体预设', showCustomConfirm: async () => true,
    showChoiceModal: async () => 'discard', showScreen: id => { c.screen = id; }
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(source('modules/data/custom-fonts.js'), c);
  vm.runInContext(source('modules/settings/font-presets.js'), c);
  c.bindFontSettingsEvents();
  c.openFontSettings();
  return { c, get, scopes, writes, requests, notices, presets, element,
    fontStyles: () => c.document.head.children.filter(style => style.isConnected),
    run: code => vm.runInContext(code, c), async flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); } };
}

test('旧备份字号恢复到控件和预览；预览开关和事件绑定保持正常', async () => {
  const f = fixture({ globalFontSize: 12 });
  f.get('font-preview-toggle').checked = true; await f.get('font-preview-toggle').emit('change');
  assert.equal(f.get('font-preview-container').style.display, 'block');
  assert.equal(f.get('font-preview').style.fontSize, '12px');
  assert.equal(f.get('font-size-slider').value, 12);
  assert.equal(f.get('font-size-value').textContent, '12');
  assert.equal(f.c.state.globalSettings.globalFontSize, 12);
  f.get('font-preview-toggle').checked = false; await f.get('font-preview-toggle').emit('change');
  assert.equal(f.get('font-preview-container').style.display, 'none');
  f.c.bindFontSettingsEvents(); assert.equal(f.get('save-font-btn').listeners.click.length, 1);
});

test('字号编辑只更新草稿和预览，保存失败保留旧值，重启恢复已保存字号', async () => {
  const f = fixture({ globalFontSize: 20 });
  await f.c.applyCustomFont('');
  const previousCss = f.c.dynamicFontStyle.textContent;
  f.get('font-size-slider').value = '24'; await f.get('font-size-slider').emit('input');
  assert.equal(f.get('font-size-value').textContent, '24');
  assert.equal(f.get('font-preview').style.fontSize, '24px');
  assert.equal(f.c.state.globalSettings.globalFontSize, 20);
  assert.equal(f.c.dynamicFontStyle.textContent, previousCss);
  const put = f.c.db.globalSettings.put;
  f.c.db.globalSettings.put = async () => { throw Error('quota'); };
  assert.equal(await f.c.saveFontSettings(), false);
  assert.equal(f.c.state.globalSettings.globalFontSize, 20);
  assert.equal(f.c.dynamicFontStyle.textContent, previousCss);
  assert.equal(f.run('getFontDraft().globalFontSize'), 24);
  f.c.db.globalSettings.put = put;
  assert.equal(await f.c.saveFontSettings(), true);
  const restarted = fixture(JSON.parse(JSON.stringify(f.writes.at(-1))));
  await restarted.c.applyCustomFont('');
  assert.equal(restarted.get('font-size-slider').value, 24);
  assert.match(restarted.c.dynamicFontStyle.textContent, /body\{font-size:24px;\}/);
  await restarted.get('reset-font-size-btn').emit('click');
  assert.equal(restarted.run('getFontDraft().globalFontSize'), 16);
  assert.equal(restarted.c.state.globalSettings.globalFontSize, 24);
  assert.equal(await restarted.c.saveFontSettings(), true);
  assert.equal(restarted.c.dynamicFontStyle.textContent, '');
});

test('部分字号范围只设置选中页面，范围恢复保留其他字号和来源', async () => {
  const f = fixture({ globalFontSize: 22, fontScope: { all: false, qq: true } });
  await f.c.applyCustomFont('');
  assert.match(f.c.dynamicFontStyle.textContent, /#chat-list-screen[^{}]+\{font-size:22px;\}/);
  assert.doesNotMatch(f.c.dynamicFontStyle.textContent, /body\{|#home-screen\{|#chat-input/);
  f.get('font-size-slider').value = '26'; await f.get('font-size-slider').emit('input');
  await f.c.saveFontPreset();
  assert.equal([...f.presets.values()].at(-1).value.globalFontSize, 26);
  assert.equal(f.c.state.globalSettings.globalFontSize, 22);
  const all = fixture({ globalFontSize: 20 });
  await all.c.applyCustomFont('');
  const next = all.c.normalizeFontSettings(all.c.state.globalSettings);
  next.fontScope.all = false; next.fontScope.qq = false;
  await all.c.resetFontSettings(next, 'restored');
  assert.equal(all.c.state.globalSettings.globalFontSize, 20);
  assert.match(all.c.dynamicFontStyle.textContent, /#chat-list-screen[^{}]+\{font-size:16px;\}/);
  assert.match(all.c.dynamicFontStyle.textContent, /#home-screen\{font-size:20px;\}/);
});

test('本地字体默认字号 16 在启动恢复，范围设置及旧字段均可读取', async () => {
  const f = fixture({ fontLocalData: 'data:font/ttf;base64,AQ==', globalFontSize: 16 });
  await f.c.applyCustomFont('');
  assert.equal(f.requests.length, 0); assert.equal(f.fontStyles().length, 1);
  assert.match(f.fontStyles()[0].textContent, /src:url\("data:font\/ttf;base64,AQ=="\)/);
  assert.match(f.c.dynamicFontStyle.textContent, /ephone-user-font/);
  assert.equal(f.c.normalizeFontSettings(f.c.state.globalSettings).fontSourceMode, 'local');
  const startup = source('src/js-bundles/event-bindings-a/global-controls-and-music.jsfrag');
  assert.match(startup, /if \(state.globalSettings\) void applyCustomFont/);
});

test('清空链接做预览不清除正式字体；预览与正式字体不同来源时互不影响', async () => {
  const f = fixture({ fontUrl: 'https://fonts.example/old.woff2' });
  await f.c.applyCustomFont(f.c.state.globalSettings.fontUrl);
  const before = f.c.dynamicFontStyle.textContent;
  f.get('font-preview-toggle').checked = true;
  await f.c.applyCustomFont('', true);
  assert.equal(f.c.dynamicFontStyle.textContent, before);
  await f.c.applyCustomFont('https://fonts.example/new.woff2', true);
  assert.equal(f.c.dynamicFontStyle.textContent, before);
  assert.match(f.get('font-preview').style.fontFamily, /ephone-user-font-2/);
  assert.equal(f.c.state.globalSettings.fontUrl, 'https://fonts.example/old.woff2');
});

test('链接保存及预设保存不依赖网络、字体 API 或验证，兼容相对地址和旧链接', async () => {
  for (const url of ['fonts/legacy.ttf', '/fonts/a.woff2', 'not-a-url', 'https://fonts.example/404', 'https://fonts.example/webpage', 'https://fonts.example/broken', 'data:font/ttf;base64,AQ==', 'blob:https://app.example/font']) {
    const f = fixture({ fontUrl: 'https://fonts.example/valid' });
    await f.c.applyCustomFont(f.c.state.globalSettings.fontUrl);
    f.run(`getFontDraft().fontUrl=${JSON.stringify(url)};getFontDraft().fontSourceMode='url'`);
    assert.equal(await f.c.saveFontSettings(), true, url);
    assert.equal(f.writes.length, 1);
    assert.equal(f.c.state.globalSettings.fontUrl, url);
    assert.match(f.c.dynamicFontStyle.textContent, /ephone-user-font/);
    await f.c.saveFontPreset();
    assert.equal([...f.presets.values()].at(-1).value.fontUrl, url);
    assert.equal(f.requests.length, 0);
    assert.match(f.get('font-load-status').textContent, /预设已保存/);
  }
});

test('保存失败保留正式状态和草稿；成功保存合并最新无关字段，连续保存复用字体', async () => {
  const f = fixture();
  f.run("getFontDraft().fontSourceMode='url';getFontDraft().fontUrl='https://fonts.example/a';getFontDraft().globalFontSize=20");
  f.c.db.globalSettings.put = async () => { throw Error('quota'); };
  assert.equal(await f.c.saveFontSettings(), false);
  assert.equal(f.c.state.globalSettings.fontUrl, undefined); assert.equal(f.run('getFontDraft().globalFontSize'), 20);
  f.c.state.globalSettings.otherChanged = 'latest';
  f.c.db.globalSettings.put = async value => f.writes.push(value);
  assert.equal(await f.c.saveFontSettings(), true);
  assert.equal(f.writes[0].otherChanged, 'latest'); assert.deepEqual(f.writes[0].unrelated, { keep: true });
  assert.equal(f.c.state.globalSettings.globalFontSize, 20); assert.match(f.c.dynamicFontStyle.textContent, /body\{font-size:20px;\}/);
  assert.doesNotMatch(f.c.dynamicFontStyle.textContent, /--user-font-scale/);
  assert.equal(await f.c.saveFontSettings(), true); assert.equal(f.requests.length, 0);
  assert.equal(f.fontStyles().length, 1);
});

test('保存锁阻止重复提交，写入期间继续编辑不会污染保存快照', async () => {
  const f = fixture(), url = 'https://fonts.example/slow'; let release;
  f.c.db.globalSettings.put = async value => {
    await new Promise(resolve => { release = resolve; }); f.writes.push(value);
  };
  f.run(`getFontDraft().fontSourceMode='url';getFontDraft().fontUrl=${JSON.stringify(url)}`);
  const saving = f.c.saveFontSettings();
  assert.equal(await f.c.saveFontSettings(), false);
  f.get('font-preview-toggle').checked = true;
  for (let i = 0; i < 5; i++) await f.c.applyCustomFont(`https://fonts.example/preview-${i}`, true);
  f.get('font-url-input').value = 'https://fonts.example/edited'; await f.get('font-url-input').emit('input');
  release(); assert.equal(await saving, true);
  assert.equal(f.c.state.globalSettings.globalFontSize, 16); assert.equal(f.run('getFontDraft().fontUrl'), 'https://fonts.example/edited');
  assert.equal(f.writes.length, 1); assert.equal(f.get('save-font-btn').disabled, false);
  const family = f.run('fontActiveFamily');
  assert.ok(f.fontStyles().some(style => style.textContent.includes(family)));
  const next = f.c.normalizeFontSettings(f.c.state.globalSettings);
  next.fontScope.all = false; next.fontScope.qq = false;
  f.c.db.globalSettings.put = async value => f.writes.push(value);
  await f.c.resetFontSettings(next, 'restored');
  assert.equal(f.run('fontActiveFamily'), family);
});

test('字体链接中的引号、反斜线和换行不会破坏 CSS，预览切换释放闲置样式', async () => {
  const f = fixture({ fontUrl: 'fonts/active.ttf' });
  await f.c.applyCustomFont('fonts/active.ttf');
  const active = f.fontStyles()[0];
  f.get('font-preview-toggle').checked = true;
  const url = 'fonts/a"\\\n.ttf';
  await f.c.applyCustomFont(url, true);
  assert.ok(f.fontStyles().at(-1).textContent.includes('a\\22 \\5c \\a .ttf'));
  assert.equal(f.fontStyles().at(-1).textContent.includes('\n'), false);
  for (let i = 0; i < 6; i++) await f.c.applyCustomFont(`fonts/preview-${i}.ttf`, true);
  assert.equal(active.isConnected, true);
  assert.equal(f.fontStyles().length, 3);
  assert.equal(f.c.state.globalSettings.fontUrl, 'fonts/active.ttf');
  await f.c.resetToDefaultFont();
  assert.equal(f.fontStyles().length, 0);
});

test('快速切换字体只展示最后一次结果，关闭预览后继续编辑不改状态', async () => {
  const f = fixture(), slow = 'https://fonts.example/slow';
  f.get('font-preview-toggle').checked = true;
  const older = f.c.applyCustomFont(slow, true);
  await f.c.applyCustomFont('https://fonts.example/new', true);
  const family = f.get('font-preview').style.fontFamily;
  await older; assert.equal(f.get('font-preview').style.fontFamily, family);
  f.get('font-preview-toggle').checked = false; await f.get('font-preview-toggle').emit('change');
  const status = f.get('font-load-status').textContent;
  await f.c.applyCustomFont('https://fonts.example/closed', true);
  assert.equal(f.get('font-load-status').textContent, status);
  assert.equal(f.requests.length, 0);
});

test('本地上传只改变草稿，读取失败和超限保留原字体，可切回网络并清除', async () => {
  const f = fixture({ fontUrl: 'https://fonts.example/existing' });
  const input = f.get('font-local-file-input');
  input.files = [{ name: '字体.woff2', size: 1024, data: 'data:font/woff2;base64,AQ==' }];
  await input.emit('change');
  assert.equal(f.c.state.globalSettings.fontLocalData, undefined); assert.equal(f.run('getFontDraft().fontSourceMode'), 'local');
  assert.equal(f.get('font-local-filename').textContent, '字体.woff2'); assert.equal(f.get('font-url-input').disabled, true);
  const reader = f.c.FileReader;
  f.c.FileReader = class { readAsDataURL() { this.onerror(); } };
  input.files = [{ name: '坏文件.ttf', size: 12 }]; await input.emit('change');
  f.c.FileReader = reader;
  assert.equal(f.run('getFontDraft().fontLocalName'), '字体.woff2');
  input.files = [{ name: '大字体.ttf', size: 11 * 1024 * 1024 }]; await input.emit('change');
  assert.equal(f.run('getFontDraft().fontLocalName'), '字体.woff2');
  await f.get('font-local-clear-btn').emit('click');
  assert.equal(f.run('getFontDraft().fontSourceMode'), 'url'); assert.equal(f.get('font-url-input').disabled, false);
  assert.equal(f.c.state.globalSettings.fontUrl, 'https://fonts.example/existing');
});

test('部分范围恢复保留未选区域、本地字体和无关配置；全部恢复清理加载资源', async () => {
  const f = fixture({ fontLocalData: 'data:font/ttf;base64,AQ==', globalFontSize: 20, fontScope: { all: true } });
  await f.c.applyCustomFont('');
  const next = f.c.normalizeFontSettings(f.c.state.globalSettings); next.fontScope.all = false; next.fontScope.qq = false;
  assert.equal(await f.c.resetFontSettings(next, 'restored'), true);
  assert.equal(f.c.state.globalSettings.fontLocalData, 'data:font/ttf;base64,AQ==');
  assert.equal(f.c.state.globalSettings.fontScope.homeScreen, true); assert.equal(f.c.state.globalSettings.fontScope.other, true);
  assert.match(f.c.dynamicFontStyle.textContent, /#chat-list-screen[^{}]+\{--user-font-family:'bulangni'/);
  assert.equal(f.requests.length, 0);
  await f.c.resetToDefaultFont();
  assert.equal(f.c.state.globalSettings.globalFontSize, 16); assert.equal(f.c.state.globalSettings.fontLocalData, '');
  assert.equal(f.fontStyles().length, 0); assert.equal(f.c.state.globalSettings.unrelated.keep, true);
  assert.equal(f.run('fontLoadCache.size'), 0); assert.equal(f.c.dynamicFontStyle.textContent, '');
});

test('真实范围恢复入口支持本地字体，必须选择区域，取消不污染共享弹窗', async () => {
  const f = fixture({ fontLocalData: 'data:font/ttf;base64,AQ==', globalFontSize: 16 });
  await f.c.applyCustomFont('');
  let resolve;
  f.c.showCustomConfirm = () => new Promise(done => { resolve = done; });
  const pending = f.c.resetFontByScope();
  const confirm = f.get('custom-modal-confirm');
  assert.equal(confirm.disabled, true);
  const choices = f.get('custom-modal-body').children.at(-1);
  const qq = choices.children[1].children[0]; qq.checked = true;
  await choices.emit('change', { target: qq }); assert.equal(confirm.disabled, false);
  resolve(true); await pending;
  assert.equal(f.c.state.globalSettings.fontScope.qq, false); assert.equal(f.c.state.globalSettings.fontScope.homeScreen, true);
  const canceled = f.c.resetFontByScope(); assert.equal(confirm.disabled, true);
  resolve(false); await canceled; assert.equal(confirm.disabled, false);
  assert.equal(f.c.state.globalSettings.fontScope.homeScreen, true);
});

test('离线启动恢复链接和旧字号，重新加载绕过缓存且保留原链接，全部重置清理样式', async () => {
  const url = 'https://fonts.example/offline?token=abc#font';
  const f = fixture({ fontUrl: url, globalFontSize: 20 });
  await f.c.applyCustomFont(url);
  assert.equal(f.c.state.globalSettings.fontUrl, url); assert.match(f.c.dynamicFontStyle.textContent, /body\{font-size:20px;\}/);
  assert.doesNotMatch(f.c.dynamicFontStyle.textContent, /--user-font-scale/);
  const active = f.fontStyles()[0];
  await f.get('font-reload-btn').emit('click');
  assert.equal(f.get('font-preview-toggle').checked, true);
  const reloaded = f.fontStyles().at(-1);
  assert.match(reloaded.textContent, /token=abc&_ephone_font_reload=[^"#]+#font/);
  assert.equal(active.isConnected, true);
  assert.equal(f.c.state.globalSettings.fontUrl, url);
  assert.equal(await f.c.saveFontSettings(), true);
  assert.equal(active.isConnected, false);
  assert.equal(f.c.state.globalSettings.fontUrl, url);
  await f.c.resetToDefaultFont();
  assert.equal(f.fontStyles().length, 0); assert.equal(f.c.state.globalSettings.fontUrl, '');
  assert.equal(f.get('font-preview').style.fontFamily.includes('ephone-user-font'), false);
  assert.equal(f.requests.length, 0);
});

test('旧链接预设只替换来源；完整预设支持本地数据和范围与默认字体', async () => {
  const f = fixture({ fontLocalData: 'data:font/ttf;base64,AQ==', globalFontSize: 22 });
  f.presets.set(1, { id: 1, name: '旧字体', type: 'font', value: 'https://fonts.example/legacy' });
  f.get('font-preset-select').value = '1'; await f.c.handleFontPresetSelectionChange();
  assert.equal(f.run('getFontDraft().fontSourceMode'), 'url'); assert.equal(f.run('getFontDraft().globalFontSize'), 22);
  assert.equal(f.run('getFontDraft().fontLocalData'), 'data:font/ttf;base64,AQ==');
  f.presets.set(2, { id: 2, name: '本地', type: 'font', value: { fontLocalData: 'data:font/ttf;base64,Ag==', fontLocalName: 'saved.ttf', globalFontSize: 18, fontScope: { all: false, qq: false } } });
  f.get('font-preset-select').value = '2'; await f.c.handleFontPresetSelectionChange();
  assert.equal(f.run('getFontDraft().fontSourceMode'), 'local'); assert.equal(f.run('getFontDraft().fontScope.qq'), false);
  await f.c.saveFontPreset();
  const saved = [...f.presets.values()].at(-1).value;
  assert.equal(saved.fontLocalName, 'saved.ttf'); assert.equal(saved.globalFontSize, 18);
  assert.equal(f.writes.length, 0); assert.equal(f.c.state.globalSettings.globalFontSize, 22);
});

test('过期的预设读取不覆盖新编辑；有效字号保留，无效字号使用旧默认值', async () => {
  const f = fixture(); let release;
  f.c.db.appearancePresets.get = async () => { await new Promise(resolve => { release = resolve; }); return { value: 'https://fonts.example/stale' }; };
  f.get('font-preset-select').value = '1'; const pending = f.c.handleFontPresetSelectionChange();
  f.get('font-url-input').value = 'https://fonts.example/new'; await f.get('font-url-input').emit('input'); release(); await pending;
  assert.equal(f.run('getFontDraft().fontUrl'), 'https://fonts.example/new'); assert.equal(f.run('getFontDraft().globalFontSize'), 16);
  assert.equal(f.c.normalizeFontSettings({ globalFontSize: 'wrong' }).globalFontSize, 16);
  assert.equal(f.c.normalizeFontSettings({ globalFontSize: 99 }).globalFontSize, 16);
  assert.equal(f.c.normalizeFontSettings({ fontScope: { all: false, qq: true } }).fontScope.other, false);
  assert.equal(f.c.normalizeFontSettings({ fontScope: { all: false, qq: true } }).fontScope.homeScreen, false);
});

test('退出可继续编辑、放弃或保存；保存失败留在页面，原有目标入口保留', async () => {
  const f = fixture(); f.get('font-url-input').value = 'https://fonts.example/edited'; await f.get('font-url-input').emit('input');
  f.c.showChoiceModal = async () => 'stay'; await f.c.leaveFontSettings(); assert.equal(f.c.screen, undefined);
  f.c.showChoiceModal = async () => 'save'; f.c.db.globalSettings.put = async () => { throw Error('quota'); };
  await f.c.leaveFontSettings(); assert.equal(f.c.screen, undefined);
  f.c.showChoiceModal = async () => 'discard'; await f.c.leaveFontSettings('wallpaper-screen');
  assert.equal(f.c.screen, 'wallpaper-screen'); assert.equal(f.c.state.globalSettings.globalFontSize, undefined);
});

test('恢复字体与字号继承，不扫描页面、不改写节点、不创建监听器', async () => {
  const f = fixture({ fontUrl: 'https://fonts.example/font', globalFontSize: 10 });
  f.c.document.styleSheets = new Proxy([], { get() { throw Error('不得扫描样式表'); } });
  f.c.MutationObserver = class { constructor() { throw Error('不得监听页面'); } };
  await f.c.applyCustomFont('https://fonts.example/font');
  assert.match(f.c.dynamicFontStyle.textContent, /font-family/);
  assert.match(f.c.dynamicFontStyle.textContent, /body\{font-size:10px;\}/);
  assert.doesNotMatch(f.c.dynamicFontStyle.textContent, /--user-font-scale|#chat-input/);
  assert.equal(f.c.document.body.derived, undefined);
  assert.match(source('modules/chat/interface-core.js'), /const fontSize = chat.settings.fontSize \|\| 13/);
  assert.match(source('src/html/chat-settings-extra.html'), /id="chat-font-size-slider" min="12" max="20"/);
});

test('原有字体入口和全部控件保留；没有浏览器原生 alert；源码与加载资源关联', () => {
  const html = source('src/html/appearance-and-thoughts.html');
  for (const id of ['font-preview', 'font-preview-toggle', 'font-preset-select', 'save-font-preset-btn', 'delete-font-preset-btn', 'font-url-input', 'font-local-upload-btn', 'font-local-clear-btn', 'font-local-file-input', 'font-scope-all', 'reset-font-scope-btn', 'reset-font-btn', 'font-size-slider', 'font-size-value', 'reset-font-size-btn']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('data-scope="other"'));
  assert.doesNotMatch(source('modules/data/custom-fonts.js') + source('modules/settings/font-presets.js'), /\balert\(/);
  assert.match(source('src/js-bundles/event-bindings-b/chat-settings.jsfrag'), /bindFontSettingsEvents\(\)/);
});

test('字体重新加载使用新地址，普通加载保留原链接', async () => {
  const f = fixture({ fontUrl: 'https://fonts.example/a.woff2' });
  await f.c.applyCustomFont('https://fonts.example/a.woff2');
  assert.doesNotMatch(f.fontStyles()[0].textContent, /_ephone_font_reload/);
  await f.get('font-reload-btn').emit('click');
  assert.match(f.fontStyles().at(-1).textContent, /_ephone_font_reload/);
  assert.equal(f.c.state.globalSettings.fontUrl, 'https://fonts.example/a.woff2');
});

test('旧外观导入按旧字段恢复来源，新外观保留显式默认选择和本地文件信息', () => {
  const s = source('modules/appearance-theme.js');
  const start = s.indexOf('          Object.assign(state.globalSettings, data);');
  const end = s.indexOf('          await db.globalSettings.put(state.globalSettings);', start);
  const block = s.slice(start, end);
  for (const [data, expected] of [
    [{ fontUrl: 'https://fonts.example/legacy', fontLocalData: '' }, 'url'],
    [{ fontUrl: '', fontLocalData: 'data:font/ttf;base64,AQ==' }, 'local'],
    [{ fontUrl: 'https://fonts.example/inactive', fontLocalData: '', fontSourceMode: 'default' }, 'default'],
    [{ fontLocalData: 'data:font/ttf;base64,AQ==', fontLocalName: 'saved.ttf', fontLocalSize: 42, fontSourceMode: 'local' }, 'local']
  ]) {
    const c = { data, state: { globalSettings: { fontSourceMode: 'default', fontLocalData: '', fontLocalName: 'old.ttf', unrelated: true } } };
    vm.createContext(c); vm.runInContext(block, c);
    assert.equal(c.state.globalSettings.fontSourceMode, expected);
    assert.equal(c.state.globalSettings.fontLocalName, data.fontLocalName || '');
    assert.equal(c.state.globalSettings.unrelated, true);
  }
});
