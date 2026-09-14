"use strict";
/* ==========================================================================
   POE NINA — le catamaran : moteur, voile, dérive, échouement, mouillage
   La vitesse stockée est celle DANS L'EAU ; le courant déplace la masse
   d'eau, donc cap ≠ route fond. C'est toute la difficulté.
   ========================================================================== */

const HULL_MAX = 3;                    // trois chances avant de couler

const B = {
  x: 0, y: 0, h: Math.PI / 2,
  vx: 0, vy: 0, cx: 0, cy: 0, lx: 0, ly: 0,
  yaw: 0, thr: 0, steer: 0,
  sail: false, sailUp: 0, boom: 0.5, luff: 0, twa: 90, side: 1,
  engineOn: true, engineDead: 0, sputter: 0, engineOk: 0, starting: 0,
  oil: 1, temp: 0, hot: 0, tempWarn: 0,
  heel: 0, bob: 0,
  anchoring: 0, anchored: false, inAnch: false,
  alive: true, dead: null, sinking: 0, stuck: 0,
  hull: HULL_MAX, invuln: 0, hitFlash: 0, leak: 0,
  clearance: 9, scrapeCd: 0, warnCd: 0
};

/* polaire de la grand-voile : angle au vent réel (deg) -> rendement.
   Zone d'interdiction (vent debout) sur 55° de chaque côté. */
const POLAR = [[0, 0], [45, 0], [55, 0.12], [65, 0.40], [78, 0.72], [95, 0.93],
[110, 1.0], [130, 0.95], [150, 0.80], [170, 0.62], [180, 0.54]];
function polar(a) {
  a = Math.abs(a);
  for (let i = 0; i < POLAR.length - 1; i++)
    if (a <= POLAR[i + 1][0])
      return lerp(POLAR[i][1], POLAR[i + 1][1], (a - POLAR[i][0]) / (POLAR[i + 1][0] - POLAR[i][0]));
  return 0.54;
}

/* points de sondage sous les deux coques */
const PROBES = [[5.3, 2.85], [1.8, 2.85], [-1.8, 2.85], [-5.1, 2.85],
[5.3, -2.85], [1.8, -2.85], [-1.8, -2.85], [-5.1, -2.85]];

function resetBoat() {
  B.x = L.start.x; B.y = L.start.y; B.h = Math.PI / 2;
  B.vx = B.vy = B.cx = B.cy = B.lx = B.ly = B.yaw = 0; B.thr = 0; B.steer = 0;
  B.sail = false; B.sailUp = 0; B.boom = 0.5; B.luff = 0;
  B.engineOn = true; B.engineDead = 0; B.sputter = 0; B.engineOk = 0; B.starting = 0;
  B.oil = 1; B.temp = 0; B.hot = 0; B.tempWarn = 0;
  B.heel = 0; B.bob = 0; B.anchoring = 0; B.anchored = false; B.inAnch = false;
  B.alive = true; B.dead = null; B.sinking = 0; B.stuck = 0;
  B.hull = HULL_MAX; B.invuln = 0; B.hitFlash = 0; B.leak = 0;
  B.clearance = 9; B.scrapeCd = 0; B.warnCd = 0;
  L.trail.length = 0;
}

/* plus petite profondeur sous les huit points de sondage des coques */
function hullProbe(x, y, h) {
  const ch = Math.cos(h), sh = Math.sin(h);
  let minD = 99, kind = K_WATER;
  for (let i = 0; i < PROBES.length; i++) {
    const px = PROBES[i][0], py = PROBES[i][1];
    const r = probe(x + px * ch - py * sh, y + px * sh + py * ch);
    if (r.d < minD) { minD = r.d; kind = r.k; }
  }
  return { d: minD, k: kind };
}

/* Après un choc : on dégage vers le plus profond, en biaisant toujours vers
   le chenal — sinon un rebond sur la barrière enverrait le bateau au large. */
