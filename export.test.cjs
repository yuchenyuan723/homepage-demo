'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cleanModel, serialize, prepare, renderHTML, CONTENT_TOKEN } = require('./export.js');
const { buildTemplate } = require('./build-export.cjs');
const photo = 'data:image/png;base64,aGVsbG8=';

test('JSON survives script closing tags, HTML and Unicode separators', () => {
  const model = { text: '</script><script>alert(1)</script>&中文\u2028\u2029', dollar: '$&' };
  const encoded = serialize(model);
  assert.doesNotMatch(encoded, /[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(encoded), model);
  const html = renderHTML({ html: '<script>window.BIRTHDAY_CONTENT=' + CONTENT_TOKEN + ';</script>' }, model);
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  const embedded = html.slice('<script>window.BIRTHDAY_CONTENT='.length, -';</script>'.length);
  assert.deepEqual(JSON.parse(embedded), model);
  assert.equal(JSON.parse(embedded).dollar, '$&');
  assert.throws(() => renderHTML({ html: CONTENT_TOKEN + CONTENT_TOKEN }, model));
});

test('sharing model keeps real photos, clears unfinished text and preserves magazine and gift positions', () => {
  const input = {
    basics: { name: '朋友', age: 18 }, signature: '【待填写：署名】', letter: '生日快乐',
    memories: [{ file: '', title: '无照片' }, { file: photo, title: '【待填写：标题】', text: '【待填写：文字】', date: '【日期 / 地点】' }, { file: photo, title: '旅行', text: '真的很开心' }],
    magazine: [{ file: '' }, { file: photo }],
    gifts: [{ title: '默认标题', text: '【待填写：礼物】' }, { title: '约定', text: '一起看海' }]
  };
  const snapshot = JSON.stringify(input);
  const result = cleanModel(input);
  assert.equal(result.sharing, true);
  assert.equal(result.memories.length, 2);
  assert.deepEqual(result.memories[0], { file: photo, title: '', text: '', date: '' });
  assert.equal(result.memories[1].title, '旅行');
  assert.equal(result.magazine[0].file, '');
  assert.equal(result.magazine[1].file, photo);
  assert.deepEqual(result.gifts[0], { title: '', text: '' });
  assert.equal(result.gifts[1].text, '一起看海');
  assert.equal(result.basics.age, 18);
  assert.equal(JSON.stringify(input), snapshot);
});

test('relative images and audio are embedded once and do not mutate input', async () => {
  const calls = [];
  const input = { memories: [{ file: 'photos/us.png' }], magazine: [{ file: 'photos/us.png' }], music: 'song.mp3' };
  const result = await prepare(input, { baseURL: 'https://example.test/birthday/index.html', fetch: async url => {
    calls.push(url);
    return { ok: true, blob: async () => new Blob(['hello'], { type: url.endsWith('.mp3') ? 'audio/mpeg' : 'image/png' }) };
  } });
  assert.deepEqual(calls, ['https://example.test/birthday/photos/us.png', 'https://example.test/birthday/song.mp3']);
  assert.equal(result.content.memories[0].file, photo);
  assert.match(result.content.music, /^data:audio\/mpeg;base64,/);
  assert.equal(input.music, 'song.mp3');
});

test('unavailable defaults are omitted, but unavailable custom assets require re-import', async () => {
  const options = { baseURL: 'file:///C:/birthday/index.html', fetch: async () => { throw new Error('blocked'); } };
  const result = await prepare({ memories: [{ file: 'memory-01.jpg' }], magazine: [{ file: 'magazine-01.jpg' }], music: 'happybirthday.mp3' }, options);
  assert.deepEqual(result.content.memories, []);
  assert.equal(result.content.magazine[0].file, '');
  assert.equal(result.content.music, '');
  assert.ok(result.warnings.some(item => item.includes('memory-01.jpg')));
  await assert.rejects(prepare({ memories: [{ file: 'my-photo.jpg' }] }, options), /重新导入/);
});

test('HTML error pages and executable asset schemes cannot become embedded photos', async () => {
  await assert.rejects(prepare({ memories: [{ file: 'custom.png' }] }, { fetch: async () => ({ ok: true, blob: async () => new Blob(['404'], { type: 'text/html' }) }) }), /重新导入/);
  await assert.rejects(prepare({ memories: [{ file: 'javascript:alert(1)' }] }), /重新导入/);
});

test('built template contains app, both stylesheets, SVG, and no editor or script dependencies', () => {
  const template = buildTemplate(__dirname);
  const html = renderHTML(template, cleanModel({ memories: [{ file: photo }] }));
  for (const name of ['style.css', 'art-direction.css']) assert.ok(html.includes(fs.readFileSync(path.join(__dirname, name), 'utf8')));
  assert.ok(html.includes(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script')));
  assert.match(html, /<symbol id="bunny"/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|editor\.js|editor\.css|export-template\.js/);
  assert.equal(html.includes(CONTENT_TOKEN), false);
  const context = { window: {} };
  vm.runInNewContext(html.match(/<script>window.BIRTHDAY_CONTENT = ([\s\S]*?)<\/script>/)[0].replace(/^<script>|<\/script>$/g, ''), context);
  assert.equal(context.window.BIRTHDAY_CONTENT.sharing, true);
  assert.equal(context.window.BIRTHDAY_CONTENT.memories[0].file, photo);
});

test('browser API confirms preflight before downloading UTF-8 HTML and supports cancellation', async () => {
  const clicks = [], messages = [], blobs = [];
  let approve = false;
  const context = { window: {
    BIRTHDAY_EXPORT_TEMPLATE: buildTemplate(__dirname), Blob, URL: { createObjectURL: blob => { blobs.push(blob); return 'blob:download'; }, revokeObjectURL() {} },
    confirm: message => { messages.push(message); return approve; }, setTimeout() {},
    document: { body: { append() {} }, createElement: () => ({ click() { clicks.push(this.download); }, remove() {} }) }
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'export.js'), 'utf8'), context);
  const api = context.window.BirthdayExport;
  assert.equal((await api.export({})).cancelled, true);
  assert.equal(clicks.length, 0);
  approve = true;
  const result = await api.export({ basics: { name: '中文朋友' }, letter: '生日快乐' });
  assert.equal(result.cancelled, false);
  assert.match(clicks[0], /中文朋友/);
  assert.equal(blobs[0].type, 'text/html;charset=utf-8');
  assert.match(await blobs[0].text(), /生日快乐/);
  assert.match(messages[1], /MB/);
});
