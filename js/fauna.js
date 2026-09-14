"use strict";
/* ==========================================================================
   POE NINA — la faune du lagon et les particules (pure décoration)
   ========================================================================== */

function makeFauna(kind, x, y, rng) {
  const f = { kind, x, y, h: rng() * TAU, ph: rng() * TAU, jump: 0, wander: rng() * TAU };
  if (kind === "raie") Object.assign(f, {
    sp: 0.5 + rng() * 0.4, size: 1.05 + rng() * 0.5, dep: 1.4 + rng() * 3.2,
    // taches dorsales : chaque raie a son propre semis
    spots: Array.from({ length: 9 }, () => ({ u: 0.2 + rng() * 0.7, v: (rng() - 0.5) * 1.6, r: 0.09 + rng() * 0.08 }))
  });
  if (kind === "tortue") Object.assign(f, { sp: 0.32 + rng() * 0.28, size: 1.0 + rng() * 0.45, dep: 0.7 + rng() * 2.4 });
  if (kind === "banc") Object.assign(f, {
    sp: 0.7 + rng() * 0.6, size: 0.85 + rng() * 0.4, dep: 0.9 + rng() * 2.6,
    fish: Array.from({ length: 14 + (rng() * 14 | 0) }, () => ({
      a: rng() * TAU, d: rng() * 3.2, ph: rng() * TAU,
      sc: 0.8 + rng() * 0.5, tone: (rng() * 3) | 0
    }))
  });
  /* Le requin est plus petit que le dauphin (0,84-1,10 contre 1,05-1,30) et
     w8 est la phase de sa trajectoire en huit.                            */
  if (kind === "requin") Object.assign(f, { sp: 0.85 + rng() * 0.6, size: 0.84 + rng() * 0.26, dep: 1.6 + rng() * 2.6, w8: rng() * TAU });
  if (kind === "dauphin") Object.assign(f, { sp: 1.8 + rng() * 1.1, size: 1.05 + rng() * 0.25, dep: 1.2, jt: rng() * 9 });
  return f;
}

function updateFauna(dt, t) {
  dt *= CFG.VIS;                       // même dilatation du temps que le bateau
  for (const f of L.fauna) {
    /* Le dauphin battait à 5 rad/s : une queue de colibri. À 2,4 le cycle
       complet dure ~2,2 s, on suit la nageoire à l'œil.                  */
    f.ph += dt * (f.kind === "dauphin" ? 2.4 : f.kind === "banc" ? 4.5 : 2);
    const sx = L.shoreX(f.y), rx = L.reefX(f.y);
    let steer;
    if (f.kind === "requin") {
      /* Le requin ne tourne plus en rond : sa barre suit une sinusoïde
         déterministe au lieu d'une marche aléatoire, ce qui trace un huit.
         L'amplitude de cap vaut k/ω ; à k = π·ω elle fait pile un demi-tour
         complet par demi-période, donc une boucle, puis l'autre dans
         l'autre sens. Mesuré : un huit de 22 × 19 m parcouru en 63 s, dans
         une vue qui fait 57 × 85 m — il tient à l'écran.                 */
      f.w8 += dt * 0.10;
      steer = Math.sin(f.w8) * 0.314;
    } else {
      f.wander += (Math.random() - 0.5) * dt * 1.5;
      steer = Math.sin(f.wander) * 0.5;
    }
    if (f.x < sx + 17) steer += angDiff(0, f.h) * 0.9;
    if (f.x > rx - 15) steer += angDiff(Math.PI, f.h) * 0.9;
    if (f.y < 6) steer += angDiff(Math.PI / 2, f.h) * 0.9;
    if (f.y > L.len - 6) steer += angDiff(-Math.PI / 2, f.h) * 0.9;
    f.h += clamp(steer, -1.2, 1.2) * dt;
    let sp = f.sp;
    if (f.kind === "dauphin") {
      f.jt -= dt;
      if (f.jt <= 0 && f.jump <= 0) { f.jump = 1; f.jt = 8 + Math.random() * 13; }
      if (f.jump > 0) { f.jump -= dt * 1.05; sp *= 1.9; }
    }
    // sillage en surface derrière la raie et le requin (peu profonds)
    if ((f.kind === "raie" || f.kind === "requin") && f.dep < 2.5 && Math.random() < dt * 3) {
      spawnRipple(f.x - Math.cos(f.h) * 2.5, f.y - Math.sin(f.h) * 2.5, 0.25);
    }
    f.x += Math.cos(f.h) * sp * dt; f.y += Math.sin(f.h) * sp * dt;
  }
}

