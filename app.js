'use strict';
let content = window.BIRTHDAY_CONTENT;
const $ = selector => document.querySelector(selector);
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function photoSlot(file, label, alt, eager = false, position) {
  const slot = element('div', undefined, 'photo-slot');
  const placeholder = element('div', undefined, 'photo-placeholder');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#bunny'); svg.append(use);
  placeholder.append(svg, element('span', label), element('small', '点击编辑礼物，添加照片'));
  if (content.sharing && !file) { slot.hidden = true; return slot; }
  const image = new Image();
  image.alt = alt || label; image.style.visibility = 'hidden'; image.loading = eager ? 'eager' : 'lazy';
  image.addEventListener('load', () => { image.style.visibility = 'visible'; placeholder.hidden = true; });
  image.addEventListener('error', () => { image.style.visibility = 'hidden'; placeholder.hidden = false; });
  // Missing images retain the illustrated placeholder, without a broken-image icon.
  if (position && typeof position === 'object') image.style.objectPosition = `${Number(position.x ?? 50)}% ${Number(position.y ?? 50)}%`;
  else if (typeof position === 'string') image.style.objectPosition = position;
  if (file) image.src = file;
  slot.append(placeholder, image);
  return slot;
}
const dialog = $('#detail-dialog');
function showDetail(...nodes) {
  $('#dialog-content').replaceChildren(...nodes);
  const heading = $('#dialog-content h2');
  if (heading) { heading.id = 'detail-title'; dialog.setAttribute('aria-labelledby', 'detail-title'); }
  dialog.showModal();
}
$('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const box = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
});
function render(nextContent) {
  const musicChanged = content.music !== nextContent.music;
  content = nextContent;
  if (musicChanged) { stopMusic(); audio.removeAttribute('src'); audio.load(); }
  const basics = content.basics || {};
  const nickname = basics.nickname || '小刘老师';
  const age = basics.age || '18';
  const birthday = basics.birthday || '农历十月初五';
  $('.greeting').textContent = basics.greeting || `亲爱的${nickname}，`;
  const heroHeading = $('.hero h1');
  heroHeading.replaceChildren(document.createTextNode(basics.heroLine1 || '今天的快乐，'), element('br'), element('span', basics.heroLine2 || '全部属于你。', 'handwritten'));
  $('.hero-copy').textContent = basics.heroCopy || '把喜欢藏进小小的角落，\n等你慢慢发现，慢慢打开。';
  $('.hero-copy').style.whiteSpace = 'pre-line';
  $('.birthday-stamp').replaceChildren(document.createTextNode(birthday), element('br'), element('strong', String(age)), element('br'), document.createTextNode('HAPPY BIRTHDAY'));
  $('.birthday-ticket strong').textContent = String(age);
  $('.mag-cover h1').replaceChildren(document.createTextNode(nickname + '，'), element('br'), element('em', content.magazineTitle || '创刊号。'));
  $('.mini-mag strong').replaceChildren(document.createTextNode(nickname), element('br'), document.createTextNode(content.magazineTitle || '创刊号。'));
  $('.mag-cover > div > p:not(.eyebrow)').textContent = `${age}岁 / 新的身份 / 不变的热爱`;
  $('.mag-masthead span:last-child').textContent = `VOL. 01 · ${birthday}`;
  $('.entry-magazine h2').textContent = nickname + '生日特刊';
  $('.mag-story h2').textContent = `你好，${nickname}。`;
  $('.award p').textContent = `致${nickname}：奖励你的勇敢出发，也珍惜你的每一份认真。`;
  const mastheads = document.querySelectorAll('.mag-masthead');
  mastheads[mastheads.length - 1].firstElementChild.textContent = '本期唯一主角 · ' + nickname;
  mastheads[mastheads.length - 1].lastElementChild.textContent = `HAPPY ${age} BIRTHDAY ♡`;
  $('.firework-house > p').textContent = `${age}岁快乐。愿你心里的光，一直亮着。`;
  $('#memory-grid').replaceChildren();
  content.memories.forEach((memory, index) => {
  const card = element('button', undefined, 'memory-card');
  card.type = 'button';
  const number = String(index + 1).padStart(2, '0');
  card.setAttribute('aria-label', '打开第 ' + number + ' 页回忆');
  card.dataset.editMemory = String(index);
  card.append(photoSlot(memory.file, '留给第 ' + number + ' 个瞬间', memory.title, false, memory.position), element('h3', memory.title), element('small', memory.date));
  card.addEventListener('click', () => showDetail(photoSlot(memory.file, '第 ' + number + ' 页', memory.title, true), element('h2', memory.title), element('small', memory.date), element('p', memory.text)));
  $('#memory-grid').append(card);
});
$('#love-letter').textContent = content.letter;
$('#signature').textContent = content.signature;
$('#teacher-message').textContent = content.teacherMessage;
$('#editor-message').textContent = content.editorMessage;
$('#mag-cover-photo').replaceChildren(); $('#mag-class-photo').replaceChildren(); $('#mag-extra-photos').replaceChildren();
content.magazine.forEach((photo, index) => {
  const target = index === 0 ? $('#mag-cover-photo') : index === 1 ? $('#mag-class-photo') : $('#mag-extra-photos');
  const slot = photoSlot(photo.file, photo.label, photo.alt, false, photo.position);
  slot.dataset.editMagazine = String(index);
  target.append(slot);
});
if (content.sharing) {
  $('.letter').hidden = !content.letter && !content.signature;
  $('.editor-note').hidden = !content.editorMessage;
  $('#teacher-message').hidden = !content.teacherMessage;
  $('#mag-cover-photo').hidden = !content.magazine[0]?.file;
  $('#mag-class-photo').hidden = !content.magazine[1]?.file;
  $('.mag-cover').classList.toggle('without-photo', !content.magazine[0]?.file);
  $('.mag-story').classList.toggle('without-photo', !content.magazine[1]?.file);
  document.querySelectorAll('[data-gift]').forEach(button => { button.hidden = !content.gifts[Number(button.dataset.gift)]?.text; });
  $('.gift-house').hidden = !content.gifts.some(gift => gift.text);
  if (!content.memories.length) $('#memory-grid').append(element('p', '愿今后的每一页，都有值得收藏的小幸福。', 'empty-memory-note'));
}
}
window.BirthdayApp = { getContent: () => content, render, stopMusic };
function route() {
  const requested = location.hash.slice(1);
  const selected = ['home', 'memories', 'park', 'magazine'].includes(requested) ? requested : 'home';
  document.body.dataset.scene = selected;
  document.querySelectorAll('[data-scene-link]').forEach(link => {
    if (link.dataset.sceneLink === selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== selected; });
  if (dialog.open) dialog.close();
  window.scrollTo(0, 0);
  if (requested) {
    const heading = $('#' + selected + ' h1');
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}
window.addEventListener('hashchange', route); route();
document.querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', () => {
  document.documentElement.style.setProperty('--cake', button.dataset.color);
  document.querySelectorAll('[data-color]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
}));
let candleOut = false;
$('#wish-button').addEventListener('click', () => {
  candleOut = !candleOut;
  $('#flame').hidden = candleOut;
  $('#wish-button').textContent = candleOut ? '再点亮一次蜡烛 ♡' : '许好愿了，吹蜡烛 ♡';
  $('#wish-message').textContent = candleOut ? '生日快乐！愿你所期待的，都在路上。' : '愿望先保密，幸福会慢慢发生。';
});
document.querySelectorAll('[data-gift]').forEach(button => button.addEventListener('click', () => {
  const gift = content.gifts[Number(button.dataset.gift)];
  showDetail(element('p', '♡ A LITTLE SURPRISE', 'eyebrow'), element('h2', gift.title), element('p', gift.text));
}));
let fireworksTimer;
$('#fireworks-button').addEventListener('click', () => {
  clearTimeout(fireworksTimer);
  const sky = $('#fireworks'); sky.replaceChildren();
  $('#firework-message').textContent = `${content.basics?.age || '18'}岁快乐，愿你永远自由、明亮，被爱包围。`;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#f1cf88', '#efadbb', '#c3d6bb', '#fff2d5'];
  for (let burst = 0; burst < 7; burst++) {
    const left = 10 + Math.random() * 80, top = 15 + Math.random() * 60;
    for (let index = 0; index < 26; index++) {
      const particle = element('span', undefined, 'particle');
      const angle = index * Math.PI * 2 / 26, distance = 45 + Math.random() * 65;
      particle.style.left = left + '%'; particle.style.top = top + '%';
      particle.style.setProperty('--x', Math.cos(angle) * distance + 'px');
      particle.style.setProperty('--y', Math.sin(angle) * distance + 'px');
      particle.style.setProperty('--color', colors[burst % colors.length]);
      particle.style.animationDelay = burst * 0.22 + 's'; particle.style.opacity = '0';
      sky.append(particle);
    }
  }
  fireworksTimer = setTimeout(() => sky.replaceChildren(), 3200);
});
// Music starts only after a tap. Use the uploaded file when available, otherwise synthesize the tune.
let audioContext, melodyTimer, playing = false, musicRequest = 0;
const activeNotes = new Set();
const audio = new Audio(); audio.loop = true; audio.preload = 'none';
const tune = [[67,.5],[67,.5],[69,1],[67,1],[72,1],[71,2],[67,.5],[67,.5],[69,1],[67,1],[74,1],[72,2],[67,.5],[67,.5],[79,1],[76,1],[72,1],[71,1],[69,2],[77,.5],[77,.5],[76,1],[72,1],[74,1],[72,2.5]];
function musicUI() {
  $('#music-toggle').setAttribute('aria-pressed', String(playing));
  $('#music-toggle').setAttribute('aria-label', playing ? '暂停生日音乐' : '播放生日音乐');
  $('#music-toggle span').textContent = playing ? '音乐播放中' : '播放音乐';
}
function stopMusic() {
  playing = false; musicRequest++; clearTimeout(melodyTimer); audio.pause();
  activeNotes.forEach(note => { try { note.stop(); } catch (_) {} }); activeNotes.clear(); musicUI();
}
function scheduleTune() {
  if (!playing || !audioContext) return;
  let time = audioContext.currentTime + .08;
  for (const [pitch, duration] of tune) {
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12);
    gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.15, time + .02);
    gain.gain.exponentialRampToValueAtTime(.001, time + duration * .44);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(time); oscillator.stop(time + duration * .46); activeNotes.add(oscillator);
    oscillator.onended = () => { activeNotes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    time += duration * .48;
  }
  melodyTimer = setTimeout(scheduleTune, (time - audioContext.currentTime + 1.5) * 1000);
}
$('#music-toggle').addEventListener('click', async () => {
  if (playing) { stopMusic(); return; }
  const request = ++musicRequest;
  playing = true; musicUI();
  // Resume Web Audio within the user gesture so fallback also works on mobile browsers.
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (AudioContextClass) {
    audioContext ||= new AudioContextClass();
    audioContext.resume().catch(() => {});
  }
  try {
    if (!content.music) throw new Error('Use birthday melody');
    if (!audio.getAttribute('src')) audio.src = content.music;
    await audio.play();
    if (request !== musicRequest) { if (!playing) audio.pause(); return; }
    $('#music-status').textContent = '正在播放生日音乐';
  } catch (_) {
    if (request !== musicRequest || !playing) return;
    if (audioContext && audioContext.state === 'running') {
      scheduleTune(); $('#music-status').textContent = '正在播放合成器生日旋律';
    } else {
      stopMusic(); $('#music-status').textContent = '当前浏览器未能播放音乐，请再点击一次或上传音频文件。';
    }
  }
});
audio.addEventListener('error', () => {
  // Initial missing-file errors are handled by the play() rejection above.
});
render(content);
