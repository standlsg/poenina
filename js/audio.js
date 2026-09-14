"use strict";
/* ==========================================================================
   POE NINA — musique 8 bits & bruitages
   Pentatonique majeure, harmonie en tierces parallèles (esprit himene),
   ostinato de toere (tambour de bois) et frappes de pahu.
   ========================================================================== */
const Snd = {
  ctx: null, master: null, mus: null, sfx: null, noise: null,
  muted: false, ready: false, __t: 0,
  bpm: 104, step: 0, nextTime: 0, playing: false, intensity: 1, transpose: 0,
  engine: null, engGain: null, engFilter: null, surfGain: null,

  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.85; this.master.connect(c.destination);
    this.mus = c.createGain(); this.mus.gain.value = 0.32; this.mus.connect(this.master);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.55; this.sfx.connect(this.master);
    const n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.buildEngine(); this.buildSurf();
    this.ready = true;
    this.nextTime = c.currentTime + 0.1;
    // horloge propre : la musique ne dépend pas de la cadence d'affichage
    setInterval(() => this.tick(), 80);
  },
  hz(m) { return 440 * Math.pow(2, (m - 69) / 12); },

  /* ------------------------------ voix ---------------------------------- */
  blip(t, midi, dur, type, g) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = type || "square";
    const f = this.hz(midi + this.transpose);
    o.frequency.setValueAtTime(f, t);
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 5.4; lg.gain.value = f * 0.0065;
    lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(g, t + 0.014);
    gn.gain.setValueAtTime(g, t + dur * 0.55);
    gn.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(gn); gn.connect(this.mus);
    o.start(t); o.stop(t + dur + 0.02);
  },
  toere(t, accent) {
    const c = this.ctx; if (!c) return;
    const s = c.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 1.5 + Math.random() * 0.2;
    const bp = c.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.value = accent ? 2050 : 2650; bp.Q.value = 3.5;
    const g = c.createGain(), v = accent ? 0.4 : 0.14;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0008, t + (accent ? 0.075 : 0.042));
    s.connect(bp); bp.connect(g); g.connect(this.mus);
    s.start(t, Math.random()); s.stop(t + 0.12);
  },
  pahu(t) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(128, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.16);
    g.gain.setValueAtTime(0.48, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(this.mus); o.start(t); o.stop(t + 0.24);
    const s = c.createBufferSource(); s.buffer = this.noise;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 280;
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.2, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    s.connect(lp); lp.connect(g2); g2.connect(this.mus); s.start(t, Math.random()); s.stop(t + 0.14);
  },

  /* ----------------------------- motifs --------------------------------- */
  PENTA: [0, 2, 4, 7, 9],
  deg(i) { const o = Math.floor(i / 5), k = ((i % 5) + 5) % 5; return 50 + o * 12 + this.PENTA[k]; },
  MEL: [
    12, -1, 13, -1, 14, -1, -1, -1, 13, -1, 12, -1, 11, -1, -1, -1,
    10, -1, 11, -1, 12, -1, -1, -1, 11, -1, 10, -1, 9, -1, -1, -1,
    11, -1, 12, -1, 13, -1, 14, -1, 15, -1, 14, -1, 13, -1, -1, -1,
    12, -1, -1, -1, 11, -1, 10, -1, 9, -1, -1, -1, -1, -1, -1, -1,
    14, -1, 15, -1, 16, -1, 15, -1, 14, -1, 13, -1, 12, -1, -1, -1,
    13, -1, 14, -1, 15, -1, -1, -1, 14, -1, 13, -1, 12, -1, 11, -1,
    12, -1, 13, -1, 14, -1, 15, -1, 16, -1, -1, -1, 15, -1, 14, -1,
    13, -1, 12, -1, 11, -1, 10, -1, 9, -1, -1, -1, -1, -1, -1, -1
  ],
  BASS: [9, 12, 13, 12, 9, 12, 11, 12],
  TOERE: [2, 1, 0, 1, 2, 0, 1, 0, 2, 1, 0, 1, 2, 0, 1, 1],
  PAHU: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],

  startMusic() { if (!this.ready) return; this.playing = true; this.nextTime = this.ctx.currentTime + 0.08; },
  stopMusic() { this.playing = false; },

  tick() {
    if (!this.ready) return;
    const c = this.ctx, spb = 60 / this.bpm / 4;
    if (this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05;
    while (this.playing && this.nextTime < c.currentTime + 0.8) {
      const t = this.nextTime, s = this.step, bar = Math.floor(s / 16) % 8, ib = s % 16, I = this.intensity;
      if (I > 0) {
        const tv = this.TOERE[ib];
        if (tv) this.toere(t, tv === 2);
        if (this.PAHU[ib]) this.pahu(t);
      }
      if (I >= 1) {
        if (ib === 0) {
          const b = this.BASS[bar];
          this.blip(t, this.deg(b) - 12, spb * 14, "triangle", 0.2);
          this.blip(t + spb * 8, this.deg(b) - 5, spb * 5, "triangle", 0.12);
        }
        const m = this.MEL[s % this.MEL.length];
        if (m !== null && m !== -1) {
          let len = 1;
          while (len < 12 && this.MEL[(s + len) % this.MEL.length] === -1) len++;
          const dur = spb * len * 0.95;
          this.blip(t, this.deg(m), dur, "square", 0.15);
          if (I >= 2) this.blip(t + 0.02, this.deg(m - 2), dur * 0.9, "square", 0.085);
        }
      }
      if (I >= 2 && (ib === 2 || ib === 6 || ib === 10 || ib === 14)) {
        const root = this.BASS[bar];
        for (let k = 0; k < 3; k++) this.blip(t + k * 0.022, this.deg(root + 2 * k + 5), 0.13, "square", 0.055);
      }
      this.step++; this.nextTime += spb;
    }
  },

  /* ---------------------------- bruitages ------------------------------- */
  buildEngine() {
    const c = this.ctx;
    const g = this.engGain = c.createGain(); g.gain.value = 0;
    const lp = this.engFilter = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
    lp.connect(g); g.connect(this.sfx);
    const a = c.createOscillator(); a.type = "sawtooth"; a.frequency.value = 46;
    const b = c.createOscillator(); b.type = "square"; b.frequency.value = 93;
    const bg = c.createGain(); bg.gain.value = 0.35;
    a.connect(lp); b.connect(bg); bg.connect(lp);
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 180; bp.Q.value = 1.2;
    const ng = c.createGain(); ng.gain.value = 0.5; s.connect(bp); bp.connect(ng); ng.connect(lp);
    a.start(); b.start(); s.start();
    this.engine = { a, b };
  },
  setEngine(level, rpm) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(level * 0.28, t, 0.08);
    this.engine.a.frequency.setTargetAtTime(40 + rpm * 58, t, 0.12);
    this.engine.b.frequency.setTargetAtTime(81 + rpm * 118, t, 0.12);
    this.engFilter.frequency.setTargetAtTime(330 + rpm * 520, t, 0.15);
  },
  buildSurf() {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520;
    const g = this.surfGain = c.createGain(); g.gain.value = 0;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.11; lg.gain.value = 0.035; lfo.connect(lg); lg.connect(g.gain);
    s.connect(lp); lp.connect(g); g.connect(this.sfx); s.start(); lfo.start();
  },
  setSurf(v) { if (this.ready) this.surfGain.gain.setTargetAtTime(v * 0.07, this.ctx.currentTime, 0.4); },

  burst(freq, dur, type, gain, q, sweepTo) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type || "bandpass";
    f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  tone(freq, dur, type, gain, to) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || "square"; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.02);
  },
  sScrape() { this.burst(700, 0.22, "bandpass", 0.33, 1.6, 260); this.tone(90, 0.18, "triangle", 0.17, 60); },
  sGround() { this.burst(420, 0.9, "lowpass", 0.45, 1, 90); this.tone(70, 0.8, "sine", 0.24, 44); },
  /* drisse au winch : 3,5 s de cliquets qui ralentissent, puis la voile
     qui claque en prenant le vent */
  sSail(down) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    let d = 0;
    for (let i = 0; i < 26 && d < 3.3; i++) {
      this.noiseAt(t + d, 0.04, "bandpass", 1900 + Math.random() * 700, 1300, 0.13, 8);
      d += 0.085 + i * 0.0055;
    }
    this.noiseAt(t, 3.3, "bandpass", down ? 900 : 400, down ? 400 : 900, 0.09, 0.7);
    if (!down) this.noiseAt(t + 3.3, 0.5, "bandpass", 700, 1800, 0.2, 0.9);
  },
  /* démarreur : on lance, ça tourne, ça prend */
  sStart() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      this.toneAt(t + i * 0.11, 0.1, "sawtooth", 55 + i * 3, 38, 0.15);
      this.noiseAt(t + i * 0.11, 0.09, "bandpass", 320, 200, 0.14, 2);
    }
    this.toneAt(t + 0.8, 0.35, "sawtooth", 44, 78, 0.2);
    this.noiseAt(t + 0.8, 0.4, "lowpass", 500, 260, 0.2);
  },
  sStop() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.toneAt(t, 0.6, "sawtooth", 82, 24, 0.2);
    this.noiseAt(t, 0.55, "lowpass", 420, 120, 0.16);
    this.toneAt(t + 0.3, 0.25, "square", 46, 26, 0.09);
  },
  sLuff(v) { this.burst(900 + Math.random() * 600, 0.14, "bandpass", 0.09 * v, 1.4); },
  sSputter() { this.tone(70, 0.14, "sawtooth", 0.19, 38); this.burst(260, 0.12, "lowpass", 0.18, 1); },
  sChain() { this.burst(2400, 0.07, "bandpass", 0.24, 6); },
  sBeep(hi) { this.tone(hi ? 1180 : 720, 0.07, "square", 0.13); },
  sStingLose(delay) {
    if (!this.ready) return;
    this.stopMusic(); const t0 = this.ctx.currentTime + (delay || 0); this.pahu(t0);
    [16, 14, 13, 11, 9, 7].forEach((d, i) => this.blip(t0 + i * 0.13, this.deg(d) - 12, 0.3, "square", 0.19));
  },
  sStingWin(delay) {
    if (!this.ready) return;
    this.stopMusic(); const t0 = this.ctx.currentTime + (delay || 0);
    [9, 11, 12, 14, 16, 17, 19].forEach((d, i) => {
      this.blip(t0 + i * 0.1, this.deg(d), 0.35, "square", 0.19);
      this.blip(t0 + i * 0.1 + 0.01, this.deg(d - 2), 0.3, "square", 0.1);
    });
    for (let i = 0; i < 14; i++) this.toere(t0 + i * 0.075, i % 4 === 0);
    this.pahu(t0); this.pahu(t0 + 0.7);
    [9, 13, 16].forEach(d => this.blip(t0 + 0.75, this.deg(d), 1.6, "triangle", 0.12));
  },

  /* ---- briques bas niveau pour les deux samples composés ---- */
  noiseAt(t, dur, type, f0, f1, gain, q) {
    const c = this.ctx; if (!c) return;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const bq = c.createBiquadFilter(); bq.type = type; bq.Q.value = q || 1;
    bq.frequency.setValueAtTime(f0, t);
    bq.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.05, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    s.connect(bq); bq.connect(g); g.connect(this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  toneAt(t, dur, type, f0, f1, gain) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.02);
  },

  /* ===== SAMPLE : CHOC (non fatal) ========================================
     la coque encaisse : claquement sec, coup sourd, corail qui racle.     */
  sHit() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.noiseAt(t, 0.13, "bandpass", 2800, 900, 0.42, 1.4);     // fibre
    this.toneAt(t, 0.34, "square", 210, 58, 0.26);
    this.toneAt(t, 0.5, "sine", 104, 34, 0.3);                   // coup sourd
    this.noiseAt(t + 0.04, 0.42, "bandpass", 900, 320, 0.28, 1.1);
    [0.1, 0.2, 0.33].forEach((d, i) =>
      this.noiseAt(t + d, 0.09, "bandpass", 1900 - i * 350, 600, 0.17, 5));
    this.noiseAt(t + 0.12, 0.5, "highpass", 1500, 3200, 0.13);   // gerbe d'eau
  },

  /* ===== SAMPLE : NAUFRAGE ================================================
     dernier choc -> la coque cède -> l'eau s'engouffre -> glouglous qui
     descendent -> la mer se referme.                                     */
  sSink() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // 1. le coup de grâce
    this.toneAt(t, 0.6, "square", 190, 40, 0.32);
    this.toneAt(t, 0.85, "sine", 88, 26, 0.36);
    this.noiseAt(t, 0.2, "bandpass", 2600, 600, 0.42, 1.2);
    this.noiseAt(t + 0.02, 0.9, "lowpass", 1400, 150, 0.36);
    // 2. la coque se déchire
    [0.14, 0.3, 0.5, 0.74, 0.98].forEach((d, i) =>
      this.noiseAt(t + d, 0.13, "bandpass", 1800 - i * 240, 420, 0.22, 4));
    // 3. l'eau s'engouffre
    this.noiseAt(t + 0.32, 1.7, "bandpass", 340, 1600, 0.26, 0.7);
    this.noiseAt(t + 0.55, 2.2, "lowpass", 780, 190, 0.28);
    // 4. glouglous de plus en plus graves
    for (let i = 0; i < 12; i++) {
      const d = 0.6 + i * 0.15 + Math.random() * 0.06;
      const f = 440 - i * 25 + Math.random() * 60;
      this.toneAt(t + d, 0.15, "sine", f, f * 0.42, 0.13);
    }
    // 5. la mer se referme au-dessus
    this.noiseAt(t + 2.2, 0.9, "lowpass", 900, 130, 0.3);
    this.toneAt(t + 2.2, 1.8, "triangle", 110, 24, 0.22);
    this.toneAt(t + 2.3, 2.0, "sine", 62, 20, 0.2);
    for (let i = 0; i < 5; i++)
      this.toneAt(t + 2.5 + i * 0.22, 0.2, "sine", 190 - i * 24, 70, 0.08);
  },

  /* ===== SAMPLE : MOUILLAGE ===============================================
     la chaîne file dans le davier -> l'ancre tombe à l'eau -> la chaîne se
     tend -> l'ancre croche : petit accord qui confirme.                   */
  sAnchorSet() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // chaîne qui file : maillons de plus en plus espacés
    let d = 0;
    for (let i = 0; i < 16; i++) {
      this.noiseAt(t + d, 0.05, "bandpass", 2300 + Math.random() * 900, 1600, 0.2, 7);
      d += 0.032 + i * 0.004;
    }
    // plouf
    this.noiseAt(t + 0.42, 0.3, "lowpass", 1800, 260, 0.34);
    this.toneAt(t + 0.42, 0.22, "sine", 300, 90, 0.16);
    this.noiseAt(t + 0.5, 0.55, "bandpass", 600, 1800, 0.14, 0.8);
    // la chaîne se tend, puis l'ancre croche
    this.toneAt(t + 0.72, 0.3, "triangle", 70, 55, 0.2);
    this.noiseAt(t + 0.72, 0.25, "lowpass", 420, 120, 0.2);
    this.toneAt(t + 0.95, 0.18, "square", 150, 120, 0.16);
    // accord de confirmation (pentatonique, comme la musique)
    [12, 14, 16].forEach((k, i) =>
      this.blip(t + 1.08 + i * 0.06, this.deg(k), 0.5, "square", 0.13));
    this.pahu(t + 1.08);
  },
  /* cri d'oiseau : sifflement bref et modulé, épisodique */
  sBird() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const f0 = 1800 + Math.random() * 1400;
    for (let i = 0; i < 3; i++) {
      const d = i * 0.07;
      this.toneAt(t + d, 0.06, "sine", f0 + i * 120, f0 + i * 120 - 200, 0.05 + Math.random() * 0.03);
      this.toneAt(t + d + 0.03, 0.05, "sine", (f0 + i * 120) * 1.5, (f0 + i * 120) * 1.4, 0.025);
    }
  },
  /* craquement de coque à la gîte : sec, sourd, bois qui fatigue */
  sCreak() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.toneAt(t, 0.14, "sawtooth", 220, 90, 0.08);
    this.noiseAt(t, 0.12, "bandpass", 600, 300, 0.08, 4);
    this.toneAt(t + 0.04, 0.10, "triangle", 140, 70, 0.05);
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.ready) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.85, this.ctx.currentTime, 0.05);
    return this.muted;
  }
};
