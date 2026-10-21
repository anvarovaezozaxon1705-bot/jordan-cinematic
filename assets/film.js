/* الأُرْدُنُّ — film engine v2 (no dependencies besides the optional globe / flag / sound modules)
   The page scrolls through an invisible script: one beat per sentence of the speech.
   A beat sets the shot (footage / globe / flag / emblem), then plays timed steps (data-t) that reveal
   the short on-screen fragments and move the camera. Autoplay walks the film at speaking pace. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const AR = (n) => String(n).padStart(2, '0').replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

  /* ---------- media ---------- */
  const ROOT = window.JORDAN_ROOT || ''; // where the media files live (empty: next to the page)
  const V = (f, poster) => ({ type: 'video', src: `${ROOT}assets/video/${f}.mp4`, poster: `${ROOT}assets/img/${poster || f}.jpg` });
  const I = (f, kb) => ({ type: 'image', src: `${ROOT}assets/img/${f}`, kb: kb || 'in' });
  const MEDIA = {
    's02-amman': V('s02-amman', 's02'), 's03-flag': V('s03-flag', 's03'), 's04-deadsea': V('s04-deadsea', 's04'),
    's07-souk': V('s07-souk', 's07'), 's08-port': V('s08-port', 's08'), 's09-script': V('s09-script', 's09'),
    's10-coffee': V('s10-coffee', 's10'), 's11-family': V('s11-family', 's11'), 's12-mezze': V('s12-mezze', 's12'),
    's13-petra': V('s13-petra', 's13'), 's14-amman': V('s14-amman', 's14'), 'c-hosp': V('c-hosp'),
    ...Object.fromEntries(['amman', 'bedouin', 'deadsea', 'jerash', 'people', 'petra', 'rum', 'shemagh', 'sunset', 'descent', 'flagpole', 'elder', 'man', 'petrapano', 'finale']
      .map((k) => [`m-${k}`, V(`m-${k}`)])),
    currency: I('jordan-currency.jpg', 'in'), embroidery: I('jordan-dress.jpg', 'in'),
    dress: I('jordan-dress.jpg', 'down'), falafel: I('falafel.jpg', 'in'), maqluba: I('maqluba.jpg', 'in'), mansaf: I('s12-mansaf.jpg', 'in'), embmacro: I('embroidery-macro.jpg', 'in'),
    mansafdish: I('mansaf-dish.jpg', 'in'), mansafrice: I('mansaf-rice.jpg', 'pan'), mansafmeat: I('mansaf-meat.jpg', 'in'), mansafjameed: I('mansaf-jameed.jpg', 'down'),
    family: I('family-mansaf.jpg', 'in'), serving: I('mansaf-serving.jpg', 'down'), dresswoman: I('women-dress.jpg', 'down'),
    ammandusk: I('amman-dusk.jpg', 'in'), ammannight: I('amman-night.jpg', 'in'),
  };

  /* ---------- script ---------- */
  const chapters = $$('.ch');
  const beats = [];
  let sectionNo = 0;
  chapters.forEach((ch, ci) => {
    const numbered = !['prologue', 'names'].includes(ch.id);
    if (numbered) sectionNo++;
    ch._n = numbered ? sectionNo : 0;
    let scene = 'globe';
    $$('.beat', ch).forEach((b) => {
      if (b.dataset.scene) scene = b.dataset.scene;
      beats.push({ el: b, ch: ci, scene: b.dataset.scene || scene, d: b.dataset,
        speech: $$('.speech', b).map((p) => p.textContent).join(' '),
        steps: $$('.frags > li', b).map((li) => ({ t: parseFloat(li.dataset.t) || 0, text: li.textContent, cls: li.className, d: li.dataset })) });
    });
  });
  const sections = sectionNo;
  $('#dock-total').textContent = AR(sections);

  /* ---------- layers ---------- */
  const reelsEl = $('#reels');
  const reels = {};
  function reel(key) {
    if (reels[key]) return reels[key];
    const wrap = document.createElement('div'); wrap.className = 'layer reel';
    const keys = key.split('+');
    const items = keys.map((k, i) => {
      const m = MEDIA[k] || {};
      let el;
      if (m.type === 'image') { el = document.createElement('img'); el.src = m.src; el.alt = ''; el.className = `kb-${m.kb}`; el.decoding = 'async'; }
      else { el = document.createElement('video'); el.muted = true; el.playsInline = true; el.preload = 'none'; el.loop = keys.length === 1;
        el.setAttribute('muted', ''); el.setAttribute('playsinline', ''); if (m.src) { el.poster = m.poster; el.src = m.src; } }
      if (i === 0) el.classList.add('cur');
      wrap.appendChild(el); return el;
    });
    const r = { el: wrap, items, idx: 0, active: false, timer: 0 };
    // a video that cannot load is replaced by its poster (or a soft sand backdrop), never a black frame
    items.forEach((v, i) => {
      if (v.tagName !== 'VIDEO') return;
      v.addEventListener('error', () => {
        const img = document.createElement('img'); img.alt = ''; img.className = 'kb-in' + (v.classList.contains('cur') ? ' cur' : '');
        img.onerror = () => { img.remove(); wrap.classList.add('is-missing'); };
        img.src = v.poster || ROOT + 'assets/img/s05.jpg';
        v.replaceWith(img); items[i] = img;
        if (r.active && r.idx === i && items.length > 1) r.timer = setTimeout(() => { if (r.active && r.idx === i) playAt(r, (i + 1) % items.length); }, 5000);
      });
    });
    items.forEach((v, i) => { if (v.tagName === 'VIDEO' && items.length > 1) v.addEventListener('ended', () => { if (r.active && i === r.idx) playAt(r, (i + 1) % items.length); }); });
    reelsEl.appendChild(wrap); reels[key] = r; return r;
  }
  function playAt(r, n) {
    r.idx = n; r.items.forEach((v, i) => v.classList.toggle('cur', i === n));
    const v = r.items[n];
    if (v.tagName === 'VIDEO' && v.src && !reduceMotion) {
      if (v.preload === 'none') v.preload = 'auto';
      try { v.currentTime = 0; } catch (e) { /* not ready */ }
      const p = v.play(); if (p && p.catch) p.catch(() => {});
      const nx = r.items[(n + 1) % r.items.length]; if (nx !== v && nx.preload === 'none') nx.preload = 'auto';
    }
    setTimeout(() => r.items.forEach((o, i) => { if (i !== r.idx && o.tagName === 'VIDEO') o.pause(); }), 1600);
  }
  const globeEl = $('#globe'), pinsEl = $('#globe-pins'), flagEl = $('#flagstage'), embEl = $('#emblem');
  let globeOK = false, flagOK = false;
  try { if (window.JGlobe) { window.JGlobe.init(globeEl, pinsEl); globeOK = true; } } catch (e) { globeOK = false; }
  try { if (window.JFlag) { window.JFlag.init($('#flagcanvas')); flagOK = true; } } catch (e) { flagOK = false; }
  if (!globeOK) MEDIA.globe = I('s05.jpg', 'in');
  if (!flagOK) MEDIA.flag = V('s03-flag', 's03');

  let curScene = null, curLayer = null;
  function layerFor(scene) {
    if (scene === 'globe' && globeOK) return { el: globeEl, kind: 'globe' };
    if (scene === 'flag' && flagOK) return { el: flagEl, kind: 'flag' };
    if (scene === 'emblem') return { el: embEl, kind: 'emblem' };
    if (scene === 'black') return { el: null, kind: 'black' };
    const key = scene.replace(/^(v|img):/, '');
    return { el: reel(key).el, kind: 'reel', r: reels[key] };
  }
  function setScene(scene, tr) {
    if (scene === curScene) return;
    const prev = curLayer, next = layerFor(scene);
    curScene = scene; curLayer = next;
    if (tr === 'star') starflash();
    if (next.el) {
      next.el.classList.remove('on');
      next.el.dataset.tr = tr || 'fade';
      void next.el.offsetWidth; // restart the entry animation
      next.el.classList.add('on');
    }
    if (next.kind === 'globe') { window.JGlobe.setVisible(true); pinsEl.classList.add('on'); }
    if (next.kind === 'flag') window.JFlag.setVisible(true);
    if (next.kind === 'reel' && !next.r.active) { next.r.active = true; playAt(next.r, 0); }
    if (prev && prev.el && prev.el !== (next.el)) {
      prev.el.classList.remove('on');
      const p = prev;
      setTimeout(() => {
        if (curLayer === p) return;
        if (p.kind === 'globe') { window.JGlobe.setVisible(false); pinsEl.classList.remove('on'); }
        if (p.kind === 'flag') window.JFlag.setVisible(false);
        if (p.kind === 'reel') { p.r.active = false; p.r.items.forEach((v) => v.tagName === 'VIDEO' && v.pause()); }
      }, 1600);
    }
  }
  function starflash() {
    const s = $('#starflash'); s.classList.remove('go'); void s.getBoundingClientRect(); s.classList.add('go');
  }

  /* ---------- emblem camera ---------- */
  const EMB = {
    silhouette: { x: .5, y: .5, s: .92, mode: 'silhouette' }, reveal: { x: .5, y: .5, s: 1, mode: 'reveal' }, full: { x: .5, y: .5, s: 1 },
    crown: { x: .498, y: .12, s: 2.5 }, eagle: { x: .498, y: .43, s: 2.1 }, flags: { x: .5, y: .47, s: 1.45 }, globe: { x: .498, y: .578, s: 3.0 },
    arms: { x: .5, y: .4, s: 1.75 }, plants: { x: .5, y: .69, s: 2.1 }, ribbon: { x: .5, y: .81, s: 1.9 }, out: { x: .5, y: .5, s: .7, mode: 'out' },
  };
  function emb(state) {
    const st = EMB[state]; if (!st) return;
    const img = $('.emblem__img', embEl);
    img.style.setProperty('--s', st.s); img.style.setProperty('--x', ((0.5 - st.x) * 100).toFixed(2) + '%'); img.style.setProperty('--y', ((0.5 - st.y) * 100).toFixed(2) + '%');
    embEl.dataset.mode = st.mode || 'lit';
  }

  /* ---------- fragments ---------- */
  const fragLayer = $('#frags');
  function clearFrags() {
    $$('.frag', fragLayer).forEach((f) => { f.classList.add('out'); setTimeout(() => f.remove(), 900); });
  }
  function addFrag(step) {
    const el = document.createElement('div');
    el.className = 'frag ' + (step.cls || '');
    if (step.cls && step.cls.includes('names')) el.dir = 'ltr';
    el.textContent = step.text;
    fragLayer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
  }

  /* ---------- play a beat ---------- */
  let current = -1, timers = [], playTimer = 0;
  const notes = $('#notes');
  function applyActions(d, tr) {
    if (d.scene) setScene(d.scene, tr);
    if (d.geo && globeOK) window.JGlobe.go(d.geo);
    if (d.flag && flagOK) window.JFlag.set(d.flag);
    if (d.emb) emb(d.emb);
  }
  function render(i, instant) {
    if (i === current) return;
    const prev = beats[current];
    current = i;
    const b = beats[i], ch = chapters[b.ch];
    timers.forEach(clearTimeout); timers = [];

    // the shot
    setScene(b.scene, b.d.tr);
    if (b.scene === 'globe' && globeOK && b.d.geo) window.JGlobe.go(b.d.geo);
    if (globeOK) { if (b.d.label) { const [id, txt] = b.d.label.split(':'); window.JGlobe.setLabel(id, txt); } else window.JGlobe.setLabel(null); }
    if (b.scene === 'flag' || b.d.flag) { if (b.d.flag && flagOK) window.JFlag.set(b.d.flag); }
    if (b.d.emb) emb(b.d.emb);
    $('#dimmer').classList.toggle('on', !!b.d.dim);

    // fragments + timed steps
    if (!b.d.keep) clearFrags();
    fragLayer.dataset.layout = b.d.layout || (b.d.keep && prev ? fragLayer.dataset.layout : 'lower');
    b.steps.forEach((s) => {
      const run = () => { applyActions(s.d, s.d.tr || 'fade'); if (s.text.trim()) addFrag(s); };
      if (instant) run(); else timers.push(setTimeout(run, s.t * 1000));
    });
    root.classList.toggle('is-title', ['title', 'number', 'center', 'names'].includes(b.d.layout));
    root.classList.toggle('is-names', ch.id === 'names');

    // chrome
    if (!prev || prev.ch !== b.ch) {
      $('#hud-num').textContent = ch._n ? AR(ch._n) : '';
      $('#hud-name').textContent = ch._n ? ch.dataset.title : '';
      $('#dock-cur').textContent = AR(ch._n || (ch.id === 'prologue' ? 0 : sections));
      $$('.index-grid li').forEach((li, k) => li.classList.toggle('is-current', k === b.ch));
      if (window.JSound) window.JSound.mood(ch.dataset.mood || 'space');
      // full URL: a <base> pointing elsewhere must not redirect the hash
      try { history.replaceState(null, '', location.pathname + location.search + '#' + ch.id); } catch (e) { /* not allowed here */ }
    }
    $('.progress__bar').style.transform = `scaleX(${(i / (beats.length - 1)).toFixed(4)})`;
    notes.textContent = b.speech;
    schedule();
  }

  /* ---------- scroll ↔ beat ---------- */
  let tops = [];
  const layout = () => { tops = beats.map((b) => b.el.getBoundingClientRect().top + window.scrollY); };
  function beatAt(y) {
    const probe = y + window.innerHeight * 0.35; let lo = 0, hi = tops.length - 1, a = 0;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (tops[m] <= probe) { a = m; lo = m + 1; } else hi = m - 1; }
    return a;
  }
  let ticking = false;
  // while a button/key jump is scrolling, ignore the beats it passes through
  let lockTo = -1, lockUntil = 0;
  window.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false; const at = beatAt(window.scrollY);
      if (lockTo >= 0) { if (at !== lockTo && performance.now() < lockUntil) return; lockTo = -1; }
      render(at);
    });
  }, { passive: true });
  window.addEventListener('resize', () => { layout(); if (globeOK) window.JGlobe.resize(); });
  window.addEventListener('load', layout);
  if (document.fonts) document.fonts.ready.then(layout);
  function goBeat(i, instant) {
    i = Math.max(0, Math.min(beats.length - 1, i));
    const smooth = !(instant || reduceMotion);
    if (smooth) { lockTo = i; lockUntil = performance.now() + 2500; }
    window.scrollTo({ top: Math.max(0, tops[i] - window.innerHeight * 0.2 + 1), behavior: smooth ? 'smooth' : 'auto' });
    render(i);
  }
  const next = () => goBeat(current + 1), prev = () => goBeat(current - 1);

  /* ---------- autoplay at speaking pace ---------- */
  let playing = false;
  const DEFAULT = { prologue: [7.5, 5, 5.5, 11], names: [10] };
  function duration(b) {
    const ch = chapters[b.ch]; const k = $$('.beat', ch).indexOf(b.el);
    if (DEFAULT[ch.id]) return DEFAULT[ch.id][k] || 6;
    const words = b.speech.split(/\s+/).filter(Boolean).length;
    const last = b.steps.reduce((m, s) => Math.max(m, s.t), 0);
    return Math.max(last + 3, 1.8 + words * 0.48, 4.5);
  }
  function schedule() {
    clearTimeout(playTimer);
    if (!playing) return;
    const my = current;
    playTimer = setTimeout(() => {
      if (!playing || my !== current) return;
      if (current >= beats.length - 1) { setPlaying(false); return; }
      next();
    }, duration(beats[current]) * 1000);
  }
  function setPlaying(on) {
    playing = on; root.classList.toggle('is-playing', on);
    const b = $('[data-action="play"]'); b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'إيقاف مؤقت' : 'تشغيل');
    if (on && soundWanted !== false && window.JSound) setSound(true);
    if (on && current >= beats.length - 1) goBeat(0, true);
    schedule();
  }
  ['wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { if (playing) setPlaying(false); }, { passive: true }));

  /* ---------- sound ---------- */
  let soundWanted = null;
  function setSound(on) {
    if (!window.JSound) return;
    soundWanted = on;
    if (on) { window.JSound.mood(chapters[beats[Math.max(0, current)].ch].dataset.mood || 'space', 0.1); window.JSound.start(); } else window.JSound.stop();
    root.classList.toggle('is-sound', on);
    $('[data-action="sound"]').setAttribute('aria-pressed', String(on));
  }
  if (!window.JSound) $('[data-action="sound"]').hidden = true;

  /* ---------- index + credits ---------- */
  const grid = $('#index-grid');
  chapters.forEach((ch, ci) => {
    const first = beats.find((b) => b.ch === ci);
    const key = first.scene.replace(/^(v|img):/, '').split('+')[0];
    const m = MEDIA[key];
    const poster = m ? (m.poster || m.src) : ROOT + 'assets/img/s05.jpg';
    const li = document.createElement('li');
    li.innerHTML = `<a href="#${ch.id}"><img src="${poster}" alt="" loading="lazy"><span class="lbl"><b></b><span></span></span></a>`;
    li.querySelector('b').textContent = ch._n ? AR(ch._n) : '';
    li.querySelector('.lbl span').textContent = ch.dataset.title || '';
    li.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); closeSheets(); goBeat(beats.indexOf(first), true); });
    grid.appendChild(li);
  });
  const C = (title, by, license, url) => ({ title, by, license, url });
  const credits = [
    C('Speech text: the two Google Docs of the authors (Arabic part)', 'Анварова Э. · Юсупова Н.', '', 'https://docs.google.com/document/d/1ktR7EVlV9HRoWHnZUTT6ctnsMOepXSxXcsaYgGchWII/edit'),
    C('Presentation “travel TO” (Canva): background footage, photos', 'the authors, with Canva media', 'Canva Content License', 'https://www.canva.com/design/DAHXb7NOykQ/oNvM7XAUMyInf90Co6uhkg/view'),
    C('Jordan... A Timeless Love', 'Jordan Tourism Board', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Jordan..._A_Timeless_Love.webm'),
    C('Jordan The Bucket List 60s', 'Jordan Tourism Board', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Jordan_The_Bucket_List_60s.webm'),
    C('The Siq at Petra', 'Ankur P', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:The_Siq_at_Petra_Ankur_P_Nov2018.webm'),
    C('Coat of arms of Jordan', 'Wikimedia Commons', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Coat_of_arms_of_Jordan.svg'),
    C('Flag of Jordan', 'Wikimedia Commons', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Flag_of_Jordan.svg'),
    C('Jordanian currency', 'Makeandtoss', 'CC0', 'https://commons.wikimedia.org/wiki/File:Jordanian_currency.jpg'),
    C('Jordanian Felafel', 'Gopal Venkatesan', 'CC BY-SA 2.0', 'https://commons.wikimedia.org/wiki/File:Jordanian_Felafel.jpg'),
    C('Jordan 2021 — Hikayet Sitti Restaurant: preparing maqluba', 'Fallaner', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Jordan_2021_P114_Hikayet_Sitti_Restaurant_preparing_Maqluba.jpg'),
    C('Traditional dress from Jordan and Palestine', 'Lama Sakhnini', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Traditional_dress_from_Jordan_and_Palestine.jpg'),
    C('Traditional Women Costume in Jordan', 'Mervat', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Traditional_Women_Costume_in_Jordan.jpg'),
    C('Family mansaf', 'Goingtosafar', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Family_mansaf.jpg'),
    C('Al-Mansaf 2', 'Aseel zm', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Al-Mansaf_2.jpg'),
    C('King Abdullah 1 Mosque at dusk', 'Motasemash', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:King_Abdullah_1_Mosque_at_dusk.jpg'),
    C('Amman at Night, 2009', 'Paul Stocker', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Amman_at_Night,_2009.jpg'),
    C('Blue Marble Next Generation (globe imagery)', 'NASA Earth Observatory, Reto Stöckli', 'Public domain', 'https://visibleearth.nasa.gov/collection/1484/blue-marble'),
    C('Natural Earth admin-0 borders', 'Natural Earth', 'Public domain', 'https://www.naturalearthdata.com/'),
    C('Fonts: Amiri, Reem Kufi, Noto Naskh Arabic', 'Google Fonts', 'SIL Open Font License 1.1', 'https://fonts.google.com/'),
    C('three.js r128', 'three.js authors', 'MIT', 'https://threejs.org/'),
  ];
  const cl = $('#credits-list');
  cl.innerHTML = '<h3>Sources</h3><ul></ul><p>Video clips were trimmed, cropped, slowed and joined with cross-fades; edited clips from CC BY-SA sources are shared under the same licence. The score is generated live in the browser.</p>';
  credits.forEach((c) => {
    const li = document.createElement('li'); const a = document.createElement('a');
    a.href = c.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = c.title;
    li.append(a, document.createTextNode(` — ${c.by}${c.license ? ', ' + c.license : ''}`)); cl.querySelector('ul').appendChild(li);
  });

  let lastFocus = null;
  function openSheet(id) {
    lastFocus = document.activeElement; const s = $(`#${id}`); s.hidden = false;
    requestAnimationFrame(() => s.classList.add('is-open')); document.body.style.overflow = 'hidden';
    if (id === 'index') $('[data-action="index"]').setAttribute('aria-expanded', 'true');
    (s.querySelector('.is-current a') || s.querySelector('.sheet__close')).focus({ preventScroll: true });
  }
  function closeSheets() {
    $$('.sheet').forEach((s) => { if (s.hidden) return; s.classList.remove('is-open'); setTimeout(() => { s.hidden = true; }, 300); });
    document.body.style.overflow = ''; $('[data-action="index"]').setAttribute('aria-expanded', 'false');
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  const anyOpen = () => $$('.sheet').some((s) => !s.hidden);

  /* ---------- controls ---------- */
  const fsOk = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  if (!fsOk) $('[data-action="fullscreen"]').hidden = true;
  function toggleFs() {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else { const r = (root.requestFullscreen || root.webkitRequestFullscreen).call(root); if (r && r.catch) r.catch(() => {}); }
    } catch (e) { /* not allowed */ }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]'); if (!b) return;
    const a = b.dataset.action;
    if (a === 'next') { setPlaying(false); next(); }
    else if (a === 'prev') { setPlaying(false); prev(); }
    else if (a === 'play') setPlaying(!playing);
    else if (a === 'sound') setSound(!(soundWanted === true));
    else if (a === 'index') openSheet('index');
    else if (a === 'credits') openSheet('credits');
    else if (a === 'close') closeSheets();
    else if (a === 'fullscreen') toggleFs();
  });
  $$('.sheet').forEach((s) => s.addEventListener('click', (e) => { if (e.target === s) closeSheets(); }));
  // touch: swipe left/right moves one sentence (vertical swipes scroll as usual)
  let tx = 0, ty = 0;
  window.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? next : prev)();
  }, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (anyOpen()) { if (e.key === 'Escape') closeSheets(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    switch (e.key) {
      case 'PageDown': case 'ArrowDown': case 'ArrowLeft': e.preventDefault(); setPlaying(false); next(); break;
      case 'PageUp': case 'ArrowUp': case 'ArrowRight': e.preventDefault(); setPlaying(false); prev(); break;
      case 'Enter': if (tag === 'button' || tag === 'a') return; e.preventDefault(); setPlaying(false); next(); break;
      case ' ': if (tag === 'button' || tag === 'a') return; e.preventDefault(); setPlaying(!playing); break;
      case 'Home': e.preventDefault(); goBeat(0); break;
      case 'End': e.preventDefault(); goBeat(beats.length - 1); break;
      case 'f': case 'F': case 'ب': if (fsOk) toggleFs(); break;
      case 'g': case 'G': case 'ل': openSheet('index'); break;
      case 'm': case 'M': case 'ة': setSound(!(soundWanted === true)); break;
      case 'n': case 'N': case 'ى': notes.hidden = !notes.hidden; break;
      default: break;
    }
  });
  // the closing frame hides the controls until the pointer moves
  let idle = 0;
  window.addEventListener('pointermove', () => { root.classList.add('chrome-awake'); clearTimeout(idle); idle = setTimeout(() => root.classList.remove('chrome-awake'), 2200); }, { passive: true });

  /* ---------- start ---------- */
  layout();
  const startCh = location.hash ? chapters.findIndex((c) => `#${c.id}` === location.hash) : -1;
  if (startCh > 0) goBeat(beats.findIndex((b) => b.ch === startCh), true);
  else render(beatAt(window.scrollY));
})();
