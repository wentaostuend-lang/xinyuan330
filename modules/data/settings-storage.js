// 设置保存使用可中止事务：超时后旧写入不能在重试后覆盖新设置。
(function () {
  window.saveSettingsRecord = async function (table, record, timeoutMs = 15000) {
    let expired = false, transaction, timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        try { transaction?.abort(); } catch (_) { /* 已结束的事务无需再中止。 */ }
        reject(new Error('本地存储响应超时，设置尚未确认保存，请重试。'));
      }, timeoutMs);
    });
    window.activeSettingsWrites = (window.activeSettingsWrites || 0) + 1;
    const save = Promise.resolve().then(() => window.db.transaction('rw', table, async () => {
      transaction = Dexie.currentTransaction;
      if (expired) throw new Error('设置保存已超时');
      await table.put(record);
    }));
    try { return await Promise.race([save, timeout]); }
    finally { clearTimeout(timer); window.activeSettingsWrites--; }
  };
})();
