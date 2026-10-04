// 强制更新管理器 (force-update.js)
// 下载并校验完整新版本，保留旧版本，空闲时由用户刷新切换。

const ForceUpdater = (() => {

  // 直接从当前文档收集入口资源，避免模块拆分后维护一份易遗漏的硬编码清单。
  let updating = false;
  function isBusy() {
    return (typeof currentApiController !== 'undefined' && currentApiController) || window.activeSettingsWrites > 0
      || document.querySelector('[data-saving="true"], .is-saving')
      || (window.GenerationAdjustments && Object.keys(window.state?.chats || {}).some(id => window.GenerationAdjustments.isBusy(id)))
      || document.getElementById('chat-input')?.value.trim()
      || (typeof fontBusy !== 'undefined' && (fontBusy || fontReading));
  }
  async function refreshUpdatedPage() {
    if (isBusy()) throw new Error('请先等待回复和保存完成，并发送或保留输入内容，再刷新更新。');
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.waiting) {
      const worker = registration.waiting;
      await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => { channel.port1.close(); reject(new Error('更新切换超时，请重试。')); }, 10000);
        channel.port1.onmessage = event => {
          clearTimeout(timer); channel.port1.close();
          if (event.data.ok) resolve(); else reject(new Error(event.data.message));
        };
        worker.postMessage({ type: 'ACTIVATE_UPDATE' }, [channel.port2]);
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { worker.removeEventListener('statechange', changed); reject(new Error('新版本尚未激活，请重试。')); }, 10000);
        const changed = () => {
          if (worker.state === 'activated' || worker.state === 'redundant') {
            clearTimeout(timer); worker.removeEventListener('statechange', changed);
            if (worker.state === 'activated') resolve();
            else reject(new Error('新版本未能激活，旧版本已保留。'));
          }
        };
        worker.addEventListener('statechange', changed); changed();
      });
    }
    location.reload();
  }

  // 创建备份提醒弹窗
  function _showBackupReminder() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'force-update-overlay';
      overlay.innerHTML = `
        <div class="force-update-modal">
          <div class="fu-icon">⚠️</div>
          <div class="fu-title">更新前请先备份</div>
          <div class="fu-desc">
            更新会替换所有代码文件，<br>
            <strong>不会影响</strong>你的聊天记录、角色数据等。<br><br>
            但为了安全，建议你先去<br>
            <span style="color:#ff6b81;">设置 → 数据管理 → 导出所有数据</span><br>
            备份一份再更新。
          </div>
          <div class="fu-buttons">
            <button class="fu-btn fu-btn-cancel" id="fu-cancel">取消</button>
            <button class="fu-btn fu-btn-backup" id="fu-go-backup">去备份</button>
            <button class="fu-btn fu-btn-confirm" id="fu-confirm">已备份，开始更新</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));

      document.getElementById('fu-cancel').onclick = () => {
        _closeOverlay(overlay);
        resolve('cancel');
      };
      document.getElementById('fu-go-backup').onclick = () => {
        _closeOverlay(overlay);
        // 触发导出
        const exportBtn = document.getElementById('export-data-btn');
        if (exportBtn) exportBtn.click();
        resolve('backup');
      };
      document.getElementById('fu-confirm').onclick = () => {
        _closeOverlay(overlay);
        resolve('confirm');
      };
    });
  }

  // 显示更新进度弹窗
  function _showProgress() {
    const overlay = document.createElement('div');
    overlay.id = 'force-update-progress';
    overlay.innerHTML = `
      <div class="force-update-modal">
        <div class="fu-icon">🔄</div>
        <div class="fu-title">正在更新...</div>
        <div class="fu-progress-bar"><div class="fu-progress-fill" id="fu-progress-fill"></div></div>
        <div class="fu-status" id="fu-status-text">准备中...</div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    return {
      setProgress(percent, text) {
        const fill = document.getElementById('fu-progress-fill');
        const status = document.getElementById('fu-status-text');
        if (fill) fill.style.width = percent + '%';
        if (status) status.textContent = text;
      },
      close() { _closeOverlay(overlay); }
    };
  }

  // 显示结果弹窗
  function _showResult(success, message) {
    const overlay = document.createElement('div');
    overlay.id = 'force-update-result';
    overlay.innerHTML = `
      <div class="force-update-modal">
        <div class="fu-icon">${success ? '✅' : '❌'}</div>
        <div class="fu-title">${success ? '更新完成' : '更新失败'}</div>
        <div class="fu-desc">${message}</div>
        <div class="fu-buttons">
          <button class="fu-btn fu-btn-confirm" id="fu-result-ok">${success ? '刷新页面' : '关闭'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    document.getElementById('fu-result-ok').onclick = async () => {
      if (!success) { _closeOverlay(overlay); return; }
      try { await refreshUpdatedPage(); }
      catch (error) { _closeOverlay(overlay); await showCustomAlert('暂不能刷新', error.message); }
    };
  }

  function _closeOverlay(el) {
    if (!el || !el.parentNode) return; // ★ 防重复调用
    el.classList.remove('show');
    setTimeout(() => {
      if (el.parentNode) el.remove(); // ★ 检查是否还在 DOM 里
    }, 300);
  }

  // 核心：执行强制更新
  async function _doUpdate() {
    if (updating) return;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      await showCustomAlert('无法自动更新', '请使用 HTTPS 网页或已安装的桌面入口。'); return;
    }
    updating = true;
    const progress = _showProgress();
    try {
      progress.setProgress(10, '正在检查完整版本…');
      const registration = await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      await registration.update();
      if (registration.installing) await new Promise((resolve, reject) => {
        const worker = registration.installing;
        const timer = setTimeout(() => { worker.removeEventListener('statechange', changed); reject(new Error('资源仍在下载，旧版本可继续使用；稍后重试。')); }, 120000);
        const changed = () => {
          if (worker.state === 'installed' || worker.state === 'activated') { clearTimeout(timer); worker.removeEventListener('statechange', changed); resolve(); }
          else if (worker.state === 'redundant') { clearTimeout(timer); worker.removeEventListener('statechange', changed); reject(new Error('新版本下载或校验失败，旧版本已保留。')); }
        };
        worker.addEventListener('statechange', changed); changed();
        progress.setProgress(40, '正在下载并校验完整资源，旧版本仍可使用…');
      });
      progress.close();
      _showResult(true, registration.waiting ? '完整新版本已准备好。回复和保存完成后，点击刷新切换。' : '版本检查完成，点击刷新重新打开。');
    } catch (error) {
      progress.close();
      await showCustomAlert('更新未完成', error.message || '旧版本和本地数据已保留，请稍后重试。');
    } finally { updating = false; }
  }

  // 公开方法：检查更新（入口）
  async function checkUpdate() {
    const choice = await _showBackupReminder();
    if (choice === 'confirm') {
      await _doUpdate();
    }
    // cancel 和 backup 都不执行更新
  }

  return { checkUpdate };

})();
