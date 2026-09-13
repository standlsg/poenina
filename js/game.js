"use strict";
/* ==========================================================================
   POE NINA — états, entrées, boucle
   ========================================================================== */

const SAVE_KEY = "poenina.best";

const Game = {
  state: "title",            // title | loading | brief | play | pause | dead | win | done
  msg: null, msgT: 0,
  best: 1, seedBump: 0,
  deadT: 0, winT: 0,
  pending: 0,

  flash(m, d) { this.msg = m; this.msgT = d || 2; },
  shake(v) { cam.shake = Math.max(cam.shake, v); },

  boot() {
    // (on récupère au passage la progression enregistrée sous l'ancien nom)
    try {
      const v = localStorage.getItem(SAVE_KEY) || localStorage.getItem("avanui.best") || "1";
      this.best = clamp(parseInt(v), 1, CFG.MAXLEVEL);
    } catch (e) { }
    resize();
    initCaustics();
    buildLevel(1, 0);
    bakeTerrain();
    resetBoat();
    cam.x = B.x; cam.y = B.y;
    initCurrentParticles();
    const b = document.getElementById("boot"); if (b) b.remove();
  },

  /* charge un niveau : on affiche un voile le temps de peindre le lagon */
  goLevel(n) {
    this.state = "loading"; this.pending = n;
  },
  doLoad() {
    const n = this.pending;
    buildLevel(n, this.seedBump);
    bakeTerrain();
    resetBoat();
    parts.length = 0;
    cam.x = B.x; cam.y = B.y; cam.shake = 0;
    initCurrentParticles();
    this.msg = null; this.msgT = 0;
    this.state = "brief";
  },
  play() {
    this.state = "play";
    Snd.init();
    Snd.intensity = L.n >= 3 ? 2 : 1;
    Snd.transpose = ((L.n - 1) % 3) * 2;
    Snd.startMusic(); Snd.setSurf(1);
  },
  /* choc encaissé : on perd une chance mais on flotte encore */
  impact(cause, left) {
    Snd.sHit(); this.shake(5.5);
    for (let i = 0; i < 12; i++) spawnSpray(B.x, B.y, 2.4);
    for (let i = 0; i < 3; i++) spawnDebris(B.x, B.y);
    spawnRipple(B.x, B.y, 1.5);
    const what = cause === "patate" ? "PATATE" : cause === "barriere" ? "BARRIÈRE" : "ÉCHOUAGE";
    this.flash(what + " ! COQUE ENDOMMAGÉE — " + left +
      (left > 1 ? " CHANCES RESTANTES" : " DERNIÈRE CHANCE"), 3);
    setTimeout(() => Snd.sBeep(false), 260);
  },

  die(reason) {
    if (!B.alive) return;
    B.alive = false; B.dead = reason; this.deadT = 0;
    Snd.setEngine(0, 0); Snd.setSurf(0.4);
    if (reason === "sable") {
      Snd.sGround(); this.shake(5);
      for (let i = 0; i < 10; i++) spawnSpray(B.x, B.y, 2);
      Snd.sStingLose(0.6);
    } else if (reason === "nuit") {
      Snd.sStingLose(0.3);
    } else {
      Snd.sSink(); this.shake(9);
      for (let i = 0; i < 22; i++) spawnSpray(B.x, B.y, 3.2);
      for (let i = 0; i < 9; i++) spawnDebris(B.x, B.y);
      Snd.sStingLose(3.0);            // le stinger attend la fin du naufrage
    }
    this.state = "dead";
  },
  win() {
    if (this.state === "win") return;
    this.state = "win"; this.winT = 0;
    Snd.setEngine(0, 0);
    Snd.sAnchorSet(); Snd.sStingWin(1.35);
    for (let i = 0; i < 5; i++) spawnRipple(B.x, B.y, 1 + i * 2);
    if (L.n >= this.best) {
      this.best = Math.min(CFG.MAXLEVEL, L.n + 1);
      try { localStorage.setItem(SAVE_KEY, String(this.best)); } catch (e) { }
    }
  },
  retry() { this.seedBump++; this.goLevel(L.n); },
  next() {
    if (L.n >= CFG.MAXLEVEL) { this.state = "done"; Snd.stopMusic(); return; }
    this.seedBump = 0; this.goLevel(L.n + 1);
  },
  confirm() {                       // touche ESPACE selon l'état
    switch (this.state) {
      case "title": Snd.init(); this.goLevel(this.best); break;
      case "brief": this.play(); break;
      case "play":
        B.sail = !B.sail;
        Snd.sSail(!B.sail);
        this.flash(B.sail ? "ON HISSE LA GRAND-VOILE…" : "ON AFFALE…", 3.5);
        break;
      case "pause": this.togglePause(); break;
      case "dead": this.retry(); break;
      case "win": this.next(); break;
      case "done": this.seedBump = 0; this.goLevel(1); break;
    }
  },

  togglePause() {
    if (this.state !== "play" && this.state !== "pause") return;
    this.state = this.state === "play" ? "pause" : "play";
    if (this.state === "pause") { Snd.stopMusic(); Snd.setEngine(0, 0); }
    else Snd.startMusic();
  },
  newGame() {
    this.seedBump = 0;
    this.goLevel(1);
  },
  toggleEngine() {
    if (this.state !== "play" || !B.alive) return;
    if (B.engineDead > 0) { this.flash("LE MOTEUR EST EN PANNE", 1.6); Snd.sBeep(false); return; }
    B.engineOn = !B.engineOn;
    if (B.engineOn) {
      B.starting = 0.95; B.engineOk = 0;
      Snd.sStart(); this.flash("DÉMARRAGE DU MOTEUR…", 1.6);
    } else {
      Snd.sStop(); Snd.setEngine(0, 0); this.flash("MOTEUR COUPÉ", 1.6);
    }
  }
};

