/* 存檔備份: export every saved record (games, cultivation progress, expedition unlocks, trials, receipts)
   to one JSON file, and restore it in a single IndexedDB transaction. Storage lives only in this browser,
   so this is the player's only way to move progress to another device or survive cleared site data. */
(function (root) {
  'use strict';
  const FORMAT = 'qinghe-mahjong-save';
  const VERSION = 1;
  const STORE = 'gameSaves';
  const MAX_BYTES = 20 * 1024 * 1024;

  function open() {
    if (typeof root.initDB !== 'function') return Promise.reject(Error('存檔資料庫尚未就緒'));
    return root.initDB();
  }
  function readAll() {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], 'readonly'), store = tx.objectStore(STORE), entries = [];
      const cursor = store.openCursor();
      cursor.onsuccess = () => { const c = cursor.result; if (c) { entries.push({ key: c.key, value: c.value }); c.continue(); } };
      tx.oncomplete = () => { db.close(); resolve(entries); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || Error('讀取存檔失敗')); };
    }));
  }
  // The whole store is replaced at once: on any error nothing is written.
  function writeAll(entries) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], 'readwrite'), store = tx.objectStore(STORE);
      store.clear();
      for (const { key, value } of entries) store.put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || Error('寫入存檔失敗')); };
    }));
  }
  const stamp = date => {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  };
  function summarize(entries) {
    const keys = entries.map(e => String(e.key));
    const profile = entries.find(e => e.key === 'cultivationProgressionV1')?.value;
    const realm = profile && root.MahjongCultivationProgression?.realms?.[profile.realm]?.name;
    return [
      keys.some(k => k === 'autoSave' || k === 'manualSave') ? '一般模式存檔' : null,
      keys.some(k => k.startsWith('cultivation') && /SaveV1$/.test(k)) ? '修仙旅程存檔' : null,
      profile ? `修為 ${profile.xp}${realm ? `・${realm}` : ''}` : null,
      keys.some(k => k.startsWith('cultivationExpedition')) ? '五行巡歷紀錄' : null
    ].filter(Boolean).join('、') || '沒有任何存檔';
  }
  async function exportFile() {
    const entries = await readAll();
    const payload = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(),
      build: root.MAHJONG_PRECACHE?.label || null, entries };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `雀仙門存檔-${stamp(new Date())}.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { count: entries.length, summary: summarize(entries) };
  }
  // Reject anything that is not a backup from this game before touching storage.
  function parse(text) {
    let data;
    try { data = JSON.parse(text); } catch (_) { throw Error('檔案不是有效的存檔備份'); }
    if (!data || data.format !== FORMAT || !Array.isArray(data.entries)) throw Error('這不是雀仙門的存檔備份');
    if (data.version !== VERSION) throw Error('存檔備份版本不相容');
    for (const entry of data.entries) {
      if (!entry || typeof entry.key !== 'string' || !entry.key || entry.key.length > 256 || !('value' in entry))
        throw Error('存檔備份內容損壞');
    }
    if (new Set(data.entries.map(e => e.key)).size !== data.entries.length) throw Error('存檔備份內容重複');
    const profile = data.entries.find(e => e.key === 'cultivationProgressionV1');
    if (profile && root.MahjongCultivationProgression) {
      try { root.MahjongCultivationProgression.validate(profile.value); } catch (_) { throw Error('備份中的修為資料無法讀取'); }
    }
    return data;
  }
  function readFile(file) {
    if (!file) return Promise.reject(Error('未選擇檔案'));
    if (file.size > MAX_BYTES) return Promise.reject(Error('檔案過大，不是有效的存檔備份'));
    return file.text();
  }
  function confirmImport(data) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'save-backup-dialog';
      const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('zh-TW') : '未知時間';
      dialog.innerHTML = `<h2>匯入存檔備份？</h2><p>備份時間：${when}</p><p>內容：${summarize(data.entries)}</p><p class="save-backup-warn">匯入會<strong>取代這台裝置目前所有的存檔與修為</strong>，無法復原。建議先匯出目前的存檔。</p><div class="save-backup-actions"><button type="button" value="cancel">取消</button><button type="button" value="ok" class="primary">確認匯入</button></div>`;
      document.body.append(dialog);
      const finish = ok => { dialog.close(); dialog.remove(); resolve(ok); };
      dialog.querySelector('[value="cancel"]').onclick = () => finish(false);
      dialog.querySelector('[value="ok"]').onclick = () => finish(true);
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      dialog.showModal();
    });
  }
  async function importFile(file) {
    const data = parse(await readFile(file));
    if (!await confirmImport(data)) return { imported: false };
    await writeAll(data.entries);
    return { imported: true, count: data.entries.length };
  }

  // Home screen controls.
  function mount() {
    const actions = document.querySelector('#startHome .start-actions') || document.querySelector('.start-actions');
    if (!actions || document.getElementById('saveBackupRow')) return;
    const row = document.createElement('div');
    row.id = 'saveBackupRow'; row.className = 'save-backup-row';
    row.innerHTML = '<span>存檔備份</span><button type="button" id="saveExportBtn">匯出</button><button type="button" id="saveImportBtn">匯入</button><input type="file" id="saveImportFile" accept="application/json,.json" hidden><p id="saveBackupStatus" role="status"></p>';
    actions.after(row);
    const status = row.querySelector('#saveBackupStatus'), input = row.querySelector('#saveImportFile');
    const busy = on => row.querySelectorAll('button').forEach(b => { b.disabled = on; });
    row.querySelector('#saveExportBtn').onclick = async () => {
      busy(true);
      try { const r = await exportFile(); status.textContent = `已匯出：${r.summary}。請把檔案存到安全的地方。`; }
      catch (error) { status.textContent = `匯出失敗：${error.message}`; }
      finally { busy(false); }
    };
    row.querySelector('#saveImportBtn').onclick = () => { input.value = ''; input.click(); };
    input.onchange = async () => {
      busy(true);
      try {
        const r = await importFile(input.files[0]);
        if (r.imported) { status.textContent = '匯入完成，正在重新載入…'; setTimeout(() => root.location.reload(), 300); }
        else status.textContent = '已取消匯入，存檔沒有變動。';
      } catch (error) { status.textContent = `匯入失敗：${error.message}。存檔沒有變動。`; }
      finally { busy(false); }
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  root.MahjongSaveBackup = Object.freeze({ exportFile, importFile, parse, readAll, summarize });
})(typeof window !== 'undefined' ? window : globalThis);
