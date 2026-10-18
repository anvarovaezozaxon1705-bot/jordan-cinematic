/* 3D globe for the journey: NASA Blue Marble imagery (public domain) + Natural Earth borders (public domain).
   Exposes window.JGlobe = { init, setVisible, go, resize } */
(() => {
  'use strict';
  const T = window.THREE;
  if (!T) { window.JGlobe = null; return; }

  const D2R = Math.PI / 180;
  const R = 1;
  // camera "shots": lat, lon, altitude above the surface (in Earth radii), tilt (deg)
  const PLACES = {
    deep:    { lat: 18, lon: -20, alt: 9, tilt: 0 },
    space:   { lat: 22, lon: 20, alt: 2.6, tilt: 0 },
    riverN:  { lat: 32.72, lon: 35.6, alt: 0.05, tilt: 52 },
    riverS:  { lat: 31.78, lon: 35.55, alt: 0.05, tilt: 52 },
    world:   { lat: 28, lon: 36, alt: 1.6, tilt: 0 },
    region:  { lat: 30.6, lon: 37.5, alt: 0.42, tilt: 18 },
    jordan:  { lat: 30.9, lon: 36.4, alt: 0.15, tilt: 28 },
    amman:   { lat: 31.95, lon: 35.93, alt: 0.075, tilt: 34 },
    petra:   { lat: 30.33, lon: 35.44, alt: 0.075, tilt: 34 },
    jerash:  { lat: 32.28, lon: 35.89, alt: 0.075, tilt: 34 },
    rum:     { lat: 29.57, lon: 35.42, alt: 0.08, tilt: 34 },
    deadsea: { lat: 31.45, lon: 35.5, alt: 0.085, tilt: 34 },
    aqaba:   { lat: 29.53, lon: 35.0, alt: 0.085, tilt: 34 },
    river:   { lat: 32.0, lon: 35.56, alt: 0.085, tilt: 34 },
    south:   { lat: 29.95, lon: 35.43, alt: 0.1, tilt: 34 },
    north:   { lat: 32.3, lon: 35.95, alt: 0.1, tilt: 34 },
  };
  // pins: label text comes from the page (data-label on #globe-labels children)
  const PINS = {
    amman: [31.95, 35.93], petra: [30.33, 35.44], jerash: [32.28, 35.89], rum: [29.57, 35.42],
    deadsea: [31.5, 35.5], aqaba: [29.53, 35.0], irbid: [32.55, 35.85], zarqa: [32.07, 36.09],
    ajloun: [32.33, 35.75], river: [32.3, 35.57],
  };

  let renderer, scene, camera, earth, hiPatch, overlay, overlayCtx, overlayTex, atmo, stars, borders = [];
  let canvasEl, labelsEl, visible = false, raf = 0, last = 0;
  const pinEls = {};
  const cam = { lat: 22, lon: -10, alt: 2.6, tilt: 0 };
  let tween = null, flyDur = 0, queued = null, label = null;
  let spin = 0.02; // idle drift in deg/frame-ish
  let highlight = [];
  let activePins = [];
  let borderData = null;

  const vec = (lat, lon, r = R) => {
    const phi = (lon + 180) * D2R, th = (90 - lat) * D2R;
    return new T.Vector3(-r * Math.sin(th) * Math.cos(phi), r * Math.cos(th), r * Math.sin(th) * Math.sin(phi));
  };

  function init(canvas, labels) {
    canvasEl = canvas; labelsEl = labels;
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x050504, 1);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(38, 1, 0.001, 100);

    const loader = new T.TextureLoader();
    const tex = loader.load('assets/globe/earth-4k.jpg');
    tex.anisotropy = 8;
    const mat = new T.MeshPhongMaterial({ map: tex, shininess: 8, specular: new T.Color(0x222222) });
    earth = new T.Mesh(new T.SphereGeometry(R, 128, 96), mat);
    scene.add(earth);

    // high-resolution patch over the Levant (lon 30–42E, lat 26–37N), NASA Blue Marble 500 m
    const hiTex = loader.load('assets/globe/levant-hi.jpg');
    hiTex.anisotropy = 8;
    // feathered edges so the sharper patch blends into the base globe
    const fc = document.createElement('canvas'); fc.width = fc.height = 256;
    const fg = fc.getContext('2d'); fg.fillStyle = '#000'; fg.fillRect(0, 0, 256, 256);
    fg.filter = 'blur(18px)'; fg.fillStyle = '#fff'; fg.fillRect(40, 40, 176, 176);
    const feather = new T.CanvasTexture(fc);
    hiPatch = new T.Mesh(
      new T.SphereGeometry(R * 1.0004, 96, 96, (30 + 180) * D2R, 12 * D2R, (90 - 37) * D2R, 11 * D2R),
      new T.MeshPhongMaterial({ map: hiTex, alphaMap: feather, shininess: 8, specular: new T.Color(0x222222), transparent: true, opacity: 0 })
    );
    scene.add(hiPatch);

    // highlight overlay (canvas texture) covering lon 24–50E, lat 12–40N
    const oc = document.createElement('canvas');
    oc.width = 2048; oc.height = 2048;
    overlayCtx = oc.getContext('2d');
    overlayTex = new T.CanvasTexture(oc);
    overlay = new T.Mesh(
      new T.SphereGeometry(R * 1.0009, 96, 96, (24 + 180) * D2R, 26 * D2R, (90 - 40) * D2R, 28 * D2R),
      new T.MeshBasicMaterial({ map: overlayTex, transparent: true, depthWrite: false })
    );
    scene.add(overlay);

    // atmosphere glow
    atmo = new T.Mesh(new T.SphereGeometry(R * 1.06, 64, 64), new T.ShaderMaterial({
      uniforms: { c: { value: new T.Color(0x6fa6ff) } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vP; void main(){ float f = pow(1.0 - abs(dot(vN, normalize(-vP))), 3.0); gl_FragColor = vec4(c, f*0.9); }',
      side: T.BackSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    }));
    scene.add(atmo);

    // stars
    const g = new T.BufferGeometry();
    const n = 3000, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 10;
      pos[i * 3] = r * Math.sqrt(1 - u * u) * Math.cos(a); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * Math.sqrt(1 - u * u) * Math.sin(a);
    }
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    stars = new T.Points(g, new T.PointsMaterial({ color: 0xf1e6d0, size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.8 }));
    scene.add(stars);

    scene.add(new T.AmbientLight(0xffffff, 0.55));
    const sun = new T.DirectionalLight(0xfff4e0, 0.95);
    sun.position.set(-3, 2, 4);
    scene.add(sun);
    scene.userData.sun = sun;

    fetch('assets/globe/borders.json').then((r) => r.json()).then((data) => { borderData = data; buildBorders(); drawOverlay(); }).catch(() => {});

    // DOM pins
    if (labelsEl) {
      Array.from(labelsEl.children).forEach((el) => { pinEls[el.dataset.pin] = el; });
    }
    resize();
  }

  function buildBorders() {
    borderData.forEach((c) => {
      const isJ = c.id === 'JOR';
      const mat = new T.LineBasicMaterial({ color: isJ ? 0xd6b36a : 0xf1e6d0, transparent: true, opacity: isJ ? 0.95 : 0.35 });
      c.polys.forEach((poly) => {
        const ring = poly[0];
        const pts = ring.map(([lo, la]) => vec(la, lo, R * 1.0012));
        const line = new T.LineLoop(new T.BufferGeometry().setFromPoints(pts), mat);
        line.userData.id = c.id;
        scene.add(line);
        borders.push(line);
      });
    });
  }

  // equirectangular overlay: lon 24–50, lat 12–40
  let veilMask = null;
  function drawOverlay() {
    if (!borderData) return;
    const ctx = overlayCtx, W = 2048, H = 2048;
    ctx.clearRect(0, 0, W, H);
    const px = (lo) => (lo - 24) / 26 * W, py = (la) => (40 - la) / 28 * H;
    const path = (id) => {
      const c = borderData.find((x) => x.id === id);
      if (!c) return false;
      ctx.beginPath();
      c.polys.forEach((poly) => poly.forEach((ring) => {
        ring.forEach(([lo, la], i) => (i ? ctx.lineTo(px(lo), py(la)) : ctx.moveTo(px(lo), py(la))));
        ctx.closePath();
      }));
      return true;
    };
    // soft veil over the region (fades out towards the patch edges)
    const g = ctx.createRadialGradient(px(36.5), py(31), 40, px(36.5), py(31), W * 0.55);
    g.addColorStop(0, 'rgba(8,8,6,0.42)'); g.addColorStop(0.7, 'rgba(8,8,6,0.30)'); g.addColorStop(1, 'rgba(8,8,6,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // fade the veil to nothing at the overlay's edges (no visible seam)
    if (!veilMask) {
      veilMask = document.createElement('canvas'); veilMask.width = veilMask.height = 512;
      const m = veilMask.getContext('2d'); m.filter = 'blur(40px)'; m.fillStyle = '#fff'; m.fillRect(80, 80, 352, 352);
    }
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(veilMask, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    // cut Jordan and the highlighted countries out of the veil, then tint them
    ctx.globalCompositeOperation = 'destination-out';
    ['JOR', ...highlight].forEach((id) => { if (path(id)) { ctx.fillStyle = '#000'; ctx.fill('evenodd'); } });
    ctx.globalCompositeOperation = 'source-over';
    highlight.forEach((id) => { if (path(id)) { ctx.fillStyle = 'rgba(255,240,205,0.22)'; ctx.fill('evenodd'); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.stroke(); } });
    if (path('JOR')) { ctx.fillStyle = 'rgba(214,179,106,0.18)'; ctx.fill('evenodd'); ctx.lineWidth = 4; ctx.strokeStyle = '#e8c579'; ctx.shadowColor = 'rgba(214,179,106,0.9)'; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0; }
    overlayTex.needsUpdate = true;
  }

  function resize() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 55 : 38;
    camera.updateProjectionMatrix();
  }

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function go(cmd) {
    if (!cmd) return;
    if (/\bdeep\b/.test(cmd)) { Object.assign(cam, PLACES.deep); cmd = cmd.replace('deep', 'space'); flyDur = 7000; }
    if (/\briver-flight\b/.test(cmd)) { cmd = cmd.replace('river-flight', 'riverN'); queued = 'riverS'; }
    const parts = cmd.split(/\s+/);
    let shot = null; const hl = []; const pins = [];
    parts.forEach((p) => {
      const [k, v] = p.split(':');
      if (k === 'hl') v.split(',').forEach((x) => hl.push(x));
      else if (k === 'pin') v.split(',').forEach((x) => pins.push(x));
      else if (PLACES[k]) shot = PLACES[k];
    });
    highlight = hl; drawOverlay();
    activePins = pins;
    borders.forEach((b) => { b.material.opacity = b.userData.id === 'JOR' ? 0.95 : (hl.includes(b.userData.id) ? 0.9 : 0.35); });
    if (shot) {
      const from = { ...cam };
      // fly with an arc: rise in the middle when travelling far
      const dist = Math.hypot(shot.lat - from.lat, ((shot.lon - from.lon + 540) % 360) - 180);
      const peak = Math.max(shot.alt, from.alt, Math.min(1.2, dist * 0.02));
      let dlon = ((shot.lon - from.lon + 540) % 360) - 180;
      tween = { from, to: shot, dlon, peak, t0: performance.now(), dur: flyDur || Math.min(4200, 1800 + dist * 60), next: queued };
      flyDur = 0; queued = null;
      spin = shot.alt > 1 ? 0.02 : 0;
    }
  }

  function step(now) {
    raf = 0;
    if (!visible) return;
    const dt = Math.min(64, now - (last || now)); last = now;
    if (tween) {
      const t = Math.min(1, (now - tween.t0) / tween.dur), e = ease(t);
      cam.lat = tween.from.lat + (tween.to.lat - tween.from.lat) * e;
      cam.lon = tween.from.lon + tween.dlon * e;
      const lin = tween.from.alt + (tween.to.alt - tween.from.alt) * e;
      const arc = Math.sin(Math.PI * e) * Math.max(0, tween.peak - Math.max(tween.from.alt, tween.to.alt)) * 0.6;
      cam.alt = lin + arc;
      cam.tilt = tween.from.tilt + (tween.to.tilt - tween.from.tilt) * e;
      if (t >= 1) {
        const nx = tween.next; tween = null;
        if (nx) { const sh = PLACES[nx]; tween = { from: { ...cam }, to: sh, dlon: sh.lon - cam.lon, peak: 0, t0: now, dur: 9000 }; }
      }
    } else if (spin) {
      cam.lon += spin * dt * 0.06;
    } else {
      cam.lon += 0.00025 * dt; // very slow drift keeps the shot alive
    }
    // camera: local frame at the target (normal, north); tilt leans the camera south and looks north
    const target = vec(cam.lat, cam.lon, R);
    const n = target.clone().normalize();
    const east = new T.Vector3(0, 1, 0).cross(n).normalize();
    const north = n.clone().cross(east).normalize();
    const tau = cam.tilt * D2R;
    const back = target.clone()
      .addScaledVector(n, cam.alt * Math.cos(tau))
      .addScaledVector(north, -cam.alt * Math.sin(tau));
    camera.position.copy(back);
    camera.up.copy(north);
    // frame the place a little above the centre, so titles and subtitles never cover it
    const look = target.clone().addScaledVector(north, -cam.alt * 0.16);
    camera.lookAt(cam.alt > 0.6 ? target : look);
    // keep the sun over the shoulder
    scene.userData.sun.position.copy(back.clone().multiplyScalar(3).add(new T.Vector3(-1, 1.5, 0)));
    // the sharp Levant patch fades in only when we are close (hides its edge when zoomed out)
    hiPatch.material.opacity = Math.max(0, Math.min(1, (0.32 - cam.alt) / 0.14));
    hiPatch.visible = hiPatch.material.opacity > 0.01;
    renderer.render(scene, camera);
    placePins();
    raf = requestAnimationFrame(step);
  }

  const tmp = new T.Vector3();
  function placePins() {
    const w = window.innerWidth, h = window.innerHeight;
    Object.keys(pinEls).forEach((k) => {
      const el = pinEls[k];
      const ll = k === 'label' ? (label && label.ll) : PINS[k];
      const on = k === 'label' ? !!label : activePins.includes(k) && PINS[k];
      el.classList.toggle('on', !!on);
      if (!on) return;
      const p = vec(ll[0], ll[1], R * 1.001);
      // hide when on the far side
      const toCam = camera.position.clone().sub(p).normalize();
      const facing = toCam.dot(p.clone().normalize()) > 0.05;
      tmp.copy(p).project(camera);
      el.style.transform = `translate(${((tmp.x + 1) / 2 * w).toFixed(1)}px, ${((1 - tmp.y) / 2 * h).toFixed(1)}px)`;
      el.style.opacity = facing ? '' : '0';
    });
  }

  function setVisible(v) {
    visible = v;
    if (canvasEl) canvasEl.classList.toggle('on', v);
    if (labelsEl) labelsEl.classList.toggle('on', v);
    if (v && !raf) { last = 0; raf = requestAnimationFrame(step); }
  }

  const CENTRES = { SYR: [35.0, 38.6], IRQ: [33.2, 43.6], SAU: [28.0, 41.5], PSX: [31.9, 35.25] };
  function setLabel(id, text) {
    label = id && CENTRES[id] ? { ll: CENTRES[id] } : null;
    const el = document.getElementById('country-label'); if (el) el.textContent = text || '';
  }
  window.JGlobe = { init, setVisible, go, resize, setLabel };
})();