function bounceOut() {
  let gx = 0, gy = 0;
  const toSpine = Math.sign(L.spineX(B.y) - B.x) || 1;
  for (let i = 0; i < 10; i++) {
    const e = 3.5;
    gx = probe(B.x + e, B.y).d - probe(B.x - e, B.y).d;
    gy = probe(B.x, B.y + e).d - probe(B.x, B.y - e).d;
    let m = Math.hypot(gx, gy);
    if (m < 1e-5) { gx = toSpine; gy = 0; m = 1; }
    gx = gx / m * 0.62 + toSpine * 0.7;
    gy = gy / m * 0.62;
    m = Math.hypot(gx, gy) || 1; gx /= m; gy /= m;
    B.x += gx * 1.7; B.y += gy * 1.7;
    if (hullProbe(B.x, B.y, B.h).d > CFG.DRAFT + 0.5) break;
  }
  const sp = Math.hypot(B.vx, B.vy);
  const back = Math.min(1.5, sp * 0.45 + 0.4);
  B.vx = gx * back; B.vy = gy * back;
  B.yaw *= 0.2; B.thr = 0;
  return [gx, gy];
}

function updateBoat(dt, t) {
  /* h = pas de temps de la dynamique. dt reste le temps réel : pannes,
     soleil et durée de mouillage doivent rester honnêtes.                */
  const h = dt * CFG.VIS;

  if (!B.alive) {
    if (B.dead === "sable") {
      B.stuck = Math.min(1, B.stuck + dt * 0.8); B.vx *= 0.82; B.vy *= 0.82;
    } else {
      B.sinking = Math.min(1, B.sinking + dt * 0.32);
      // le bateau coule : ondes à la surface, seulement ici
      B.leak += dt;
      if (B.leak > 0.35) { B.leak = 0; spawnRipple(B.x - Math.cos(B.h) * 3, B.y - Math.sin(B.h) * 3, 0.3); }
    }
    return;
  }
  if (B.anchored) { B.vx *= 0.9; B.vy *= 0.9; B.bob = 0.1 * Math.sin(t * 1.9); return; }

  /* ----------------------------- le moteur ----------------------------- */
  if (B.engineDead > 0) {
    B.engineDead -= dt;
    if (B.engineDead <= 0) {
      B.engineDead = 0; B.engineOk = 0;
      Snd.sBeep(true); Game.flash("MOTEUR RELANCÉ", 2);
    }
  }
  if (B.starting > 0) B.starting -= dt;       // temps de démarrage du diesel
  const running = B.engineOn && B.engineDead === 0 && B.starting <= 0;
  const load = running ? Math.abs(B.thr) : 0;

  /* -------------------- huile, température, surchauffe ------------------
     hot vaut 0 sous 35 % de jauge puis monte au carré : c'est lui qui
     pilote à la fois le risque de panne et l'usure de l'huile.         */
  B.hot = Math.pow(clamp((B.temp - 0.35) / 0.65, 0, 1), 2);
  if (running) {
    /* Le carter ne tient qu'un tiers de jour à plein régime. Très dépendant
       du régime : ménager le gaz garde de l'huile, et couper le moteur
       n'en consomme plus du tout.                                      */
    const wear = (0.15 + 0.85 * load) * (1 + 0.8 * B.hot);
    const was = B.oil;
    B.oil = Math.max(0, B.oil - dt * wear / (L.dayLength * 0.31));
    if (was > 0.25 && B.oil <= 0.25) {
      Game.flash("PRESSION D'HUILE BASSE — LE MOTEUR VA CHAUFFER", 4); Snd.sBeep(false);
    }
  }
  /* Température d'équilibre : la charge chauffe, l'huile basse aggrave.
     Elle monte vite (τ ≈ 17 s) et redescend lentement (τ ≈ 62 s au
     ralenti). Couper le moteur reste de loin le plus efficace, mais ça
     prend quand même une dizaine de secondes.                          */
  const tTarget = running ? (0.15 + 0.63 * load) * (1 + (1 - B.oil) * 0.45) : 0;
  const tRate = !running ? 0.080 : (tTarget > B.temp ? 0.060 : 0.016);
  B.temp = clamp(B.temp + (tTarget - B.temp) * Math.min(1, tRate * dt), 0, 1);
  B.tempWarn -= dt;
  if (B.temp > 0.88 && B.tempWarn <= 0) {
    B.tempWarn = 7; Game.flash("SURCHAUFFE — LÈVE LE PIED OU COUPE LE MOTEUR", 3.5); Snd.sBeep(false);
  }

  if (running) {
    /* Une panne peut tomber à n'importe quel moment, même moteur froid :
       le taux de base du niveau s'applique toujours. La température le
       multiplie jusqu'à douze fois dans le rouge. Pas de période de
       grâce — mais le moteur démarre froid, ce qui protège de fait les
       premières secondes.                                             */
    const rate = L.failRate * (1 + 16 * B.hot);
    if (B.sputter <= 0 && Math.random() < rate * dt) {
      B.sputter = 2.0; Snd.sSputter();
    }
    B.engineOk += dt;
    if (B.sputter > 0) {
      B.sputter -= dt;
      if (Math.random() < dt * 7) Snd.sSputter();
      if (B.sputter <= 0) {
        B.engineDead = 18 + Math.random() * 16;
        Game.flash((B.hot > 0.3 ? "SURCHAUFFE — MOTEUR SERRÉ" : "PANNE MOTEUR")
          + " — ESPACE POUR ENVOYER LA VOILE", 4);
        Snd.sBeep(false);
      }
    }
  }
  const thrust = running ? B.thr * (B.sputter > 0 ? (Math.random() < 0.4 ? 0.25 : 0.9) : 1) * 0.92 : 0;

  /* ----------------------------- voile --------------------------------- */
  // hissage / affalage linéaire : 3,5 s de winch, on ne triche pas
  const sTgt = B.sail ? 1 : 0;
  if (B.sailUp !== sTgt) {
    const step = dt / 3.5;
    B.sailUp = sTgt > B.sailUp ? Math.min(sTgt, B.sailUp + step) : Math.max(sTgt, B.sailUp - step);
  }
  const fwx = Math.cos(B.h), fwy = Math.sin(B.h);
  const wx = Math.cos(L.windFrom), wy = Math.sin(L.windFrom);   // vers la provenance
  B.twa = Math.acos(clamp(fwx * wx + fwy * wy, -1, 1)) * R2D;   // 0 = vent debout
  B.side = Math.sign(fwx * wy - fwy * wx) || 1;
  let sailF = 0;
  if (B.sailUp > 0.15) {
    const p = polar(B.twa);
    sailF = p * B.sailUp * (L.windPow / 12) * 0.78;
    B.luff = p < 0.08 ? 1 : Math.max(0, B.luff - dt * 3);
    // la bôme passe SOUS le vent : vent de tribord => bôme à bâbord.
    // ~20° au près, ~40° au travers, ~70° vent arrière.
    B.boom += (clamp(B.twa * 0.0068, 0.1, 1.2) * B.side - B.boom) * Math.min(1, dt * 3);
    if (B.luff > 0.5 && Math.random() < dt * 9) Snd.sLuff(1);
  } else B.luff = 0;

  /* Face au vent (twa < 55°) la voile ne pousse plus — mais si elle est
     hissée, le bateau est en train de virer : il garde son erre pour
     franchir le cone et gonfler l'autre bord. Seul le cas « moteur coupé
     ET voile affalée » est une vraie ancre flottante (noProp).       */
  const sailHoisted = B.sailUp > 0.15;
  const sailEff = (sailHoisted && B.twa >= 55) ? sailF : 0;
  const hasProp = thrust > 0.01 || sailEff > 0.01;
  const intoWind = sailHoisted && B.twa < 55;       // virement : voile hissée face au vent
  const noProp = !hasProp && !intoWind;             // moteur coupé ET voile affalée = ancre flottante


  /* ------------------- courant + dérive due au vent --------------------
     Le courant s'impose toujours à la position : la masse d'eau emporte
     le bateau, point. La dérive due au vent (le catamaran, voile même
     toile affalée : franc-bord, rouf, mât) est elle aussi une vitesse
     imposée — mais elle s'atténue dès que le bateau a de l'erre : les
     coques en mouvement tiennent leur cap. À l'arrêt elles ne retiennent
     rien, la dérive est pleine ; au-dessus d'un demi-nœud d'erre elle
     s'annule (racine carrée). Le courant, lui, pousse toujours.

     driftDir = direction de la dérive combinée vent+courant, celle qui
     sert à orienter le bateau travers à la dérive sans propulsion.   */
  const c = currentAt(B.x, B.y, t);
  B.cx = c[0]; B.cy = c[1];
  const lee = 0.40 * (L.windPow / 12) * (1 + B.sailUp * 0.5);
  B.lx = -wx * lee; B.ly = -wy * lee;

  /* ---------------------------- forces --------------------------------- */
  let ax = fwx * (thrust + sailEff), ay = fwy * (thrust + sailEff);
  const vf = B.vx * fwx + B.vy * fwy, vl = -B.vx * fwy + B.vy * fwx;
   const df = -0.068 * vf * Math.abs(vf) - 0.10 * vf;
  const dl = -0.62 * vl * Math.abs(vl) - 0.95 * vl;
  ax += fwx * df - fwy * dl; ay += fwy * df + fwx * dl;

   /* Sans propulsion (ancre flottante : moteur coupé ET voile affalée) :
     l'erre décroît à 30 %/s. Pendant un virement (intoWind) on ne
     l'applique pas : la traînée hydrodynamique normale ralentit le
     bateau face au vent tout en gardant assez d'erre pour franchir
     le cone et gonfler l'autre bord.                          */
  const erreSpeed = Math.hypot(B.vx, B.vy);
  if (noProp && erreSpeed > 0.05) {
    const damp = Math.pow(0.7, dt);           // 30 %/s
    const k = (damp - 1) / h;
    ax += B.vx * k; ay += B.vy * k;
  }
  B.vx += ax * h; B.vy += ay * h;

  /* --------------------- barre : il faut de l'erre --------------------- */
  /* À l'écran l'axe y est inversé : un cap qui croît tourne vers la gauche.
     D'où le signe, pour que D = tribord et Q = bâbord.                   */
  const rudder = clamp(Math.abs(vf) / 0.5, 0, 1) * (running && B.thr > 0.05 ? 1.2 : 1);
  const want = -B.steer * 0.72 * rudder * (vf < -0.2 ? -1 : 1);
  B.yaw += (want - B.yaw) * Math.min(1, h * 3.4);

 /* Sans propulsion et presque à l'arrêt : le bateau présente son flanc à
     la dérive (ancre flottante). Il loffe travers à la dérive combinée
     vent+courant à vitesse fixe (~1 rad/s → 180° en ~3 s).         */
 if (noProp && Math.hypot(B.vx, B.vy) < 0.3) {
    const driftDir = Math.atan2(B.ly + B.cy, B.lx + B.cx);
    let target = driftDir + Math.PI / 2;     // travers = perpendiculaire à la dérive
    if (Math.abs(angDiff(target, B.h)) > Math.PI / 2) target += Math.PI;  // côté le plus court
    const diff = angDiff(target, B.h);
    const rate = 0.5; // rad/s : ~28°/s, ~6 s pour 180°
    B.h = (B.h + clamp(diff, -rate * dt, rate * dt)) % TAU;
    B.yaw = 0;                              // la loffe remplace la barre
  } else {
    B.h = (B.h + B.yaw * h) % TAU;
  }
  /* Application de la position : courant toujours plein, dérive vent
     atténuée par √(1 − erre/vfMax), vfMax = 0,25 m/s (≈ 0,5 kt).     */
  const att = Math.sqrt(1 - clamp(Math.hypot(B.vx, B.vy) / 0.25, 0, 1));
  B.x += (B.vx + B.cx + B.lx * att) * h;
  B.y += (B.vy + B.cy + B.ly * att) * h;

  const speed = Math.hypot(B.vx, B.vy);
  B.bob = 0.1 * Math.sin(t * 1.9 + B.y * 0.05);
  B.heel += ((B.side * sailEff * 0.5) + clamp(B.yaw * vf * 0.35, -0.5, 0.5) - B.heel) * Math.min(1, dt * 2.6);

  /* --------------------------- sillage --------------------------------- */
  if (speed > 0.25) {
    const last = L.trail[L.trail.length - 1];
    if (!last || Math.hypot(last.x - B.x, last.y - B.y) > 1.5)
      L.trail.push({ x: B.x, y: B.y, h: B.h, a: 1 });
    if (L.trail.length > 90) L.trail.shift();
  }
  for (let i = L.trail.length - 1; i >= 0; i--) {
    L.trail[i].a -= dt * 0.26; if (L.trail[i].a <= 0) L.trail.splice(i, 1);
  }

  /* -------------------------- collisions ------------------------------- */
  const hp = hullProbe(B.x, B.y, B.h);
  B.clearance = hp.d - CFG.DRAFT;
  B.invuln = Math.max(0, B.invuln - dt);
  B.hitFlash = Math.max(0, B.hitFlash - dt * 1.8);
  if ((hp.d < CFG.DRAFT || hp.k === K_OCEAN) && B.invuln <= 0) {
    const cause = hp.k === K_CORAL ? "patate"
      : (hp.k === K_REEF || hp.k === K_OCEAN) ? "barriere" : "sable";
    B.hull--;
    if (B.hull <= 0) { Game.die(cause); return; }
    B.invuln = 1.9; B.hitFlash = 1;
    Game.impact(cause, B.hull);
    bounceOut();
    return;
  }

  B.scrapeCd -= dt;
  if (B.clearance < CFG.SCRAPE && speed > 0.5 && B.scrapeCd <= 0) {
    B.scrapeCd = 0.55; Snd.sScrape(); Game.shake(2.2);
    Game.flash(hp.k === K_CORAL ? "!! ÇA FROTTE SUR LE CORAIL !!" : "!! ÇA TALONNE !!", 1.1);
    for (let i = 0; i < 7; i++) spawnSpray(B.x, B.y, 1.4);
  }

  /* --------------------------- mouillage -------------------------------- */
  B.inAnch = Math.hypot(B.x - L.anch.x, B.y - L.anch.y) < L.anch.r;
  B.warnCd -= dt;
  if (B.inAnch && Input.anchor) {
    if (speed > 0.9) {
      B.anchoring = 0;
      if (B.warnCd <= 0) { B.warnCd = 1.4; Game.flash("TROP RAPIDE POUR MOUILLER — RALENTIS", 1.4); Snd.sBeep(false); }
    } else if (B.sailUp > 0.15 && B.twa < 55) {
      B.anchoring = 0;
      if (B.warnCd <= 0) { B.warnCd = 1.4; Game.flash("FACE AU VENT — ABATS DANS LE CONE POUR MOUILLER", 1.6); Snd.sBeep(false); }
    } else {
      B.anchoring += dt;
      if (Math.random() < dt * 12) Snd.sChain();
      if (B.anchoring > 1.6) { B.anchored = true; Game.win(); }
    }
  } else B.anchoring = Math.max(0, B.anchoring - dt * 1.6);
}
