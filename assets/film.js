/* المملكة الأردنية الهاشمية — the film engine (no dependencies besides the optional globe)
   Scroll position picks the current beat; each beat sets the shot (globe / footage / object)
   and types its text as a subtitle. Autoplay walks through the beats like a documentary. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const AR = (n) => String(n).padStart(2, '0').replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

  /* ---------- footage ---------- */
  const V = (src, poster) => ({ src: `assets/video/${src}`, poster: `assets/img/${poster}` });
  const VIDEOS = {
    's01-deir': V('s01-deir.mp4', 's01.jpg'),
    's02-amman': V('s02-amman.mp4', 's02.jpg'),
    's03-flag': V('s03-flag.mp4', 's03.jpg'),
    's04-deadsea': V('s04-deadsea.mp4', 's04.jpg'),
    's07-souk': V('s07-souk.mp4', 's07.jpg'),
    's08-port': V('s08-port.mp4', 's08.jpg'),
    's09-script': V('s09-script.mp4', 's09.jpg'),
    's10-coffee': V('s10-coffee.mp4', 's10.jpg'),
    's11-family': V('s11-family.mp4', 's11.jpg'),
    's12-mezze': V('s12-mezze.mp4', 's12.jpg'),
    's13-petra': V('s13-petra.mp4', 's13.jpg'),
    's14-amman': V('s14-amman.mp4', 's14.jpg'),
    's15-jerash': V('s15-jerash.mp4', 's15.jpg'),
    's16-rum': V('s16-rum.mp4', 's16.jpg'),
    's17-sea': V('s17-sea.mp4', 's17.jpg'),
    's19-camels': V('s19-camels.mp4', 's19.jpg'),
    'c-hosp': V('c-hosp.mp4', 'c-hosp.jpg'),
    ...Object.fromEntries(['amman', 'aqaba', 'bedouin', 'deadsea', 'food', 'jerash', 'people', 'petra', 'road', 'rum', 'shemagh']
      .map((k) => [`m-${k}`, V(`m-${k}.mp4`, `m-${k}.jpg`)])),
  };

  /* ---------- beats: resolve inherited state ---------- */
  const chapters = $$('.ch');
  const beats = [];
  chapters.forEach((ch, ci) => {
    let scene = null, geo = null, ov = null, tag = null;
    $$('.beat', ch).forEach((b, bi) => {
      const d = b.dataset;
      if (d.scene) { if (d.scene !== scene) tag = null; scene = d.scene; }
      if (d.geo) geo = d.geo;
      if (d.ov !== undefined) ov = d.ov === 'none' ? null : d.ov;
      if (d.tag) tag = d.tag;
      beats.push({ el: b, ch: ci, first: bi === 0, kind: d.kind || 'sub', scene: scene || 'globe', geo, ov, tag, vocal: b.classList.contains('vocal') });
    });
  });
  const total = chapters.length;
  $('#dock-total').textContent = AR(total);

  /* ---------- stage elements ---------- */
  const reelsEl = $('#reels');
  const reels = {};
  function reel(key) {
    if (reels[key]) return reels[key];
    const meta = VIDEOS[key];
    const wrap = document.createElement('div');
    wrap.className = 'reel';
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    if (meta) { v.poster = meta.poster; v.src = meta.src; }
    wrap.appendChild(v);
    reelsEl.appendChild(wrap);
    reels[key] = { wrap, v, timer: 0 };
    return reels[key];
  }
  const globeCanvas = $('#globe');
  let globeReady = false;
  try {
    if (window.JGlobe) { window.JGlobe.init(globeCanvas, $('#globe-pins')); globeReady = true; }
  } catch (e) { globeReady = false; }
  // without WebGL fall back to the satellite still
  if (!globeReady) VIDEOS.globe = { src: '', poster: 'assets/img/s05.jpg' };

  const ovs = Object.fromEntries($$('.ov').map((o) => [o.dataset.ov, o]));
  const cardEl = $('#card-title'), cardText = $('#card-text'), cardN = $('#card-n');
  const subsInner = $('#subs-inner');
  const tagEl = $('#tag'), tagText = $('#tag-text');
  const hudNum = $('#hud-num'), hudName = $('#hud-name'), dockCur = $('#dock-cur');
  const bar = $('.progress__bar');
  const hint = $('#hint');

  /* ---------- typewriter ---------- */
  const seg = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('ar', { granularity: 'grapheme' }) : null;
  const graphemes = (s) => (seg ? Array.from(seg.segment(s), (x) => x.segment) : Array.from(s));
  let typeToken = 0;
  const CPS = 34; // characters per second

  // copies `src` children into `dest`, then reveals the text grapheme by grapheme; resolves when done
  function typeInto(dest, src, opts = {}) {
    const my = ++typeToken;
    dest.innerHTML = '';
    src.forEach((n) => dest.appendChild(n.cloneNode(true)));
    const caret = document.createElement('span');
    caret.className = 'caret';
    if (reduceMotion || opts.instant) {
      $$('li', dest).forEach((li) => li.classList.add('in'));
      return Promise.resolve();
    }
    // collect text nodes in order, remember full text, blank them
    const walker = document.createTreeWalker(dest, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) { const t = walker.currentNode; if (t.nodeValue.trim() || t.nodeValue === ' ') nodes.push({ t, g: graphemes(t.nodeValue) }); }
    nodes.forEach((n) => { n.t.nodeValue = ''; });
    return new Promise((resolve) => {
      let ni = 0, gi = 0, lastLi = null, t0 = performance.now(), shown = 0;
      function tick(now) {
        if (my !== typeToken) return resolve();
        const want = Math.floor((now - t0) / 1000 * CPS);
        while (shown < want && ni < nodes.length) {
          const n = nodes[ni];
          const li = n.t.parentElement && n.t.parentElement.closest('li');
          if (li && li !== lastLi) { li.classList.add('in'); lastLi = li; }
          n.t.nodeValue += n.g[gi++] || '';
          shown++;
          if (gi >= n.g.length) { ni++; gi = 0; }
        }
        const cur = nodes[Math.min(ni, nodes.length - 1)];
        if (cur && cur.t.parentNode) cur.t.parentNode.insertBefore(caret, cur.t.nextSibling);
        if (ni >= nodes.length) { setTimeout(() => caret.remove(), 900); return resolve(); }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  /* ---------- render a beat ---------- */
  let current = -1, curScene = null, globeHideTimer = 0, playTimer = 0, typing = Promise.resolve();
  function render(i) {
    if (i === current) return;
    const prev = beats[current];
    current = i;
    const b = beats[i];
    const ch = chapters[b.ch];

    // scene
    if (b.scene !== curScene) {
      curScene = b.scene;
      if (b.scene === 'globe' && globeReady) {
        clearTimeout(globeHideTimer);
        window.JGlobe.setVisible(true);
        Object.values(reels).forEach(hideReel);
      } else {
        const key = b.scene === 'globe' ? 'globe' : b.scene.replace(/^v:/, '');
        const r = reel(key);
        Object.entries(reels).forEach(([k, x]) => { if (x !== r) hideReel(x); });
        showReel(r);
        if (globeReady) { clearTimeout(globeHideTimer); globeHideTimer = setTimeout(() => window.JGlobe.setVisible(false), 1500); }
      }
    }
    if (b.scene === 'globe' && globeReady && b.geo) window.JGlobe.go(b.geo);

    // overlay object
    const [ovName, ovArg] = (b.ov || '').split(':');
    Object.entries(ovs).forEach(([k, o]) => o.classList.toggle('on', k === ovName));
    if (ovs.flag) { if (ovName === 'flag' && ovArg) ovs.flag.dataset.hl = ovArg; else delete ovs.flag.dataset.hl; }

    // location tag
    if (b.tag) { tagText.textContent = b.tag; tagEl.classList.add('on'); } else tagEl.classList.remove('on');

    // chapter label
    hudNum.textContent = AR(b.ch + 1);
    dockCur.textContent = AR(b.ch + 1);
    if (!prev || prev.ch !== b.ch) {
      hudName.style.opacity = '0';
      setTimeout(() => { hudName.textContent = ch.dataset.title || ''; hudName.style.opacity = ''; }, 250);
      $$('.index-grid li').forEach((li, k) => li.classList.toggle('is-current', k === b.ch));
      if (history.replaceState) history.replaceState(null, '', `#${ch.id}`);
    }
    bar.style.transform = `scaleX(${(i / (beats.length - 1)).toFixed(4)})`;
    hint.classList.toggle('on', i === 0);

    // text
    const kids = Array.from(b.el.children);
    root.classList.toggle('is-title', b.kind === 'title' || b.kind === 'finale');
    root.classList.toggle('is-finale', b.kind === 'finale');
    cardEl.classList.toggle('vocal', b.vocal);
    if (b.kind === 'title' || b.kind === 'finale') {
      cardN.textContent = AR(b.ch + 1);
      subsInner.innerHTML = '';
      const h = kids.find((k) => /^H[12]$/.test(k.tagName));
      const credit = kids.find((k) => k.classList.contains('credit'));
      const old = cardEl.querySelector('.credit');
      if (old) old.remove();
      typing = typeInto(cardText, h ? Array.from(h.childNodes) : []);
      if (credit) {
        const c = document.createElement('p');
        c.className = 'credit';
        cardEl.appendChild(c);
        const tok = typeToken;
        typing = typing.then(() => (tok === typeToken ? typeInto(c, Array.from(credit.childNodes)) : null));
      }
    } else {
      subsInner.classList.toggle('vocal', b.vocal);
      typing = typeInto(subsInner, kids);
    }
    schedule();
  }

  function showReel(r) {
    clearTimeout(r.timer);
    r.wrap.classList.add('on');
    if (r.v.src && !reduceMotion) {
      if (r.v.preload === 'none') r.v.preload = 'auto';
      const p = r.v.play(); if (p && p.catch) p.catch(() => {});
    }
  }
  function hideReel(r) {
    if (!r.wrap.classList.contains('on')) return;
    r.wrap.classList.remove('on');
    clearTimeout(r.timer);
    r.timer = setTimeout(() => r.v.pause(), 1500);
  }

  /* ---------- scroll → beat ---------- */
  let tops = [];
  function layout() { tops = beats.map((b) => b.el.getBoundingClientRect().top + window.scrollY); }
  function beatAt(y) {
    const probe = y + window.innerHeight * 0.35;
    let lo = 0, hi = tops.length - 1, ans = 0;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (tops[m] <= probe) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  }
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; render(beatAt(window.scrollY)); });
  }, { passive: true });
  window.addEventListener('resize', () => { layout(); if (globeReady) window.JGlobe.resize(); });
  window.addEventListener('load', layout);

  function goBeat(i, instant) {
    i = Math.max(0, Math.min(beats.length - 1, i));
    const y = tops[i] - window.innerHeight * 0.2 + 1;
    window.scrollTo({ top: Math.max(0, y), behavior: instant || reduceMotion ? 'auto' : 'smooth' });
    render(i);
  }
  const next = () => goBeat(current + 1);
  const prev = () => goBeat(current - 1);

  /* ---------- autoplay ---------- */
  let playing = false;
  function readTime(b) {
    if (b.kind === 'title') return 2600;
    if (b.kind === 'finale') return 6000;
    const len = (b.el.textContent || '').trim().length;
    if (!len) return 5200; // opening shot of the globe
    return Math.min(9000, 1800 + len * 45);
  }
  function schedule() {
    clearTimeout(playTimer);
    if (!playing) return;
    const my = current;
    typing.then(() => {
      if (!playing || my !== current) return;
      playTimer = setTimeout(() => {
        if (!playing || my !== current) return;
        if (current >= beats.length - 1) { setPlaying(false); return; }
        next();
      }, readTime(beats[current]));
    });
  }
  function setPlaying(on) {
    playing = on;
    root.classList.toggle('is-playing', on);
    const b = $('[data-action="play"]');
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'إيقاف مؤقت' : 'تشغيل تلقائي');
    if (on && current >= beats.length - 1) { goBeat(0, true); }
    schedule();
  }
  // a manual scroll or wheel pauses autoplay
  ['wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { if (playing) setPlaying(false); }, { passive: true }));

  /* ---------- index + credits sheets ---------- */
  const grid = $('#index-grid');
  chapters.forEach((ch, ci) => {
    const first = beats.find((b) => b.ch === ci && b.scene !== 'globe') || beats.find((b) => b.ch === ci);
    const key = first.scene.replace(/^v:/, '');
    const poster = first.scene === 'globe' ? 'assets/img/s05.jpg' : (VIDEOS[key] ? VIDEOS[key].poster : '');
    const li = document.createElement('li');
    li.innerHTML = `<a href="#${ch.id}"><img src="${poster}" alt="" loading="lazy"><span class="lbl"><b>${AR(ci + 1)}</b><span></span></span></a>`;
    li.querySelector('.lbl span').textContent = ch.dataset.title || '';
    li.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); closeSheets(); goBeat(beats.findIndex((b) => b.ch === ci), true); });
    grid.appendChild(li);
  });
  const C = (title, by, license, url) => ({ title, by, license, url });
  const credits = [
    C('Original presentation “travel TO” (Canva) — photos, background footage, emblem and flag', 'the author of the presentation, made with Canva media', 'Canva Content License', 'https://www.canva.com/design/DAHXb7NOykQ/oNvM7XAUMyInf90Co6uhkg/view'),
    C('Jordan... A Timeless Love', 'Jordan Tourism Board', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Jordan..._A_Timeless_Love.webm'),
    C('Jordan The Bucket List 60s', 'Jordan Tourism Board', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Jordan_The_Bucket_List_60s.webm'),
    C('The Siq at Petra', 'Ankur P', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:The_Siq_at_Petra_Ankur_P_Nov2018.webm'),
    C('VIDEO - Wadi Rum', 'Jorge Láscar', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:VIDEO_-_Wadi_Rum.webm'),
    C('Dead Sea, Israel and Jordan (Timelapse)', 'Google Earth', 'CC BY 3.0', 'https://commons.wikimedia.org/wiki/File:Dead_Sea,_Israel_and_Jordan.webm'),
    C('Blue Marble Next Generation (globe imagery)', 'NASA Earth Observatory, Reto Stöckli', 'Public domain', 'https://visibleearth.nasa.gov/collection/1484/blue-marble'),
    C('Natural Earth admin-0 country borders', 'Natural Earth', 'Public domain', 'https://www.naturalearthdata.com/'),
    C('Fonts: Reem Kufi, Amiri, Noto Naskh Arabic', 'Google Fonts', 'SIL Open Font License 1.1', 'https://fonts.google.com/'),
    C('3D engine: three.js r128', 'three.js authors', 'MIT', 'https://threejs.org/'),
  ];
  const cl = $('#credits-list');
  cl.innerHTML = '<h3>Sources</h3><ul></ul><p>Clips were trimmed, cropped, slowed and joined with cross-fades. Edited clips from CC BY-SA sources are shared under the same licence.</p>';
  credits.forEach((c) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = c.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = c.title;
    li.append(a, document.createTextNode(` — ${c.by ? c.by + ', ' : ''}${c.license}`));
    cl.querySelector('ul').appendChild(li);
  });

  let lastFocus = null;
  function openSheet(id) {
    lastFocus = document.activeElement;
    const s = $(`#${id}`);
    s.hidden = false;
    requestAnimationFrame(() => s.classList.add('is-open'));
    document.body.style.overflow = 'hidden';
    if (id === 'index') $('[data-action="index"]').setAttribute('aria-expanded', 'true');
    (s.querySelector('.is-current a') || s.querySelector('.sheet__close')).focus({ preventScroll: true });
  }
  function closeSheets() {
    $$('.sheet').forEach((s) => { if (s.hidden) return; s.classList.remove('is-open'); setTimeout(() => { s.hidden = true; }, 300); });
    document.body.style.overflow = '';
    $('[data-action="index"]').setAttribute('aria-expanded', 'false');
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  const anyOpen = () => $$('.sheet').some((s) => !s.hidden);

  /* ---------- buttons ---------- */
  const fsOk = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  if (!fsOk) $('[data-action="fullscreen"]').hidden = true;
  function toggleFs() {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else { const r = (root.requestFullscreen || root.webkitRequestFullscreen).call(root); if (r && r.catch) r.catch(() => {}); }
    } catch (e) { /* not allowed here */ }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'next') { setPlaying(false); next(); }
    else if (a === 'prev') { setPlaying(false); prev(); }
    else if (a === 'play') setPlaying(!playing);
    else if (a === 'index') openSheet('index');
    else if (a === 'credits') openSheet('credits');
    else if (a === 'close') closeSheets();
    else if (a === 'fullscreen') toggleFs();
  });
  $$('.sheet').forEach((s) => s.addEventListener('click', (e) => { if (e.target === s) closeSheets(); }));

  /* ---------- keyboard (and presentation clickers) ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (anyOpen()) { if (e.key === 'Escape') closeSheets(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    switch (e.key) {
      case 'PageDown': case 'ArrowDown': case 'ArrowLeft': case 'Enter':
        if (e.key === 'Enter' && (tag === 'button' || tag === 'a')) return;
        e.preventDefault(); setPlaying(false); next(); break;
      case 'PageUp': case 'ArrowUp': case 'ArrowRight':
        e.preventDefault(); setPlaying(false); prev(); break;
      case ' ':
        if (tag === 'button' || tag === 'a') return;
        e.preventDefault(); setPlaying(!playing); break;
      case 'Home': e.preventDefault(); setPlaying(false); goBeat(0); break;
      case 'End': e.preventDefault(); setPlaying(false); goBeat(beats.length - 1); break;
      case 'f': case 'F': case 'ب': if (fsOk) toggleFs(); break;
      case 'g': case 'G': case 'ل': openSheet('index'); break;
      case 'p': case 'P': case 'ح': setPlaying(!playing); break;
      default: break;
    }
  });

  /* ---------- start ---------- */
  layout();
  const startCh = location.hash ? chapters.findIndex((c) => `#${c.id}` === location.hash) : -1;
  if (startCh > 0) goBeat(beats.findIndex((b) => b.ch === startCh), true);
  else render(beatAt(window.scrollY));
})();
