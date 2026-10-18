/* Generative score (WebAudio): drones, pads in a Hijaz colour, wind and a soft city murmur.
   Nothing is downloaded. Starts only after a user gesture. window.JSound = { start, stop, mood, on } */
(() => {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { window.JSound = null; return; }
  let ctx, master, rev, pad, drone, wind, windFilter, city, shimmer, on = false, current = 'space';
  const N = (n) => 146.83 * Math.pow(2, n / 12); // semitones from D3
  // moods: pad chord (semitones from D3), brightness, levels
  const MOODS = {
    space:   { chord: [-12, -5, 0, 7], bright: 500, pad: 0.10, drone: 0.16, wind: 0.0, city: 0.0, shimmer: 0.035 },
    wind:    { chord: [-12, 0, 7, 12], bright: 900, pad: 0.10, drone: 0.12, wind: 0.10, city: 0.0, shimmer: 0.0 },
    hall:    { chord: [-12, 0, 4, 7, 12], bright: 1300, pad: 0.13, drone: 0.10, wind: 0.0, city: 0.0, shimmer: 0.02 },
    city:    { chord: [-12, 0, 3, 7, 10], bright: 1000, pad: 0.09, drone: 0.08, wind: 0.0, city: 0.06, shimmer: 0.0 },
    warm:    { chord: [-12, 1, 4, 7, 11], bright: 1100, pad: 0.12, drone: 0.08, wind: 0.0, city: 0.0, shimmer: 0.0 },
    desert:  { chord: [-12, 0, 7, 12, 19], bright: 1500, pad: 0.13, drone: 0.12, wind: 0.08, city: 0.0, shimmer: 0.02 },
    finale:  { chord: [-12, 0, 4, 7, 12, 16], bright: 2200, pad: 0.18, drone: 0.12, wind: 0.05, city: 0.0, shimmer: 0.03 },
    silence: { chord: [-12, 0, 7], bright: 400, pad: 0.03, drone: 0.03, wind: 0.0, city: 0.0, shimmer: 0.0 },
  };

  function noiseBuffer(sec) {
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function impulse(sec) {
    const b = ctx.createBuffer(2, ctx.sampleRate * sec, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
    return b;
  }
  const ramp = (p, v, s = 3) => { const t = ctx.currentTime; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(v, t + s); };

  function build() {
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
    rev = ctx.createConvolver(); rev.buffer = impulse(4);
    const revGain = ctx.createGain(); revGain.gain.value = 0.55; rev.connect(revGain); revGain.connect(master);

    // pad: 6 voices of detuned saws through a slowly moving low-pass
    pad = { out: ctx.createGain(), filter: ctx.createBiquadFilter(), voices: [] };
    pad.filter.type = 'lowpass'; pad.filter.frequency.value = 600; pad.filter.Q.value = 0.7;
    pad.out.gain.value = 0; pad.filter.connect(pad.out); pad.out.connect(master); pad.out.connect(rev);
    for (let i = 0; i < 6; i++) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(pad.filter);
      const a = ctx.createOscillator(), b = ctx.createOscillator();
      a.type = 'sawtooth'; b.type = 'triangle'; a.detune.value = -7; b.detune.value = 6;
      a.connect(g); b.connect(g); a.start(); b.start();
      pad.voices.push({ g, a, b });
    }
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.05; lg.gain.value = 250; lfo.connect(lg); lg.connect(pad.filter.frequency); lfo.start();

    // drone
    drone = ctx.createGain(); drone.gain.value = 0; drone.connect(master); drone.connect(rev);
    [N(-24), N(-17)].forEach((f) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(drone); o.start(); });

    // shimmer (space)
    shimmer = ctx.createGain(); shimmer.gain.value = 0; shimmer.connect(rev);
    [N(24), N(31)].forEach((f, i) => { const o = ctx.createOscillator(); o.frequency.value = f; const tr = ctx.createGain(); tr.gain.value = 0.5;
      const l = ctx.createOscillator(); l.frequency.value = 0.13 + i * 0.07; const lg2 = ctx.createGain(); lg2.gain.value = 0.5; l.connect(lg2); lg2.connect(tr.gain); l.start();
      o.connect(tr); tr.connect(shimmer); o.start(); });

    // wind
    const nb = noiseBuffer(4);
    const ws = ctx.createBufferSource(); ws.buffer = nb; ws.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 500; windFilter.Q.value = 0.8;
    wind = ctx.createGain(); wind.gain.value = 0; ws.connect(windFilter); windFilter.connect(wind); wind.connect(master); ws.start();
    const wl = ctx.createOscillator(), wlg = ctx.createGain(); wl.frequency.value = 0.09; wlg.gain.value = 300; wl.connect(wlg); wlg.connect(windFilter.frequency); wl.start();

    // city murmur
    const cs = ctx.createBufferSource(); cs.buffer = nb; cs.loop = true;
    const cf = ctx.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 320;
    city = ctx.createGain(); city.gain.value = 0; cs.connect(cf); cf.connect(city); city.connect(master); cs.start();
  }

  function mood(name, secs = 4) {
    current = MOODS[name] ? name : current;
    if (!ctx || !on) return;
    const m = MOODS[current];
    pad.voices.forEach((v, i) => {
      const n = m.chord[i];
      if (n === undefined) { ramp(v.g.gain, 0, secs); return; }
      const f = N(n); const t = ctx.currentTime;
      v.a.frequency.setTargetAtTime(f, t, secs / 3); v.b.frequency.setTargetAtTime(f * 1.002, t, secs / 3);
      ramp(v.g.gain, 0.16, secs);
    });
    ramp(pad.filter.frequency, m.bright, secs);
    ramp(pad.out.gain, m.pad, secs); ramp(drone.gain, m.drone, secs); ramp(wind.gain, m.wind, secs);
    ramp(city.gain, m.city, secs); ramp(shimmer.gain, m.shimmer, secs);
  }
  function start() {
    if (!ctx) build();
    if (ctx.state === 'suspended') ctx.resume();
    on = true; ramp(master.gain, 0.8, 2.5); mood(current, 3);
  }
  function stop() { if (!ctx) return; on = false; ramp(master.gain, 0, 1.2); }
  window.JSound = { start, stop, mood, on: () => on };
})();
