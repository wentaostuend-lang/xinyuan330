// ============================================================
// js/fullscreen-guard.js
// 全面屏 + 防误触（来自你的油猴脚本「全面屏优化+网页防误触 V3.3」，改为项目内置）
//
// 和油猴脚本相比的调整：
//  - 视口 viewport-fit=cover、apple-mobile-web-app-* 、theme-color 项目 HTML 里本来就有，不再重复注入。
//  - 「运行时用 Blob 重写 manifest」改成直接修改 manifest.json（display: fullscreen）。
//    原因：Blob 形式的 manifest 里相对路径的图标会解析失败；直接改文件更稳，
//    安装/添加到主屏幕后自然就是全屏。已安装过的用户需要重新「添加到主屏幕」才会生效。
//  - 下面两部分逻辑保持和油猴脚本一致：侧滑返回拦截、首次点击请求通知权限。
// ============================================================
(function () {
  'use strict';

  // ---------- 侧滑返回防误触（仅在已安装的全屏/独立窗口模式下生效） ----------
  const isStandaloneMode =
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone;

  // 注入一条虚假历史记录（防误触护盾）
  function injectFakeHistoryShield() {
    window.history.pushState({ page: 'ephone-lock' }, '', '');
  }

  // 触发侧滑返回时的拦截逻辑
  function onPopState() {
    if (confirm('🐾 刚刚触发了返回手势！确定要退出吗？')) {
      // 用户点击确定：卸载雷达，放行真正退出
      window.removeEventListener('popstate', onPopState);
      window.history.back();
    } else {
      // 关键修复：不能在当前同步周期内立刻塞回记录。
      // 延迟 60 毫秒，等浏览器退出动画和历史栈状态稳定后再异步补回护盾，
      // 这样才能无限次、无死角地拦截。
      setTimeout(injectFakeHistoryShield, 60);
    }
  }

  if (isStandaloneMode) {
    const bootstrap = () => {
      injectFakeHistoryShield();
      window.addEventListener('popstate', onPopState);
    };
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', bootstrap);
    } else {
      bootstrap();
    }
  }

  // ---------- 主动唤起并固化通知权限（首次点击时申请一次） ----------
  document.addEventListener('click', function requestNotifyPermission() {
    if (window.Notification && Notification.permission !== 'granted') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          console.log('✅ 全面屏脚本：已成功为当前网页提权，通知权限拉满！');
        }
      });
    }
    document.removeEventListener('click', requestNotifyPermission);
  }, { once: true });
})();
