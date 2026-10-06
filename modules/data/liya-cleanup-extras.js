// ============================================================
// data/liya-cleanup-extras.js
// 从 Liya 移植的数据管理增强：
//   1. 清空相册图片（保留相册）
//   2. 清空本地上传的头像
//   3. 一键清空所有本地图片
//   4. 深入分析聊天记录构成
// 函数体来自 Liya 的 data-management.js，按 xinyuan 的拆分方式独立成文件。
// ============================================================
(function () {
'use strict';

  let selectedAlbumsForPhotoClear = [];

    function mb(bytes) {
      return (bytes / 1024 / 1024).toFixed(2);
    }

  function estimateJsonBytes(value) {
    if (value === undefined || value === null) return 0;
    try {
      return new Blob([JSON.stringify(value)]).size;
    } catch (e) {
      return 0;
    }
  }

  function countImageBytesInObject(obj) {
    let total = 0;
    function walk(o) {
      if (!o || typeof o !== 'object') return;
      for (const key in o) {
        if (!o.hasOwnProperty(key)) continue;
        const v = o[key];
        if (typeof v === 'string' && v.startsWith('data:image')) {
          total += v.length;
        } else if (Array.isArray(v)) {
          v.forEach(item => {
            if (typeof item === 'string' && item.startsWith('data:image')) {
              total += item.length;
            } else if (item && typeof item === 'object') {
              walk(item);
            }
          });
        } else if (v && typeof v === 'object') {
          walk(v);
        }
      }
    }
    walk(obj);
    return total;
  }

  async function analyzeChatsFieldBreakdown() {
    const chats = await db.chats.toArray();

    const categoryTotals = {
      images: 0,
      variableMemory: 0,
      apiHistory: 0,
      historyText: 0,
      other: 0
    };

    const perChat = [];

    for (const chat of chats) {
      const totalBytes = estimateJsonBytes(chat);
      const imageBytes = countImageBytesInObject(chat);
      const apiHistoryBytes = chat.apiHistory ? estimateJsonBytes(chat.apiHistory) : 0;
      const variableMemoryBytes = chat.variableMemory ? estimateJsonBytes(chat.variableMemory) : 0;
      const historyBytes = chat.history ? estimateJsonBytes(chat.history) : 0;
      // history 里可能包含图片，这里粗略把图片部分从"消息文本"里减掉，避免重复计入
      const historyTextBytes = Math.max(historyBytes - imageBytes, 0);
      const otherBytes = Math.max(totalBytes - historyBytes - apiHistoryBytes - variableMemoryBytes, 0);

      categoryTotals.images += imageBytes;
      categoryTotals.apiHistory += apiHistoryBytes;
      categoryTotals.variableMemory += variableMemoryBytes;
      categoryTotals.historyText += historyTextBytes;
      categoryTotals.other += otherBytes;

      perChat.push({
        id: chat.id,
        name: chat.name || '未命名',
        isGroup: chat.isGroup || false,
        totalBytes,
        historyTextBytes,
        imageBytes,
        variableMemoryBytes,
        apiHistoryBytes,
        otherBytes
      });
    }

    perChat.sort((a, b) => b.totalBytes - a.totalBytes);

    return { categoryTotals, perChat };
  }

  async function viewChatsBreakdown() {
    showScreen('chats-breakdown-screen');
    const container = document.getElementById('chats-breakdown-container');
    await renderChatsBreakdown(container);
  }

  async function renderChatsBreakdown(container) {
    container.innerHTML = '<p style="text-align: center; padding: 40px 0;">正在分析聊天记录构成，数据量大时需要几秒...</p>';

    try {
      const { categoryTotals, perChat } = await analyzeChatsFieldBreakdown();
      const grandTotal = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

      const categoryRows = [
        ['消息文本（不含图片）', categoryTotals.historyText, '#007bff'],
        ['图片（消息图/表情/头像/壁纸等）', categoryTotals.images, '#28a745'],
        ['记忆/向量数据 variableMemory', categoryTotals.variableMemory, '#ff9500'],
        ['API历史记录 apiHistory', categoryTotals.apiHistory, '#af52de'],
        ['其他（设置/预设/世界书覆盖等）', categoryTotals.other, '#8e8e93']
      ];

      let html = `
        <div style="background: var(--bg-secondary, #f5f5f5); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
          <h3 style="margin: 0 0 10px 0;">📊 聊天记录内部构成（共 ${mb(grandTotal)} MB，${perChat.length} 个角色/群聊）</h3>
      `;

      categoryRows.forEach(([label, bytes, color]) => {
        const pct = grandTotal > 0 ? ((bytes / grandTotal) * 100).toFixed(1) : '0.0';
        html += `
          <div style="margin: 8px 0;">
            <div style="display:flex; justify-content: space-between; font-size: 13px;">
              <span>${label}</span>
              <span style="color:${color}; font-weight: 600;">${mb(bytes)} MB (${pct}%)</span>
            </div>
            <div style="width:100%; height:6px; background:#e0e0e0; border-radius:3px; overflow:hidden; margin-top:3px;">
              <div style="width:${pct}%; height:100%; background:${color};"></div>
            </div>
          </div>
        `;
      });

      html += `</div>`;

      html += `
        <div style="background: var(--bg-primary, #fff); border-radius: 10px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead style="background: var(--bg-secondary, #f5f5f5);">
              <tr>
                <th style="padding: 8px; text-align: left; border-bottom: 1px solid var(--border-color, #ddd);">角色/群聊</th>
                <th style="padding: 8px; text-align: right; border-bottom: 1px solid var(--border-color, #ddd);">总计MB</th>
                <th style="padding: 8px; text-align: right; border-bottom: 1px solid var(--border-color, #ddd);">文本</th>
                <th style="padding: 8px; text-align: right; border-bottom: 1px solid var(--border-color, #ddd);">图片</th>
                <th style="padding: 8px; text-align: right; border-bottom: 1px solid var(--border-color, #ddd);">记忆</th>
              </tr>
            </thead>
            <tbody>
      `;

      perChat.slice(0, 20).forEach((c, i) => {
        const bg = i % 2 === 0 ? 'transparent' : 'var(--bg-secondary, #f9f9f9)';
        html += `
          <tr style="background:${bg};">
            <td style="padding: 8px; border-bottom: 1px solid var(--border-color, #eee);">${c.name}${c.isGroup ? '（群）' : ''}</td>
            <td style="padding: 8px; text-align: right; border-bottom: 1px solid var(--border-color, #eee); font-weight:600;">${mb(c.totalBytes)}</td>
            <td style="padding: 8px; text-align: right; border-bottom: 1px solid var(--border-color, #eee);">${mb(c.historyTextBytes)}</td>
            <td style="padding: 8px; text-align: right; border-bottom: 1px solid var(--border-color, #eee);">${mb(c.imageBytes)}</td>
            <td style="padding: 8px; text-align: right; border-bottom: 1px solid var(--border-color, #eee);">${mb(c.variableMemoryBytes)}</td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
        </div>
        <p style="font-size: 12px; color: var(--text-secondary, #999); margin-top: 10px;">
          只列出体积最大的前20个角色/群聊。"其他"类目（设置/预设/世界书覆盖等）没有单列在表格里，属于总计减去左边三项。
        </p>
      `;

      container.innerHTML = html;
    } catch (error) {
      console.error("分析聊天记录构成时出错:", error);
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          <p style="color: #ff3b30; font-size: 16px; margin-bottom: 10px;">⚠️ 分析失败</p>
          <p style="color: #666; font-size: 14px;">${error.message}</p>
        </div>
      `;
    }
  }

  function openClearAlbumPhotosModal() {
    const modal = document.getElementById('clear-album-photos-modal');
    selectedAlbumsForPhotoClear = [];

    renderClearAlbumPhotosList();
    modal.classList.add('visible');
  }

  async function renderClearAlbumPhotosList() {
    const listEl = document.getElementById('clear-album-photos-list');
    listEl.innerHTML = '';

    const albums = await db.qzoneAlbums.toArray();
    const albumsWithPhotos = [];

    for (const album of albums) {
      const photos = await db.qzonePhotos.where('albumId').equals(album.id).toArray();
      let photoCount = 0;
      let totalSize = 0;

      photos.forEach(p => {
        if (typeof p.url === 'string' && p.url.startsWith('data:image')) {
          photoCount++;
          totalSize += p.url.length;
        }
      });

      if (photoCount > 0) {
        albumsWithPhotos.push({
          id: album.id,
          name: album.name || '未命名相册',
          photoCount,
          totalSize
        });
      }
    }

    if (albumsWithPhotos.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-secondary);">没有找到包含本地图片的相册</p>';
      return;
    }

    // 按占用空间降序排列，最占地方的相册排在最前面
    albumsWithPhotos.sort((a, b) => b.totalSize - a.totalSize);

    albumsWithPhotos.forEach(album => {
      const sizeMB = (album.totalSize / 1024 / 1024).toFixed(2);
      const item = document.createElement('div');
      item.className = 'clear-posts-item';
      item.dataset.albumId = album.id;
      item.innerHTML = `
        <div class="checkbox"></div>
        <div>
          <span class="name">${album.name}</span>
          <p style="font-size: 12px; color: #888; margin: 4px 0 0;">${album.photoCount} 张照片，占用 ${sizeMB} MB</p>
        </div>
      `;
      listEl.appendChild(item);
    });
  }

  async function handleConfirmClearAlbumPhotos() {
    const selectedItems = document.querySelectorAll('#clear-album-photos-list .clear-posts-item.selected');

    if (selectedItems.length === 0) {
      alert("请至少选择一个相册。");
      return;
    }

    selectedAlbumsForPhotoClear = Array.from(selectedItems).map(item => Number(item.dataset.albumId));

    const confirmed = await showCustomConfirm(
      '确认清空相册照片？',
      `即将清空 <strong>${selectedAlbumsForPhotoClear.length}</strong> 个相册中的本地照片（相册本身会保留，仅删除照片）。<br><br>此操作不可撤销，建议先导出数据备份。`,
      {
        confirmButtonClass: 'btn-danger',
        confirmText: '确认清空'
      }
    );

    if (!confirmed) return;

    await showCustomAlert("请稍候...", "正在清空相册照片，请不要关闭页面...");

    try {
      let stats = {
        albumsProcessed: 0,
        photosCleared: 0,
        sizeFreed: 0
      };

      await db.transaction('rw', db.qzonePhotos, db.qzoneAlbums, async () => {
        for (const albumId of selectedAlbumsForPhotoClear) {
          const photos = await db.qzonePhotos.where('albumId').equals(albumId).toArray();
          const idsToDelete = [];

          photos.forEach(p => {
            if (typeof p.url === 'string' && p.url.startsWith('data:image')) {
              stats.photosCleared++;
              stats.sizeFreed += p.url.length;
              idsToDelete.push(p.id);
            }
          });

          if (idsToDelete.length > 0) {
            await db.qzonePhotos.bulkDelete(idsToDelete);
          }

          const remainingCount = await db.qzonePhotos.where('albumId').equals(albumId).count();
          await db.qzoneAlbums.update(albumId, {
            photoCount: remainingCount
          });

          stats.albumsProcessed++;
        }
      });

      document.getElementById('clear-album-photos-modal').classList.remove('visible');

      const freedMB = (stats.sizeFreed / 1024 / 1024).toFixed(2);
      await showCustomAlert(
        '清空完成',
        `已清空 ${stats.albumsProcessed} 个相册中的照片。<br>
        清空了 ${stats.photosCleared} 张照片<br>
        释放了 <strong>${freedMB} MB</strong> 空间。<br><br>
        建议刷新页面以使更改生效。`
      );

      // 刷新存储大小显示
      displayTotalImageSize();
    } catch (error) {
      console.error("清空相册照片时出错:", error);
      await showCustomAlert('清空失败', `操作失败: ${error.message}`);
    }
  }

  function isLocalAvatarUrl(url) {
    return typeof url === 'string' && url.startsWith('data:image');
  }

  async function scanLocalAvatarStats() {
    let found = 0;
    let size = 0;

    const chats = await db.chats.toArray();
    for (const chat of chats) {
      const s = chat.settings || {};

      ['aiAvatar', 'myAvatar', 'groupAvatar'].forEach(key => {
        if (isLocalAvatarUrl(s[key])) {
          found++;
          size += s[key].length;
        }
      });

      ['aiAvatarLibrary', 'myAvatarLibrary', 'groupAvatarLibrary'].forEach(key => {
        (s[key] || []).forEach(item => {
          if (item && isLocalAvatarUrl(item.url)) {
            found++;
            size += item.url.length;
          }
        });
      });
    }

    const qzoneSettingsArr = await db.qzoneSettings.toArray();
    qzoneSettingsArr.forEach(q => {
      if (isLocalAvatarUrl(q.avatar)) {
        found++;
        size += q.avatar.length;
      }
    });

    const globalSettingsArr = await db.globalSettings.toArray();
    globalSettingsArr.forEach(g => {
      if (isLocalAvatarUrl(g.doubanUserAvatar)) {
        found++;
        size += g.doubanUserAvatar.length;
      }
    });

    return { found, size };
  }

  async function openClearAvatarsConfirm() {
    await showCustomAlert("正在扫描...", "正在统计本地上传的头像，请稍候...");

    const { found, size } = await scanLocalAvatarStats();

    if (found === 0) {
      await showCustomAlert('没有找到', '没有找到本地上传的头像，无需清空。（图床链接头像不受影响）');
      return;
    }

    const sizeMB = (size / 1024 / 1024).toFixed(2);
    const confirmed = await showCustomConfirm(
      '确认清空所有本地头像？',
      `找到 <strong>${found}</strong> 个本地上传的头像，共占用约 <strong>${sizeMB} MB</strong>。<br><br>
      清空范围：角色头像、我的头像（含每个角色的自定义"我的头像"）、群聊头像、三个头像库中的备用头像、QQ空间个人头像、豆瓣头像。<br><br>
      <strong>只清空本地上传（base64）的头像，使用图床/网络链接的头像不受影响。</strong>清空后会恢复为默认头像。<br><br>
      此操作不可撤销，建议先导出数据备份。`,
      {
        confirmButtonClass: 'btn-danger',
        confirmText: '确认清空'
      }
    );

    if (!confirmed) return;

    await handleConfirmClearAvatars();
  }

  async function handleConfirmClearAvatars() {
    await showCustomAlert("请稍候...", "正在清空本地头像，请不要关闭页面...");

    let stats = {
      avatarsCleared: 0,
      sizeFreed: 0
    };

    try {
      await db.transaction('rw', db.chats, db.qzoneSettings, db.globalSettings, async () => {
        const chats = await db.chats.toArray();
        for (const chat of chats) {
          if (!chat.settings) continue;
          let changed = false;

          ['aiAvatar', 'myAvatar', 'groupAvatar'].forEach(key => {
            if (isLocalAvatarUrl(chat.settings[key])) {
              stats.avatarsCleared++;
              stats.sizeFreed += chat.settings[key].length;
              chat.settings[key] = '';
              changed = true;
            }
          });

          ['aiAvatarLibrary', 'myAvatarLibrary', 'groupAvatarLibrary'].forEach(key => {
            if (Array.isArray(chat.settings[key])) {
              const before = chat.settings[key].length;
              chat.settings[key] = chat.settings[key].filter(item => {
                if (item && isLocalAvatarUrl(item.url)) {
                  stats.avatarsCleared++;
                  stats.sizeFreed += item.url.length;
                  return false;
                }
                return true;
              });
              if (chat.settings[key].length !== before) changed = true;
            }
          });

          if (changed) {
            await db.chats.put(chat);
            if (state.chats && state.chats[chat.id]) {
              state.chats[chat.id].settings = chat.settings;
            }
          }
        }

        const qzoneSettingsArr = await db.qzoneSettings.toArray();
        for (const q of qzoneSettingsArr) {
          if (isLocalAvatarUrl(q.avatar)) {
            stats.avatarsCleared++;
            stats.sizeFreed += q.avatar.length;
            q.avatar = '';
            await db.qzoneSettings.put(q);
          }
        }

        const globalSettingsArr = await db.globalSettings.toArray();
        for (const g of globalSettingsArr) {
          if (isLocalAvatarUrl(g.doubanUserAvatar)) {
            stats.avatarsCleared++;
            stats.sizeFreed += g.doubanUserAvatar.length;
            g.doubanUserAvatar = '';
            await db.globalSettings.put(g);
          }
        }
      });

      const freedMB = (stats.sizeFreed / 1024 / 1024).toFixed(2);
      await showCustomAlert(
        '清空完成',
        `已清空 ${stats.avatarsCleared} 个本地头像。<br>
        释放了 <strong>${freedMB} MB</strong> 空间。<br><br>
        建议刷新页面以使更改生效。`
      );

      displayTotalImageSize();
    } catch (error) {
      console.error("清空头像时出错:", error);
      await showCustomAlert('清空失败', `操作失败: ${error.message}`);
    }
  }

  async function scanTablesGeneric() {
    function count(obj, stats, parentKey = '') {
      if (!obj || typeof obj !== 'object') return;
      const isExcludedParent =
        parentKey === 'widgetData' ||
        parentKey === 'appIcons' ||
        parentKey === 'cphoneAppIcons' ||
        parentKey === 'myphoneAppIcons';

      for (const key in obj) {
        if (!obj.hasOwnProperty(key)) continue;
        const value = obj[key];
        if (typeof value === 'string' && value.startsWith('data:image')) {
          if (!isExcludedParent) {
            stats.count++;
            stats.size += value.length;
          }
        } else if (Array.isArray(value)) {
          value.forEach(item => {
            if (typeof item === 'string' && item.startsWith('data:image')) {
              if (!isExcludedParent) {
                stats.count++;
                stats.size += item.length;
              }
            } else if (item && typeof item === 'object') {
              count(item, stats, key);
            }
          });
        } else if (value && typeof value === 'object') {
          count(value, stats, key);
        }
      }
    }

    const mainStats = { count: 0, size: 0 };
    const albumStats = { count: 0, size: 0 };

    const chats = await db.chats.toArray();
    chats.forEach(record => count(record, mainStats));

    const globalSettingsArr = await db.globalSettings.toArray();
    globalSettingsArr.forEach(record => count(record, mainStats));

    const qzoneSettingsArr = await db.qzoneSettings.toArray();
    qzoneSettingsArr.forEach(record => count(record, mainStats));

    const stickers = await db.userStickers.toArray();
    stickers.forEach(record => count(record, mainStats));

    const frames = await db.customAvatarFrames.toArray();
    frames.forEach(record => count(record, mainStats));

    const photos = await db.qzonePhotos.toArray();
    photos.forEach(photo => {
      if (typeof photo.url === 'string' && photo.url.startsWith('data:image')) {
        albumStats.count++;
        albumStats.size += photo.url.length;
      }
    });

    return { mainStats, albumStats };
  }

  async function openClearAllLocalImagesConfirm() {
    await showCustomAlert("正在扫描...", "正在统计所有本地图片，数据量大时可能需要几秒，请稍候...");

    const { mainStats, albumStats } = await scanTablesGeneric();
    const totalCount = mainStats.count + albumStats.count;
    const totalSize = mainStats.size + albumStats.size;

    if (totalCount === 0) {
      await showCustomAlert('没有找到', '没有找到本地图片，无需清空。');
      return;
    }

    const totalMB = (totalSize / 1024 / 1024).toFixed(2);
    let lines = '';
    if (mainStats.count > 0) {
      lines += `- 聊天记录/头像/表情包/头像框/壁纸等：${mainStats.count} 张，约 ${(mainStats.size / 1024 / 1024).toFixed(2)} MB<br>`;
    }
    if (albumStats.count > 0) {
      lines += `- 相册照片：${albumStats.count} 张，约 ${(albumStats.size / 1024 / 1024).toFixed(2)} MB<br>`;
    }

    const confirmed = await showCustomConfirm(
      '⚠️ 确认清空全部本地图片？',
      `将清空共 <strong>${totalCount}</strong> 张本地图片，约 <strong>${totalMB} MB</strong>：<br><br>
      ${lines}<br>
      不受影响：App图标/小组件图片（体积通常很小，未纳入本次清空），以及所有使用图床/网络链接的图片。<br><br>
      清空后聊天记录里对应的图片/表情位置可能会显示为空白（消息本身不会被删除），相册会保留、只删照片。<br><br>
      <strong style="color:#dc3545">此操作不可撤销，强烈建议先导出数据备份再继续！</strong>`,
      {
        confirmButtonClass: 'btn-danger',
        confirmText: '我已备份，确认全部清空'
      }
    );

    if (!confirmed) return;

    await executeClearAllLocalImages();
  }

  async function executeClearAllLocalImages() {
    await showCustomAlert("请稍候...", "正在清空所有本地图片，数据量大时可能需要一段时间，请不要关闭页面...");

    function clearInPlace(obj, stats, parentKey = '') {
      if (!obj || typeof obj !== 'object') return false;
      const isExcludedParent =
        parentKey === 'widgetData' ||
        parentKey === 'appIcons' ||
        parentKey === 'cphoneAppIcons' ||
        parentKey === 'myphoneAppIcons';

      let changed = false;

      for (const key in obj) {
        if (!obj.hasOwnProperty(key)) continue;
        const value = obj[key];

        if (typeof value === 'string' && value.startsWith('data:image')) {
          if (!isExcludedParent) {
            stats.count++;
            stats.size += value.length;
            obj[key] = '';
            changed = true;
          }
        } else if (Array.isArray(value)) {
          for (let i = value.length - 1; i >= 0; i--) {
            const item = value[i];
            if (typeof item === 'string' && item.startsWith('data:image')) {
              if (!isExcludedParent) {
                stats.count++;
                stats.size += item.length;
                value.splice(i, 1);
                changed = true;
              }
            } else if (item && typeof item === 'object') {
              if (clearInPlace(item, stats, key)) changed = true;
            }
          }
        } else if (value && typeof value === 'object') {
          if (clearInPlace(value, stats, key)) changed = true;
        }
      }

      return changed;
    }

    let totalFreed = 0;
    const stats = { count: 0, size: 0 };

    try {
      await db.transaction('rw', db.chats, db.globalSettings, db.qzoneSettings, db.userStickers, db.customAvatarFrames, db.qzonePhotos, db.qzoneAlbums, async () => {

        const chats = await db.chats.toArray();
        for (const chat of chats) {
          if (clearInPlace(chat, stats)) {
            await db.chats.put(chat);
            if (state.chats && state.chats[chat.id]) {
              state.chats[chat.id] = chat;
            }
          }
        }

        const globalSettingsArr = await db.globalSettings.toArray();
        for (const g of globalSettingsArr) {
          if (clearInPlace(g, stats)) {
            await db.globalSettings.put(g);
          }
        }

        const qzoneSettingsArr = await db.qzoneSettings.toArray();
        for (const q of qzoneSettingsArr) {
          if (clearInPlace(q, stats)) {
            await db.qzoneSettings.put(q);
          }
        }

        const stickers = await db.userStickers.toArray();
        for (const sticker of stickers) {
          if (clearInPlace(sticker, stats)) {
            await db.userStickers.put(sticker);
          }
        }

        const frames = await db.customAvatarFrames.toArray();
        for (const frame of frames) {
          if (clearInPlace(frame, stats)) {
            await db.customAvatarFrames.put(frame);
          }
        }

        // 相册照片（保留相册本身，只删照片）
        const photos = await db.qzonePhotos.toArray();
        const photoIdsToDelete = [];
        const affectedAlbumIds = new Set();
        photos.forEach(photo => {
          if (typeof photo.url === 'string' && photo.url.startsWith('data:image')) {
            stats.count++;
            stats.size += photo.url.length;
            photoIdsToDelete.push(photo.id);
            affectedAlbumIds.add(photo.albumId);
          }
        });
        if (photoIdsToDelete.length > 0) {
          await db.qzonePhotos.bulkDelete(photoIdsToDelete);
          for (const albumId of affectedAlbumIds) {
            const remaining = await db.qzonePhotos.where('albumId').equals(albumId).count();
            await db.qzoneAlbums.update(albumId, { photoCount: remaining });
          }
        }
      });

      totalFreed = stats.size;
      const freedMB = (totalFreed / 1024 / 1024).toFixed(2);

      const shouldRefresh = await showCustomConfirm(
        '清空完成',
        `已清空 ${stats.count} 张本地图片，释放约 <strong>${freedMB} MB</strong> 空间。<br><br>
        是否立即刷新页面以使更改生效？`,
        {
          confirmText: '立即刷新',
          cancelText: '稍后刷新'
        }
      );

      if (shouldRefresh) {
        location.reload();
      } else {
        displayTotalImageSize();
      }
    } catch (error) {
      console.error("一键清空所有本地图片时出错:", error);
      await showCustomAlert('清空失败', `操作失败: ${error.message}`);
    }
  }

  function bindLiyaCleanupExtras() {
    const on = (id, evt, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(evt, handler);
    };

    // 清空相册图片
    on('clear-album-photos-btn', 'click', openClearAlbumPhotosModal);
    on('cancel-clear-album-photos-btn', 'click', () => {
      document.getElementById('clear-album-photos-modal').classList.remove('visible');
    });
    on('confirm-clear-album-photos-btn', 'click', handleConfirmClearAlbumPhotos);
    on('clear-album-photos-modal', 'click', (e) => {
      const item = e.target.closest('.clear-posts-item');
      if (item) {
        e.stopPropagation();
        item.classList.toggle('selected');
      }
    });
    on('select-all-albums-for-photo-clear', 'change', (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll('#clear-album-photos-list .clear-posts-item').forEach(item => {
        item.classList.toggle('selected', isChecked);
      });
    });

    // 清空本地上传的头像 / 一键清空所有本地图片
    on('clear-avatars-btn', 'click', openClearAvatarsConfirm);
    on('clear-all-images-btn', 'click', openClearAllLocalImagesConfirm);

    // 深入分析聊天记录构成
    on('view-chats-breakdown-btn', 'click', viewChatsBreakdown);
    on('chats-breakdown-back-btn', 'click', () => {
      showScreen('api-settings-screen');
    });
    on('refresh-chats-breakdown-btn', 'click', async () => {
      const container = document.getElementById('chats-breakdown-container');
      await renderChatsBreakdown(container);
      showToast('数据已刷新', 'success');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindLiyaCleanupExtras);
  } else {
    bindLiyaCleanupExtras();
  }

  window.viewChatsBreakdown = viewChatsBreakdown;
  window.renderChatsBreakdown = renderChatsBreakdown;
  window.openClearAlbumPhotosModal = openClearAlbumPhotosModal;
  window.openClearAvatarsConfirm = openClearAvatarsConfirm;
  window.openClearAllLocalImagesConfirm = openClearAllLocalImagesConfirm;
})();