/* ----------------------------- entrées --------------------------------- */
const Input = { up: 0, down: 0, left: 0, right: 0, anchor: 0 };
/* On lit le code PHYSIQUE de la touche : sur AZERTY, Z=KeyW, Q=KeyA, A=KeyQ. */
const CODEMAP = {
  KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down",
  KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
  KeyQ: "anchor", Enter: "anchor"
};
const KEYMAP = { z: "up", w: "up", s: "down", q: "left", d: "right", a: "anchor" };

/* Commande développeur secrète : taper ZQSDZQSD dans le menu Échap saute
   le niveau en cours. Le buffer ne retient que les 8 dernières touches.  */
let cheatSeq = "";

function onKey(e, down) {
  const act = CODEMAP[e.code] || KEYMAP[(e.key || "").toLowerCase()];
  if (act) { Input[act] = down ? 1 : 0; e.preventDefault(); }
  if (!down) return;
  const k = (e.key || "").toLowerCase();
  if (e.code === "Space" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); Game.confirm(); }
  if (k === "r" && (Game.state === "play" || Game.state === "dead" || Game.state === "pause")) Game.retry();
  if (k === "p" || e.code === "Escape" || e.key === "Escape") { e.preventDefault(); Game.togglePause(); }
  if (k === "n" && Game.state === "pause") Game.newGame();
  if (e.code === "KeyE" || k === "e") Game.toggleEngine();
  if (k === "m") Game.flash(Snd.toggleMute() ? "SON COUPÉ" : "SON ACTIVÉ", 1.2);
  /* --- cheat : ZQSDZQSD en pause => niveau suivant --- */
  if (Game.state === "pause" && "zqsd".includes(k)) {
    cheatSeq = (cheatSeq + k).slice(-8);
    if (cheatSeq === "zqsdzqsd") {
      cheatSeq = "";
      if (L.n >= CFG.MAXLEVEL) { Game.flash("DÉJÀ AU DERNIER NIVEAU", 2); return; }
      Game.flash("NIVEAU PASSÉ (DEV)", 2);
      Game.next();
    }
  } else if (Game.state !== "pause") {
    cheatSeq = "";
  }
}
window.addEventListener("keydown", e => onKey(e, true));
window.addEventListener("keyup", e => onKey(e, false));
window.addEventListener("blur", () => { for (const k in Input) Input[k] = 0; });
cv.addEventListener("pointerdown", () => {
  Snd.init();
  if (Game.state === "title" || Game.state === "brief") Game.confirm();
});

/* ------------------------------ boucle --------------------------------- */
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  Snd.__t += dt;
  Game.msgT -= dt;
  const st = Game.state;

  /* ---------------------------- mise à jour --------------------------- */
  if (st === "play") {
    updateBoat(dt, Snd.__t);
    updateFauna(dt, Snd.__t);
    updateParts(dt);
    updateCurrentParticles(dt, Snd.__t);
    const sp = Math.hypot(B.vx, B.vy);
    cam.x += (B.x - cam.x) * Math.min(1, dt * 4);
    cam.y += (B.y - cam.y) * Math.min(1, dt * 4);
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt * 14);
      SHX = (Math.random() - 0.5) * cam.shake * 2;
      SHY = (Math.random() - 0.5) * cam.shake * 2;
    } else SHX = SHY = 0;
    /* moteur : son + indicateur de charge pour la chauffe */
    if (B.engineOn && B.engineDead === 0 && B.starting <= 0) {
      const load = Math.abs(B.thr);
      Snd.setEngine(0.35 + 0.65 * load, load);
    } else Snd.setEngine(0, 0);
    /* le soleil descend : la traversée s'use, le jour décline */
    L.time += dt;
    const dayFrac = L.time / L.dayLength;
    L.sun = L.night ? clamp(NIGHT_SUN + dayFrac * 0.07, 0, 1)
      : clamp(dayFrac, 0, 1);
    SUN = sunParams(L.sun);
    if (!L.nightFlashed && L.sun > 0.84 && L.n) {
      L.nightFlashed = true;
      Game.flash("LA NUIT EST TOMBÉE — ON NAVIGUE À LA CARTE", 4);
    }
    if (!L.night && L.sun >= 1) { Game.die("nuit"); return; }
  }

  /* ---------------------------- rendu -------------------------------- */
  if (st !== "loading") drawWorld(Snd.__t);

  /* ---------------------------- surcouches -------------------------- */
  if (st === "loading") {
    requestAnimationFrame(() => { Game.doLoad(); last = performance.now(); requestAnimationFrame(frame); });
  } else if (st === "title") overlayTitle(Snd.__t);
  else if (st === "brief") overlayBrief(Snd.__t);
  else if (st === "pause") overlayPause(Snd.__t);
  else if (st === "dead") {
    Game.deadT += dt;
    if (L.night) overlayNight(Snd.__t);
    else overlayDead(Snd.__t);
  } else if (st === "win") {
    Game.winT += dt;
    if (L.n >= CFG.MAXLEVEL) overlayEnd(Snd.__t);
    else overlayWin(Snd.__t);
  } else if (st === "done") overlayEnd(Snd.__t);

  if (Game.msgT > 0 && (st === "play" || st === "brief")) drawMessage();

  if (st === "dead" && Game.deadT > wait) overlayEnd(Snd.__t);
  if (st === "win" && Game.winT > 1.35) overlayEnd(Snd.__t);

  requestAnimationFrame(frame);
}

Game.boot();
requestAnimationFrame(frame);
