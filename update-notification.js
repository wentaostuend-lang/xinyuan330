// 更新弹窗管理器
class UpdateNotification {
  constructor() {
    this.storageKey = 'update_notification_dismissed';
    this.currentVersion = '9.18'; // 当前更新版本号
    this.countdownSeconds = 5;
    this.countdownInterval = null;
  }

  // 检查是否应该显示弹窗
  shouldShow() {
    const dismissedVersion = localStorage.getItem(this.storageKey);
    // 如果没有记录或者记录的版本不是当前版本，则显示弹窗
    return !dismissedVersion || dismissedVersion !== this.currentVersion;
  }

  // 创建弹窗HTML
  createNotificationHTML() {
    const updateContent = `
      <div style="margin-bottom: 15px;"><button id="update-clear-global-css-btn" style="width: 100%; padding: 10px; background: #ff4d4f; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">清除全局自定义CSS (防错位)</button></div>
      <div class="update-item important-note">新手必看：DC解答区 <a href="https://discord.com/channels/1379304008157499423/1443544486796853248" target="_blank" style="color: #4A9EFF;">点击前往</a></div>
      <div class="update-item important-note">强烈建议：安装到主屏幕以获得最佳体验</div>
      <div class="update-item important-note">注意：首次打开最好使用魔法</div>
      <div class="update-item tips">有任何问题请通过DC私信联系 <a href="https://discord.com/users/1353222930875551804" target="_blank" style="color: #4A9EFF;">点击前往</a>，其他渠道可能无法及时回复</div>
      <div class="update-item important-note">使用提示：请留意 API 设置页面的小人菜单，新增功能入口都在这里哦。</div>
      <div class="update-divider">9.18 本次更新</div>
      <div class="update-item">1. 修复简洁 API 模式及部分美化场景下的卡顿问题，优化整体使用流畅度。</div>
      <div class="update-item important-note">2. 感谢 <strong>穗穗 / 笨蛋小姐</strong> 提供及公开分享的相关代码与实现思路。本次参考并结合当前版本进行了适配，包括情侣空间、iOS 安全区、语音电话、本地音乐资源处理等部分内容。由于涉及内容较多，不在此逐项列出，可前往「引用第三方」中查看具体引用范围及来源。</div>
      <div class="update-item">3. 优化备份与记忆管理：修复分类备份 BUG；新增独立的「分类备份」入口、记忆导出类型选择和记忆单独导入功能。</div>
      <div class="update-item">4. 新增真实语音发送与语音对话功能，安卓设备同样可以使用。</div>
      <div class="update-item">5. 修复酒馆角色卡导入世界书时，默认关闭的世界书条目可能丢失的问题。</div>
      <div class="update-item">6. 优化向量记忆与结构化记忆，修复部分处理异常，优化写入、读取及转换流程，提升大量记忆情况下的稳定性。</div>
      <div class="update-item">7. 修复导入书籍时部分书名出现乱码的问题。</div>
      <div class="update-item">8. 优化向量记忆的多语言兼容，更好地处理不同语言的记忆内容。</div>
      <div class="update-item">9. 全面优化双语功能：可分别设置原文输出与翻译方式，自由开关双语，并在高级设置中自定义双语提示词。</div>
      <div class="update-item">10. 优化时间感知，改进角色对当前时间、日期及时间变化的理解，并优化相关信息注入与处理。</div>
      <div class="update-item">11. 优化邮件系统：新增向陌生人发送邮件、邮件回信及主动发送信件，优化邮件往来与交互逻辑。</div>
      <div class="update-item">12. 修复心声中 HTML / CSS 内容较多时可能导致页面卡顿的问题。</div>
      <div class="update-item">13. 优化番茄钟功能及部分交互体验。</div>
      <div class="update-item">14. 新增「小火人 / 火花」互动功能。</div>
      <div class="update-item">15. 新增提示词分层管理，支持按用途拆分、编辑查找及控制作用范围；分层设计灵感来源于 <strong>1900老师</strong>，感谢分享与授权。</div>
      <div class="update-item">16. 修复部分情况下旁白内容被错误识别成角色本人发言的问题。</div>
      <div class="update-item">17. 优化部分页面 UI 与移动端使用体验，包括弹窗、安全区域及不同屏幕尺寸下的显示。</div>
      <div class="update-item">18. 进一步适配 iOS 安全区与动态视口，优化顶部、底部安全区域及键盘弹出后的页面高度处理，减少页面被遮挡或弹窗超出屏幕。</div>
      <div class="update-item">19. 优化世界书页面显示与操作体验，调整列表、编辑页面和部分按钮样式。</div>
      <div class="update-item">20. 情侣空间新增历史奖励检查：支持预览、逐条确认修复，避免历史奖励重复补发。</div>
      <div class="update-item">21. 优化部分公共组件、语言设置、时间感知、角色关系及提示词相关模块，减少不同功能之间互相影响的问题。</div>
      <div class="update-item tips">本次更新涉及内容较多，如果出现遗漏或异常欢迎反馈。</div>
    `;

    return `
      <div id="update-notification-overlay">
        <div id="update-notification-modal">
          <img src="https://img.baibai.cv/f/mwOEhK/retouch-2026013121094970.png" class="update-decoration-img">
          <div class="update-notification-header">
            <div class="update-title">9.18 更新</div>
          </div>
          
          <div class="update-notification-body">
            <div class="update-content">
              ${updateContent}
            </div>
          </div>
          
          <div class="update-notification-footer">
            <button id="update-btn-got-it" class="update-btn update-btn-primary" disabled>
              我知道了 (<span id="countdown">${this.countdownSeconds}</span>s)
            </button>
            <button id="update-btn-dont-show" class="update-btn update-btn-secondary" disabled>
              下次不要提示
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // 开始倒计时
  startCountdown() {
    let timeLeft = this.countdownSeconds;
    const countdownElement = document.getElementById('countdown');
    const btnGotIt = document.getElementById('update-btn-got-it');
    const btnDontShow = document.getElementById('update-btn-dont-show');

    this.countdownInterval = setInterval(() => {
      timeLeft--;
      if (countdownElement) {
        countdownElement.textContent = timeLeft;
      }

      if (timeLeft <= 0) {
        clearInterval(this.countdownInterval);
        // 启用按钮
        if (btnGotIt) {
          btnGotIt.disabled = false;
          btnGotIt.innerHTML = '我知道了';
          btnGotIt.classList.add('enabled');
        }
        if (btnDontShow) {
          btnDontShow.disabled = false;
          btnDontShow.classList.add('enabled');
        }
      }
    }, 1000);
  }

  // 关闭弹窗
  closeNotification() {
    const overlay = document.getElementById('update-notification-overlay');
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.remove();
      }, 300);
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  // 点击"我知道了"
  handleGotIt() {
    // 不保存任何内容，下次刷新还会显示
    this.closeNotification();
  }

  // 点击"下次不要提示"
  handleDontShow() {
    // 保存当前版本号，下次不再显示
    localStorage.setItem(this.storageKey, this.currentVersion);
    this.closeNotification();
  }

  // 绑定事件
  bindEvents() {
    const btnGotIt = document.getElementById('update-btn-got-it');
    const btnDontShow = document.getElementById('update-btn-dont-show');

    if (btnGotIt) {
      btnGotIt.addEventListener('click', () => {
        if (!btnGotIt.disabled) {
          this.handleGotIt();
        }
      });
    }

    if (btnDontShow) {
      btnDontShow.addEventListener('click', () => {
        if (!btnDontShow.disabled) {
          this.handleDontShow();
        }
      });
    }

    // 清除全局 CSS 按钮事件
    const clearCssBtn = document.getElementById('update-clear-global-css-btn');
    if (clearCssBtn) {
      clearCssBtn.addEventListener('click', () => {
        // 1. 更新内存状态
        if (window.state && window.state.globalSettings) {
          window.state.globalSettings.globalCss = '';
          // 2. 更新数据库
          if (window.db && window.db.globalSettings) {
            window.db.globalSettings.put({ id: 1, ...window.state.globalSettings }).catch(console.error);
          }
        }
        // 3. 更新输入框（如果存在）
        const globalCssInput = document.getElementById('global-css-input');
        if (globalCssInput) globalCssInput.value = '';
        // 4. 清除页面上的样式标签
        const styleEl = document.getElementById('global-custom-style');
        if (styleEl) styleEl.textContent = '';
        
        // 5. 调用 applyGlobalCss 确保应用空样式
        if (typeof window.applyGlobalCss === 'function') {
          window.applyGlobalCss('');
        }
        
        // 6. 重新渲染聊天消息 (如果有激活的聊天)，确保气泡等恢复默认
        if (window.state && window.state.activeChatId && typeof window.renderMessages === 'function') {
            const chat = window.state.chats[window.state.activeChatId];
            if (chat) window.renderMessages(chat);
        }

        clearCssBtn.textContent = '✅ 已清除全局CSS';
        clearCssBtn.style.background = '#52c41a';
      });
    }

    // 防止点击弹窗内容时关闭
    const modal = document.getElementById('update-notification-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // 🎯 紧急跳过功能：连续点击3次屏幕跳过弹窗
    this.setupEmergencySkip();
  }

  // 紧急跳过功能实现
  setupEmergencySkip() {
    const overlay = document.getElementById('update-notification-overlay');
    if (!overlay) return;

    let clickCount = 0;
    let clickTimer = null;

    overlay.addEventListener('click', (e) => {
      // 只在点击遮罩层时触发（不是点击弹窗内容）
      if (e.target !== overlay) return;

      clickCount++;

      // 清除之前的定时器
      if (clickTimer) {
        clearTimeout(clickTimer);
      }

      // 如果2秒内点击3次，触发跳过
      if (clickCount >= 3) {
        console.log('[UpdateNotification] 检测到紧急跳过手势');
        this.emergencySkip();
        clickCount = 0;
        return;
      }

      // 2秒后重置计数
      clickTimer = setTimeout(() => {
        clickCount = 0;
      }, 2000);
    });
  }

  // 紧急跳过方法
  emergencySkip() {
    // 显示跳过提示（可选）
    const modal = document.getElementById('update-notification-modal');
    if (modal) {
      const skipHint = document.createElement('div');
      skipHint.textContent = '已跳过更新通知';
      skipHint.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255, 184, 197, 0.95);
        color: white;
        padding: 12px 24px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10;
        animation: skipHintAnim 0.4s ease;
      `;
      modal.appendChild(skipHint);

      // 添加动画样式
      if (!document.querySelector('#skip-hint-style')) {
        const style = document.createElement('style');
        style.id = 'skip-hint-style';
        style.textContent = `
          @keyframes skipHintAnim {
            from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
            to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          }
        `;
        document.head.appendChild(style);
      }
    }

    // 0.5秒后关闭弹窗
    setTimeout(() => {
      this.closeNotification();
    }, 500);
  }

  // 显示弹窗
  show() {
    if (!this.shouldShow()) {
      return;
    }

    // 创建弹窗
    const notificationHTML = this.createNotificationHTML();
    document.body.insertAdjacentHTML('beforeend', notificationHTML);

    // 绑定事件
    this.bindEvents();

    // 开始倒计时
    this.startCountdown();

    // 添加显示动画
    setTimeout(() => {
      const overlay = document.getElementById('update-notification-overlay');
      if (overlay) {
        overlay.classList.add('show');
      }
    }, 100);
  }

  // 初始化
  init() {
    // 等待DOM加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.show();
      });
    } else {
      this.show();
    }
  }
}

// 创建实例并初始化
const updateNotification = new UpdateNotification();
updateNotification.init();