/* ----------------------------- particules ------------------------------ */
const parts = [];
const PARTS_MAX = 400;                 // garde-fou : jamais d'accumulation
function spawnSpray(x, y, v) {
  if (parts.length > PARTS_MAX) return;
  parts.push({
    x, y, vx: (Math.random() - 0.5) * v * 2, vy: (Math.random() - 0.5) * v * 2,
    life: 0.45 + Math.random() * 0.4, t: 0, r: 0.35 + Math.random() * 0.6, kind: 0
  });
}
function spawnRipple(x, y, r) {
  if (parts.length > PARTS_MAX) return;
  parts.push({ x, y, vx: 0, vy: 0, life: 1.1 + Math.random() * 0.6, t: 0, r: r || 0.4, kind: 1 });
}
function spawnDebris(x, y) {
  if (parts.length > PARTS_MAX) return;
  const a = Math.random() * TAU, s = 1.5 + Math.random() * 3;
  parts.push({
    x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.6 + Math.random(),
    t: 0, r: 0.3 + Math.random() * 0.5, kind: 2, a: Math.random() * TAU, va: (Math.random() - 0.5) * 6
  });
}
/* fumée noire d'échappement : le moteur en panne tousse et fume.
   La particule naît au capot, dérive vers l'arrière (vers où va le vent
   relatif), gonfle et s'estompe.                                        */
function spawnSmoke(x, y, vx, vy) {
  if (parts.length > PARTS_MAX) return;
  parts.push({
    x, y, vx, vy, life: 0.9 + Math.random() * 0.5,
    t: 0, r: 0.28 + Math.random() * 0.18, kind: 3
  });
}
/* fumée grise du moteur qui tousse : plus claire et plus courte que la
   fumée noire de panne franche. Annonce la panne.                      */
function spawnHaze(x, y, vx, vy) {
  if (parts.length > PARTS_MAX) return;
  parts.push({
    x, y, vx, vy, life: 0.6 + Math.random() * 0.35,
    t: 0, r: 0.22 + Math.random() * 0.14, kind: 5
  });
}
/* étincelle de surchauffe : point chaud orange-jaune qui jaillit du capot
   et s'éteint vite.                                                    */
function spawnSpark(x, y, vx, vy) {
  if (parts.length > PARTS_MAX) return;
  parts.push({
    x, y, vx, vy, life: 0.28 + Math.random() * 0.18,
    t: 0, r: 0.12 + Math.random() * 0.08, kind: 4
  });
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.t += dt;
    if (p.t > p.life) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 0) { p.vx *= 0.92; p.vy *= 0.92; p.r += dt * 0.5; }
    else if (p.kind === 1) p.r += dt * 4.5;
    else if (p.kind === 3) { p.vx *= 0.94; p.vy *= 0.94; p.r += dt * 0.9; }
    else if (p.kind === 4) { p.vx *= 0.90; p.vy *= 0.90; }
    else if (p.kind === 5) { p.vx *= 0.93; p.vy *= 0.93; p.r += dt * 0.6; }
    else { p.vx *= 0.95; p.vy *= 0.95; p.a += p.va * dt; }
  }
}

/* ====================== pêcheurs : barques locales ====================== */
function updateFishers(dt, t) {
  if (!L.fishers) return;
  dt *= CFG.VIS;
  const nt = nightAmount();
  for (const f of L.fishers) {
    if (f.sunken > 0) {
      // la barque coule : le pêcheur dérive sur sa bouée orange.
      f.sunken = Math.min(1, f.sunken + dt * 0.5);
      if (f.sunken >= 1 && !f.drifted) f.drifted = true;
      // dérive = courant + dérive vent, comme le catamaran sans erre
      const c = currentAt(f.x, f.y, t);
      const wx = Math.cos(L.windFrom), wy = Math.sin(L.windFrom);
      const lee = 0.40 * (L.windPow / 12);
      f.x += (c[0] - wx * lee) * dt;
      f.y += (c[1] - wy * lee) * dt;
      continue;
    }
    // la nuit tombe : les pêcheurs rentrent au rivage et s'échouent
    if (nt > 0.45 && !f.beached) {
      const sx = L.shoreX(f.y);
      const tx = sx + 6;                       // juste au ras du rivage
      const dx = tx - f.x;
      if (Math.abs(dx) < 1.2) { f.beached = true; f.x = tx; }
      else { f.h = dx > 0 ? 0 : Math.PI; f.x += Math.sign(dx) * 1.4 * dt; f.y += 0; }
      continue;
    }
    const px0 = f.x, py0 = f.y;
    f.ph += dt * f.spd;
    if (f.mode === "circle") {
      f.x = f.bx + Math.cos(f.ph) * f.amp;
      f.y = f.by + Math.sin(f.ph) * f.amp;
    } else {
      const s = Math.sin(f.ph);
      f.x = f.bx + Math.cos(f.h0 || 0) * s * f.amp;
      f.y = f.by + Math.sin(f.h0 || 0) * s * f.amp;
    }
    const sx = L.shoreX(f.y), rx = L.reefX(f.y);
    f.x = clamp(f.x, sx + 10, rx - 10);
    // le cap suit toujours la direction reelle du deplacement : le bateau
    // avance vers l'avant et pivote franchement dans le virage.
    const vx = f.x - px0, vy = f.y - py0;
    if (Math.hypot(vx, vy) > 0.003) f.h = Math.atan2(vy, vx);
    // trace du sillage : on garde les dernieres positions pour dessiner une ligne
    f.trail = f.trail || [];
    if (Math.hypot(vx, vy) > 0.003) {
      f.trail.push({ x: f.x, y: f.y, h: f.h, t: t });
      if (f.trail.length > 16) f.trail.shift();
    }
  }
}
