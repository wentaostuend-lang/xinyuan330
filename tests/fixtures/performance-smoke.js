const results = document.getElementById('results');
const report = text => { results.textContent += '\n' + text; };
const check = (value, text) => { if (!value) throw new Error(text); report('通过：' + text); };
navigator.serviceWorker.addEventListener('message', event => {
  if (event.data?.type === 'EPHONE_UPDATE_FAILED') report('安装错误详情：' + event.data.message);
});
document.getElementById('run').onclick = async () => {
  results.textContent = '开始浏览器测试';
  try {
    const started = performance.now();
    for (let index = 0; index < 50; index++) {
      const result = await RenderingRuleRuntime.run('消息' + index, [], 'test');
      if (result.content !== '消息' + index) throw new Error('空规则内容改变');
    }
    report(`通过：50 条空规则消息 ${ (performance.now() - started).toFixed(2) } ms`);
    const legacy = { isEnabled: true, chatId: ['global'], regex: '你好', template: '您好' };
    check((await RenderingRuleRuntime.run('你好你好', [legacy], 'test')).content === '您好您好', '旧规则结果与旧版一致');
    check((await RenderingRuleRuntime.run('你好', [{ ...legacy, options: { matchMode: 'regex' } }], 'test')).content === '您好', '真实 Worker 执行新正则');
    const bad = { ...legacy, regex: '(a+)+$', options: { matchMode: 'regex' } };
    const badInput = 'a'.repeat(35) + '!';
    const recovered = await RenderingRuleRuntime.run(badInput, [bad], 'test');
    check(recovered.content === badInput && recovered.warnings.length > 0, '失控正则终止并保留原文');
    applyFontSettings({ fontSourceMode: 'default', globalFontSize: 10 });
    check(!dynamicFontStyle.textContent.includes('font-size') && getComputedStyle(document.getElementById('chat-input')).fontSize === '16px', '旧字号数据不缩小页面，聊天输入框 16px');
    const database = window.db = new Dexie('ephone-performance-smoke');
    database.version(1).stores({ settings: 'id' });
    await database.open();
    await saveSettingsRecord(database.settings, { id: 'main', value: 'new' });
    check((await database.settings.get('main')).value === 'new' && activeSettingsWrites === 0, '真实 IndexedDB 保存成功并解锁');
    let aborted = false;
    try { await database.transaction('rw', database.settings, async () => {
      await database.settings.put({ id: 'main', value: 'rolled-back' });
      Dexie.currentTransaction.abort();
    }); } catch (_) { aborted = true; }
    check(aborted && (await database.settings.get('main')).value === 'new', '真实事务中止后保留原设置');
    database.close();
    report('浏览器功能测试完成');
  } catch (error) { report('失败：' + error.stack); }
};
document.getElementById('copy').onclick = async () => {
  activeMessageTimestamp = 1;
  report('点击时用户手势有效：' + navigator.userActivation.isActive);
  await copyMessageContent();
  report('复制调用完成');
};
document.getElementById('pwa').onclick = async () => {
  try {
    report('开始下载并校验发布资源');
    const registration = await navigator.serviceWorker.register('../../sw.js', { scope: '../../', updateViaCache: 'none' });
    await registration.update();
    report('注册状态：' + (registration.installing?.state || registration.waiting?.state || registration.active?.state));
    const waitForState = (worker, states) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { worker.removeEventListener('statechange', changed); reject(new Error('安装或激活超时')); }, 45000);
      const changed = () => {
        report('安装状态：' + worker.state);
        if (states.includes(worker.state) || worker.state === 'redundant') {
          clearTimeout(timeout); worker.removeEventListener('statechange', changed);
          if (worker.state === 'redundant') reject(new Error('安装失败：资源下载或校验未完成')); else resolve();
        }
      };
      worker.addEventListener('statechange', changed); changed();
    });
    if (registration.installing) await waitForState(registration.installing, ['installed', 'activated']);
    const worker = registration.waiting || registration.active;
    if (registration.waiting) await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('切换请求超时')); }, 10000);
      channel.port1.onmessage = event => {
        clearTimeout(timer); channel.port1.close();
        if (event.data.ok) resolve(); else reject(new Error(event.data.message));
      };
      worker.postMessage({ type: 'ACTIVATE_UPDATE' }, [channel.port2]);
    });
    if (worker?.state !== 'activated') await waitForState(worker, ['activated']);
    check(registration.active?.state === 'activated', '真实 Service Worker 已安装并激活');
    const names = await caches.keys();
    const releases = names.filter(name => name.startsWith('ephone-cache-'));
    check(releases.length > 0, '存在发布缓存');
    const cache = await caches.open(releases[releases.length - 1]);
    const keys = await cache.keys();
    check(keys.length > 300, '完整资源缓存数量 ' + keys.length);
    const engine = keys.find(key => new URL(key.url).pathname.endsWith('/modules/rendering-rule-engine.js'));
    check((await cache.match(engine)).ok, '缓存包含渲染引擎');
    report('缓存发布版本：' + new URL(engine.url).searchParams.get('v'));
    report('PWA 浏览器安装验证完成');
  } catch (error) { report('失败：' + error.stack); }
};
