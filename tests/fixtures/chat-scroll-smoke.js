renderChatList = () => {};
const chat = state.chats.test, container = document.getElementById('chat-messages'), results = document.getElementById('results');
let editingTimestamp = null, pendingEdit = null;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const settled = async () => { await wait(180); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); };
const bottom = () => Math.abs(container.scrollHeight - container.clientHeight - container.scrollTop) < 3;
const wrapper = timestamp => container.querySelector(`.message-bubble[data-timestamp="${timestamp}"]`)?.closest('.message-wrapper');
const visible = () => Array.from(container.querySelectorAll('.message-wrapper')).find(el => el.getBoundingClientRect().bottom > container.getBoundingClientRect().top + 5);
function check(condition, description) { if (!condition) throw new Error(description); results.textContent += '\n通过：' + description; }
async function reset(count = 150) {
  chat.history = Array.from({ length: count }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', type: 'text', content: `第 ${index + 1} 条消息：测试聊天阅读位置。` + (index % 6 === 0 ? '\n多行内容\n更多内容' : ''), timestamp: index + 1 }));
  showScreen('chat-interface-screen'); await renderChatInterface('test'); await settled();
}
document.getElementById('save').onclick = () => { pendingEdit = saveEditedMessage(editingTimestamp, document.getElementById('edit-content').value); };
document.getElementById('recall').onclick = () => { pendingEdit = recallMessage(editingTimestamp, true); };
document.getElementById('latest').onclick = () => renderChatInterface('test');
document.getElementById('older').onclick = async () => { container.scrollTop = 0; await loadMoreMessages(); await settled(); container.scrollTop = 250; };
document.querySelectorAll('.back').forEach(button => { button.onclick = () => showScreen('chat-interface-screen'); });
container.addEventListener('scroll', () => { if (container.scrollTop < 1 && !isLoadingMoreMessages && chat.history.length > currentRenderedCount) loadMoreMessages(); });

document.getElementById('run').onclick = async () => {
  const button = document.getElementById('run'); button.disabled = true; results.textContent = '检查进行中';
  try {
    const resume = new URLSearchParams(location.search).get('resume');
    if (resume !== 'cancel') {
    for (const width of [320, 640]) {
      const resumeRecall = width === 320 && resume === 'recall';
      document.getElementById('phone-screen').style.width = width + 'px'; await reset();
      if (!resumeRecall) check(bottom(), width + 'px 长聊天进入后停在底部');
      editingTimestamp = chat.history.at(-1).timestamp; document.getElementById('edit-content').value = '编辑后的最后一条\n增加一行\n再增加一行';
      document.getElementById('save').click(); await pendingEdit; await settled();
      if (!resumeRecall) check(bottom(), width + 'px 底部编辑后仍停在底部');
      container.scrollTop = 0; await loadMoreMessages(); await settled(); container.scrollTop = 250;
      const anchor = visible(), offset = anchor.getBoundingClientRect().top;
      editingTimestamp = Number(anchor.querySelector('.message-bubble').dataset.timestamp);
      document.getElementById('edit-content').value = '修改旧消息\n第一行\n第二行\n第三行';
      document.getElementById('save').click(); await pendingEdit; await settled();
      if (!resumeRecall) check(Math.abs(wrapper(editingTimestamp).getBoundingClientRect().top - offset) < 3, width + 'px 旧消息编辑后保持阅读位置');
      const recallOffset = wrapper(editingTimestamp).getBoundingClientRect().top;
      document.getElementById('recall').click(); await pendingEdit; await settled();
      check(Math.abs(wrapper(editingTimestamp).getBoundingClientRect().top - recallOffset) < 3, width + 'px 撤回后原阅读位置不跳位');
    }
    for (const screen of ['browser-screen', 'todo-list-screen', 'shopping-screen', 'cart-screen', 'chat-settings-screen', 'long-term-memory-screen']) {
      await reset(); showScreen(screen); check(container.children.length === 0, screen + ' 离开聊天释放消息 DOM');
      document.querySelector('#' + screen + ' .back').click(); await settled();
      check(container.querySelectorAll('.message-wrapper').length === 50 && bottom(), screen + ' 返回聊天恢复消息并停在底部');
    }
    await reset(); await openRedditDetail({});
    document.querySelector('#char-browser-article-screen .back-btn').click(); await settled();
    check(container.querySelectorAll('.message-wrapper').length === 50 && bottom(), 'Reddit 详情加载失败后也可以返回最新消息');
    }
    await reset(); container.scrollTop = 0; const loading = loadMoreMessages(); container.scrollTop = 600;
    const cancelAnchor = visible(), cancelTimestamp = Number(cancelAnchor.querySelector('.message-bubble').dataset.timestamp), cancelOffset = cancelAnchor.getBoundingClientRect().top;
    await loading; await settled();
    check(container.querySelectorAll('.message-wrapper').length === 50 && Math.abs(wrapper(cancelTimestamp).getBoundingClientRect().top - cancelOffset) < 3, '历史加载期间滚走，迟到加载不覆盖阅读位置');
    await reset(4); editingTimestamp = 4; document.getElementById('edit-content').value = '短聊天修改';
    document.getElementById('save').click(); await pendingEdit; await settled(); check(bottom(), '短聊天编辑后正常显示');
    await reset(); await renderChatContext('test', 31); await settled();
    check(state.isViewingHistoryMode, '历史搜索定位模式正常');
    editingTimestamp = 31; document.getElementById('edit-content').value = '历史模式下修改消息';
    document.getElementById('save').click(); await pendingEdit; await settled(); check(state.isViewingHistoryMode, '编辑历史消息不退出历史模式');
    document.getElementById('latest').click(); await settled(); check(!state.isViewingHistoryMode && bottom(), '返回最新按钮恢复原有行为');
    document.getElementById('phone-screen').style.width = '390px';
    results.textContent += '\n完成：全部浏览器检查通过。';
  } catch (error) { results.textContent += '\n失败：' + error.stack; }
  finally { button.disabled = false; }
};
reset().catch(error => { results.textContent = error.stack; });
