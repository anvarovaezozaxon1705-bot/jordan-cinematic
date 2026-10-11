/* المملكة الأردنية الهاشمية — interactions (no dependencies) */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const scenes = $$('.scene');
  const total = scenes.length;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toArabicDigits = (n) => String(n).padStart(2, '0').replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

  const hudNum = $('.hud__num');
  const hudName = $('.hud__name');
  const pagerCur = $('.pager__cur');
  const progressBar = $('.progress__bar');
  const prevBtn = $('[data-action="prev"]');
  const nextBtn = $('[data-action="next"]');
  $('.pager__total').textContent = toArabicDigits(total);

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

    const img = sc.querySelector('.scene__bg img, .scene__bg video, figure img, .s-lang__paper img');
    const src = img ? (img.getAttribute('poster') || img.getAttribute('src')) : '';
    const item = document.createElement('li');
    item.className = 'index__item';
    item.innerHTML = `<a href="#${sc.id}">${src ? `<img src="${src}" alt="" loading="lazy">` : ''}<span class="index__label"><b>${toArabicDigits(i + 1)}</b><span>${title}</span></span></a>`;
    item.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); closeIndex(); goTo(i); });
    indexGrid.appendChild(item);
  });
  const railBtns = $$('.rail__btn');
  const indexItems = $$('.index__item');

  /* ---------- Current scene tracking ---------- */
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
    const probe = window.innerHeight * 0.45;
    let idx = 0;
    for (let k = 0; k < total; k++) {
      if (scenes[k].getBoundingClientRect().top <= probe) idx = k; else break;
    }
    setCurrent(idx);
  }

  function goTo(i) {
    i = Math.max(0, Math.min(total - 1, i));
    const top = scenes[i].getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  const next = () => {
    // if the current scene is taller than the viewport and its end isn't visible, page within it first
    const sc = scenes[current];
    const r = sc.getBoundingClientRect();
    if (r.top <= 4 && r.bottom - window.innerHeight > 40) {
      window.scrollBy({ top: Math.min(window.innerHeight * 0.85, r.bottom - window.innerHeight), behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }
    goTo(current + 1);
  };
  const prev = () => {
    const r = scenes[current].getBoundingClientRect();
    if (r.top < -40) { goTo(current); return; }
    goTo(current - 1);
  };

  /* ---------- Reveal on view ---------- */
  const revealEls = $$('.rv');
  if ('IntersectionObserver' in window && !reduceMotion) {
    // Masked/clipped elements start fully hidden (clip-path / translated out of an overflow box),
    // so they never "intersect" themselves — watch their parent instead.
    const watchers = new Map();
    revealEls.forEach((el) => {
      const masked = el.matches('.rv-mask, .rv-curtain');
      const target = masked ? el.parentElement : el;
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

  /* ---------- Videos: play only while visible ---------- */
  const videos = $$('video');
  if ('IntersectionObserver' in window) {
    const vio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting && !reduceMotion) {
          if (v.preload === 'none') { v.preload = 'auto'; }
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        } else { v.pause(); }
      });
    }, { threshold: 0.2 });
    videos.forEach((v) => vio.observe(v));
  }

  /* ---------- Parallax + progress (rAF) ---------- */
  const parallaxEls = $$('[data-speed]');
  let ticking = false;
  function frame() {
    ticking = false;
    const vh = window.innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    const p = max > 0 ? window.scrollY / max : 0;
    progressBar.style.transform = `scaleX(${p.toFixed(4)})`;

    if (!reduceMotion) {
      for (const el of parallaxEls) {
        const host = el.closest('.scene') || el;
        const r = host.getBoundingClientRect();
        if (r.bottom < -100 || r.top > vh + 100) continue;
        const center = r.top + r.height / 2 - vh / 2;
        const speed = parseFloat(el.dataset.speed) || 0;
        const y = -center * speed;
        if (el.classList.contains('rv') && !el.classList.contains('in')) continue;
        el.style.translate = `0 ${y.toFixed(1)}px`;
      }
    }
    detectCurrent();
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

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
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    } else {
      const el = d.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    }
  }
  fsBtn.addEventListener('click', toggleFullscreen);
  const onFs = () => {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.documentElement.classList.toggle('is-fullscreen', on);
    fsBtn.setAttribute('aria-label', on ? 'الخروج من ملء الشاشة' : 'ملء الشاشة');
  };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);

  // in-page anchors (hero cue, logo, back-to-top) use the same smooth navigation
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
  const startHash = location.hash && scenes.findIndex((s) => `#${s.id}` === location.hash);
  frame();
  if (startHash > 0) setTimeout(() => goTo(startHash), 60);
})();
