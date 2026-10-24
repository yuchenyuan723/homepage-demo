/* Single-file sharing. Rebuild export-template.js after changing the page or app. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BirthdayExport = api;
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  const CONTENT_TOKEN = '__BIRTHDAY_EXPORT_CONTENT_JSON__';
  const placeholder = /待填写|待放入|待上传|请上传|【\s*日期\s*[/／]\s*地点\s*】/;
  const text = value => typeof value === 'string' && !placeholder.test(value) ? value.trim() : '';
  const file = value => typeof value === 'string' ? value.trim() : '';
  const list = value => Array.isArray(value) ? value : [];
  function serialize(value) {
    return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => ({
      '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029'
    })[character]);
  }
  function cleanModel(input) {
    input = input && typeof input === 'object' ? input : {};
    const basics = {};
    for (const [key, value] of Object.entries(input.basics || {})) {
      if (typeof value === 'string') Object.defineProperty(basics, key, { value: text(value), enumerable: true });
      else if (typeof value === 'number' && Number.isFinite(value)) basics[key] = value;
    }
    return {
      sharing: true, basics, music: file(input.music),
      signature: text(input.signature), letter: text(input.letter),
      teacherMessage: text(input.teacherMessage), editorMessage: text(input.editorMessage),
      memories: list(input.memories).filter(item => item && file(item.file)).map(item => ({
        file: file(item.file), title: text(item.title), date: text(item.date), text: text(item.text)
      })),
      magazine: list(input.magazine).map(item => ({
        file: file(item && item.file), label: text(item && item.label), alt: text(item && item.alt)
      })),
      gifts: list(input.gifts).map(item => {
        const body = text(item && item.text);
        return { title: body ? text(item && item.title) : '', text: body };
      })
    };
  }
  function isDefault(source) {
    return /^(?:\.\/)?(?:(?:memory|magazine)-\d{2}\.jpg|happybirthday\.mp3)$/i.test(source);
  }
  async function embedAsset(source, kind, options, warnings) {
    if (!source) return '';
    if (new RegExp('^data:' + kind + '/[a-z0-9.+-]+(?:;[^,]*)?,', 'i').test(source)) return source;
    try {
      if (/^data:/i.test(source)) throw new Error('文件类型不正确');
      const url = new URL(source, options.baseURL);
      if (!['http:', 'https:', 'blob:', 'file:'].includes(url.protocol)) throw new Error('不支持此资源地址');
      const response = await options.fetch(url.href);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const blob = await response.blob();
      if (!blob.size) throw new Error('文件为空');
      let mime = blob.type.split(';')[0].toLowerCase();
      if (!mime || mime === 'application/octet-stream') {
        const ext = url.pathname.split('.').pop().toLowerCase();
        mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4' })[ext] || '';
      }
      if (!mime.startsWith(kind + '/')) throw new Error('资源不是有效的' + (kind === 'image' ? '图片' : '音频'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let start = 0; start < bytes.length; start += 32768) binary += String.fromCharCode.apply(null, bytes.subarray(start, start + 32768));
      return 'data:' + mime + ';base64,' + root.btoa(binary);
    } catch (error) {
      if (isDefault(source)) {
        warnings.push('默认素材未找到，已省略：' + source);
        return '';
      }
      throw new Error('无法读取素材“' + source.slice(0, 120) + '”。请回到编辑器重新导入这张照片或音乐，再导出。' + (options.baseURL.startsWith('file:') ? ' 本地文件页面不能直接读取相邻文件。' : '') + ' 原因：' + error.message);
    }
  }
  async function prepare(input, options = {}) {
    const model = cleanModel(input);
    const warnings = [];
    const settings = { baseURL: options.baseURL || (root.location && root.location.href) || 'http://localhost/', fetch: options.fetch || (root.fetch && root.fetch.bind(root)) };
    const cache = new Map();
    const embed = (source, kind) => {
      const key = kind + ':' + source;
      if (!cache.has(key)) cache.set(key, embedAsset(source, kind, settings, warnings));
      return cache.get(key);
    };
    // Sequential reads keep peak memory bounded for large photo collections.
    for (const item of model.memories) item.file = await embed(item.file, 'image');
    model.memories = model.memories.filter(item => item.file);
    for (const item of model.magazine) item.file = await embed(item.file, 'image');
    model.music = await embed(model.music, 'audio');
    const omitted = list(input && input.memories).length - model.memories.length;
    if (omitted) warnings.push(omitted + ' 页没有可用照片的回忆将省略');
    const emptyMagazine = model.magazine.filter(item => !item.file).length;
    if (emptyMagazine) warnings.push(emptyMagazine + ' 个特刊空照片位置将隐藏');
    const emptyGifts = model.gifts.filter(item => !item.text).length;
    if (emptyGifts) warnings.push(emptyGifts + ' 份未填写的礼物将隐藏');
    if (!model.letter) warnings.push('生日信尚未填写');
    if (!model.signature) warnings.push('署名尚未填写');
    if (model.memories.some(item => !item.title || !item.text)) warnings.push('部分照片没有标题或文字：保留照片，省略未填写文字');
    return { content: model, warnings };
  }
  function renderHTML(template, model) {
    if (!template || typeof template.html !== 'string' || template.html.split(CONTENT_TOKEN).length !== 2) throw new Error('导出模板未就绪，请先运行 node build-export.cjs 并刷新页面。');
    return template.html.replace(CONTENT_TOKEN, () => serialize(model));
  }
  async function exportHTML(input) {
    const template = root.BIRTHDAY_EXPORT_TEMPLATE;
    // Validate before fetching potentially large assets.
    renderHTML(template, {});
    const prepared = await prepare(input);
    const html = renderHTML(template, prepared.content);
    const blob = new root.Blob([html], { type: 'text/html;charset=utf-8' });
    const size = (blob.size / 1024 / 1024).toFixed(2);
    const message = '导出离线生日礼物 HTML\n\n' + (prepared.warnings.length ? prepared.warnings.map(item => '• ' + item).join('\n') + '\n\n' : '') + '包含 ' + prepared.content.memories.length + ' 张回忆照片；预计文件大小 ' + size + ' MB。' + (blob.size > 25 * 1024 * 1024 ? '\n文件较大，手机打开和传输可能较慢。' : '') + '\n所有可用照片、音乐和页面资源都会嵌入文件。确认下载？';
    if (!root.confirm(message)) return { cancelled: true, warnings: prepared.warnings };
    const name = text(prepared.content.basics.nickname || prepared.content.basics.recipient || prepared.content.basics.name || '生日礼物').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').slice(0, 60) || '生日礼物';
    const filename = name + '-生日礼物.html';
    const url = root.URL.createObjectURL(blob);
    const anchor = root.document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.hidden = true;
    try { root.document.body.append(anchor); anchor.click(); }
    finally { anchor.remove(); root.setTimeout(() => root.URL.revokeObjectURL(url), 60000); }
    return { cancelled: false, filename, bytes: blob.size, warnings: prepared.warnings };
  }
  return { export: exportHTML, cleanModel, serialize, prepare, renderHTML, CONTENT_TOKEN };
});
