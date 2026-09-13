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
      // on repart toujours du début : le record n'est qu'un souvenir
      case "title": Snd.init(); this.seedBump = 0; this.goLevel(1); break;
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
    CHEAT.buf = "";                       // on repart d'une séquence vierge
    if (this.state === "pause") { Snd.stopMusic(); Snd.setEngine(0, 0); }
    else { Snd.startMusic(); for (const k in Input) Input[k] = 0; }
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

/* ---- accès dev : dans la pause, taper ZQSDZQSD saute le niveau ----------
   On lit les touches physiques, donc la même gestuelle du bout des doigts
   marche en AZERTY (Z Q S D) comme en QWERTY (W A S D).                  */
const CHEAT = { seq: "WASDWASD", buf: "" };
function cheatKey(e) {
  if (Game.state !== "pause") { CHEAT.buf = ""; return; }
  const m = /^Key([A-Z])$/.exec(e.code || "");
  const c = m ? m[1] : (e.key || "").toUpperCase();
  if (!/^[A-Z]$/.test(c)) return;
  CHEAT.buf = (CHEAT.buf + c).slice(-CHEAT.seq.length);
  if (CHEAT.buf !== CHEAT.seq) return;
  CHEAT.buf = "";
  Snd.sBeep(true);
  if (L.n >= CFG.MAXLEVEL) { Game.state = "done"; Snd.stopMusic(); return; }
  Game.flash("ACCÈS DEV — NIVEAU " + (L.n + 1), 3);
  Game.seedBump = 0; Game.goLevel(L.n + 1);
}

function onKey(e, down) {
  const act = CODEMAP[e.code] || KEYMAP[(e.key || "").toLowerCase()];
  if (act) { Input[act] = down ? 1 : 0; e.preventDefault(); }
  if (!down) return;
  cheatKey(e);
  const k = (e.key || "").toLowerCase();
  if (e.code === "Space" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); Game.confirm(); }
  if (k === "r" && (Game.state === "play" || Game.state === "dead" || Game.state === "pause")) Game.retry();
  if (k === "p" || e.code === "Escape" || e.key === "Escape") { e.preventDefault(); Game.togglePause(); }
  if (k === "n" && Game.state === "pause") Game.newGame();
  if (e.code === "KeyE" || k === "e") Game.toggleEngine();
  if (k === "m") Game.flash(Snd.toggleMute() ? "SON COUPÉ" : "SON ACTIVÉ", 1.2);
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
    const tgt = Input.up ? 1 : Input.down ? -0.4 : 0;
    B.thr += (tgt - B.thr) * Math.min(1, dt * 2.2);
    const s = (Input.right ? 1 : 0) - (Input.left ? 1 : 0);
    B.steer += (s - B.steer) * Math.min(1, dt * 6);

    L.time += dt;
    /* La nuit n'est plus une fin de partie : c'est un durcissement. On perd
       les couleurs et la vue porte à peine plus loin que le bateau.      */
    L.sun = L.night
      ? NIGHT_SUN + (1 - NIGHT_SUN) * clamp(L.time / L.dayLength, 0, 1)
      : clamp(L.time / L.dayLength, 0, 1);
    SUN = sunParams(L.sun);
    if (!L.nightFlashed && L.sun > 0.97) {
      L.nightFlashed = true;
      Game.flash("LA NUIT EST TOMBÉE — ON NAVIGUE À LA CARTE", 4);
      Snd.sBeep(false);
    }

    updateBoat(dt, L.time);
    updateFauna(dt, L.time);
    updateCurrentParticles(dt, L.time);
    updateParts(dt);

    const running = B.engineOn && B.engineDead === 0 && B.starting <= 0;
    Snd.setEngine(running ? 0.55 + 0.45 * Math.abs(B.thr) : 0, running ? clamp(Math.abs(B.thr), 0, 1) : 0);
    Snd.setSurf(clamp(1.25 - (L.reefX(B.y) - B.x) / 55, 0.15, 1.25));
    Snd.intensity = (B.engineDead > 0) ? 0.5 : (L.n >= 3 ? 2 : 1);

    // vapeur au capot moteur quand ça cuit vraiment
    if (B.temp > 0.86 && Math.random() < dt * 7) {
      const c = Math.cos(B.h), s2 = Math.sin(B.h);
      spawnSpray(B.x - 4.2 * c, B.y - 4.2 * s2, 0.5);
    }
  }
  else if (st === "dead") {
    Game.deadT += dt;
    updateBoat(dt, L.time); updateParts(dt); updateFauna(dt, L.time);
    updateCurrentParticles(dt, L.time);
    // bulles et remous pendant que le bateau s'enfonce
    if (B.dead !== "sable" && B.dead !== "nuit") {
      if (B.sinking < 0.95 && Math.random() < dt * 22) spawnRipple(B.x + (Math.random() - 0.5) * 8, B.y + (Math.random() - 0.5) * 8, 0.25);
      if (B.sinking < 0.5 && Math.random() < dt * 6) spawnDebris(B.x, B.y);
    }
    Snd.setEngine(0, 0);
  }
  else if (st === "win") {
    Game.winT += dt;
    updateBoat(dt, L.time); updateParts(dt); updateFauna(dt, L.time);
    updateCurrentParticles(dt, L.time);
  }
  else if (st === "brief") updateFauna(dt, 0);

  /* ------------------------------ caméra ------------------------------ */
  if (st === "play" || st === "dead" || st === "win" || st === "pause" || st === "brief") {
    const lead = 16;
    const tx = B.x + Math.cos(B.h) * lead * 0.35 + (B.vx + B.cx + B.lx) * 2.4;
    const ty = B.y + Math.sin(B.h) * lead * 0.35 + (B.vy + B.cy + B.ly) * 2.4;
    const k = Math.min(1, dt * 2.6);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    cam.shake *= Math.pow(0.02, dt);
    SHX = (Math.random() - 0.5) * cam.shake * 2.4;
    SHY = (Math.random() - 0.5) * cam.shake * 2.4;
  }

  /* ------------------------------ rendu ------------------------------- */
  if (st === "title") { titleScreen(Snd.__t); requestAnimationFrame(frame); return; }
  if (st === "done") { doneScreen(Snd.__t); requestAnimationFrame(frame); return; }
  if (st === "loading") {
    loadingOverlay();
    requestAnimationFrame(() => { Game.doLoad(); last = performance.now(); requestAnimationFrame(frame); });
    return;
  }

  drawWorld(Snd.__t);
  drawHUD(Snd.__t);
  if (st === "brief") briefScreen(Snd.__t);
  if (st === "pause") pauseOverlay(Snd.__t);
  // on laisse l'animation de naufrage se dérouler avant le panneau
  const wait = (B.dead === "sable" || B.dead === "nuit") ? 1.3 : 3.4;
  if (st === "dead" && Game.deadT > wait) overlayEnd(Snd.__t);
  if (st === "win" && Game.winT > 1.35) overlayEnd(Snd.__t);

  requestAnimationFrame(frame);
}

Game.boot();
requestAnimationFrame(frame);
