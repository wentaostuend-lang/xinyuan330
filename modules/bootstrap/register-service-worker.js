(function registerEPhoneServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // 本地开发/预览不启用离线缓存；公开站点的自定义端口仍支持 PWA。
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(location.hostname) ||
                  location.hostname.startsWith('192.168.') ||
                  location.hostname.startsWith('10.') ||
                  /^172\.(1[6-9]|2\d|3[01])\./.test(location.hostname) ||
                  location.protocol === 'file:';

  if (isLocal) {
    // 只清理本应用的预览缓存与作用域，不碰同源其他应用。
    const scope = new URL('./', document.baseURI).href;
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const reg of registrations) {
        if (reg.scope === scope) reg.unregister();
      }
    });
    if ('caches' in window) {
      caches.keys().then(names => {
        for (const name of names) {
          if (name.startsWith('ephone-')) caches.delete(name);
        }
      });
    }
    console.log('[Dev] 本地开发环境：已禁用 Service Worker 并清除缓存，刷新即可加载最新文件');
    return;
  }

  navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
    .then(registration => {
      console.log('ServiceWorker 注册成功，作用域为:', registration.scope);
    })
    .catch(error => {
      console.error('ServiceWorker 注册失败:', error);
    });
})();
