const avatar = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="pink"/></svg>');
window.defaultAvatar = window.defaultMyGroupAvatar = window.defaultGroupMemberAvatar = avatar;
window.state = { activeChatId: 'test', globalSettings: { chatRenderWindow: 50 }, apiConfig: {}, qzoneSettings: {}, chats: {
  test: { id: 'test', name: '测试角色', settings: {}, relationship: { status: 'friend' }, history: [] }
} };
window.currentRenderedCount = 0; window.isLoadingMoreMessages = false; window.isSelectionMode = false;
window.STICKER_REGEX = /^https?:\/\/.*\.gif$/;
window.db = { chats: { put: async () => {} } };
window.applyButtonOrder = window.cleanupWaimaiTimers = window.exitSelectionMode = window.applyScopedCss = window.stopChatMessageTtsOnly = window.playNotificationSound = () => {};
window.formatTimestamp = timestamp => String(timestamp);
window.processMentions = text => text;
window.applyRenderingRulesDetailed = async content => ({ content });
window.escapeHTML = window.renderSafeRichText = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
window.parseMarkdown = window.escapeHTML;
window.addLongPressListener = () => {};
window.showCustomAlert = async () => {};
window.createSystemTimestampElement = () => document.createElement('div');
window.showLoader = container => { if (!container.querySelector('.loader-container')) { const loader = document.createElement('div'); loader.className = 'loader-container'; container.prepend(loader); } };
window.hideLoader = container => container.querySelector('.loader-container')?.remove();
window.switchToCharScreen = () => {};
