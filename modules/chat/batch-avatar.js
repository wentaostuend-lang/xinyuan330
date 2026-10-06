// ============================================================
// chat/batch-avatar.js
// 批量设置头像：粘贴一串图片链接 → 自动识别并显示预览图 → 每张勾选要应用到哪个角色
//
// 入口：设置页的「批量设置头像」按钮、悬浮球菜单里的「批量设置头像」（也可以在控制台调用 openBatchAvatarModal()）。
// 注意：不放在聊天列表顶栏里——有些自定义 CSS 会按位置重排顶栏按钮，多一个按钮就会错位。
// 应用后写入：
//   单聊  角色头像 chat.settings.aiAvatar / 我的头像 chat.settings.myAvatar
//   群聊  群头像   chat.settings.groupAvatar
// 预览图用了 class="avatar"，加载成功时 avatar-guard.js 会顺手存一份小缩略图备份。
// ============================================================
(function () {
  'use strict';

  const MAX_URLS = 200;
  const LOAD_TIMEOUT_MS = 15000;
  let rows = [];      // { id, url, status: 'loading'|'ok'|'bad', info, chatId, target }
  let nextRowId = 1;
  let built = false;
  let detectTimer = null;

  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------- 识别链接
  function extractUrls(text) {
    const found = String(text || '').match(/https?:\/\/[^\s"'<>()\[\]{}，。；、！？]+/gi) || [];
    const seen = new Set();
    const urls = [];
    for (let u of found) {
      u = u.replace(/[.,;:!?)\]}>]+$/, ''); // 去掉结尾夹带的标点
      if (u.length < 12 || seen.has(u)) continue;
      seen.add(u);
      urls.push(u);
      if (urls.length >= MAX_URLS) break;
    }
    return urls;
  }

  // ---------------------------------------------------------- 可选的聊天列表
  function lastActivity(chat) {
    const h = chat.history || [];
    return h.length ? (h[h.length - 1].timestamp || 0) : 0;
  }

  function getChatOptions() {
    const list = Object.values(state.chats || {}).filter(c => c && c.id);
    list.sort((a, b) => lastActivity(b) - lastActivity(a));
    return list;
  }

  function currentAvatarOf(chat, target) {
    if (!chat) return '';
    if (chat.isGroup) return chat.settings?.groupAvatar || '';
    return (target === 'my' ? chat.settings?.myAvatar : chat.settings?.aiAvatar) || '';
  }

  // ---------------------------------------------------------- 界面
  function buildModal() {
    if (built) return;
    built = true;
    const modal = document.createElement('div');
    modal.id = 'batch-avatar-modal';
    modal.innerHTML = `
      <div class="ba-header">
        <span class="ba-btn" id="ba-cancel">取消</span>
        <span>批量设置头像</span>
        <span class="ba-btn disabled" id="ba-apply">应用 (0)</span>
      </div>
      <div class="ba-body">
        <textarea id="ba-input" placeholder="把图片链接粘贴到这里，一行一个，或者用空格、逗号隔开都行。会自动识别并在下面显示预览。"></textarea>
        <div class="ba-tools">
          <button class="ba-tool" id="ba-detect">识别链接</button>
          <button class="ba-tool" id="ba-auto">按聊天列表顺序自动分配</button>
          <button class="ba-tool" id="ba-unassign">全部取消分配</button>
          <button class="ba-tool" id="ba-clear">清空</button>
        </div>
        <div class="ba-summary" id="ba-summary"></div>
        <div id="ba-list"></div>
      </div>`;
    document.body.appendChild(modal);

    $('ba-cancel').addEventListener('click', closeModal);
    $('ba-apply').addEventListener('click', applyAll);
    $('ba-detect').addEventListener('click', detect);
    $('ba-input').addEventListener('input', () => { clearTimeout(detectTimer); detectTimer = setTimeout(detect, 600); });
    $('ba-input').addEventListener('paste', () => { clearTimeout(detectTimer); detectTimer = setTimeout(detect, 150); });
    $('ba-auto').addEventListener('click', autoAssign);
    $('ba-unassign').addEventListener('click', () => { rows.forEach(r => { r.chatId = ''; }); renderRows(); });
    $('ba-clear').addEventListener('click', () => { rows = []; $('ba-input').value = ''; renderRows(); });

    // 下拉框改变（事件委托）
    $('ba-list').addEventListener('change', e => {
      const rowEl = e.target.closest('.ba-row');
      if (!rowEl) return;
      const row = rows.find(r => r.id === Number(rowEl.dataset.rowId));
      if (!row) return;
      if (e.target.classList.contains('ba-chat')) {
        row.chatId = e.target.value;
        if (row.chatId) {
          const chat = state.chats[row.chatId];
          if (chat && chat.isGroup) row.target = 'group';
          else if (row.target === 'group') row.target = 'ai';
        }
        resolveConflicts(row);
      } else if (e.target.classList.contains('ba-target')) {
        row.target = e.target.value;
        resolveConflicts(row);
      }
      renderRows();
    });
  }

  // 同一个聊天的同一个位置只能对应一张图：后选的把先选的顶掉
  function resolveConflicts(changedRow) {
    if (!changedRow.chatId) return;
    rows.forEach(r => {
      if (r !== changedRow && r.chatId === changedRow.chatId && r.target === changedRow.target) r.chatId = '';
    });
  }

  function targetLabel(t) { return t === 'my' ? '我的头像' : t === 'group' ? '群头像' : '角色头像'; }

  function renderRows() {
    const list = $('ba-list');
    if (!list) return;
    const chats = getChatOptions();
    if (!rows.length) {
      list.innerHTML = '<div class="ba-empty">还没有识别到链接</div>';
    } else {
      list.innerHTML = rows.map((r, i) => {
        const chat = r.chatId ? state.chats[r.chatId] : null;
        const target = chat && chat.isGroup ? 'group' : (r.target || 'ai');
        const cur = chat ? currentAvatarOf(chat, target) : '';
        const canAssign = r.status === 'ok';
        const statusHtml = r.status === 'ok'
          ? `<div class="ba-status ok">✓ 加载成功${r.info ? ' · ' + esc(r.info) : ''}</div>`
          : r.status === 'bad'
            ? '<div class="ba-status bad">✕ 加载失败（链接失效、被图床拦截，或不是图片）</div>'
            : '<div class="ba-status">加载中…</div>';
        const options = ['<option value="">— 不应用 —</option>']
          .concat(chats.map(c => `<option value="${esc(c.id)}"${c.id === r.chatId ? ' selected' : ''}>${c.isGroup ? '👥 ' : ''}${esc(c.name || c.originalName || '未命名')}</option>`))
          .join('');
        const targetSel = chat && !chat.isGroup
          ? `<select class="ba-target"><option value="ai"${target === 'ai' ? ' selected' : ''}>角色头像</option><option value="my"${target === 'my' ? ' selected' : ''}>我的头像</option></select>`
          : (chat && chat.isGroup ? '<select class="ba-target" disabled><option>群头像</option></select>' : '');
        return `
          <div class="ba-row${chat ? ' assigned' : ''}${r.status === 'bad' ? ' failed' : ''}" data-row-id="${r.id}">
            <div class="ba-preview" data-preview="${r.id}">${r.status === 'bad' ? '无法预览' : ''}</div>
            <div class="ba-main">
              <div class="ba-url">${i + 1}. ${esc(r.url)}</div>
              ${statusHtml}
              <div class="ba-assign">
                <select class="ba-chat"${canAssign ? '' : ' disabled'}>${options}</select>
                ${targetSel}
                ${cur ? `<img class="ba-current" src="${esc(cur)}" referrerpolicy="no-referrer" title="当前头像" onerror="this.style.visibility='hidden'">` : ''}
              </div>
            </div>
          </div>`;
      }).join('');
      // 预览图用 DOM 节点单独挂上去，这样重新渲染列表时不会重复发请求/丢加载状态
      rows.forEach(r => {
        const holder = list.querySelector(`[data-preview="${r.id}"]`);
        if (holder && r.img && r.status !== 'bad') holder.appendChild(r.img);
      });
    }
    updateSummary();
  }

  function updateSummary() {
    const ok = rows.filter(r => r.status === 'ok').length;
    const bad = rows.filter(r => r.status === 'bad').length;
    const assigned = rows.filter(r => r.chatId && r.status === 'ok').length;
    const el = $('ba-summary');
    if (el) el.textContent = rows.length ? `识别到 ${rows.length} 个链接：${ok} 个可用${bad ? `，${bad} 个失败` : ''}；已选择应用 ${assigned} 个` : '';
    const btn = $('ba-apply');
    if (btn) {
      btn.textContent = `应用 (${assigned})`;
      btn.classList.toggle('disabled', assigned === 0);
    }
  }

  // ---------------------------------------------------------- 识别 + 预览加载
  function startLoading(row) {
    const img = new Image();
    img.className = 'avatar';           // 让 avatar-guard 也能顺手备份、重试
    img.referrerPolicy = 'no-referrer'; // 很多图床是按来源防盗链，预览时不带来源成功率更高
    img.alt = '';
    row.img = img;
    let done = false;
    const finish = (status) => {
      if (done && status === row.status) return;
      done = true;
      row.status = status;
      if (status === 'ok') row.info = `${img.naturalWidth}×${img.naturalHeight}`;
      renderRows();
    };
    img.onload = () => finish('ok');
    img.onerror = () => finish('bad');
    setTimeout(() => { if (row.status === 'loading') finish('bad'); }, LOAD_TIMEOUT_MS);
    img.src = row.url;
  }

  function detect() {
    const urls = extractUrls($('ba-input').value);
    const old = new Map(rows.map(r => [r.url, r]));
    // 已有的保留（保留它们的勾选和加载状态），新的加进来，输入框里没有了的去掉
    rows = urls.map(u => old.get(u) || { id: nextRowId++, url: u, status: 'loading', info: '', chatId: '', target: 'ai', img: null });
    rows.forEach(r => { if (!r.img) startLoading(r); });
    renderRows();
  }

  // 按聊天列表顺序，把还没分配的可用图片依次分给还没被占用的单聊角色头像
  function autoAssign() {
    const singles = getChatOptions().filter(c => !c.isGroup);
    const used = new Set(rows.filter(r => r.chatId && r.target !== 'my').map(r => r.chatId));
    let idx = 0;
    let count = 0;
    for (const r of rows) {
      if (r.status !== 'ok' || r.chatId) continue;
      while (idx < singles.length && used.has(singles[idx].id)) idx++;
      if (idx >= singles.length) break;
      r.chatId = singles[idx].id;
      r.target = 'ai';
      used.add(singles[idx].id);
      count++;
    }
    renderRows();
    if (typeof showToast === 'function') showToast(count ? `已按顺序分配 ${count} 张，可以再手动调整` : '没有可以自动分配的图片或角色', count ? 'success' : 'info');
  }

  // ---------------------------------------------------------- 应用
  async function applyAll() {
    const todo = rows.filter(r => r.chatId && r.status === 'ok' && state.chats[r.chatId]);
    if (!todo.length) return;
    const ok = typeof showCustomConfirm === 'function'
      ? await showCustomConfirm('应用头像', `将把 ${todo.length} 个头像应用到对应的角色/群聊，会覆盖它们现在的头像。确定吗？`)
      : true;
    if (!ok) return;

    const changedRoles = [];
    for (const r of todo) {
      const chat = state.chats[r.chatId];
      if (!chat.settings) chat.settings = {};
      if (chat.isGroup) chat.settings.groupAvatar = r.url;
      else if (r.target === 'my') chat.settings.myAvatar = r.url;
      else { chat.settings.aiAvatar = r.url; changedRoles.push(chat); }
      await db.chats.put(chat);
    }
    // 角色头像改了，所在群聊里这个角色的头像也要同步
    if (typeof syncCharacterAvatarInGroups === 'function') {
      for (const chat of changedRoles) {
        try { await syncCharacterAvatarInGroups(chat); } catch (e) { console.warn('[批量头像] 同步群成员头像失败', e); }
      }
    }
    if (typeof renderChatList === 'function') renderChatList();
    if (state.activeChatId && typeof renderChatInterface === 'function' && todo.some(r => r.chatId === state.activeChatId)) {
      renderChatInterface(state.activeChatId);
    }
    if (typeof showToast === 'function') showToast(`已应用 ${todo.length} 个头像`, 'success');
    closeModal();
  }

  // ---------------------------------------------------------- 打开 / 关闭
  function openModal() {
    buildModal();
    $('batch-avatar-modal').classList.add('visible');
    renderRows();
  }
  function closeModal() {
    const m = $('batch-avatar-modal');
    if (m) m.classList.remove('visible');
  }

  function bindEntry() {
    // 入口：设置页「批量设置头像」按钮、悬浮球菜单里的「批量设置头像」（见 floating-ball.js）
    const btn = document.getElementById('open-batch-avatar-btn');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', openModal);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEntry);
  else bindEntry();

  window.openBatchAvatarModal = openModal;
  window.__batchAvatarExtractUrls = extractUrls; // 方便测试
})();
