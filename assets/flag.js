/* The Jordanian flag on a pole, rendered as waving cloth (three.js).
   Artwork: Flag of Jordan.svg (public domain). States: approach, stripes, black, white, green, red, star.
   window.JFlag = { init, setVisible, set } */
(() => {
  'use strict';
  const T = window.THREE;
  if (!T) { window.JFlag = null; return; }

  let renderer, scene, camera, mesh, mat, visible = false, raf = 0, t0 = 0;
  const cam = { x: 0.3, y: 0.15, z: 9, tx: 0.3, ty: 0.15, fov: 34 };
  let tween = null, hlTarget = 0, hlAmt = 0, hlId = 0;
  let star = { u: 0.17, v: 0.5 };

  const VS = `
    uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vP;
    float wave(float u, float v, float t){ return sin(u*6.5 - t*2.4) + 0.45*sin(u*12.0 + v*2.5 - t*3.7) + 0.2*sin(u*21.0 - v*4.0 - t*5.3); }
    void main(){
      vUv = uv; float u = uv.x, v = uv.y, t = uTime;
      float a = 0.11 * pow(u, 1.15);
      vec3 p = position;
      p.z += a * wave(u, v, t);
      p.y += a * 0.18 * sin(u*4.0 - t*1.9) - 0.03*u*u;
      float e = 0.002;
      float dzu = (0.11*pow(u+e,1.15)*wave(u+e,v,t) - a*wave(u,v,t)) / (e*2.0);
      float dzv = (a*wave(u,v+e,t) - a*wave(u,v,t)) / e;
      vN = normalize(normalMatrix * normalize(vec3(-dzu, -dzv, 1.0)));
      vec4 mv = modelViewMatrix * vec4(p, 1.0); vP = mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  const FS = `
    uniform sampler2D uTex; uniform float uHL; uniform float uAmt; varying vec2 vUv; varying vec3 vN; varying vec3 vP;
    float regionOf(vec2 uv){
      vec4 c = texture2D(uTex, uv);
      float inTri = step(uv.x, 0.5 - abs(uv.y - 0.5));
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      return inTri > 0.5 ? (lum > 0.8 ? 5.0 : 4.0) : (uv.y > 0.6667 ? 1.0 : (uv.y > 0.3333 ? 2.0 : 3.0));
    }
    float isSel(vec2 uv){ float r = regionOf(uv); if (uHL > 3.5 && uHL < 4.5 && r > 4.5) r = 4.0; return 1.0 - step(0.5, abs(r - uHL)); }
    void main(){
      vec4 c = texture2D(uTex, vUv);
      float sel = isSel(vUv);
      // a thin gold outline around the part being described
      float e = 0.0032;
      float nb = min(min(isSel(vUv + vec2(e, 0.0)), isSel(vUv - vec2(e, 0.0))), min(isSel(vUv + vec2(0.0, e * 2.0)), isSel(vUv - vec2(0.0, e * 2.0))));
      float edge = sel * (1.0 - nb);
      float dim = mix(1.0, mix(0.18, 1.0, sel), uAmt);
      vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
      vec3 L = normalize(vec3(-0.35, 0.45, 0.82));
      vec3 V = normalize(-vP);
      float diff = 0.5 + 0.5 * max(dot(N, L), 0.0);
      float spec = pow(max(dot(reflect(-L, N), V), 0.0), 28.0) * 0.22;
      vec3 col = c.rgb * diff * dim + spec * dim;
      col += sel * uAmt * vec3(0.05, 0.045, 0.03);
      col = mix(col, vec3(0.92, 0.76, 0.42), edge * uAmt);
      gl_FragColor = vec4(col, 1.0);
    }`;

  function flagTexture(cb) {
    const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 1024;
    const g = cv.getContext('2d');
    const done = () => {
      // find the star: centre of white pixels inside the red triangle
      const d = g.getImageData(0, 0, 1024, 1024).data; let sx = 0, sy = 0, n = 0;
      for (let y = 256; y < 768; y += 2) for (let x = 0; x < 512; x += 2) {
        const i = (y * 1024 + x) * 4; if (d[i] > 230 && d[i + 1] > 230 && d[i + 2] > 230 && x < (1024 - Math.abs(y - 512) * 2) * 0.85) { sx += x; sy += y; n++; }
      }
      if (n) star = { u: sx / n / 2048, v: 1 - sy / n / 1024 };
      const tex = new T.CanvasTexture(cv); tex.anisotropy = 8; cb(tex);
    };
    const img = new Image(); img.crossOrigin = 'anonymous'; // the page may load its files from a CDN
    img.onload = () => { g.drawImage(img, 0, 0, 2048, 1024); done(); };
    img.onerror = () => { // fallback drawing (same geometry as the official flag)
      [['#000', 0], ['#fff', 1], ['#007a3d', 2]].forEach(([c, i]) => { g.fillStyle = c; g.fillRect(0, i * 1024 / 3, 2048, 1024 / 3 + 1); });
      g.fillStyle = '#ce1126'; g.beginPath(); g.moveTo(0, 0); g.lineTo(1024, 512); g.lineTo(0, 1024); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.beginPath();
      for (let k = 0; k < 14; k++) { const r = k % 2 ? 50 : 120, a = -Math.PI / 2 + k * Math.PI / 7; g.lineTo(340 + r * Math.cos(a), 512 + r * Math.sin(a)); }
      g.closePath(); g.fill(); done();
    };
    img.src = 'assets/img/flag-jordan.png';
  }

  function init(canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(cam.fov, 1, 0.01, 100);
    flagTexture((tex) => {
      mat = new T.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uTex: { value: tex }, uHL: { value: 0 }, uAmt: { value: 0 } }, vertexShader: VS, fragmentShader: FS, side: T.DoubleSide });
      mesh = new T.Mesh(new T.PlaneGeometry(2, 1, 180, 90), mat);
      mesh.position.set(0, 0.5, 0);
      scene.add(mesh);
      // pole + finial
      const pole = new T.Mesh(new T.CylinderGeometry(0.022, 0.026, 6, 24), new T.MeshStandardMaterial({ color: 0xb9b2a3, metalness: 0.8, roughness: 0.35 }));
      pole.position.set(-1.03, -1.95, 0); scene.add(pole);
      const ball = new T.Mesh(new T.SphereGeometry(0.05, 24, 16), new T.MeshStandardMaterial({ color: 0xd6b36a, metalness: 0.9, roughness: 0.25 }));
      ball.position.set(-1.03, 1.08, 0); scene.add(ball);
      scene.add(new T.AmbientLight(0xffffff, 0.6));
      const dl = new T.DirectionalLight(0xfff1d6, 1.1); dl.position.set(-2, 3, 4); scene.add(dl);
    });
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const SHOTS = {
    far:      { x: 0.2, y: 0.0, z: 11, tx: 0.0, ty: 0.25, fov: 34 },
    approach: { x: 0.25, y: 0.25, z: 3.4, tx: 0.05, ty: 0.45, fov: 34 },
    stripes:  { x: 0.15, y: 0.4, z: 2.75, tx: 0.05, ty: 0.48, fov: 34 },
    black:    { x: 0.35, y: 0.75, z: 2.2, tx: 0.25, ty: 0.78, fov: 34 },
    white:    { x: 0.35, y: 0.5, z: 2.2, tx: 0.25, ty: 0.5, fov: 34 },
    green:    { x: 0.35, y: 0.25, z: 2.2, tx: 0.25, ty: 0.22, fov: 34 },
    red:      { x: -0.45, y: 0.5, z: 1.75, tx: -0.55, ty: 0.5, fov: 34 },
  };
  const HL = { stripes: 0, black: 1, white: 2, green: 3, red: 4, star: 5 };

  function set(state) {
    let shot = SHOTS[state];
    if (state === 'star') { const sx = -1 + star.u * 2, sy = star.v; shot = { x: sx + 0.02, y: sy, z: 0.42, tx: sx, ty: sy, fov: 30 }; }
    if (state === 'approach') { Object.assign(cam, SHOTS.far); }
    if (shot) tween = { from: { ...cam }, to: shot, t0: performance.now(), dur: state === 'approach' ? 5200 : state === 'star' ? 3200 : 2200 };
    hlTarget = state in HL && HL[state] > 0 ? 1 : 0;
    if (HL[state]) hlId = HL[state];
  }

  function step(now) {
    raf = 0;
    if (!visible) return;
    if (!t0) t0 = now;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.dur), e = ease(k);
      ['x', 'y', 'z', 'tx', 'ty', 'fov'].forEach((p) => { cam[p] = tween.from[p] + (tween.to[p] - tween.from[p]) * e; });
      if (k >= 1) tween = null;
    }
    hlAmt += (hlTarget - hlAmt) * 0.06;
    if (mat) { mat.uniforms.uTime.value = (now - t0) / 1000; mat.uniforms.uHL.value = hlId; mat.uniforms.uAmt.value = hlAmt; }
    camera.position.set(cam.x, cam.y, cam.z); camera.fov = cam.fov; camera.updateProjectionMatrix();
    camera.lookAt(cam.tx, cam.ty, 0);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(step);
  }
  function setVisible(v) {
    visible = v;
    if (v && !raf) raf = requestAnimationFrame(step);
  }
  window.JFlag = { init, setVisible, set, debug: () => ({ star, cam: { ...cam } }) };
})();
