// ============================================================
// chat/return-to-chat-sync.js
// 修复：等回复的时候点进「聊天设置」等子页面，再点回来，聊天记录会少几句，
//       退出聊天再重新点进去才恢复。
//
// 原因：离开聊天界面时，showScreen 会调用 disposeChatMessageDom()（离屏资源释放），
//       把 #chat-messages 里的消息节点整个清空、并让旧的异步渲染失效；
//       但从子页面点「‹」返回时只是切了个界面，没有重新渲染。
//       于是：离开这段时间到的新消息（这时不算"正在看这个聊天"，不会插进页面）、
//       以及被作废的渲染，都不会出现在页面上，只有返回之后才追加的消息能看到。
//
// 做法：从聊天界面切去别的界面（不是聊天列表/主屏幕）之后再切回同一个聊天时，
//       如果消息区已经被清空或落后于聊天记录，就重新渲染一次，并保留"正在输入..."状态。
//       不改动 chat.history 和原有的释放逻辑。
// ============================================================
(function () {
  'use strict';

  const CHAT_SCREEN = 'chat-interface-screen';
  // 从这些界面回到聊天，走的是 openChat（它自己会渲染），这里不用重复渲染
  const SKIP_WHEN_LEFT_TO = new Set(['chat-list-screen', 'home-screen', 'voice-call-screen', 'video-call-screen']);

  let leftInfo = null; // { chatId, to }

  function lastVisibleMessage(chat) {
    const history = (chat && chat.history) || [];
    for (let i = history.length - 1; i >= 0; i--) {
      if (!history[i].isHidden) return history[i];
    }
    return null;
  }

  function messagesAreOutOfSync(chat) {
    const container = document.getElementById('chat-messages');
    if (!container || !chat) return false;
    const last = lastVisibleMessage(chat);
    if (!last) return false; // 没有可见消息，没什么可补的
    // 消息区被清空了，或者最后一条消息的气泡不在里面
    if (!container.querySelector('.message-wrapper')) return true;
    if (last.timestamp !== undefined && !container.querySelector(`[data-timestamp="${last.timestamp}"]`)) return true;
    return false;
  }

  async function resyncChat(chatId) {
    const chat = state.chats[chatId];
    if (!chat || state.activeChatId !== chatId) return;
    if (typeof renderChatInterface !== 'function') return;
    if (!messagesAreOutOfSync(chat)) return;

    // 记住"对方正在输入..."状态，重新渲染会把顶栏文字重置
    const header = document.getElementById('chat-header-title');
    const typingText = header && header.classList.contains('typing-status') ? header.textContent : null;
    const groupTyping = document.getElementById('typing-indicator');
    const groupTypingShown = groupTyping && groupTyping.style.display === 'block' ? groupTyping.textContent : null;

    try {
      await renderChatInterface(chatId);
    } catch (e) {
      console.warn('[返回聊天] 重新渲染失败', e);
      return;
    }

    if (state.activeChatId !== chatId) return;
    if (typingText && header) {
      header.textContent = typingText;
      header.classList.add('typing-status');
    }
    if (groupTypingShown && groupTyping) {
      groupTyping.textContent = groupTypingShown;
      groupTyping.style.display = 'block';
    }

    // 离开的这段时间里到的消息，现在已经看到了，不再算未读
    if (chat.unreadCount) {
      chat.unreadCount = 0;
      try { await db.chats.put(chat); } catch (e) { /* 不影响显示 */ }
      if (typeof renderChatList === 'function') renderChatList();
    }
  }

  function install() {
    if (typeof window.showScreen !== 'function' || window.showScreen.__returnToChatSyncHooked) return false;
    const original = window.showScreen;
    const wrapped = function (screenId, ...rest) {
      let current = null;
      try {
        const active = document.querySelector('.screen.active');
        current = active ? active.id : null;
        if (current === CHAT_SCREEN && screenId !== CHAT_SCREEN && state.activeChatId) {
          leftInfo = { chatId: state.activeChatId, to: screenId };
        }
      } catch (e) { /* 只是记录，出错不影响切换界面 */ }

      const result = original.apply(this, [screenId, ...rest]);

      try {
        if (screenId === CHAT_SCREEN && current !== CHAT_SCREEN && leftInfo) {
          const info = leftInfo;
          leftInfo = null;
          if (state.activeChatId === info.chatId && !SKIP_WHEN_LEFT_TO.has(info.to)) {
            resyncChat(info.chatId);
          }
        }
      } catch (e) {
        console.warn('[返回聊天] 检查消息同步失败', e);
      }
      return result;
    };
    wrapped.__returnToChatSyncHooked = true;
    window.showScreen = wrapped;
    return true;
  }

  if (!install()) {
    document.addEventListener('DOMContentLoaded', install);
    window.addEventListener('load', install);
  }
})();
