/* المملكة الأردنية الهاشمية — interactions (no dependencies)
   - scenes are stacked with position: sticky; the next scene slides over the
     previous one, which tilts back into 3D depth (scroll-driven, natural scrolling)
   - reveal-on-view with 3D title flips, scroll parallax + mouse depth, card tilt
   - videos play only while their scene is visible */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const scenes = $$('.scene');
  const total = scenes.length;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const use3D = !reduceMotion;
  const toArabicDigits = (n) => String(n).padStart(2, '0').replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  if (use3D) root.classList.add('stack');

  const hudNum = $('.hud__num');
  const hudName = $('.hud__name');
  const pagerCur = $('.pager__cur');
  const progressBar = $('.progress__bar');
  const prevBtn = $('[data-action="prev"]');
  const nextBtn = $('[data-action="next"]');
  $('.pager__total').textContent = toArabicDigits(total);

  /* ---------- per-scene helpers: dim layer, z-order ---------- */
  scenes.forEach((sc, i) => {
    const dim = document.createElement('div');
    dim.className = 'scene__dim';
    dim.setAttribute('aria-hidden', 'true');
    sc.appendChild(dim);
    sc._dim = dim;
    sc.style.zIndex = String(i + 1);
    sc._videos = $$('video', sc);
    sc._depth = $$('[data-depth]', sc);
    sc._tilt = $$('[data-tilt]', sc);
  });

  /* ---------- Rail (dots) + index overlay ---------- */
  const railList = $('.rail__list');
  const indexGrid = $('.index__grid');
  scenes.forEach((sc, i) => {
    const title = sc.dataset.title || '';
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rail__btn';
    b.setAttribute('aria-label', `${toArabicDigits(i + 1)} — ${title}`);
    b.innerHTML = `<span class="rail__tip">${toArabicDigits(i + 1)} · ${title}</span>`;
    b.addEventListener('click', () => goTo(i));
    li.appendChild(b);
    railList.appendChild(li);

    const media = sc.querySelector('video[poster], .scene__bg img, figure img, .s-lang__paper img');
    const src = media ? (media.getAttribute('poster') || media.getAttribute('src')) : '';
    const item = document.createElement('li');
    item.className = 'index__item';
    item.innerHTML = `<a href="#${sc.id}">${src ? `<img src="${src}" alt="" loading="lazy">` : ''}<span class="index__label"><b>${toArabicDigits(i + 1)}</b><span>${title}</span></span></a>`;
    item.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); closeIndex(); goTo(i, true); });
    indexGrid.appendChild(item);
  });
  const railBtns = $$('.rail__btn');
  const indexItems = $$('.index__item');

  /* ---------- Layout: natural scene positions (sticky elements lie about rects) ---------- */
  let vh = window.innerHeight;
  let tops = [];
  let heights = [];
  function layout() {
    vh = window.innerHeight;
    scenes.forEach((s) => { s.style.top = ''; });
    heights = scenes.map((s) => s.offsetHeight);
    const start = $('#film').offsetTop;
    let acc = start;
    tops = heights.map((h) => { const t = acc; acc += h; return t; });
    if (use3D) {
      // a scene taller than the screen sticks once its bottom edge reaches the bottom of the viewport
      scenes.forEach((s, i) => { s.style.top = `${Math.min(0, vh - heights[i])}px`; });
    }
  }

  /* ---------- Current scene ---------- */
  let current = -1;
  function setCurrent(i) {
    if (i === current || i < 0) return;
    current = i;
    const sc = scenes[i];
    scenes.forEach((s, k) => s.classList.toggle('is-active', k === i));
    railBtns.forEach((b, k) => b.setAttribute('aria-current', k === i ? 'true' : 'false'));
    indexItems.forEach((it, k) => it.classList.toggle('is-current', k === i));
    hudNum.textContent = toArabicDigits(i + 1);
    pagerCur.textContent = toArabicDigits(i + 1);
    hudName.classList.add('is-swapping');
    setTimeout(() => { hudName.textContent = sc.dataset.title || ''; hudName.classList.remove('is-swapping'); }, 200);
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === total - 1;
    if (history.replaceState) history.replaceState(null, '', `#${sc.id}`);
  }
  function detectCurrent() {
    const probe = window.scrollY + vh * 0.45;
    let idx = 0;
    for (let k = 0; k < total; k++) { if (tops[k] <= probe) idx = k; else break; }
    setCurrent(idx);
  }

  function goTo(i, instant) {
    i = clamp(i, 0, total - 1);
    window.scrollTo({ top: tops[i], behavior: reduceMotion || instant ? 'auto' : 'smooth' });
  }
  function next() {
    const end = tops[current] + heights[current] - vh; // last scroll position still inside this scene
    if (window.scrollY < end - 40) {
      window.scrollTo({ top: Math.min(end, window.scrollY + vh * 0.85), behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }
    goTo(current + 1);
  }
  function prev() {
    if (window.scrollY > tops[current] + 40) { goTo(current); return; }
    goTo(current - 1);
  }

  /* ---------- Reveal on view ---------- */
  const revealEls = $$('.rv');
  if ('IntersectionObserver' in window && !reduceMotion) {
    // masked / flipped elements start hidden, so watch their parent instead
    const watchers = new Map();
    revealEls.forEach((el) => {
      const target = el.matches('.rv-mask, .rv-curtain') ? el.parentElement : el;
      if (!watchers.has(target)) watchers.set(target, []);
      watchers.get(target).push(el);
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        (watchers.get(e.target) || []).forEach((el) => el.classList.add('in'));
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    watchers.forEach((_, target) => io.observe(target));
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }

  /* ---------- Pointer (mouse depth + tilt) ---------- */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  if (finePointer && use3D) {
    window.addEventListener('pointermove', (e) => {
      mouse.tx = e.clientX / window.innerWidth - 0.5;
      mouse.ty = e.clientY / window.innerHeight - 0.5;
      kick();
    }, { passive: true });
    document.addEventListener('pointerleave', () => { mouse.tx = 0; mouse.ty = 0; kick(); });
  }

  /* ---------- Frame loop (runs only while something is changing) ---------- */
  const parallaxEls = $$('[data-speed]');
  const sceneOf = new Map(parallaxEls.map((el) => [el, scenes.indexOf(el.closest('.scene'))]));
  let running = false;
  let lastScroll = -1;
  function kick() { if (!running) { running = true; requestAnimationFrame(frame); } }

  function frame() {
    const sy = window.scrollY;
    const scrolled = sy !== lastScroll;
    lastScroll = sy;
    mouse.x += (mouse.tx - mouse.x) * 0.08;
    mouse.y += (mouse.ty - mouse.y) * 0.08;
    const mouseMoving = Math.abs(mouse.tx - mouse.x) > 0.0005 || Math.abs(mouse.ty - mouse.y) > 0.0005;

    if (scrolled) {
      const max = document.documentElement.scrollHeight - vh;
      progressBar.style.transform = `scaleX(${(max > 0 ? sy / max : 0).toFixed(4)})`;
      detectCurrent();
    }

    for (let i = 0; i < total; i++) {
      const sc = scenes[i];
      const top = tops[i] - sy;               // natural (unstuck) position
      const bottom = top + heights[i];
      const near = bottom > -vh && top < vh * 2;

      // cover: how much of the viewport the next scene occupies (0 … 1)
      let cover = 0;
      if (i < total - 1) cover = clamp((vh - (tops[i + 1] - sy)) / vh, 0, 1);
      // enter: how far this scene still is from reaching the top (1 … 0)
      const enter = clamp(top / vh, 0, 1);

      if (use3D && near) {
        if (cover > 0.001) {
          const originY = clamp(sy + vh / 2 - tops[i], 0, heights[i]);
          sc.style.transformOrigin = `50% ${originY.toFixed(0)}px`;
          sc.style.transform = `perspective(1600px) translate3d(0, ${(-cover * 4).toFixed(2)}vh, ${(-cover * 280).toFixed(1)}px) rotateX(${(cover * 8).toFixed(2)}deg)`;
          sc.style.borderRadius = `${(cover * 28).toFixed(1)}px`;
          sc._dim.style.opacity = (cover * 0.82).toFixed(3);
        } else if (enter > 0.001 && enter < 1) {
          sc.style.transformOrigin = '50% 0%';
          sc.style.transform = `perspective(1600px) rotateX(${(-enter * 9).toFixed(2)}deg) scale(${(1 - enter * 0.04).toFixed(4)})`;
          sc.style.borderRadius = `${(enter * 36).toFixed(1)}px ${(enter * 36).toFixed(1)}px 0 0`;
          sc._dim.style.opacity = (enter * 0.35).toFixed(3);
        } else if (sc.style.transform) {
          sc.style.transform = '';
          sc.style.borderRadius = '';
          sc._dim.style.opacity = '0';
        }
      }

      // videos: play while meaningfully visible and not buried under the next scene
      const visible = bottom > 0 && top < vh && cover < 0.97;
      for (const v of sc._videos) {
        if (visible && !reduceMotion) {
          if (v.paused && !v._starting) {
            if (v.preload === 'none') v.preload = 'auto';
            v._starting = true;
            const p = v.play();
            if (p && p.then) p.then(() => { v._starting = false; }, () => { v._starting = false; });
            else v._starting = false;
          }
        } else if (!v.paused) { v.pause(); }
      }

      // mouse depth + tilt for the scene in focus
      if (finePointer && use3D && i === current) {
        for (const el of sc._depth) {
          const d = parseFloat(el.dataset.depth) || 0;
          el.style.setProperty('--mx', `${(mouse.x * d).toFixed(2)}px`);
          el.style.setProperty('--my', `${(mouse.y * d).toFixed(2)}px`);
        }
        for (const el of sc._tilt) {
          if (el.classList.contains('rv') && !el.classList.contains('in')) continue;
          el.style.transform = `perspective(900px) rotateY(${(mouse.x * 14).toFixed(2)}deg) rotateX(${(-mouse.y * 10).toFixed(2)}deg)`;
        }
      }
    }

    // scroll parallax (translate on the element; mouse depth is added through --mx/--my)
    if (!reduceMotion) {
      for (const el of parallaxEls) {
        const i = sceneOf.get(el);
        const top = (i >= 0 ? tops[i] : 0) - sy;
        const h = i >= 0 ? heights[i] : vh;
        if (top + h < -vh || top > vh * 1.5) continue;
        if (el.classList.contains('rv') && !el.classList.contains('in')) continue;
        const center = top + h / 2 - vh / 2;
        const y = -center * (parseFloat(el.dataset.speed) || 0);
        el.style.translate = `var(--mx, 0px) calc(${y.toFixed(1)}px + var(--my, 0px))`;
      }
    }

    if (mouseMoving || window.scrollY !== lastScroll) requestAnimationFrame(frame);
    else running = false;
  }

  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', () => { layout(); lastScroll = -1; kick(); });
  window.addEventListener('load', () => { layout(); lastScroll = -1; kick(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layout(); lastScroll = -1; kick(); });

  /* ---------- Buttons ---------- */
  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);

  const indexEl = $('#index');
  const indexBtn = $('[data-action="index"]');
  let lastFocus = null;
  function openIndex() {
    lastFocus = document.activeElement;
    indexEl.hidden = false;
    requestAnimationFrame(() => indexEl.classList.add('is-open'));
    indexBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    const cur = indexItems[current] && indexItems[current].querySelector('a');
    (cur || $('.index__close')).focus({ preventScroll: true });
    if (cur) cur.scrollIntoView({ block: 'center' });
  }
  function closeIndex() {
    if (indexEl.hidden) return;
    indexEl.classList.remove('is-open');
    indexBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    setTimeout(() => { indexEl.hidden = true; }, 350);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  indexBtn.addEventListener('click', () => (indexEl.hidden ? openIndex() : closeIndex()));
  $('[data-action="index-close"]').addEventListener('click', closeIndex);
  indexEl.addEventListener('click', (e) => { if (e.target === indexEl) closeIndex(); });

  const fsBtn = $('[data-action="fullscreen"]');
  const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  if (!fsSupported) fsBtn.hidden = true;
  function toggleFullscreen() {
    const d = document;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) {
        (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      } else {
        const el = d.documentElement;
        const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        if (r && r.catch) r.catch(() => {});
      }
    } catch (err) { /* fullscreen not allowed here */ }
  }
  fsBtn.addEventListener('click', toggleFullscreen);
  const onFs = () => {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    root.classList.toggle('is-fullscreen', on);
    fsBtn.setAttribute('aria-label', on ? 'الخروج من ملء الشاشة' : 'ملء الشاشة');
  };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);

  // in-page anchors (hero cue, logo, back-to-top) use the same navigation
  $$('a[href^="#s"]').forEach((a) => {
    if (a.closest('.index')) return;
    a.addEventListener('click', (e) => {
      const i = scenes.findIndex((s) => `#${s.id}` === a.getAttribute('href'));
      if (i >= 0) { e.preventDefault(); goTo(i); }
    });
  });

  /* ---------- Keyboard (also works with presentation clickers) ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (!indexEl.hidden) { if (e.key === 'Escape') closeIndex(); return; }
    switch (e.key) {
      // RTL: the left arrow moves forward, the right arrow moves back
      case 'PageDown': case 'ArrowDown': case 'ArrowLeft':
        e.preventDefault(); next(); break;
      case 'ArrowRight':
        e.preventDefault(); prev(); break;
      case ' ':
        if (tag === 'button' || tag === 'a') return;
        e.preventDefault(); e.shiftKey ? prev() : next(); break;
      case 'PageUp': case 'ArrowUp':
        e.preventDefault(); prev(); break;
      case 'Home': e.preventDefault(); goTo(0); break;
      case 'End': e.preventDefault(); goTo(total - 1); break;
      case 'f': case 'F': case 'ف': if (fsSupported) toggleFullscreen(); break;
      case 'g': case 'G': case 'ل': openIndex(); break;
      default: break;
    }
  });

  /* ---------- Init ---------- */
  layout();
  kick();
  requestAnimationFrame(() => root.classList.add('is-loaded'));
  const startHash = location.hash ? scenes.findIndex((s) => `#${s.id}` === location.hash) : -1;
  if (startHash > 0) setTimeout(() => goTo(startHash, true), 60);
})();
