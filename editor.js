/* Birthday editor. Persistence deliberately uses ONE IndexedDB document containing
 * compressed image/audio data URLs. A completed readwrite transaction is the only
 * saved acknowledgement. This keeps backups/exports portable without Blob URL lifetime
 * dependencies; quota failures retain the working copy and offer a JSON backup. */
(() => {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const defaults = { nickname: '小刘老师', age: '18', birthday: '农历十月初五', greeting: '亲爱的小刘老师，', heroLine1: '今天的快乐，', heroLine2: '全部属于你。', heroCopy: '把喜欢藏进小小的角落，\n等你慢慢发现，慢慢打开。' };
  const DB_NAME = 'birthday-editor-v1', KEY = 'document', VERSION = 1;
  let model, db, revision = 0, generation = 0, savedGeneration = 0, timer, saving = false, conflict = false, ready = false, busy = false;
  let panel, body, status, notice, toggle, channel, dragId, sessionSnapshot, open = false, fieldId = 0;
  const client = window.crypto?.randomUUID?.() || String(Math.random());
  const uid = () => window.crypto?.randomUUID?.() || `memory-${Date.now()}-${Math.random()}`;
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (text, action, className = '') => {
    const node = el('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node;
  };
  const message = (text, error = false) => { notice.textContent = text; notice.classList.toggle('is-error', error); };
  const state = (text, kind = '') => { status.textContent = text; status.dataset.state = kind; };
  const normalize = source => {
    const value = clone(source);
    value.basics = { ...defaults, ...value.basics };
    value.memories = (value.memories || []).map(item => ({ ...item, id: item.id || uid(), position: position(item.position) }));
    value.magazine = (value.magazine || []).map(item => ({ ...item, position: position(item.position) }));
    return value;
  };
  function position(value) {
    if (value && typeof value === 'object') return { x: Math.max(0, Math.min(100, Number(value.x) || 0)), y: Math.max(0, Math.min(100, Number(value.y) || 0)) };
    return { x: 50, y: 50 };
  }
  function preview() {
    try { window.BirthdayApp.render(clone(model)); } catch (error) { message(`预览失败：${error.message}`, true); }
  }
  function changed() {
    generation++; preview();
    if (conflict) { state('其他标签页有更新 · 暂停保存', 'error'); return; }
    state('有未保存的修改', 'pending');
    clearTimeout(timer); timer = setTimeout(save, 650);
  }
  function connect() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('此浏览器不支持 IndexedDB'));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('documents');
      request.onsuccess = () => { const database = request.result; database.onversionchange = () => { database.close(); db = null; state('存储连接已关闭，请先备份再刷新', 'error'); }; resolve(database); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => message('数据库被其他页面占用，请关闭旧页面后重试。', true);
    });
  }
  function readDocument() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readonly'), request = tx.objectStore('documents').get(KEY);
      let value; request.onsuccess = () => { value = request.result; };
      tx.oncomplete = () => resolve(value); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('读取中断'));
    });
  }
  async function save() {
    clearTimeout(timer);
    if (!ready || conflict || saving || generation === savedGeneration) return;
    if (!db) { state('未保存 · 存储不可用，请下载备份', 'error'); return; }
    saving = true; const snapshot = clone(model), currentGeneration = generation;
    state('正在保存…', 'pending');
    try {
      const nextRevision = await new Promise((resolve, reject) => {
        const tx = db.transaction('documents', 'readwrite'), store = tx.objectStore('documents');
        let next, collided = false;
        const request = store.get(KEY);
        request.onsuccess = () => {
          if ((request.result?.revision || 0) !== revision) { collided = true; tx.abort(); return; }
          next = revision + 1;
          store.put({ version: VERSION, revision: next, updatedAt: new Date().toISOString(), content: snapshot }, KEY);
        };
        tx.oncomplete = () => resolve(next);
        tx.onabort = tx.onerror = () => reject(collided ? new Error('CONFLICT') : tx.error || new Error('保存事务中断'));
      });
      revision = nextRevision; savedGeneration = currentGeneration;
      channel?.postMessage({ client, revision });
      if (conflict) state('其他标签页有更新 · 暂停保存', 'error');
      else if (generation === savedGeneration) state('已保存到此浏览器', 'saved');
      else state('有未保存的修改', 'pending');
      return true;
    } catch (error) {
      if (error.message === 'CONFLICT') flagConflict();
      else { state('保存失败 · 请下载 JSON 备份', 'error'); message(`浏览器存储失败（可能空间不足或隐私模式限制）。修改仍在当前页面内。${error.message}`, true); }
    } finally {
      saving = false;
      if (!conflict && savedGeneration === currentGeneration && generation !== savedGeneration) timer = setTimeout(save, 650);
    }
  }
  function flagConflict() {
    conflict = true; clearTimeout(timer); state('其他标签页有更新 · 暂停保存', 'error');
    message('检测到其他标签页更新。请先下载备份，再点击“载入已保存版本”。当前修改不会自动覆盖另一页。', true);
  }
  async function reloadSaved() {
    if (saving) { message('正在完成保存，请稍后再载入。'); return; }
    if (!db) { message('存储不可用，请先备份，再刷新页面。', true); return; }
    if (!window.confirm('载入浏览器已保存版本？当前页面尚未保存的修改将被替换。建议先下载备份。')) return;
    try {
      const record = await readDocument();
      if (!record) throw new Error('没有已保存的版本');
      validate(record.content); model = normalize(record.content); revision = record.revision;
      generation++; savedGeneration = generation; conflict = false; window.BirthdayApp.stopMusic(); preview(); buildForms(); state('已载入保存版本', 'saved'); message('已载入此浏览器最新的保存版本。');
    } catch (error) { message(`载入失败：${error.message}`, true); }
  }
  function field(parent, label, target, key, multiline = false, type = 'text') {
    const wrap = el('div', 'be-field'), labelNode = el('label', '', label), input = el(multiline ? 'textarea' : 'input');
    input.id = `be-field-${++fieldId}`; labelNode.htmlFor = input.id;
    if (!multiline) input.type = type; else input.rows = 3;
    input.value = target[key] ?? ''; input.maxLength = multiline ? 20000 : 300;
    input.addEventListener('input', () => { target[key] = input.value; changed(); });
    wrap.append(labelNode, input); parent.append(wrap); return input;
  }
  function section(title, expanded = false) {
    const details = el('details', 'be-section'); details.open = expanded; details.append(el('summary', '', title));
    const content = el('div', 'be-section-content'); details.append(content); body.append(details); return content;
  }
  function filePicker(accept, multiple, action, text) {
    const wrap = el('label', 'be-file-button', text), input = el('input'); input.type = 'file'; input.accept = accept; input.multiple = multiple;
    input.addEventListener('change', async () => { const files = [...input.files]; input.value = ''; if (files.length) await task(() => action(files)); });
    wrap.append(input); return wrap;
  }
  async function task(action) {
    if (busy) { message('请等待当前媒体或导出操作完成。'); return; }
    busy = true; panel.classList.add('be-busy'); body.inert = true;
    try { await action(); } catch (error) { message(error.message || '操作失败，请重试。', true); }
    finally { busy = false; panel.classList.remove('be-busy'); body.inert = false; }
  }
  function isEmpty(item) { return !item.file || /^(memory|magazine)-\d+\.(jpg|png|webp)$/i.test(item.file); }
  function moveMemory(id, direction) {
    const index = model.memories.findIndex(item => item.id === id), next = index + direction;
    if (index < 0 || next < 0 || next >= model.memories.length) return;
    const [item] = model.memories.splice(index, 1); model.memories.splice(next, 0, item); changed(); buildForms('memories');
  }
  function photoCard(parent, item, index, memory) {
    const card = el('article', 'be-photo-card');
    const heading = el('div', 'be-card-heading'); heading.append(el('strong', '', `${String(index + 1).padStart(2, '0')} · ${memory ? '回忆' : '特刊照片'}`));
    if (memory) {
      const handle = el('span', 'be-drag', '⠿ 拖动排序'); handle.draggable = true; handle.title = '拖动此处排序；也可使用上移和下移按钮';
      handle.addEventListener('dragstart', event => { dragId = item.id; event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; });
      handle.addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.be-drop').forEach(node => node.classList.remove('be-drop')); });
      card.addEventListener('dragover', event => { if (dragId) { event.preventDefault(); card.classList.add('be-drop'); } });
      card.addEventListener('dragleave', () => card.classList.remove('be-drop'));
      card.addEventListener('drop', event => {
        event.preventDefault(); card.classList.remove('be-drop');
        const from = model.memories.findIndex(entry => entry.id === dragId), to = model.memories.indexOf(item);
        if (from >= 0 && to >= 0 && from !== to) { const [entry] = model.memories.splice(from, 1); model.memories.splice(to, 0, entry); changed(); buildForms('memories'); }
        dragId = null;
      });
      heading.append(handle);
    }
    card.dataset.photoIndex = String(index); card.dataset.photoKind = memory ? 'memories' : 'magazine';
    card.append(heading);
    const image = el('img', 'be-thumbnail'); image.alt = memory ? item.title || '回忆照片预览' : item.alt || '特刊照片预览'; image.loading = 'lazy';
    image.style.objectPosition = `${item.position.x}% ${item.position.y}%`;
    const empty = el('p', 'be-empty', '尚未添加照片');
    if (item.file) { image.src = item.file; empty.hidden = true; } else image.hidden = true;
    image.addEventListener('error', () => { image.hidden = true; empty.hidden = false; }); card.append(image, empty);
    const actions = el('div', 'be-row');
    actions.append(filePicker('image/jpeg,image/png,image/webp', false, async files => {
      const data = await compressImage(files[0]); item.file = data; changed(); buildForms(memory ? 'memories' : 'magazine'); message('照片已处理，最长边不超过 2000 像素。');
    }, '上传 / 替换'), button('移除', () => { item.file = ''; changed(); buildForms(memory ? 'memories' : 'magazine'); }));
    if (memory) {
      const up = button('↑ 上移', () => moveMemory(item.id, -1)), down = button('↓ 下移', () => moveMemory(item.id, 1));
      up.disabled = index === 0; down.disabled = index === model.memories.length - 1; actions.append(up, down);
    }
    card.append(actions);
    for (const axis of ['x', 'y']) {
      const row = el('div', 'be-focal'), label = el('label', '', axis === 'x' ? '焦点 · 左右' : '焦点 · 上下'), input = el('input');
      input.id = `be-field-${++fieldId}`; input.type = 'range'; input.min = '0'; input.max = '100'; input.value = item.position[axis]; label.htmlFor = input.id;
      input.addEventListener('input', () => { item.position[axis] = Number(input.value); image.style.objectPosition = `${item.position.x}% ${item.position.y}%`; changed(); }); row.append(label, input); card.append(row);
    }
    if (memory) { field(card, '标题', item, 'title'); field(card, '日期 / 地点', item, 'date'); field(card, '照片背后的话', item, 'text', true); }
    else { field(card, '标签', item, 'label'); field(card, '图片描述（供无障碍阅读）', item, 'alt'); }
    parent.append(card);
  }
  function buildForms(focusSection) {
    const expanded = [...body.querySelectorAll('details')].map(node => node.open), scroll = body.scrollTop;
    body.replaceChildren();
    const basic = section('01 / 生日主角', true);
    [['昵称', 'nickname'], ['年龄', 'age'], ['生日文字', 'birthday'], ['开场问候', 'greeting'], ['主标题 · 第一行', 'heroLine1'], ['主标题 · 第二行', 'heroLine2'], ['首页寄语', 'heroCopy']].forEach(([label, key]) => field(basic, label, model.basics, key, key === 'heroCopy'));
    const memories = section('02 / 20 个回忆'); memories.parentElement.dataset.section = 'memories';
    memories.append(el('p', 'be-help', 'JPEG / PNG / WebP，每张最多 25 MB。批量上传按顺序填入空位或默认示例位；整张卡片的文字随照片一起排序。'));
    memories.append(filePicker('image/jpeg,image/png,image/webp', true, async files => {
      const slots = model.memories.filter(isEmpty);
      if (!slots.length) throw new Error('没有空位，请先移除照片，或在卡片中替换。');
      const count = Math.min(files.length, slots.length), failures = [];
      let done = 0;
      for (let index = 0; index < count; index++) {
        try { const data = await compressImage(files[index]); slots[index].file = data; done++; changed(); } catch (error) { failures.push(`${files[index].name}: ${error.message}`); }
      }
      buildForms('memories'); message(`已加入 ${done} 张。${files.length > count ? `另有 ${files.length - count} 张因空位不足未加入。` : ''}${failures.join('；')}`, failures.length > 0);
    }, '批量加入回忆照片'));
    model.memories.forEach((item, index) => photoCard(memories, item, index, true));
    const magazine = section('03 / 生日特刊'); magazine.parentElement.dataset.section = 'magazine';
    field(magazine, '特刊标题（可选）', model, 'magazineTitle');
    model.magazine.forEach((item, index) => photoCard(magazine, item, index, false));
    field(magazine, '给新老师的话', model, 'teacherMessage', true); field(magazine, '编辑寄语', model, 'editorMessage', true);
    const letters = section('04 / 信与礼物'); field(letters, '生日信', model, 'letter', true); field(letters, '署名', model, 'signature');
    model.gifts.forEach((gift, index) => { const group = el('div', 'be-gift'); group.append(el('h3', '', `礼物 ${index + 1}`)); field(group, '礼物标题', gift, 'title'); field(group, '礼物内容', gift, 'text', true); letters.append(group); });
    const music = section('05 / 背景音乐'); music.append(el('p', 'be-help', '选择浏览器可播放的音频，最多 20 MB。移除后使用默认生日旋律。'));
    music.append(el('p', 'be-help', model.music?.startsWith('data:') ? '已设置自定义音乐' : model.music ? `当前：${model.music}` : '当前：默认生日旋律'));
    music.append(filePicker('audio/*,.mp3,.m4a,.wav,.ogg,.webm', false, async files => { const data = await audioData(files[0]); window.BirthdayApp.stopMusic(); model.music = data; changed(); buildForms(); message('已设置音乐；请在预览中点击播放。'); }, '上传背景音乐'), button('移除音乐', () => { window.BirthdayApp.stopMusic(); model.music = ''; changed(); buildForms(); }));
    [...body.querySelectorAll('details')].forEach((node, index) => { if (expanded.length) node.open = expanded[index]; if (node.dataset.section === focusSection) node.open = true; }); body.scrollTop = scroll;
  }
  function asDataURL(blob) {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('读取文件失败')); reader.readAsDataURL(blob); });
  }
  async function compressImage(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('仅支持 JPEG、PNG、WebP 照片');
    if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('照片须大于 0 且不超过 25 MB');
    const url = URL.createObjectURL(file), image = new Image();
    try {
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('照片无法解码，请换一张图片')); image.src = url; });
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('无效图片尺寸');
      const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight)), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error('浏览器无法处理图片');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .86));
      if (!blob) throw new Error('照片压缩失败'); return await asDataURL(blob);
    } finally { URL.revokeObjectURL(url); }
  }
  async function audioData(file) {
    if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('音乐须大于 0 且不超过 20 MB');
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg|webm)$/i.test(file.name)) throw new Error('请选择音频文件');
    const url = URL.createObjectURL(file), audio = new Audio();
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('音频验证超时，请换一个文件')), 15000);
        audio.onloadeddata = () => { clearTimeout(timeout); resolve(); };
        audio.onerror = () => { clearTimeout(timeout); reject(new Error('浏览器无法解码此音频')); }; audio.preload = 'auto'; audio.src = url; audio.load();
      });
      const extension = file.name.split('.').pop().toLowerCase(), mime = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm' }[extension];
      return await asDataURL(new Blob([file], { type: file.type.startsWith('audio/') ? file.type : mime }));
    } finally { audio.pause(); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url); }
  }
  function validate(content) {
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const text = (value, name, limit = 20000) => { if (typeof value !== 'string' || value.length > limit) throw new Error(`${name} 格式不正确`); };
    const media = (value, kind) => {
      text(value, '媒体', 40 * 1024 * 1024);
      if (!value) return;
      if (value.startsWith('data:')) {
        const pattern = kind === 'image' ? /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]*={0,2}$/ : /^data:audio\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]*={0,2}$/i;
        if (!pattern.test(value)) throw new Error('备份包含不支持的媒体数据');
      } else if (!/^(?:[\w\- .\u0080-\uffff]+\/)*[\w\- .\u0080-\uffff]+\.(?:jpg|jpeg|png|webp|mp3|m4a|wav|ogg|webm)$/i.test(value) || value.includes('..')) throw new Error('备份包含不安全的媒体地址');
    };
    if (!object(content) || !object(content.basics)) throw new Error('缺少生日基本信息');
    Object.keys(defaults).forEach(key => text(content.basics[key], key));
    ['letter', 'signature', 'teacherMessage', 'editorMessage'].forEach(key => text(content[key], key)); media(content.music, 'audio');
    if (!Array.isArray(content.memories) || content.memories.length !== 20 || !Array.isArray(content.magazine) || content.magazine.length !== 4 || !Array.isArray(content.gifts) || content.gifts.length !== 3) throw new Error('备份需要 20 个回忆、4 张特刊照片及 3 份礼物');
    const ids = new Set();
    content.memories.forEach(item => { if (!object(item)) throw new Error('回忆格式错误'); ['title', 'date', 'text', 'id'].forEach(key => text(item[key], key)); if (!item.id || ids.has(item.id)) throw new Error('回忆 ID 重复或缺失'); ids.add(item.id); });
    content.magazine.forEach(item => { if (!object(item)) throw new Error('特刊格式错误'); ['label', 'alt'].forEach(key => text(item[key], key)); });
    [...content.memories, ...content.magazine].forEach(item => { media(item.file, 'image'); if (!object(item.position) || !['x', 'y'].every(axis => Number.isFinite(item.position[axis]) && item.position[axis] >= 0 && item.position[axis] <= 100)) throw new Error('照片焦点必须在 0–100 之间'); });
    content.gifts.forEach(item => { if (!object(item)) throw new Error('礼物格式错误'); text(item.title, '礼物标题'); text(item.text, '礼物内容'); });
  }
  async function portableContent() {
    const snapshot = clone(model), missing = [];
    const assets = [...snapshot.memories, ...snapshot.magazine].map(item => [item, 'file']); assets.push([snapshot, 'music']);
    for (const [target, key] of assets) {
      const path = target[key]; if (!path || path.startsWith('data:')) continue;
      try {
        const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
        let response; try { response = await fetch(path, { signal: controller.signal }); } finally { clearTimeout(timeout); }
        if (!response.ok) throw new Error('not found');
        const blob = await response.blob();
        target[key] = key === 'music' ? await audioData(new File([blob], path.split('/').pop(), { type: blob.type })) : await compressImage(blob);
      } catch (_) { missing.push(path); target[key] = ''; }
    }
    if (missing.length && !window.confirm(`以下 ${missing.length} 个本地媒体未能读取，将在此次备份/导出中留空（音乐使用默认旋律）：\n${missing.slice(0, 8).join('\n')}\n\n是否继续？原编辑内容不会改变。`)) throw new Error('已取消，编辑内容未改变。');
    return snapshot;
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), link = el('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function backup() {
    message('正在准备包含媒体的 JSON 备份…'); const snapshot = await portableContent();
    download(new Blob([JSON.stringify({ format: 'birthday-editor', version: VERSION, exportedAt: new Date().toISOString(), content: snapshot })], { type: 'application/json' }), `birthday-backup-${new Date().toISOString().slice(0, 10)}.json`);
    message('已生成 JSON 备份下载，请确认文件已保存在你的设备上。');
  }
  async function importBackup(file) {
    if (file.size > 250 * 1024 * 1024) throw new Error('备份超过 250 MB，无法导入');
    let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('无法读取 JSON 备份'); }
    if (!data || data.format !== 'birthday-editor' || data.version !== VERSION) throw new Error('备份格式或版本不兼容（需要 version 1）');
    validate(data.content);
    message('正在验证备份中的照片和音乐…');
    for (const item of [...data.content.memories, ...data.content.magazine]) {
      if (!item.file.startsWith('data:')) continue;
      const blob = await (await fetch(item.file)).blob();
      await compressImage(blob);
    }
    if (data.content.music.startsWith('data:')) {
      const blob = await (await fetch(data.content.music)).blob();
      await audioData(new File([blob], 'imported-audio', { type: blob.type }));
    }
    if (conflict) throw new Error('请先解决标签页冲突，再导入备份');
    if (saving) throw new Error('正在保存，请稍后再导入');
    if (!db) throw new Error('浏览器存储不可用，无法安全替换保存版本；请保留此备份文件。');
    if (!window.confirm('导入将替换当前全部文字、照片和音乐，并保存到此浏览器。确认继续？建议先备份当前作品。')) return;
    const previous = model, previousGeneration = generation;
    window.BirthdayApp.stopMusic(); model = normalize(data.content); generation++; clearTimeout(timer);
    const committed = await save();
    if (!committed) { model = previous; generation = previousGeneration; preview(); buildForms(); throw new Error('导入未能保存，已恢复导入前的编辑内容；浏览器原保存版本未被本次导入替换。'); }
    preview(); buildForms(); message('备份已导入并保存到此浏览器。');
  }
  async function exportPage() {
    if (typeof window.BirthdayExport?.export !== 'function') throw new Error('导出模块尚未就绪，请确认 export.js 已加载');
    message('正在整理媒体并生成离线网页…'); const snapshot = await portableContent();
    const result = await window.BirthdayExport.export(snapshot);
    message(result?.cancelled ? '已取消导出。' : '离线网页已生成，请确认下载并打开检查。');
  }
  function setOpen(value) {
    if (value && !open) sessionSnapshot = clone(model);
    open = value; panel.hidden = !value; toggle.setAttribute('aria-expanded', String(value)); document.body.classList.toggle('birthday-editing', value);
    if (value) panel.querySelector('button').focus(); else toggle.focus();
  }
  async function init() {
    if (!window.BirthdayApp?.render || !window.BirthdayApp?.getContent) { console.error('BirthdayEditor requires BirthdayApp after app.js'); return; }
    model = normalize(window.BirthdayApp.getContent() || window.BIRTHDAY_CONTENT);
    panel = el('aside', 'birthday-editor'); panel.id = 'birthday-editor'; panel.hidden = true; panel.setAttribute('aria-label', '生日礼物编辑器');
    const heading = el('header', 'be-header'), titles = el('div'); titles.append(el('span', 'be-eyebrow', 'MAKE IT YOURS'), el('h2', '', '把偏爱写进这一页'));
    heading.append(titles, button('×', () => setOpen(false), 'be-close')); heading.lastChild.setAttribute('aria-label', '关闭编辑器'); panel.append(heading);
    status = el('p', 'be-status', '正在读取浏览器保存…'); status.setAttribute('role', 'status'); panel.append(status);
    notice = el('p', 'be-notice', '内容只保存在当前浏览器。分享前请导出离线网页，并定期下载备份。'); notice.setAttribute('aria-live', 'polite'); panel.append(notice);
    const tools = el('div', 'be-tools');
    tools.append(button('预览', () => { preview(); setOpen(false); }), button('备份 JSON', () => task(backup)), filePicker('.json,application/json', false, files => importBackup(files[0]), '导入备份'), button('导出离线网页 ↗', () => task(exportPage), 'be-primary'));
    panel.append(tools); body = el('div', 'be-body'); panel.append(body);
    const foot = el('footer', 'be-footer'); foot.append(button('立即保存', save), button('撤销本次编辑', () => {
      if (busy || !sessionSnapshot) return;
      if (!window.confirm('恢复到本次打开编辑器时的内容？这也会撤回本次已经自动保存的修改。')) return;
      window.BirthdayApp.stopMusic(); model = clone(sessionSnapshot); changed(); buildForms(); message('已恢复打开编辑器时的内容，请查看保存状态。');
    }), button('载入已保存版本', () => task(reloadSaved))); panel.append(foot);
    toggle = button('✎ 编辑这份礼物', () => setOpen(!open), 'birthday-editor-toggle'); toggle.setAttribute('aria-controls', panel.id); toggle.setAttribute('aria-expanded', 'false');
    document.body.append(toggle, panel); toggle.disabled = true;
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
      if (event.key === 'Tab' && window.matchMedia('(max-width: 760px)').matches) {
        const nodes = [...panel.querySelectorAll('button,input,textarea,summary,[tabindex="0"]')].filter(node => !node.disabled && node.getClientRects().length), first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    try {
      db = await connect(); const record = await readDocument();
      if (record) { if (record.version !== VERSION) throw new Error('保存版本不兼容'); validate(record.content); model = normalize(record.content); revision = record.revision; state('已载入浏览器保存', 'saved'); }
      else state('尚未修改 · 使用初始内容');
    } catch (error) { db = null; state('存储不可用 · 请使用 JSON 备份', 'error'); message(`无法读取浏览器存储：${error.message}。你仍可以编辑、备份和导出。`, true); }
    ready = true; toggle.disabled = false; preview(); buildForms();
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(DB_NAME); channel.onmessage = event => { if (event.data?.client !== client && event.data?.revision > revision) flagConflict(); };
    }
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) { save(); return; }
      if (!db || saving) return;
      try { const record = await readDocument(); if ((record?.revision || 0) > revision) flagConflict(); } catch (_) { /* Save will surface storage errors. */ }
    });
    document.addEventListener('click', event => {
      if (!open || busy || panel.contains(event.target)) return;
      const target = event.target.closest('[data-edit-memory],[data-edit-magazine]');
      if (!target) return;
      const memory = target.hasAttribute('data-edit-memory');
      const index = Number(target.getAttribute(memory ? 'data-edit-memory' : 'data-edit-magazine'));
      if (!Number.isInteger(index)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      window.BirthdayEditor.editPhoto(memory ? 'memories' : 'magazine', index);
    }, true);
    window.addEventListener('beforeunload', event => { if (generation !== savedGeneration || busy) { event.preventDefault(); event.returnValue = ''; } });
    window.BirthdayEditor = { open: () => setOpen(true), close: () => setOpen(false), editPhoto: (kind, index) => {
      if (!['memories', 'magazine'].includes(kind) || !Number.isInteger(index)) return;
      setOpen(true); const details = body.querySelector(`[data-section="${kind}"]`); if (details) details.open = true;
      const card = body.querySelector(`[data-photo-kind="${kind}"][data-photo-index="${index}"]`);
      if (card) { card.scrollIntoView({ block: 'center', behavior: 'auto' }); card.querySelector('input')?.focus({ preventScroll: true }); }
    }, getContent: () => clone(model), save, get status() { return { ready, saving, busy, conflict, dirty: generation !== savedGeneration, revision, storage: Boolean(db) }; } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
