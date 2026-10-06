// ============================================================
// ui/avatar-guard.js
// 头像防失效 + 本地头像瘦身
//
// 1. 本地上传头像自动缩小：
//    以前选一张图当头像，是把原图整个转成 base64 存起来（几 MB 一张）。
//    现在所有"头像"上传框（id 里带 avatar 的文件选择框）选出来的图，
//    会先缩到 256 像素以内再存，一张大约十几 KB。GIF（动图）和很小的图不动。
//
// 2. 网络头像（URL）防失效：
//    - 头像图片加载成功时，在后台悄悄存一份 192 像素的小缩略图（约 5~15KB，存在独立的 IndexedDB 里，
//      不占聊天数据、不进备份）；
//    - 图床哪天失效/被拦截，头像加载失败时先用"不带来源(no-referrer)"重试一次（很多图床的防盗链是看来源），
//      还是失败就自动换成之前存的缩略图，头像不会变成一片空白；
//    - 下次页面重新渲染，还是会先去请求原链接，图床恢复了就自动用回原图。
//
// 说明：存缩略图需要图床允许跨站读取图片（CORS）。不允许的图床存不了备份，只有重试这一层保护。
// ============================================================
(function () {
  'use strict';

  const DB_NAME = 'EPhoneAvatarThumbs';
  const STORE = 'thumbs';
  const MAX_ENTRIES = 400;        // 最多保留多少张缩略图，超过时按最久没用的先删
  const THUMB_SIDE = 192;         // 网络头像备份缩略图的最大边长
  const UPLOAD_SIDE = 256;        // 本地上传头像的最大边长
  const SKIP_COMPRESS_BELOW = 50 * 1024; // 小于 50KB 的本地图片不再处理
  const BACKUP_RETRY_MS = 6 * 60 * 60 * 1000; // 备份失败后，隔多久再试

  const memory = new Map();       // url -> 缩略图 dataURL（启动时整体读进内存，几 MB 以内）
  const failedBackup = new Map(); // url -> 上次备份失败的时间
  const pending = new Set();
  const queue = [];
  let running = 0;
  let dbPromise = null;
  let webpOk = null;

  // ---------------------------------------------------------- 小工具
  function isExternalHttp(url) {
    try {
      const u = new URL(url, location.href);
      return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== location.origin;
    } catch (e) {
      return false;
    }
  }

  function supportsWebp() {
    if (webpOk === null) {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
      } catch (e) {
        webpOk = false;
      }
    }
    return webpOk;
  }

  async function blobToBitmap(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob); } catch (e) { /* 走下面的兜底 */ }
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // 把图片缩放到最大边 maxSide，输出 Blob（优先 webp，Safari 不支持就用 jpeg）
  async function resizeToBlob(blob, maxSide, quality) {
    const bmp = await blobToBitmap(blob);
    const sw = bmp.width || bmp.naturalWidth;
    const sh = bmp.height || bmp.naturalHeight;
    if (!sw || !sh) throw new Error('图片尺寸无效');
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const useWebp = supportsWebp();
    if (!useWebp) { // jpeg 没有透明通道，先垫白底
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    return await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('导出图片失败')),
        useWebp ? 'image/webp' : 'image/jpeg', quality);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      // 注意：这里用的是原生 readAsDataURL（下面的补丁只处理头像上传框选出的文件）
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      nativeReadAsDataURL.call(r, blob);
    });
  }

  const kb = n => (n / 1024).toFixed(n > 1024 * 100 ? 0 : 1) + 'KB';

  // ---------------------------------------------------------- 缩略图存储（独立的小库）
  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('没有 IndexedDB'));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'url' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch(e => { console.warn('[头像备份] 打不开缩略图库，只保留重试保护', e); return null; });
    }
    return dbPromise;
  }

  function idbRun(db, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const result = fn(store);
      tx.oncomplete = () => resolve(result && result.result !== undefined ? result.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  const readyPromise = (async () => {
    const db = await openDb();
    if (!db) return;
    try {
      const all = await idbRun(db, 'readonly', s => s.getAll());
      (all || []).forEach(e => memory.set(e.url, e.data));
      if (all && all.length > MAX_ENTRIES) {
        const drop = all.sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0)).slice(0, all.length - MAX_ENTRIES);
        await idbRun(db, 'readwrite', s => { drop.forEach(e => s.delete(e.url)); });
        drop.forEach(e => memory.delete(e.url));
      }
    } catch (e) {
      console.warn('[头像备份] 读取缩略图失败', e);
    }
  })();

  async function saveThumb(url, data) {
    memory.set(url, data);
    const db = await openDb();
    if (!db) return;
    try {
      await idbRun(db, 'readwrite', s => { s.put({ url, data, ts: Date.now(), lastUsed: Date.now() }); });
    } catch (e) {
      console.warn('[头像备份] 保存缩略图失败', e);
    }
  }

  // ---------------------------------------------------------- 备份队列
  async function backupOne(url) {
    const resp = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    if (!/^image\//.test(blob.type)) throw new Error('不是图片');
    if (blob.size > 12 * 1024 * 1024) throw new Error('图片太大，跳过备份');
    const thumb = await resizeToBlob(blob, THUMB_SIDE, 0.85);
    const dataUrl = await blobToDataUrl(thumb);
    await saveThumb(url, dataUrl);
    console.log(`[头像备份] 已备份 ${url.slice(0, 60)} → ${kb(thumb.size)}`);
  }

  function pump() {
    while (running < 2 && queue.length) {
      const url = queue.shift();
      running++;
      backupOne(url)
        .catch(e => { failedBackup.set(url, Date.now()); console.debug('[头像备份] 备份失败（多半是图床不允许跨站读取）', url.slice(0, 60), e && e.message); })
        .finally(() => { pending.delete(url); running--; pump(); });
    }
  }

  function scheduleBackup(url) {
    if (!isExternalHttp(url) || pending.has(url)) return;
    if (memory.has(url)) return;
    const failedAt = failedBackup.get(url);
    if (failedAt && Date.now() - failedAt < BACKUP_RETRY_MS) return;
    pending.add(url);
    readyPromise.then(() => {
      queue.push(url);
      // 等一会儿再开始，别和界面渲染抢资源
      (window.requestIdleCallback || (fn => setTimeout(fn, 1200)))(pump);
    });
  }

  // ---------------------------------------------------------- 头像图片：加载成功 / 失败
  function isAvatarImg(img) {
    const own = (img.className && img.className.baseVal !== undefined ? img.className.baseVal : img.className) || '';
    if (/avatar/i.test(own) || /avatar/i.test(img.id || '')) return true;
    const p = img.parentElement;
    return !!p && (/avatar/i.test(typeof p.className === 'string' ? p.className : '') || /avatar/i.test(p.id || ''));
  }

  function handleLoaded(img) {
    if (img.dataset.avatarFallback) return;
    const url = img.getAttribute('src');
    if (url) scheduleBackup(url);
  }

  async function handleFailed(img) {
    const url = img.getAttribute('src');
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return;
    if (!isExternalHttp(url)) return;
    // 设置界面里的头像预览：保存设置时会读 src，别悄悄换成缩略图，让用户能看出链接真的失效了
    if (/preview/i.test(img.id || '')) return;

    // 第一步：换成"不带来源"再试一次（图床防盗链常见是校验 Referer）
    if (img.dataset.avatarRetry !== url) {
      img.dataset.avatarRetry = url;
      img.referrerPolicy = 'no-referrer';
      img.removeAttribute('src');
      img.setAttribute('src', url);
      return;
    }

    // 第二步：用之前备份的缩略图
    await readyPromise;
    const thumb = memory.get(url);
    if (thumb) {
      img.dataset.avatarFallback = '1';
      img.dataset.avatarOrig = url;
      img.setAttribute('src', thumb);
    }
  }

  // 捕获阶段监听：img 的 load/error 不冒泡，但能在 document 上被捕获到
  document.addEventListener('load', e => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && isAvatarImg(t)) handleLoaded(t);
  }, true);
  document.addEventListener('error', e => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && isAvatarImg(t)) handleFailed(t);
  }, true);

  // 图片在事件监听生效前/插入页面前就已经加载完（或失败）的情况：用 MutationObserver 补扫
  const sweepQueue = new Set();
  let sweepTimer = null;

  function checkImg(img) {
    if (!isAvatarImg(img)) return;
    const src = img.getAttribute('src');
    if (!src || src.startsWith('data:') || src.startsWith('blob:') || !isExternalHttp(src)) return;
    if (!img.complete) return; // 还在加载，等 load/error 事件
    if (img.naturalWidth > 0) {
      handleLoaded(img);
    } else {
      // complete 但没有尺寸：可能是加载失败，也可能是没有固有尺寸的 SVG，用 decode 区分
      img.decode().catch(() => handleFailed(img));
    }
  }

  function flushSweep() {
    sweepTimer = null;
    const batch = Array.from(sweepQueue);
    sweepQueue.clear();
    batch.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.tagName === 'IMG') checkImg(node);
      else if (node.querySelectorAll) node.querySelectorAll('img').forEach(checkImg);
    });
  }

  function queueSweep(node) {
    sweepQueue.add(node);
    if (!sweepTimer) sweepTimer = setTimeout(flushSweep, 400);
  }

  function startObserver() {
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.type === 'childList') m.addedNodes.forEach(n => n.nodeType === 1 && queueSweep(n));
        else if (m.type === 'attributes' && m.target.tagName === 'IMG') queueSweep(m.target);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    queueSweep(document.documentElement);
  }
  if (document.documentElement) startObserver();

  // ---------------------------------------------------------- 本地上传头像瘦身
  const nativeReadAsDataURL = FileReader.prototype.readAsDataURL;
  const avatarFiles = new WeakSet();

  document.addEventListener('change', e => {
    const t = e.target;
    if (t && t.tagName === 'INPUT' && t.type === 'file' && /avatar/i.test(t.id || '')) {
      Array.from(t.files || []).forEach(f => avatarFiles.add(f));
    }
  }, true);

  async function compressAvatarFile(file) {
    if (!/^image\//.test(file.type) || /gif|svg/.test(file.type) || file.size < SKIP_COMPRESS_BELOW) return file;
    const out = await resizeToBlob(file, UPLOAD_SIDE, 0.86);
    if (out.size >= file.size) return file; // 压完反而更大（极少见），就用原图
    console.log(`[头像] 本地头像已压缩 ${kb(file.size)} → ${kb(out.size)}`);
    return out;
  }

  FileReader.prototype.readAsDataURL = function (file) {
    if (file && avatarFiles.has(file)) {
      const reader = this;
      avatarFiles.delete(file);
      compressAvatarFile(file)
        .catch(err => { console.warn('[头像] 压缩失败，改用原图', err); return file; })
        .then(blob => nativeReadAsDataURL.call(reader, blob));
      return;
    }
    return nativeReadAsDataURL.call(this, file);
  };

  // ---------------------------------------------------------- 对外接口（排查用）
  window.AvatarGuard = {
    async stats() {
      await readyPromise;
      let bytes = 0;
      memory.forEach(v => { bytes += v.length; });
      return { thumbs: memory.size, approxKB: Math.round(bytes * 0.75 / 1024), pendingBackups: pending.size };
    },
    async clear() {
      await readyPromise;
      memory.clear();
      const db = await openDb();
      if (db) await idbRun(db, 'readwrite', s => { s.clear(); });
    },
    compressFile: compressAvatarFile,
  };
})();
