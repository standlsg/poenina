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
  if (kind === "requin") Object.assign(f, { sp: 0.85 + rng() * 0.6, size: 1.05 + rng() * 0.45, dep: 1.6 + rng() * 2.6 });
  if (kind === "dauphin") Object.assign(f, { sp: 1.8 + rng() * 1.1, size: 1.05 + rng() * 0.25, dep: 1.2, jt: rng() * 9 });
  return f;
}

function updateFauna(dt, t) {
  dt *= CFG.VIS;                       // même dilatation du temps que le bateau
  for (const f of L.fauna) {
    f.ph += dt * (f.kind === "dauphin" ? 2.5 : f.kind === "banc" ? 4.5 : 2);
    f.wander += (Math.random() - 0.5) * dt * 1.5;
    const sx = L.shoreX(f.y), rx = L.reefX(f.y);
    let steer = Math.sin(f.wander) * 0.5;
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
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.t += dt;
    if (p.t > p.life) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 0) { p.vx *= 0.92; p.vy *= 0.92; p.r += dt * 0.5; }
    else if (p.kind === 1) p.r += dt * 4.5;
    else { p.vx *= 0.95; p.vy *= 0.95; p.a += p.va * dt; }
  }
}
