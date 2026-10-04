const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function fixture() {
  class Element {
    constructor(id = '', height = 0) {
      this.id = id; this.height = height; this.children = []; this.dataset = {}; this.style = { setProperty() {} };
      this.classes = new Set(); this.classList = {
        add: name => this.classes.add(name), remove: name => this.classes.delete(name),
        contains: name => this.classes.has(name), toggle() {}
      };
      this.clientHeight = id === 'chat-messages' ? 200 : 0; this.clientTop = 0; this.top = 0;
    }
    get scrollHeight() { return this.children.reduce((sum, child) => sum + child.height, 0); }
    get scrollTop() { return this.top; }
    set scrollTop(value) { this.top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); }
    appendChild(child) {
      if (child.fragment) { child.children.forEach(item => this.appendChild(item)); return child; }
      child.parent = this; this.children.push(child); return child;
    }
    prepend(child) {
      const children = child.fragment ? child.children : [child];
      children.forEach(item => { item.parent = this; }); this.children.unshift(...children);
    }
    insertBefore(child, target) {
      child.parent = this; const index = this.children.indexOf(target);
      this.children.splice(index < 0 ? this.children.length : index, 0, child);
    }
    replaceChildren() { this.children = []; this.top = 0; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); }
    removeAttribute() {}
    addEventListener() {}
    getBoundingClientRect() {
      const top = this.parent ? this.parent.getBoundingClientRect().top + this.parent.children.slice(0, this.parent.children.indexOf(this)).reduce((sum, child) => sum + child.height, 0) - this.parent.scrollTop : 0;
      return { top, bottom: top + (this.clientHeight || this.height) };
    }
    querySelectorAll(selector) {
      const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
      if (selector === '*') return descendants;
      if (selector.includes('message-wrapper')) return descendants.filter(child => child.classes.has('message-wrapper'));
      if (selector.includes('message-bubble')) return descendants.filter(child => child.dataset.timestamp !== undefined);
      if (selector.includes('img')) return descendants.filter(child => child.tagName === 'IMG');
      return [];
    }
    querySelector(selector) {
      if (selector === '.status-text') return new Element();
      if (selector === '.loader-container') return this.children.find(child => child.loader) || null;
      return this.querySelectorAll(selector)[0] || null;
    }
  }
  const ids = ['chat-messages', 'chat-interface-screen', 'chat-input-area', 'chat-lock-overlay', 'chat-lock-content', 'chat-header-title', 'chat-header-status', 'chat-header-title-wrapper', 'phone-screen', 'return-to-latest-btn', 'message-editor-modal'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  elements['chat-interface-screen'].classes.add('active');
  const history = Array.from({ length: 150 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', type: 'text', content: `message-${index}`, timestamp: index + 1 }));
  const chat = { id: 'a', name: '角色', settings: {}, relationship: { status: 'friend' }, history };
  const frames = [], timers = [], writes = [];
  const c = vm.createContext({ console, window: {},
    state: { activeChatId: 'a', chats: { a: chat }, globalSettings: { chatRenderWindow: 50 } },
    currentRenderedCount: 0, isLoadingMoreMessages: false,
    document: { getElementById: id => elements[id] || null, createElement: () => new Element(),
      createDocumentFragment: () => Object.assign(new Element(), { fragment: true }),
      querySelector: () => null, querySelectorAll: () => [] },
    applyButtonOrder() {}, cleanupWaimaiTimers() {}, exitSelectionMode() {}, applyScopedCss() {},
    requestAnimationFrame: fn => frames.push(fn), setTimeout: fn => timers.push(fn),
    showLoader(container) { const loader = new Element('', 0); loader.loader = true; container.prepend(loader); },
    hideLoader(container) { container.querySelector('.loader-container')?.remove(); },
    createSystemTimestampElement: () => new Element(),
    createMessageElement: async message => {
      if (message.isHidden) return null;
      const element = new Element('', 40 + (message.extraHeight || 0)); element.classes.add('message-wrapper');
      const bubble = new Element(); bubble.dataset.timestamp = String(message.timestamp); element.appendChild(bubble);
      if (message.image) { const image = new Element(); image.tagName = 'IMG'; image.complete = false; element.appendChild(image); }
      return element;
    },
    STICKER_REGEX: /^https?:\/\/.*\.gif$/, db: { chats: { put: async value => writes.push(JSON.parse(JSON.stringify(value))) } },
    showCustomAlert: async () => {}, playNotificationSound() {}
  });
  vm.runInContext(read('modules/chat/interface-core.js'), c);
  vm.runInContext(read('modules/message-actions.js'), c);
  const container = elements['chat-messages'];
  async function framesDone() {
    await new Promise(setImmediate);
    while (frames.length) { frames.splice(0).forEach(fn => fn()); await new Promise(setImmediate); }
  }
  async function render(options) { await c.renderChatInterface('a', options); await framesDone(); }
  async function finishLoad(pending) { timers.splice(0).forEach(fn => fn()); await pending; }
  const offset = message => container.querySelectorAll('.message-wrapper').find(el => el.querySelector('.message-bubble[data-timestamp]')?.dataset.timestamp === String(message.timestamp))?.getBoundingClientRect().top;
  return { c, chat, container, elements, framesDone, render, finishLoad, offset, writes };
}

test('整页重画期间不误加载历史，默认及底部编辑仍定位最新', async () => {
  const f = fixture(); await f.c.renderChatInterface('a');
  await f.c.loadMoreMessages(); assert.equal(f.c.currentRenderedCount, 50);
  await f.framesDone(); assert.equal(f.container.scrollTop, f.container.scrollHeight - 200);
  await f.c.window.saveEditedMessage(150, '修改后的最后消息'); await f.framesDone();
  assert.equal(f.container.scrollTop, f.container.scrollHeight - 200);
  assert.equal(f.chat.history.at(-1).content, '修改后的最后消息'); assert.equal(f.writes.length, 1);
});

test('普通编辑重排后续时间戳，仍保留正在阅读的旧消息位置和已加载窗口', async () => {
  const f = fixture(); await f.render(); f.container.scrollTop = 0;
  await f.finishLoad(f.c.loadMoreMessages()); f.container.scrollTop = 230;
  const anchor = f.chat.history[56], before = f.offset(anchor);
  await f.c.window.saveEditedMessage(f.chat.history[55].timestamp, '分块编辑文本'); await f.framesDone();
  assert.equal(f.offset(anchor), before); assert.equal(f.c.currentRenderedCount, 100);
  assert.equal(f.chat.history.length, 150);
});

test('删除当前可见消息后保留邻近消息位置', async () => {
  const f = fixture(); await f.render(); f.container.scrollTop = 230;
  const neighbor = f.chat.history[106], before = f.offset(neighbor);
  f.chat.history.splice(105, 1); await f.render({ preserveScroll: true });
  assert.equal(f.offset(neighbor), before);
});

test('数据库重新读取产生新对象后仍可按时间戳保留位置', async () => {
  const f = fixture(); await f.render(); f.container.scrollTop = 350;
  const before = f.offset(f.chat.history[108]);
  f.chat.history = JSON.parse(JSON.stringify(f.chat.history)); await f.render({ preserveScroll: true });
  assert.equal(f.offset(f.chat.history[108]), before);
});

test('编辑搜索定位的历史消息保留历史模式；返回最新仍使用原默认行为', async () => {
  const f = fixture(); await f.c.renderChatContext('a', 31);
  f.container.scrollTop = 350; const anchor = f.chat.history[14], before = f.offset(anchor);
  await f.c.window.saveEditedMessage(15, '修改历史消息'); await f.framesDone();
  assert.equal(f.c.state.isViewingHistoryMode, true); assert.equal(f.offset(f.chat.history[14]), before);
  assert.equal(f.elements['return-to-latest-btn'].style.display, 'block');
  await f.render(); assert.equal(f.c.state.isViewingHistoryMode, false);
  assert.equal(f.container.scrollTop, f.container.scrollHeight - 200);
});

test('历史加载等待期间用户离开顶部，不覆盖位置或错误推进计数', async () => {
  const f = fixture(); await f.render(); f.container.scrollTop = 0;
  const pending = f.c.loadMoreMessages(); f.container.scrollTop = 700; await f.finishLoad(pending);
  assert.equal(f.container.scrollTop, 700); assert.equal(f.c.currentRenderedCount, 50);
  assert.equal(f.c.isLoadingMoreMessages, false); assert.equal(f.container.querySelector('.loader-container'), null);
});

test('历史消息异步创建期间用户滚走，也丢弃迟到加载；正常上滑继续可用', async () => {
  const f = fixture(); await f.render(); f.container.scrollTop = 0;
  const create = f.c.createMessageElement; let changed = false;
  f.c.createMessageElement = async message => { if (!changed) { changed = true; f.container.scrollTop = 650; } return create(message); };
  await f.finishLoad(f.c.loadMoreMessages()); assert.equal(f.c.currentRenderedCount, 50); assert.equal(f.container.scrollTop, 650);
  f.c.createMessageElement = create; f.container.scrollTop = 0;
  await f.finishLoad(f.c.loadMoreMessages()); assert.equal(f.c.currentRenderedCount, 100);
  assert.equal(f.container.scrollTop, 2000);
});

test('旧聊天的加载在切换后失效，不写入新聊天', async () => {
  const f = fixture(); await f.render(); f.container.scrollTop = 0;
  const pending = f.c.loadMoreMessages(); f.c.state.activeChatId = 'b'; f.c.disposeChatMessageDom();
  await f.finishLoad(pending); assert.equal(f.container.children.length, 0); assert.equal(f.c.isLoadingMoreMessages, false);
});

test('图片加载迟到不把已经上滑的用户拉回底部', async () => {
  const f = fixture(); f.chat.history.at(-1).image = true; await f.render();
  const image = f.container.querySelectorAll('img')[0]; f.container.scrollTop = 300;
  image.onload(); await f.framesDone(); assert.equal(f.container.scrollTop, 300);
});

test('渲染或加载失败后不会留下无法继续加载的锁', async () => {
  const f = fixture(); const create = f.c.createMessageElement;
  f.c.createMessageElement = async () => { throw new Error('render failed'); };
  await assert.rejects(f.c.renderChatInterface('a'), /render failed/);
  f.c.createMessageElement = create; await f.render(); f.container.scrollTop = 0;
  f.c.createMessageElement = async () => { throw new Error('load failed'); };
  await assert.rejects(f.finishLoad(f.c.loadMoreMessages()), /load failed/);
  assert.equal(f.c.isLoadingMoreMessages, false); assert.equal(f.container.querySelector('.loader-container'), null);
});

test('补齐返回入口且已修好的返回只渲染一次；搜索和通话行为不变', () => {
  const source = read('modules/chat-list.js');
  const showScreenSource = source.slice(source.indexOf('  function showScreen('), source.indexOf('  window.updateListenTogetherIconProxy ='));
  for (const from of ['browser-screen', 'todo-list-screen', 'shopping-screen', 'cart-screen', 'chat-settings-screen', 'long-term-memory-screen', 'search-history-screen', 'voice-call-screen']) {
    let rendered = 0, messages = from === 'voice-call-screen' ? 50 : 0;
    const screens = [from, 'chat-interface-screen'].map(id => ({ id, active: id === from, classList: {} }));
    screens.forEach(screen => { screen.classList.add = () => { screen.active = true; }; screen.classList.remove = () => { screen.active = false; }; });
    const c = vm.createContext({ state: { activeChatId: 'a' }, window: { updateListenTogetherIconProxy() {} },
      document: { querySelector: () => screens.find(screen => screen.active), querySelectorAll: () => screens, getElementById: id => screens.find(screen => screen.id === id) },
      renderChatInterface() { rendered++; messages = 50; } });
    vm.runInContext(showScreenSource, c); c.showScreen('chat-interface-screen');
    const shouldRender = !['search-history-screen', 'voice-call-screen'].includes(from);
    assert.equal(rendered, shouldRender ? 1 : 0, from);
    if (shouldRender || from === 'voice-call-screen') assert.equal(messages, 50, from);
  }
});
