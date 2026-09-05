(function registerEPhoneServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then(registration => {
      console.log('ServiceWorker 注册成功，作用域为:', registration.scope);
    })
    .catch(error => {
      console.error('ServiceWorker 注册失败:', error);
    });
})();
