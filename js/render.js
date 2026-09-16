"use strict";
/* ==========================================================================
   POE NINA — rendu vue de dessus
   ========================================================================== */

/* ------------------------- recopie du décor ---------------------------- */
function blit(img, offx, offy) {
  const T = CFG.TPM;
  const u0 = (wX(0) - L.bx0) * T, v0 = (L.by1 - wY(0)) * T;
  const iu = Math.floor(u0), iv = Math.floor(v0);
  let su = iu, sv = iv, sw = Math.ceil(W / 2) + 2, sh = Math.ceil(H / 2) + 2;
  let dx = -(u0 - iu) * 2 + (offx || 0), dy = -(v0 - iv) * 2 + (offy || 0);
  if (su < 0) { dx += -su * 2; sw += su; su = 0; }
  if (sv < 0) { dy += -sv * 2; sh += sv; sv = 0; }
  if (su + sw > img.width) sw = img.width - su;
  if (sv + sh > img.height) sh = img.height - sv;
  if (sw > 0 && sh > 0) ctx.drawImage(img, su, sv, sw, sh, dx, dy, sw * 2, sh * 2);
}

/* --------------------------- caustiques -------------------------------- */
function drawCaustics(t) {
  if (!CAUS) return;
  // discret : le réseau de lumière habille l'eau sans masquer les bandes
  // de profondeur, qui sont l'information de jeu.
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.globalCompositeOperation = "overlay";
  let s = 2.1, ox = (-cam.x * CFG.K * 0.2 + t * 4) / s, oy = (cam.y * CFG.K * 0.2 + t * 2.5) / s;
  ctx.scale(s, s); ctx.translate(ox, oy);
  ctx.fillStyle = CAUS.a; ctx.fillRect(-ox, -oy, W / s + 4, H / s + 4);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.globalCompositeOperation = "overlay";
  s = 1.3; ox = (-cam.x * CFG.K * 0.26 - t * 7) / s; oy = (cam.y * CFG.K * 0.26 - t * 3) / s;
  ctx.scale(s, s); ctx.translate(ox, oy);
  ctx.fillStyle = CAUS.b; ctx.fillRect(-ox, -oy, W / s + 4, H / s + 4);
  ctx.restore();
}

/* ------------------------ courants & vent ------------------------------ */
const curP = [];
function initCurrentParticles() {
  curP.length = 0;
  const rx = W / CFG.K, ry = H / CFG.K;
  for (let i = 0; i < 150; i++) curP.push({
    x: cam.x + (Math.random() - 0.5) * rx * 1.4, y: cam.y + (Math.random() - 0.5) * ry * 1.4,
    px: 0, py: 0, a: Math.random(), mag: 0
  });
}
function updateCurrentParticles(dt, t) {
  const rx = W / CFG.K, ry = H / CFG.K;
  dt *= CFG.VIS;
  for (const p of curP) {
    const c = currentAt(p.x, p.y, t);
    p.px = p.x; p.py = p.y;
    p.x += c[0] * dt * 6; p.y += c[1] * dt * 6;
    p.mag = Math.hypot(c[0], c[1]);
    p.a -= dt * 0.32;
    if (p.a <= 0 || Math.abs(p.x - cam.x) > rx * 0.75 || Math.abs(p.y - cam.y) > ry * 0.75) {
      p.x = cam.x + (Math.random() - 0.5) * rx * 1.4;
      p.y = cam.y + (Math.random() - 0.5) * ry * 1.4;
      p.a = 0.7 + Math.random() * 0.55; p.px = p.x; p.py = p.y;
    }
  }
}
function drawCurrents(t) {
  ctx.lineCap = "round";
  for (const p of curP) {
    const m = clamp(p.mag / 0.75, 0, 1);
    if (m < 0.04) continue;
    const a = clamp(p.a, 0, 1);
    ctx.strokeStyle = rgba(P.foam, (0.14 + 0.4 * m) * a);
    ctx.lineWidth = 0.9 + m * 1.6;
    ctx.beginPath();
    ctx.moveTo(sX(p.px), sY(p.py)); ctx.lineTo(sX(p.x), sY(p.y));
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  drawEddies(t);
}

/* ----- petits tourbillons (vortex) a l'aval courant des patates -----
   Apparaissent au bord d'une patate, derivent dans le courant et
   s'estompent a ~2 m. Petit vortex blanc qui tourne sur lui-meme.    */
const eddies = [];
let eddySpawnT = 0;
function updateEddies(dt, t) {
  // spawn : periodically, near a patate close to the boat
  eddySpawnT -= dt;
  if (eddySpawnT <= 0) {
    eddySpawnT = 0.25 + Math.random() * 0.4;
    if (L.pat) for (const p of L.pat) {
      if (p.sand) continue;
      const dx = p.x - cam.x, dy = p.y - cam.y;
      if (Math.hypot(dx, dy) > W / CFG.K * 0.6) continue;  // only near visible
      const c = currentAt(p.x, p.y, t);
      const cmag = Math.hypot(c[0], c[1]);
      if (cmag < 0.15) continue;                            // need some current
      // spawn at the downstream edge of the patate
      const dirx = c[0] / cmag, diry = c[1] / cmag;
      const ex = p.x + dirx * p.r * 0.9, ey = p.y + diry * p.r * 0.9;
      if (Math.random() < 0.5) {
        eddies.push({
          x: ex, y: ey, ox: p.x, oy: p.y, r: p.r,
          life: 1.2 + Math.random() * 0.6, t: 0,
          spin: (Math.random() < 0.5 ? 1 : -1) * (4 + Math.random() * 3),
          sz: 0.5 + Math.random() * 0.3
        });
      }
    }
  }
  // update + cull
  for (let i = eddies.length - 1; i >= 0; i--) {
    const e = eddies[i];
    e.t += dt;
    const c = currentAt(e.x, e.y, t);
    e.x += c[0] * dt; e.y += c[1] * dt;
    const dist = Math.hypot(e.x - e.ox, e.y - e.oy);
    if (e.t >= e.life || dist > 2.2 + e.r * 0.5) eddies.splice(i, 1);
  }
}
function drawEddies(t) {
  for (const e of eddies) {
    const a = 1 - e.t / e.life;
    const px = sX(e.x), py = sY(e.y);
    const rad = e.sz * CFG.K * (0.6 + 0.4 * a);
    ctx.strokeStyle = rgba(P.foam, 0.6 * a);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    // spirale : 1 tour et demi
    const ang = e.t * e.spin;
    for (let s = 0; s <= 16; s++) {
      const u = s / 16, rr = rad * u, aa = ang + u * TAU * 1.5 * Math.sign(e.spin);
      const x = px + Math.cos(aa) * rr, y = py + Math.sin(aa) * rr;
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
function drawWindRipples(t) {
  const wdx = -Math.cos(L.windFrom), wdy = -Math.sin(L.windFrom);
  ctx.strokeStyle = rgba(P.foam, 0.13); ctx.lineWidth = 1;
  ctx.beginPath();
  const step = 13, n = 0.5;
  const i0 = Math.floor((cam.x - W / CFG.K / 2) / step) - 1, i1 = Math.ceil((cam.x + W / CFG.K / 2) / step) + 1;
  const j0 = Math.floor((cam.y - H / CFG.K / 2) / step) - 1, j1 = Math.ceil((cam.y + H / CFG.K / 2) / step) + 1;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const bx = i * step + ((j & 1) ? step * 0.5 : 0) + Math.sin(j * 1.7) * 2;
    const by = j * step + Math.sin(i * 2.1) * 2;
    if (Math.sin(bx * 0.27 + by * 0.19 + t * 1.3) < n) continue;
    ctx.moveTo(sX(bx), sY(by));
    ctx.lineTo(sX(bx + wdx * 3.6), sY(by + wdy * 3.6));
  }
  ctx.stroke();
}
function drawSparkles(t) {
  ctx.fillStyle = rgba(P.foam, 0.75);
  const step = 9;
  const i0 = Math.floor((cam.x - W / CFG.K / 2) / step), i1 = Math.ceil((cam.x + W / CFG.K / 2) / step);
  const j0 = Math.floor((cam.y - H / CFG.K / 2) / step), j1 = Math.ceil((cam.y + H / CFG.K / 2) / step);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const n = hash2(i, j);
    if (n < 0.955) continue;
    const tw = Math.sin(t * 2.6 + n * 40);
    if (tw < 0.86) continue;
    const x = i * step + n * step, y = j * step + hash2(j, i) * step;
    ctx.fillRect(Math.round(sX(x)), Math.round(sY(y)), 2, 2);
  }
}


/* ------------------------------ écume ---------------------------------- */
function foamLine(xf, t, amp, freq, spd, width, alpha) {
  const y0 = cam.y - H / CFG.K * 0.6, y1 = cam.y + H / CFG.K * 0.6;
  ctx.strokeStyle = rgba(P.foam, alpha); ctx.lineWidth = width;
  ctx.lineCap = "round"; ctx.beginPath();
  for (let y = y0; y <= y1; y += 3) {
    const x = xf(y) + amp * Math.sin(y * freq + t * spd) + amp * 0.5 * Math.sin(y * freq * 2.7 - t * spd * 0.7);
    const px = sX(x), py = sY(y);
    y === y0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.stroke(); ctx.lineCap = "butt";
}
function drawShoreFoam(t) {
  foamLine(y => L.shoreX(y) + 1.0, t, 1.3, 0.16, 1.7, 2.2, 0.75);
  foamLine(y => L.shoreX(y) + 3.2, t, 1.8, 0.11, 1.1, 1.2, 0.3);
}
function drawReefFoam(t) {
  // le récif brise : bourrelet épais + paquets de mer
  foamLine(y => L.reefX(y) - 3.5, t, 1.6, 0.13, 2.1, 5.5, 0.45);
  foamLine(y => L.reefX(y) - 2.0, t, 2.1, 0.21, 2.6, 2.4, 0.9);
  const y0 = cam.y - H / CFG.K * 0.6, y1 = cam.y + H / CFG.K * 0.6;
  for (let y = Math.floor(y0 / 9) * 9; y <= y1; y += 9) {
    const ph = Math.sin(y * 0.31 + t * 1.9);
    if (ph < 0.55) continue;
    const x = L.reefX(y) - 1 - ph * 3;
    ctx.fillStyle = rgba(P.foam, (ph - 0.55) * 1.6);
    ctx.beginPath(); ctx.ellipse(sX(x), sY(y), 9 * ph, 3.4 * ph, 0, 0, TAU); ctx.fill();
  }
  // houle du large
  ctx.strokeStyle = rgba(mixRGB(P.foam, P.ocean, 0.4), 0.4); ctx.lineWidth = 1;
  for (let k = 0; k < 4; k++)
    foamLine(y => L.reefX(y) + 10 + k * 8, t, 2.4, 0.06, 0.8 + k * 0.1, 1, 0.22);
}
function drawCoralFoam(t) {
  for (const p of L.pat) {
    if (!p.emerg || !onScreen(p.x, p.y, p.r * CFG.K + 30)) continue;
    const w = 1 + 0.12 * Math.sin(t * 2.3 + p.ph);
    ctx.strokeStyle = rgba(P.foam, 0.55 + 0.25 * Math.sin(t * 2.3 + p.ph));
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(sX(p.x), sY(p.y), p.r * CFG.K * 0.72 * w, p.r * CFG.K * 0.72 * w, 0, 0, TAU);
    ctx.stroke();
  }
}

/* --------------------------- mouillage --------------------------------- */
function drawAnchorage(t) {
  const a = L.anch;
  if (!onScreen(a.x, a.y, a.r * CFG.K + 80)) return;
  const px = sX(a.x), py = sY(a.y), R = a.r * CFG.K;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2);
  ctx.fillStyle = rgba(P.buoy, 0.09 + 0.04 * pulse);
  ctx.beginPath(); ctx.arc(px, py, R, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(P.buoy, 0.4 + 0.3 * pulse); ctx.lineWidth = 2;
  ctx.setLineDash([7, 6]); ctx.lineDashOffset = -t * 11;
  ctx.beginPath(); ctx.arc(px, py, R, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  // bouée
  const bob = Math.sin(t * 1.7) * 1.2;
  ctx.fillStyle = rgba(P.line, 0.3);
  ctx.beginPath(); ctx.ellipse(px + 2.5, py + 3, 5, 4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = rgbStr(P.buoy);
  ctx.beginPath(); ctx.arc(px, py + bob, 5, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(P.foam, 0.85);
  ctx.beginPath(); ctx.arc(px - 1.4, py + bob - 1.6, 2.2, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(P.line, 0.85); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(px, py + bob, 5, 0, TAU); ctx.stroke();
}

/* ----------------------------- faune ----------------------------------- */
function sprite(x, y, h, sc) {
  ctx.save();
  ctx.translate(sX(x), sY(y));
  ctx.rotate(-h);
  ctx.scale(CFG.K * sc, CFG.K * sc);
}
function leaf(g, x0, y0, x1, y1, wd) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  g.beginPath(); g.moveTo(x0, y0);
  g.quadraticCurveTo(mx + nx * wd, my + ny * wd, x1, y1);
  g.quadraticCurveTo(mx - nx * wd, my - ny * wd, x0, y0);
  g.closePath();
}

/* Repères : x = avant, y = tribord, en mètres. Les tailles sont un peu
   exagérées par rapport au réel, sinon rien ne se lit à côté d'un 11 m.   */
function drawFauna(t) {
  for (const f of L.fauna) {
    if (!onScreen(f.x, f.y, 70)) continue;
    const jumping = f.kind === "dauphin" && f.jump > 0;
    const jz = jumping ? Math.sin((1 - f.jump) * Math.PI) : 0;
    const dep = jumping ? 0 : f.dep;
    const vis = clamp(1 - dep / 7.5, 0.34, 0.96);
    const wc = BANDS[bandOf(probe(f.x, f.y).d)].c;
    const tn = c => rgbStr(mixRGB(wc, c, vis));          // atténué par la profondeur
    const sc = f.size * (1 + jz * 0.22);
    const lw = Math.max(1.05, 1.5 * vis) / (CFG.K * sc);  // liseré toujours ≥ 1 px
    const ink = rgba(P.line, 0.2 + 0.45 * vis + (jumping ? 0.3 : 0));

    // ombre sur le fond, décalée comme celle des patates
    ctx.fillStyle = rgba(P.line, (jumping ? 0.24 : 0.1 * vis) * (1 - jz * 0.4));
    ctx.beginPath();
    ctx.ellipse(sX(f.x) + 3 + jz * 11, sY(f.y) + 4 + jz * 13,
      (f.kind === "banc" ? 16 : 13) * f.size, (f.kind === "banc" ? 13 : 7) * f.size, 0, 0, TAU);
    ctx.fill();

    sprite(f.x, f.y, f.h, sc);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = ink; ctx.lineWidth = lw;

    if (f.kind === "raie") {
      /* raie léopard : ailes en delta, lobes céphaliques, semis de taches */
      const flap = 1 + Math.sin(f.ph) * 0.2;
      const W2 = 2.35 * flap;
      ctx.fillStyle = tn([132, 110, 176]);
      ctx.beginPath();
      ctx.moveTo(1.85, 0);
      ctx.bezierCurveTo(1.6, 0.9, 0.9, 1.9, -0.35, W2);          // bord d'attaque
      ctx.bezierCurveTo(-0.95, W2 * 0.92, -1.25, 0.9, -1.15, 0.42);
      ctx.bezierCurveTo(-1.25, -0.9, -0.95, -W2 * 0.92, -0.35, -W2);
      ctx.bezierCurveTo(0.9, -1.9, 1.6, -0.9, 1.85, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // lobes céphaliques
      ctx.fillStyle = tn([116, 94, 158]);
      for (const s of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(1.8, s * 0.1);
        ctx.quadraticCurveTo(2.35, s * 0.34, 2.15, s * 0.52);
        ctx.quadraticCurveTo(1.8, s * 0.4, 1.7, s * 0.22);
        ctx.closePath(); ctx.fill();
      }
      // crête dorsale claire + taches
      ctx.fillStyle = tn([176, 158, 214]);
      ctx.beginPath(); ctx.ellipse(0.5, 0, 1.15, 0.34, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(mixRGB(wc, [232, 224, 248], vis), 0.85);
      for (const sp of f.spots) {
        ctx.beginPath();
        ctx.ellipse(1.5 - sp.u * 2.4, sp.v * flap, sp.r, sp.r * 0.8, 0, 0, TAU); ctx.fill();
      }
      // queue en fouet : effilée, pas un fil de fer
      const wag = Math.sin(f.ph * 0.7);
      ctx.fillStyle = tn([124, 104, 166]);
      ctx.beginPath();
      ctx.moveTo(-0.95, 0.2);
      ctx.quadraticCurveTo(-2.1, wag * 0.5 + 0.07, -3.3, wag * 1.1);
      ctx.quadraticCurveTo(-2.1, wag * 0.5 - 0.07, -0.95, -0.2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = lw * 0.7; ctx.stroke();
      // yeux
      ctx.fillStyle = rgba(P.line, 0.75 * vis);
      ctx.beginPath(); ctx.arc(1.35, 0.42, 0.13, 0, TAU); ctx.arc(1.35, -0.42, 0.13, 0, TAU); ctx.fill();
    }

    else if (f.kind === "tortue") {
      /* tortue verte : dossières visibles, bord de carapace plus clair */
      const pad = Math.sin(f.ph) * 0.5, pad2 = Math.sin(f.ph + 1.1) * 0.35;
      // nageoires
      ctx.fillStyle = tn([92, 152, 106]);
      for (const s of [1, -1]) {
        leaf(ctx, 0.35, s * 0.45, 1.35, s * (1.25 + pad * s), 0.24); ctx.fill(); ctx.stroke();
        leaf(ctx, -0.5, s * 0.42, -1.25, s * (1.0 - pad2 * s), 0.17); ctx.fill(); ctx.stroke();
      }
      // tête
      ctx.fillStyle = tn([104, 160, 112]);
      ctx.beginPath(); ctx.ellipse(1.2, 0, 0.42, 0.32, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgba(P.line, 0.7 * vis);
      ctx.beginPath(); ctx.arc(1.3, 0.2, 0.09, 0, TAU); ctx.arc(1.3, -0.2, 0.09, 0, TAU); ctx.fill();
      // carapace : bord clair puis plastron central
      ctx.fillStyle = tn([120, 182, 120]);
      ctx.beginPath(); ctx.ellipse(0, 0, 1.15, 0.92, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = tn([146, 206, 136]);
      ctx.beginPath(); ctx.ellipse(0.02, 0, 0.9, 0.7, 0, 0, TAU); ctx.fill();
      // dossières
      ctx.strokeStyle = rgba(P.line, 0.3 * vis); ctx.lineWidth = lw * 0.75;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * TAU + 0.3;
        ctx.moveTo(Math.cos(a) * 0.3, Math.sin(a) * 0.24);
        ctx.lineTo(Math.cos(a) * 0.92, Math.sin(a) * 0.72);
      }
      ctx.ellipse(0.02, 0, 0.42, 0.33, 0, 0, TAU);
      ctx.stroke();
    }

    else if (f.kind === "banc") {
      /* poissons-perroquets : corps + caudale + œil, trois livrées */
      const tones = [[252, 206, 110], [122, 214, 206], [238, 152, 168]];
      for (const fi of f.fish) {
        const a = fi.a + Math.sin(f.ph * 0.5 + fi.ph) * 0.2;
        const x = Math.cos(a) * fi.d, y = Math.sin(a) * fi.d * 0.8;
        const s = fi.sc * 0.42, wag = Math.sin(f.ph * 1.6 + fi.ph) * 0.35;
        ctx.fillStyle = tn(tones[fi.tone]);
        ctx.beginPath();                                    // corps
        ctx.moveTo(x + s * 1.5, y);
        ctx.quadraticCurveTo(x + s * 0.2, y + s * 0.72, x - s * 0.9, y + s * 0.18);
        ctx.quadraticCurveTo(x - s * 0.9, y - s * 0.18, x + s * 0.2, y - s * 0.72);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();                                    // caudale
        ctx.moveTo(x - s * 0.75, y);
        ctx.lineTo(x - s * 1.7, y + s * (0.6 + wag));
        ctx.lineTo(x - s * 1.35, y);
        ctx.lineTo(x - s * 1.7, y - s * (0.6 - wag));
        ctx.closePath(); ctx.fill();
        if (vis > 0.55) {
          ctx.fillStyle = rgba(P.line, 0.55 * vis);
          ctx.beginPath(); ctx.arc(x + s * 0.85, y - s * 0.12, s * 0.16, 0, TAU); ctx.fill();
        }
      }
    }

    else if (f.kind === "requin") {
      /* requin pointe-noire : museau pointu, fentes branchiales, extrémités
         de nageoires noires — c'est sa signature.                        */
      /* Silhouette FINE et effilée, gris terne : rien à voir avec le bleu
         et les rondeurs du dauphin. Museau pointu, corps deux fois moins
         épais que long-dauphin, pédoncule étroit.
         La caudale est une nageoire VERTICALE : de dessus on n'en voit que
         l'épaisseur, donc UNE SEULE lame, longue et mince. Pas de fourche :
         les deux lobes sont superposés, ils se projettent au même endroit.
         Elle balaie latéralement et se galbe en S pendant la course.      */
      const tail = Math.sin(f.ph) * 1.15;
      const cw = 0.15 + 0.09 * Math.abs(Math.sin(f.ph));   // épaisseur apparente
      const body = tn([142, 149, 152]);
      // pectorales, en faux, derrière le corps
      ctx.fillStyle = tn([126, 133, 137]);
      for (const s of [1, -1]) { leaf(ctx, 0.8, s * 0.4, -0.5, s * 1.5, 0.17); ctx.fill(); ctx.stroke(); }
      // pelviennes : petites nageoires au tiers arrière du corps
      ctx.fillStyle = tn([130, 137, 141]);
      for (const s of [1, -1]) { leaf(ctx, -0.6, s * 0.3, -1.5, s * 0.4, 0.11); ctx.fill(); ctx.stroke(); }
      // lame caudale, dessinée avant le corps : le raccord passe dessous
      ctx.beginPath();
      ctx.moveTo(-1.8, 0.24);
      ctx.bezierCurveTo(-2.45, tail * 0.18 + cw, -3.2, tail * 0.68 + cw * 0.7, -3.95, tail);
      ctx.bezierCurveTo(-3.2, tail * 0.68 - cw * 0.7, -2.45, tail * 0.18 - cw, -1.8, -0.24);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // corps
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(2.75, 0.16);
      ctx.bezierCurveTo(2.3, 0.32, 1.5, 0.5, 0.4, 0.5);
      ctx.bezierCurveTo(-0.7, 0.48, -1.5, 0.3, -2.0, 0.15);
      ctx.quadraticCurveTo(-2.22, 0, -2.0, -0.15);         // pédicule étroit
      ctx.bezierCurveTo(-1.5, -0.3, -0.7, -0.48, 0.4, -0.5);
      ctx.bezierCurveTo(1.5, -0.5, 2.3, -0.32, 2.75, -0.16);
      ctx.quadraticCurveTo(2.95, 0, 2.75, 0.16);            // museau arrondi
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // flanc plus clair
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0.3, 0, 2.5, 0.5, 0, 0, TAU); ctx.clip();
      ctx.fillStyle = tn([180, 188, 191]);
      ctx.beginPath(); ctx.ellipse(0.3, 0.28, 2.2, 0.15, 0, 0, TAU); ctx.fill();
      ctx.restore();
      // fentes branchiales
      if (vis > 0.5) {
        ctx.strokeStyle = rgba(P.line, 0.3 * vis); ctx.lineWidth = lw * 0.6;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          ctx.moveTo(1.4 - k * 0.19, 0.13); ctx.lineTo(1.33 - k * 0.19, 0.37);
        }
        ctx.stroke();
      }
      /* Dorsales verticales : de dessus, étroites — mais dans la teinte
         sombre des nageoires, sinon elles disparaissent dans le dos et le
         requin perd sa silhouette la plus reconnaissable.                */
      ctx.fillStyle = tn([120, 128, 132]);
      leaf(ctx, 0.75, 0, -0.85, 0, 0.32); ctx.fill(); ctx.stroke();
      leaf(ctx, -1.3, 0, -1.78, 0, 0.14); ctx.fill(); ctx.stroke();
      // pointes noires — la signature du pointe-noire
      ctx.fillStyle = rgba(mixRGB(wc, [26, 32, 44], Math.max(vis, 0.6)), 1);
      ctx.beginPath(); ctx.arc(-0.68, 0, 0.15, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(-3.82, tail * 0.95, 0.14, 0, TAU); ctx.fill();
      for (const s of [1, -1]) { ctx.beginPath(); ctx.arc(-0.46, s * 1.4, 0.13, 0, TAU); ctx.fill(); }
      ctx.fillStyle = rgba(P.line, 0.7 * vis);
      ctx.beginPath(); ctx.arc(2.2, 0.24, 0.1, 0, TAU); ctx.arc(2.2, -0.24, 0.1, 0, TAU); ctx.fill();
    }

    else if (f.kind === "dauphin") {
      /* dauphin : melon, rostre, cape sombre sur le dos, ventre clair */
      /* Un cétacé bat de la queue de haut en bas, pas latéralement. Vu de
         dessus, ce battement se lit à l'envergure apparente du croissant
         caudal : large quand la queue est à plat, fine quand elle monte ou
         descend et qu'on la voit par la tranche. Deux pulsations par cycle
         (plat - tranche - plat - tranche), d'où la valeur absolue.       */
      const fl = 1.45 * (0.16 + 0.84 * Math.abs(Math.cos(f.ph))); // demi-envergure : 0,23 (tranche) → 1,45 (plat)
      const w = jumping ? 1 : vis;
      const dk = c => jumping ? rgbStr(c) : tn(c);
      ctx.fillStyle = dk([128, 148, 180]);
      for (const s of [1, -1]) { leaf(ctx, 0.7, s * 0.42, -0.35, s * 1.45, 0.18); ctx.fill(); ctx.stroke(); }
      /* Caudale dessinée à part, avant le corps : un vrai croissant. Bord
         d'attaque bombé vers l'avant, pointes effilées REJETÉES VERS
         L'ARRIÈRE, bord de fuite échancré au milieu. C'est la corde (0,6 →
         1,5 m d'avant en arrière) qui manquait : sans elle la nageoire
         n'était qu'une palette plate collée au pédoncule.                */
      ctx.fillStyle = dk([141, 163, 195]);
      ctx.beginPath();
      ctx.moveTo(-2.2, 0.22);
      ctx.bezierCurveTo(-2.45, fl * 0.46, -3.0, fl * 0.88, -3.75, fl);   // bord d'attaque
      ctx.quadraticCurveTo(-3.1, fl * 0.34, -2.82, 0);                   // échancrure
      ctx.quadraticCurveTo(-3.1, -fl * 0.34, -3.75, -fl);
      ctx.bezierCurveTo(-3.0, -fl * 0.88, -2.45, -fl * 0.46, -2.2, -0.22);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dk([154, 176, 204]);
      ctx.beginPath();
      ctx.moveTo(3.05, 0);                                  // rostre
      ctx.quadraticCurveTo(2.5, 0.16, 2.15, 0.3);
      ctx.bezierCurveTo(1.4, 0.66, 0.2, 0.78, -1.1, 0.58);
      ctx.lineTo(-2.42, 0.19);
      ctx.quadraticCurveTo(-2.6, 0, -2.42, -0.19);          // pédoncule
      ctx.lineTo(-1.1, -0.58);
      ctx.bezierCurveTo(0.2, -0.78, 1.4, -0.66, 2.15, -0.3);
      ctx.quadraticCurveTo(2.5, -0.16, 3.05, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // cape sombre
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0.3, 0, 2.6, 0.74, 0, 0, TAU); ctx.clip();
      ctx.fillStyle = jumping ? "rgba(86,106,142,0.8)" : rgba(mixRGB(wc, [86, 106, 142], w), 0.75);
      ctx.beginPath(); ctx.ellipse(0.1, -0.28, 2.3, 0.42, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = jumping ? "rgba(236,240,246,0.75)" : rgba(mixRGB(wc, [236, 240, 246], w), 0.6);
      ctx.beginPath(); ctx.ellipse(0.4, 0.46, 1.9, 0.3, 0, 0, TAU); ctx.fill();
      ctx.restore();
      // dorsale
      ctx.fillStyle = dk([116, 136, 170]);
      leaf(ctx, 0.45, 0, -1.0, 0, 0.4); ctx.fill(); ctx.stroke();
      // évent + œil
      ctx.fillStyle = rgba(P.line, 0.6 * w);
      ctx.beginPath(); ctx.arc(1.45, 0, 0.1, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(1.9, 0.3, 0.1, 0, TAU); ctx.arc(1.9, -0.3, 0.1, 0, TAU); ctx.fill();
      if (jumping && jz < 0.35 && Math.random() < 0.5) spawnSpray(f.x, f.y, 2);
    }
    ctx.lineCap = "butt";
    ctx.restore();
  }
}

/* ------------------------------ sillage -------------------------------- */
function drawWake() {
  if (L.trail.length > 1) {
    for (const s of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i < L.trail.length; i++) {
        const p = L.trail[i], c = Math.cos(p.h), sn = Math.sin(p.h);
        const x = p.x - 5.4 * c - 2.85 * s * sn, y = p.y - 5.4 * sn + 2.85 * s * c;
        i ? ctx.lineTo(sX(x), sY(y)) : ctx.moveTo(sX(x), sY(y));
      }
      ctx.lineCap = "round";
      ctx.strokeStyle = rgba(P.foam, 0.26); ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = rgba(P.foam, 0.55); ctx.lineWidth = 2; ctx.stroke();
      ctx.lineCap = "butt";
    }
  }
  const sp = Math.hypot(B.vx, B.vy);
  if (sp > 0.25 && B.alive) {
    const c = Math.cos(B.h), sn = Math.sin(B.h), u = Math.min(1, sp / 3.2);
    for (const s of [1, -1]) {
      let x = B.x - 5.7 * c - 2.85 * s * sn, y = B.y - 5.7 * sn + 2.85 * s * c;
      ctx.fillStyle = rgba(P.foam, 0.3 + 0.35 * u);
      ctx.beginPath(); ctx.arc(sX(x), sY(y), (2.4 + 3.4 * u) * CFG.K / 4.2, 0, TAU); ctx.fill();
      x = B.x + 5.2 * c - 2.85 * s * sn; y = B.y + 5.2 * sn + 2.85 * s * c;
      ctx.fillStyle = rgba(P.foam, 0.16 + 0.35 * u);
      ctx.beginPath(); ctx.arc(sX(x), sY(y), (1.6 + 2.6 * u) * CFG.K / 4.2, 0, TAU); ctx.fill();
    }
  }
  // ondulations autour du bateau à l'arrêt : l'eau vit même sans erre
  if (sp <= 0.25 && B.alive) {
    const t = Snd.__t;
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.45 + k / 3) % 1;
      if (ph > 0.9) continue;
      const R = (4 + ph * 9) * CFG.K;
      ctx.strokeStyle = rgba(P.foam, 0.35 * (1 - ph / 0.9));
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(sX(B.x), sY(B.y), R, R * 0.78, 0, 0, TAU); ctx.stroke();
    }
  }
}

/* ---------------------------- le catamaran ----------------------------- */
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
const HW = 0.88;                       // demi-largeur d'une coque
function hullPath(g, yc, hw) {
  g.beginPath();
  g.moveTo(5.66, yc);
  g.bezierCurveTo(5.0, yc + hw * 0.55, 3.4, yc + hw * 0.95, 1.0, yc + hw);
  g.bezierCurveTo(-1.6, yc + hw, -3.6, yc + hw * 0.96, -5.15, yc + hw * 0.82);
  g.quadraticCurveTo(-5.5, yc + hw * 0.7, -5.5, yc);
  g.quadraticCurveTo(-5.5, yc - hw * 0.7, -5.15, yc - hw * 0.82);
  g.bezierCurveTo(-3.6, yc - hw * 0.96, -1.6, yc - hw, 1.0, yc - hw);
  g.bezierCurveTo(3.4, yc - hw * 0.95, 5.0, yc - hw * 0.55, 5.66, yc);
  g.closePath();
}

function boatSilhouette(g) {          // pour l'ombre portée
  hullPath(g, 2.85, HW); g.fill();
  hullPath(g, -2.85, HW); g.fill();
  rr(g, -5.3, -2.2, 10.9, 4.4, 0.8); g.fill();
  rr(g, -6.9, -1.15, 1.5, 2.3, 0.5); g.fill();   // annexe sur les bossoirs
}

/* Voile vue de dessus : un croissant qui se creuse SOUS LE VENT.
   n = normale unitaire à la corde, orientée vers le côté de la bôme.     */
function sailPath(g, ax, ay, bx, by, nx, ny, belly, k) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  g.beginPath();
  g.moveTo(ax, ay);
  g.quadraticCurveTo(mx + nx * belly * 2.7 * k, my + ny * belly * 2.7 * k, bx, by);
  g.quadraticCurveTo(mx + nx * belly * 0.35 * k, my + ny * belly * 0.35 * k, ax, ay);
  g.closePath();
}

function drawBoat(t) {
  const K = CFG.K, LNW = 1.5 / K, THIN = 0.9 / K, HAIR = 0.7 / K;
  const sink = B.sinking;
  const heel = clamp(B.heel, -1, 1);
  const px = sX(B.x), py = sY(B.y);
  if (px < -180 || px > W + 180 || py < -180 || py > H + 180) return;

  // chaîne + ancre au fond : dessinées en coordonnées écran (sous le bateau).
  // La proue du bateau est à 5.6 m vers l'avant (B.h).
  if (B.anchored || B.anchorDrop > 0) {
    const bowX = B.x + Math.cos(B.h) * 5.6, bowY = B.y + Math.sin(B.h) * 5.6;
    const bx = sX(bowX), by = sY(bowY);
    let ax = B.anchorX, ay = B.anchorY;
    if (B.anchorDrop > 0 && B.anchorDrop < 1) {
      // animation de descente : l'ancre part de la proue et s'enfonce.
      ax = bowX + (B.anchorX - bowX) * B.anchorDrop;
      ay = bowY + (B.anchorY - bowY) * B.anchorDrop;
    }
    const sx = sX(ax), sy = sY(ay);
    // chaîne qui file / arc / tendue
    const dist = Math.hypot(B.anchorX - bowX, B.anchorY - bowY);
    const taut = B.anchorDrop >= 1 && dist >= B.chainR - 0.5;
    ctx.strokeStyle = rgba(P.line, taut ? 0.85 : (B.anchorDrop < 1 ? 0.6 : 0.6));
    ctx.lineWidth = (taut ? 1.3 : 1.1) / K;
    if (taut) {
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(sx, sy); ctx.stroke();
    } else if (B.anchorDrop < 1) {
      ctx.setLineDash([0.3 * K, 0.25 * K]);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(sx, sy); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // chaîne souple : arc qui pend (point de contrôle bas au milieu)
      ctx.setLineDash([]);
      const mx = (bx + sx) / 2, my = (by + sy) / 2;
      ctx.beginPath(); ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(mx, my + 0.9 * K, sx, sy);
      ctx.stroke();
    }
    // ancre au fond (point fixe gris) + croisillon
    ctx.fillStyle = rgba(P.line, 0.7);
    ctx.beginPath(); ctx.arc(sx, sy, 0.34 * K, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(P.line, 0.5); ctx.lineWidth = HAIR;
    ctx.beginPath();
    ctx.moveTo(sx - 0.5 * K, sy); ctx.lineTo(sx + 0.5 * K, sy);
    ctx.moveTo(sx, sy - 0.5 * K); ctx.lineTo(sx, sy + 0.5 * K);
    ctx.stroke();
  }

  // ombre portée sur l'eau
  ctx.save();
  ctx.translate(px + 4, py + 5);
  ctx.rotate(-B.h); ctx.scale(K, K);
  ctx.fillStyle = rgba(P.line, 0.26 * (1 - sink));
  boatSilhouette(ctx);
  ctx.restore();

  ctx.save();
  ctx.translate(px, py);
  // en coulant, le bateau s'enfonce (il rétrécit), part en travers et s'efface
  ctx.rotate(-B.h + sink * 0.6);
  ctx.scale(K * (1 - sink * 0.42), K * (1 - sink * 0.42));
  ctx.lineJoin = "round";
  ctx.globalAlpha = 1 - sink * 0.85;
  const line = rgba(P.line, 0.92);
  const soft = rgba(P.line, 0.3);

  /* ===================== annexe sur les bossoirs ======================= */
  ctx.strokeStyle = rgbStr(P.mast); ctx.lineWidth = 0.14;
  for (const s of [1, -1]) {
    ctx.beginPath(); ctx.moveTo(-5.2, s * 1.75); ctx.lineTo(-6.5, s * 1.0); ctx.stroke();
  }
  // semi-rigide : étrave pointée vers l'arrière du cata
  ctx.beginPath();
  ctx.moveTo(-5.35, 0.92); ctx.lineTo(-6.5, 1.05);
  ctx.quadraticCurveTo(-7.1, 0.95, -7.15, 0);
  ctx.quadraticCurveTo(-7.1, -0.95, -6.5, -1.05);
  ctx.lineTo(-5.35, -0.92);
  ctx.closePath();
  ctx.fillStyle = rgbStr(P.hullSh); ctx.fill();
  ctx.strokeStyle = line; ctx.lineWidth = LNW; ctx.stroke();
  ctx.fillStyle = rgba(P.line, 0.28);
  rr(ctx, -6.62, -0.55, 1.1, 1.1, 0.3); ctx.fill();
  ctx.fillStyle = rgbStr(P.line);
  rr(ctx, -5.52, -0.2, 0.34, 0.4, 0.1); ctx.fill();          // hors-bord

  /* ========================= plate-forme avant ========================= */
  // poutre + étai de poutre
  ctx.strokeStyle = rgbStr(P.mast); ctx.lineWidth = 0.32;
  ctx.beginPath(); ctx.moveTo(4.05, -2.55); ctx.lineTo(4.05, 2.55); ctx.stroke();
  ctx.strokeStyle = line; ctx.lineWidth = THIN;
  ctx.beginPath(); ctx.moveTo(4.05, -2.55); ctx.lineTo(4.05, 2.55); ctx.stroke();
  // trampolines (deux panneaux séparés par la sangle centrale)
  const TF = 5.05, TA = 1.45;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(TA, s * 0.14); ctx.lineTo(TF, s * 0.14);
    ctx.lineTo(TF, s * 1.02); ctx.lineTo(TA, s * 2.1);
    ctx.closePath();
    ctx.fillStyle = rgbStr(P.tramp); ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = rgba(P.line, 0.2); ctx.lineWidth = HAIR;
    ctx.beginPath();
    for (let i = 0; i <= 9; i++) {
      const u = i / 9;
      ctx.moveTo(lerp(TA, TF, u), s * 0.1); ctx.lineTo(lerp(TA, TF, u), s * 2.2);
      ctx.moveTo(TA, s * (0.2 + u * 1.9)); ctx.lineTo(TF, s * (0.2 + u * 1.9));
    }
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(TA, s * 0.14); ctx.lineTo(TF, s * 0.14);
    ctx.lineTo(TF, s * 1.02); ctx.lineTo(TA, s * 2.1);
    ctx.closePath();
    ctx.strokeStyle = line; ctx.lineWidth = LNW; ctx.stroke();
  }
  // davier + ancre (l'ancre est sur le davier seulement quand elle est
  // levée : pas ancrée, pas en descente). Sinon elle est à l'eau.
  ctx.fillStyle = rgbStr(P.mast);
  rr(ctx, 4.55, -0.22, 1.25, 0.44, 0.12); ctx.fill();
  ctx.strokeStyle = line; ctx.lineWidth = THIN; ctx.stroke();
  if (!B.anchored && B.anchorDrop <= 0) {
    ctx.fillStyle = rgba(P.line, 0.8);
    rr(ctx, 4.85, -0.12, 0.7, 0.24, 0.08); ctx.fill();
  }

  /* ============================= cockpit =============================== */
  ctx.fillStyle = rgbStr(P.deck);
  rr(ctx, -5.3, -2.15, 3.6, 4.3, 0.55); ctx.fill();
  ctx.strokeStyle = line; ctx.lineWidth = LNW; ctx.stroke();
  ctx.save(); rr(ctx, -5.3, -2.15, 3.6, 4.3, 0.55); ctx.clip();
  // lames de pont
  ctx.strokeStyle = rgba(P.line, 0.16); ctx.lineWidth = HAIR;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) { ctx.moveTo(-5.3, -2.1 + i * 0.36); ctx.lineTo(-1.7, -2.1 + i * 0.36); }
  ctx.stroke();
  // ombre du bimini
  ctx.fillStyle = "rgba(14,43,58,0.14)";
  rr(ctx, -4.6, -1.5, 2.9, 3.7, 0.6); ctx.fill();
  ctx.restore();
  // banc arrière + table
  ctx.fillStyle = rgbStr(P.hullSh);
  rr(ctx, -5.1, -1.85, 0.62, 3.7, 0.28); ctx.fill();
  ctx.strokeStyle = rgba(P.line, 0.5); ctx.lineWidth = THIN; ctx.stroke();
  ctx.fillStyle = rgbStr(mixRGB(P.deck, P.trunk, 0.35));
  rr(ctx, -4.3, -1.25, 1.1, 2.5, 0.2); ctx.fill();
  ctx.strokeStyle = rgba(P.line, 0.45); ctx.lineWidth = THIN; ctx.stroke();
  // console + barre à roue à tribord
  ctx.fillStyle = rgbStr(P.deck);
  rr(ctx, -2.9, 0.95, 0.85, 1.05, 0.18); ctx.fill();
  ctx.strokeStyle = rgba(P.line, 0.6); ctx.lineWidth = THIN; ctx.stroke();
  ctx.strokeStyle = rgba(P.line, 0.85); ctx.lineWidth = 1.3 / K;
  ctx.beginPath(); ctx.arc(-2.48, 1.45, 0.4, 0, TAU); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI;
    ctx.moveTo(-2.48 - Math.cos(a) * 0.4, 1.45 - Math.sin(a) * 0.4);
    ctx.lineTo(-2.48 + Math.cos(a) * 0.4, 1.45 + Math.sin(a) * 0.4);
  }
  ctx.stroke();

  /* ============================ les coques ============================= */
  for (const s of [-1, 1]) {
    const yc = 2.85 * s, lee = heel * s > 0;
    hullPath(ctx, yc, HW);
    ctx.fillStyle = rgbStr(P.hull); ctx.fill();
    ctx.save(); hullPath(ctx, yc, HW); ctx.clip();
    // bande de liston sur le bord extérieur
    ctx.fillStyle = rgba(P.hullSh, lee ? 0.95 : 0.62);
    ctx.fillRect(-7, yc + (HW - 0.3) * s, 13, 0.34 * s);
    // reflet d'étrave
    ctx.fillStyle = rgba(P.foam, 0.5);
    ctx.beginPath(); ctx.ellipse(3.9, yc - 0.18 * s, 1.5, 0.17, 0, 0, TAU); ctx.fill();
    // ombre côté nacelle : détache la coque de la plate-forme
    ctx.fillStyle = rgba(P.line, 0.17);
    ctx.fillRect(-7, yc - HW * s, 13, 0.34 * s);
    ctx.restore();
    ctx.strokeStyle = line; ctx.lineWidth = LNW;
    hullPath(ctx, yc, HW); ctx.stroke();
    // liseré de flottaison
    ctx.strokeStyle = rgba(P.glass, 0.5); ctx.lineWidth = 1.1 / K;
    hullPath(ctx, yc, HW * 0.6); ctx.stroke();
    // passavant
    ctx.strokeStyle = rgba(P.line, 0.2); ctx.lineWidth = HAIR;
    ctx.beginPath(); ctx.moveTo(4.5, yc); ctx.lineTo(-4.9, yc); ctx.stroke();
    // panneaux de pont
    for (const hxp of [2.55, -0.2, -3.45]) {
      ctx.fillStyle = rgba(P.glass, 0.34);
      rr(ctx, hxp, yc - 0.28, 0.8, 0.56, 0.12); ctx.fill();
      ctx.strokeStyle = rgba(P.line, 0.4); ctx.lineWidth = HAIR; ctx.stroke();
      ctx.fillStyle = rgba(P.glassLt, 0.45);
      rr(ctx, hxp + 0.08, yc - 0.2, 0.28, 0.18, 0.06); ctx.fill();
    }
    // jupe arrière + taquets
    ctx.fillStyle = rgba(P.foam, 0.55);
    rr(ctx, -5.4, yc - 0.42, 0.55, 0.84, 0.16); ctx.fill();
    ctx.strokeStyle = rgba(P.line, 0.45); ctx.lineWidth = HAIR; ctx.stroke();
    ctx.fillStyle = rgba(P.line, 0.65);
    rr(ctx, 3.5, yc + (HW - 0.5) * s, 0.34, 0.16, 0.06); ctx.fill();
    rr(ctx, -4.4, yc + (HW - 0.5) * s, 0.34, 0.16, 0.06); ctx.fill();
  }
  /* déchirures : une par chance perdue */
  for (let d = 0; d < HULL_MAX - B.hull; d++) {
    const s = (d % 2) ? 1 : -1, xo = -1.4 + d * 2.2, yc = 2.85 * s;
    ctx.fillStyle = rgba(P.line, 0.72);
    ctx.beginPath();
    ctx.moveTo(xo, yc + HW * s * 1.02);
    ctx.lineTo(xo + 0.42, yc + HW * s * 0.2);
    ctx.lineTo(xo + 0.78, yc + HW * s * 0.85);
    ctx.lineTo(xo + 1.25, yc + HW * s * 0.15);
    ctx.lineTo(xo + 1.5, yc + HW * s * 1.02);
    ctx.closePath(); ctx.fill();
  }

  /* ========================== nacelle / carré ========================== */
  const hx = heel * 0.14;
  ctx.save(); ctx.translate(0, hx);
  ctx.fillStyle = rgbStr(P.deck);
  rr(ctx, -2.05, -2.04, 4.2, 4.08, 0.75); ctx.fill();
  ctx.strokeStyle = line; ctx.lineWidth = LNW; ctx.stroke();
  // panneaux solaires sur le rouf : bleu ardoise franc, pour ne pas être
  // confondus avec la maille claire des trampolines
  ctx.fillStyle = rgbStr(mixRGB(P.glass, P.line, 0.42));
  rr(ctx, -1.75, -1.5, 1.5, 3.0, 0.12); ctx.fill();
  ctx.strokeStyle = rgba(P.line, 0.8); ctx.lineWidth = THIN; ctx.stroke();
  ctx.strokeStyle = rgba(P.glassLt, 0.45); ctx.lineWidth = HAIR;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) { ctx.moveTo(-1.75 + i * 0.5, -1.5); ctx.lineTo(-1.75 + i * 0.5, 1.5); }
  for (let i = 1; i < 4; i++) { ctx.moveTo(-1.75, -1.5 + i * 0.75); ctx.lineTo(-0.25, -1.5 + i * 0.75); }
  ctx.stroke();
  ctx.fillStyle = rgba(P.glassLt, 0.3);
  rr(ctx, -1.66, -1.4, 0.38, 0.62, 0.06); ctx.fill();
  // pare-brise panoramique
  ctx.fillStyle = rgbStr(P.glass);
  ctx.beginPath();
  ctx.moveTo(0.55, -1.78);
  ctx.quadraticCurveTo(2.0, -1.5, 2.06, 0);
  ctx.quadraticCurveTo(2.0, 1.5, 0.55, 1.78);
  ctx.lineTo(0.55, 1.35);
  ctx.quadraticCurveTo(1.6, 1.2, 1.64, 0);
  ctx.quadraticCurveTo(1.6, -1.2, 0.55, -1.35);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rgba(P.line, 0.72); ctx.lineWidth = THIN; ctx.stroke();
  ctx.fillStyle = rgba(P.glassLt, 0.8);
  ctx.beginPath();
  ctx.moveTo(0.7, -1.62); ctx.quadraticCurveTo(1.72, -1.34, 1.8, -0.6);
  ctx.lineTo(1.42, -0.66); ctx.quadraticCurveTo(1.35, -1.18, 0.7, -1.3);
  ctx.closePath(); ctx.fill();
  // vitrage latéral
  for (const s of [1, -1]) {
    ctx.fillStyle = rgbStr(s > 0 ? P.glassLt : P.glass);
    rr(ctx, -1.55, s * 1.72 - 0.17, 2.1, 0.34, 0.14); ctx.fill();
    ctx.strokeStyle = rgba(P.line, 0.55); ctx.lineWidth = HAIR; ctx.stroke();
    // main courante
    ctx.strokeStyle = rgba(P.line, 0.35); ctx.lineWidth = HAIR;
    ctx.beginPath(); ctx.moveTo(-1.3, s * 1.3); ctx.lineTo(0.6, s * 1.3); ctx.stroke();
  }
  ctx.restore();

  /* ===================== bimini corail sur le cockpit ================== */
  ctx.fillStyle = rgbStr(P.bimini);
  rr(ctx, -4.85, -1.78, 2.8, 3.56, 0.62); ctx.fill();
  ctx.strokeStyle = line; ctx.lineWidth = LNW; ctx.stroke();
  ctx.fillStyle = rgba(P.foam, 0.3);
  rr(ctx, -4.62, -1.56, 0.95, 3.12, 0.45); ctx.fill();
  ctx.strokeStyle = rgba(P.line, 0.22); ctx.lineWidth = HAIR;
  ctx.beginPath();
  ctx.moveTo(-3.45, -1.78); ctx.lineTo(-3.45, 1.78);
  ctx.moveTo(-4.85, 0); ctx.lineTo(-2.05, 0);
  ctx.stroke();

  /* ============================= gréement ============================== */
  const mastX = 1.15, bl = 4.5;
  let ba = B.boom;
  if (B.luff > 0.5) ba = Math.sin(Snd.__t * 15) * 0.2 * B.luff;
  // haubans et étai
  ctx.strokeStyle = rgba(P.line, 0.28); ctx.lineWidth = HAIR;
  ctx.beginPath();
  ctx.moveTo(mastX, 0); ctx.lineTo(5.5, 0);
  for (const s of [1, -1]) { ctx.moveTo(mastX, 0); ctx.lineTo(-0.3, s * 2.6); }
  ctx.stroke();

  if (B.sailUp > 0.05) {
    const ex = mastX - Math.cos(ba) * bl, ey = Math.sin(ba) * bl;
    /* Normale à la corde mât→point d'écoute, retournée pour pointer DU CÔTÉ
       DE LA BÔME : la voile se creuse donc toujours sous le vent. Le terme
       longitudinal est amorti, sinon le creux part vers l'étrave.        */
    const sgn = Math.sign(ba) || Math.sign(B.side) || 1;
    const nx = sgn * Math.sin(ba) * 0.38, ny = sgn * Math.cos(ba);
    const belly = (0.55 + 1.05 * Math.min(1, B.twa / 110)) * B.sailUp * (1 - B.luff * 0.72);
    // bôme + écoute
    ctx.strokeStyle = rgbStr(P.mast); ctx.lineWidth = 0.28;
    ctx.beginPath(); ctx.moveTo(mastX, 0); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = line; ctx.lineWidth = THIN;
    ctx.beginPath(); ctx.moveTo(mastX, 0); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = rgba(P.line, 0.4); ctx.lineWidth = HAIR;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(-2.4, 0); ctx.stroke();
    // grand-voile
    sailPath(ctx, mastX, 0, ex, ey, nx, ny, belly, 1);
    ctx.fillStyle = rgbStr(P.sail); ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = LNW; ctx.stroke();
    ctx.save();
    sailPath(ctx, mastX, 0, ex, ey, nx, ny, belly, 1); ctx.clip();
    // le creux au vent reste dans l'ombre
    ctx.fillStyle = rgba(P.sailSh, 0.9);
    ctx.beginPath();
    ctx.moveTo(mastX, 0);
    ctx.quadraticCurveTo(((mastX + ex) / 2) + nx * belly * 1.2, (ey / 2) + ny * belly * 1.2, ex, ey);
    ctx.lineTo(mastX, 0); ctx.closePath(); ctx.fill();
    // lattes
    ctx.strokeStyle = rgba(P.line, 0.22); ctx.lineWidth = HAIR;
    for (let i = 1; i <= 4; i++) {
      const u = i / 5, mx = (mastX + ex) / 2, my = ey / 2;
      ctx.beginPath();
      ctx.moveTo(lerp(mastX, ex, u * 0.16), lerp(0, ey, u * 0.16));
      ctx.quadraticCurveTo(mx + nx * belly * 2.1 * u, my + ny * belly * 2.1 * u,
        lerp(mastX, ex, u), lerp(0, ey, u));
      ctx.stroke();
    }
    ctx.restore();
    // foc, creusé du même bord que la grand-voile
    const js = sgn;
    const jax = 5.4, jbx = 2.15, jby = js * 1.95 * B.sailUp;
    const jl = Math.hypot(jbx - jax, jby);
    let pnx = -jby / jl, pny = (jbx - jax) / jl;
    if (pny * js < 0) { pnx = -pnx; pny = -pny; }     // du côté du point d'écoute
    sailPath(ctx, jax, 0, jbx, jby, pnx * 0.38, pny,
      (0.45 + 0.7 * Math.min(1, B.twa / 110)) * B.sailUp * (1 - B.luff * 0.72), 1);
    ctx.fillStyle = rgbStr(mixRGB(P.sail, P.sailSh, 0.18)); ctx.fill();
    ctx.strokeStyle = line; ctx.lineWidth = LNW; ctx.stroke();
    ctx.strokeStyle = rgba(P.line, 0.35); ctx.lineWidth = HAIR;
    ctx.beginPath(); ctx.moveTo(jbx, jby); ctx.lineTo(-0.4, js * 1.9); ctx.stroke();
  }
  // pied de mât
  ctx.fillStyle = rgbStr(P.hullSh);
  ctx.beginPath(); ctx.arc(mastX, 0, 0.42, 0, TAU); ctx.fill();
  ctx.strokeStyle = soft; ctx.lineWidth = HAIR; ctx.stroke();
  ctx.fillStyle = rgbStr(P.mast);
  ctx.beginPath(); ctx.arc(mastX, 0, 0.28, 0, TAU); ctx.fill();
  ctx.strokeStyle = line; ctx.lineWidth = LNW; ctx.stroke();
  ctx.fillStyle = rgba(P.foam, 0.7);
  ctx.beginPath(); ctx.arc(mastX - 0.09, -0.09, 0.12, 0, TAU); ctx.fill();
  // penon de tête de mât : montre où va le vent
  const la = (L.windFrom + Math.PI) - B.h;
  const fx2 = mastX + Math.cos(-la) * 2.5, fy2 = Math.sin(-la) * 2.5;
  ctx.strokeStyle = rgba(P.line, 0.5); ctx.lineWidth = 2.2 / K;
  ctx.beginPath(); ctx.moveTo(mastX, 0); ctx.lineTo(fx2, fy2); ctx.stroke();
  ctx.strokeStyle = rgbStr(P.buoy); ctx.lineWidth = 1.5 / K;
  ctx.beginPath(); ctx.moveTo(mastX, 0); ctx.lineTo(fx2, fy2); ctx.stroke();
  ctx.fillStyle = rgbStr(P.buoy);
  ctx.beginPath(); ctx.arc(fx2, fy2, 0.26, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(P.line, 0.6); ctx.lineWidth = HAIR; ctx.stroke();

  // la mer recouvre la coque au fur et à mesure
  if (sink > 0.02) {
    ctx.fillStyle = rgba(P.ocean, 0.5 * sink);
    ctx.beginPath(); ctx.ellipse(-0.2, 0, 6.8, 4.3, 0, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // échouement : nuage de sable
  if (B.dead === "sable" && B.stuck > 0) {
    ctx.fillStyle = rgba(P.sand, 0.4 * (1 - B.stuck * 0.4));
    ctx.beginPath(); ctx.arc(px, py, 22 + B.stuck * 16, 0, TAU); ctx.fill();
  }
}

/* ---------------------- animation de naufrage -------------------------- */
function drawSinkEffect(t) {
  if (B.alive || B.dead === "sable" || B.dead === "nuit") return;
  const s = clamp(B.sinking, 0, 1), px = sX(B.x), py = sY(B.y);
  // le trou sombre que laisse la coque en descendant
  ctx.fillStyle = rgba(P.oceanDk, 0.4 * Math.min(1, s * 2.5) * (1 - s * 0.25));
  ctx.beginPath(); ctx.ellipse(px, py, 30 - s * 8, 23 - s * 6, 0, 0, TAU); ctx.fill();
  // tourbillon : quatre arcs d'écume qui tournent et se resserrent
  for (let i = 0; i < 4; i++) {
    const a0 = t * 2.3 + i / 4 * TAU;
    const r = (34 - s * 18) * (i % 2 ? 1 : 0.72);
    ctx.strokeStyle = rgba(P.foam, Math.max(0, 0.55 - s * 0.3) * (1 - i * 0.14));
    ctx.lineWidth = 2.6 - i * 0.45;
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.78, a0, a0, a0 + 1.8);
    ctx.stroke();
  }
  // anneaux qui s'écartent
  for (let k = 0; k < 3; k++) {
    const u = (s * 1.7 + k * 0.34) % 1;
    ctx.strokeStyle = rgba(P.foam, 0.42 * (1 - u) * (1 - s * 0.4));
    ctx.lineWidth = 1.7;
    const r = 14 + u * 50;
    ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.78, 0, 0, TAU); ctx.stroke();
  }
  // écume résiduelle une fois la coque disparue
  if (s > 0.75) {
    ctx.fillStyle = rgba(P.foam, 0.3 * (1 - (s - 0.75) / 0.25) + 0.08);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + t * 0.4;
      ctx.beginPath();
      ctx.arc(px + Math.cos(a) * 14, py + Math.sin(a) * 11, 4 + Math.sin(t * 3 + i) * 1.6, 0, TAU);
      ctx.fill();
    }
  }
}

/* --------------------------- particules -------------------------------- */
function drawParts() {
  for (const p of parts) {
    const a = 1 - p.t / p.life, px = sX(p.x), py = sY(p.y);
    if (p.kind === 0) {
      ctx.fillStyle = rgba(P.foam, 0.8 * a);
      ctx.beginPath(); ctx.arc(px, py, p.r * CFG.K * 0.55, 0, TAU); ctx.fill();
    } else if (p.kind === 1) {
      ctx.strokeStyle = rgba(P.foam, 0.5 * a); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(px, py, p.r * CFG.K, 0, TAU); ctx.stroke();
    } else if (p.kind === 3) {
      // fumée noire : ronde, gonfle et se dilue en s'estompant
      const r = p.r * CFG.K;
      ctx.fillStyle = rgba(P.line, 0.55 * a);
      ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    } else if (p.kind === 4) {
      // étincelle de surchauffe : point chaud orange-jaune
      ctx.fillStyle = rgba([255, 200, 90], 0.95 * a);
      ctx.beginPath(); ctx.arc(px, py, p.r * CFG.K, 0, TAU); ctx.fill();
    } else if (p.kind === 5) {
      // fumée grise de toussement : plus claire que la fumée noire
      ctx.fillStyle = rgba([150, 150, 158], 0.4 * a);
      ctx.beginPath(); ctx.arc(px, py, p.r * CFG.K, 0, TAU); ctx.fill();
    } else {
      ctx.save(); ctx.translate(px, py); ctx.rotate(p.a);
      ctx.fillStyle = rgba(P.hull, 0.9 * a);
      ctx.fillRect(-p.r * CFG.K * 0.6, -p.r * CFG.K * 0.25, p.r * CFG.K * 1.2, p.r * CFG.K * 0.5);
      ctx.strokeStyle = rgba(P.line, 0.6 * a); ctx.lineWidth = 1;
      ctx.strokeRect(-p.r * CFG.K * 0.6, -p.r * CFG.K * 0.25, p.r * CFG.K * 1.2, p.r * CFG.K * 0.5);
      ctx.restore();
    }
  }
}

/* ------------------------ lumière du moment ---------------------------- */
function applyLight() {
  const s = SUN, nt = nightAmount();
  if (s.mul[0] < 253 || s.mul[1] < 253 || s.mul[2] < 253) {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = rgbStr(s.mul); ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }
  if (s.va > 0.003) { ctx.fillStyle = rgba(s.veil, s.va); ctx.fillRect(0, 0, W, H); }

  /* la nuit : on perd les couleurs… */
  if (nt > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = "saturation";
    ctx.globalAlpha = 0.82 * nt;
    ctx.fillStyle = "rgb(128,128,128)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  /* …et la vue ne porte plus qu'autour du bateau. La nuit, l'obscurité
     vient très près : seul le cockpit (halo chaud, dessiné après) et le
     projecteur avant percent le noir. */
  if (nt > 0.01) {
    const px = sX(B.x), py = sY(B.y);
    const r0 = lerp(95, 4, nt), r1 = lerp(260, 12, nt);
    const g = ctx.createRadialGradient(px, py, r0, px, py, r1);
    g.addColorStop(0, "rgba(5,11,30,0)");
    g.addColorStop(0.5, "rgba(4,8,24," + (0.84 * nt) + ")");
    g.addColorStop(1, "rgba(2,5,16," + (1.0 * nt) + ")");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  } else if (L.sun > 0.5) {
    const v = (L.sun - 0.5) / 0.3;
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(8,12,38," + (0.42 * v) + ")");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

/* ---- feux de navigation : dessinés APRÈS la lumière, donc épargnés ---- */
function drawNavLights() {
  const nt = nightAmount();
  if (nt < 0.12 || !B.alive) return;
  const a = nt * (1 - B.sinking);
  ctx.save();
  ctx.translate(sX(B.x), sY(B.y));
  ctx.rotate(-B.h);
  ctx.scale(CFG.K, CFG.K);
  // halo chaud du cockpit : composite 'lighter' pour percer le noir
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const hg = ctx.createRadialGradient(0, 0, 1, 0, 0, 13);
  hg.addColorStop(0, "rgba(255,216,146," + (0.26 * a) + ")");
  hg.addColorStop(1, "rgba(255,216,146,0)");
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
  ctx.restore();
  const lamp = (x, y, col, r) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.4);
    g.addColorStop(0, col.replace("A", 0.95 * a));
    g.addColorStop(0.32, col.replace("A", 0.42 * a));
    g.addColorStop(1, col.replace("A", 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = col.replace("A", 0.95 * a);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  };
  lamp(5.05, -0.8, "rgba(255,72,72,A)", 0.26);     // feu bâbord
  lamp(5.05, 0.8, "rgba(90,255,136,A)", 0.26);     // feu tribord
  lamp(-5.3, 0, "rgba(255,250,228,A)", 0.22);      // feu de poupe
  // carré éclairé
  ctx.fillStyle = "rgba(255,208,124," + (0.26 * a) + ")";
  rr(ctx, -1.85, -1.9, 3.8, 3.8, 0.7); ctx.fill();
  ctx.restore();
}

/* projecteur avant : redessine le décor (encore coloré sous le voile) dans
   un masque en cône vers l'avant, puis le désature à moitié pour
   révéler les vraies couleurs du terrain, atténuées. Tracé APRÈS
   applyLight (qui a désaturé/voilé l'écran) ; on repeint donc par-dessus
   le noir, en coordonnées écran. */
function drawSpotlight() {
  const nt = nightAmount();
  if (nt < 0.12 || !B.alive) return;
  const a = nt * (1 - B.sinking);
  const coneR = 44, coneHalf = 0.40, bowD = 5.6;
  // origine du cône = proue du bateau, en coords écran.
  const ox = sX(B.x + Math.cos(B.h) * bowD), oy = sY(B.y + Math.sin(B.h) * bowD);
  const dir = -B.h;                       // vers l'avant à l'écran (y inversé)
  const fx = Math.cos(dir), fy = Math.sin(dir);
  const nx = -fy, ny = fx;
  const R = coneR * CFG.K;
  const half = R * coneHalf;
  // bout du cône arrondi : arc de cercle de rayon `half` entre les deux
  // coins, au lieu d'un segment plat.
  const tipX = ox + fx * R, tipY = oy + fy * R;
  const p1x = tipX + nx * half, p1y = tipY + ny * half;
  const p2x = tipX - nx * half, p2y = tipY - ny * half;
  // angle des deux coins vus depuis le bout (pour l'arc) :
  const a1 = Math.atan2(p1y - tipY, p1x - tipX);
  const a2 = Math.atan2(p2y - tipY, p2x - tipX);
  // chemin du cône à bout rond (en pixels) pour servir de masque.
  const conePath = () => {
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(p1x, p1y);
    ctx.arc(tipX, tipY, half, a1, a2, false);
    ctx.closePath();
  };
  ctx.save();
  conePath(); ctx.clip();
  ctx.fillStyle = "rgb(2,5,16)"; ctx.fillRect(0, 0, W, H);
  blit(TER.water, 0, 0); blit(TER.shade, 4, 5); blit(TER.land, 0, 0);
  // désaturation modérée du décor ainsi révélé : mi-chemin entre la nuit
  // (0.82) et le plein jour (0). Reste des couleurs mais atténuées.
  ctx.globalCompositeOperation = "saturation";
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.globalAlpha = 0.45 * nt;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  // léger voile gris qui atténue la luminosité du cône (rend la lumière
  // moins crue, plus diffuse).
  ctx.fillStyle = "rgba(60,68,80," + (0.30 * nt) + ")";
  ctx.fillRect(0, 0, W, H);
  // fondu vers le transparent sur les flancs et le bout : dégradé radial
  // centré sur l'origine, transparent hors du cône, plein au centre.
  ctx.globalCompositeOperation = "destination-in";
  const fg = ctx.createRadialGradient(ox, oy, R * 0.15, ox, oy, R);
  fg.addColorStop(0, "rgba(0,0,0,1)");
  fg.addColorStop(0.7, "rgba(0,0,0,0.92)");
  fg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
  // légère lueur blanche additionnelle au cône pour le faire "briller".
  ctx.save();
  conePath(); ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  const cg = ctx.createLinearGradient(ox, oy, tipX, tipY);
  cg.addColorStop(0, "rgba(255,255,250," + (0.08 * a) + ")");
  cg.addColorStop(1, "rgba(255,255,250,0)");
  ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* ----------------------------- oiseau en survol ------------------------
   Une frégate traverse le ciel de temps en temps : décor pur, aucune
   interaction. Elle vole au-dessus de tout, donc dessinée en dernier.  */
let bird = { active: false, x: 0, y: 0, vx: 0, sc: 1, ph: 0, next: 8 };
function updateBird(dt) {
  if (!bird.active) {
    bird.next -= dt;
    if (bird.next <= 0) {
      bird.active = true;
      const fromLeft = Math.random() < 0.5;
      bird.x = fromLeft ? -40 : W + 40;
      bird.vx = (fromLeft ? 1 : -1) * (60 + Math.random() * 40);
      bird.y = 30 + Math.random() * (H * 0.32);
      bird.sc = 0.8 + Math.random() * 0.5;
      bird.ph = 0;
    }
    return;
  }
  bird.x += bird.vx * dt;
  bird.ph += dt * 6;
  if (bird.x < -60 || bird.x > W + 60) {
    bird.active = false;
    bird.next = 12 + Math.random() * 22;
  }
}
/* ====================== pêcheurs : barques locales ====================== */
/* Petite pirogue de pêche locale qui erre dans le lagon (niveaux 3-5).
   Au choc elle coule : animation de naufrage, puis le pêcheur dérive sur
   une bouée orange (même dérive que le catamaran). La nuit, les barques
   rentrent au rivage et s'échouent.                                  */
function drawFishers(t) {
  if (!L.fishers) return;
  for (const f of L.fishers) {
    if (!onScreen(f.x, f.y, 60)) continue;
    const px = sX(f.x), py = sY(f.y);
    if (f.sunken > 0) {
      const sk = f.sunken;
      // la barque s'enfonce, penche et s'efface (pas de halo sombre)
      if (sk < 0.95) {
        ctx.save(); ctx.translate(px, py); ctx.rotate(-f.h + sk * 0.5);
        ctx.scale(CFG.K * (1 - sk * 0.42), CFG.K * (1 - sk * 0.42));
        ctx.globalAlpha = 1 - sk * 0.85;
        ctx.fillStyle = "rgba(120,82,52,0.95)";
        ctx.strokeStyle = rgba(P.line, 0.8); ctx.lineWidth = 0.18;
        ctx.beginPath(); ctx.moveTo(3.0, 0); ctx.quadraticCurveTo(2.0, 0.92, -1.0, 0.98);
        ctx.quadraticCurveTo(-2.7, 0.9, -3.0, 0); ctx.quadraticCurveTo(-2.7, -0.9, -1.0, -0.98);
        ctx.quadraticCurveTo(2.0, -0.92, 3.0, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      // une fois la barque disparue : le pecheur flotte, bras agites, bouee orange opaque
      if (sk > 0.6) {
        const aa = (sk - 0.6) / 0.4;       // apparition progressive du pecheur
        const wave = Math.sin(t * 11) * 0.5; // bras qui s'agitent vite
        ctx.save(); ctx.translate(px, py);
        ctx.globalAlpha = aa;
        // bouee ronde rayee rouge et blanche : 4 quartiers verticaux
        // (rouge | blanc | rouge | blanc), sans interstice -> pas de bleu qui passe.
        ctx.save();
        ctx.beginPath(); ctx.ellipse(0, 0, 5.6, 4.7, 0, 0, TAU); ctx.clip();
        const BW = 2.8;   // largeur d'un quartier (5.6 / 4)
        ctx.fillStyle = "rgb(214,40,40)";   ctx.fillRect(-5.6, -4.7, BW, 9.4);
        ctx.fillStyle = "rgb(255,255,255)"; ctx.fillRect(-2.8, -4.7, BW, 9.4);
        ctx.fillStyle = "rgb(214,40,40)";   ctx.fillRect(0.0, -4.7, BW, 9.4);
        ctx.fillStyle = "rgb(255,255,255)"; ctx.fillRect(2.8, -4.7, BW, 9.4);
        ctx.restore();
        // contour fonce de la bouee
        ctx.strokeStyle = rgba(P.line, 0.85); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(0, 0, 5.6, 4.7, 0, 0, TAU); ctx.stroke();
        // pecheur agrippe a la bouee : tete plus grande (proportionnelle)
        ctx.fillStyle = "rgba(70,50,36,0.96)";
        ctx.beginPath(); ctx.arc(0, -2.4, 1.55, 0, TAU); ctx.fill();
        // chapeau de paille (meme couleur que sur la barque), plus grand
        ctx.fillStyle = "rgba(238,214,138,0.97)";
        ctx.strokeStyle = rgba(P.line, 0.55); ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.ellipse(0, -2.5, 2.8, 2.45, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(196,168,104,0.9)";   // calotte (meme que barque)
        ctx.beginPath(); ctx.ellipse(0, -2.5, 1.5, 1.3, 0, 0, TAU); ctx.fill();
        // deux bras plus longs qui s'agitent de haut en bas (haut/bas = -y/+y)
        ctx.strokeStyle = "rgba(70,50,36,0.96)"; ctx.lineWidth = 1.7; ctx.lineCap = "round";
        for (const s2 of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s2 * 1.4, -0.9);
          ctx.lineTo(s2 * 3.6, -0.9 + wave * 3.0);
          ctx.stroke();
        }
        ctx.lineCap = "butt";
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      continue;
    }
    // sillage en ligne derriere la barque (meme style que le catamaran), avec
    // fondu par point (tp.a decroit dans updateFishers) : segments relies du
    // plus recent (pleine opacite) vers le plus ancien (quasi transparent).
    if (f.trail && f.trail.length > 1) {
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const pass of [{ w: 3.2, b: 0.22 }, { w: 1.4, b: 0.5 }]) {
        for (let i = 0; i < f.trail.length - 1; i++) {
          const a = f.trail[i], b = f.trail[i + 1];
          const am = (a.a + b.a) * 0.5;
          if (am <= 0.01) continue;
          const x0 = a.x - Math.cos(a.h) * 4.9, y0 = a.y - Math.sin(a.h) * 4.9;
          const x1 = b.x - Math.cos(b.h) * 4.9, y1 = b.y - Math.sin(b.h) * 4.9;
          ctx.beginPath();
          ctx.moveTo(sX(x0), sY(y0)); ctx.lineTo(sX(x1), sY(y1));
          ctx.strokeStyle = rgba(P.foam, am * pass.b); ctx.lineWidth = pass.w;
          ctx.stroke();
        }
      }
      ctx.lineCap = "butt"; ctx.lineJoin = "miter";
    }
    // ombre portee legere (barque agrandie)
    ctx.save(); ctx.translate(px + 2, py + 3); ctx.rotate(-f.h); ctx.scale(CFG.K, CFG.K);
    ctx.fillStyle = rgba(P.line, 0.16);
    ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 1.45, 0, 0, TAU); ctx.fill();
    ctx.restore();
    // barque de peche : pirogue effilee, bois clair, lisele fonce, cap = avant (+x)
    ctx.save();
    ctx.translate(px, py); ctx.rotate(-f.h); ctx.scale(CFG.K, CFG.K);
    ctx.scale(1.45, 1.45);                // agrandissement de la barque
    ctx.lineJoin = "round";
    ctx.strokeStyle = rgba(P.line, 0.8); ctx.lineWidth = 0.12;
    ctx.fillStyle = "rgba(150,104,66,0.95)";
    ctx.beginPath();
    ctx.moveTo(3.2, 0);
    ctx.quadraticCurveTo(2.2, 1.0, -1.0, 1.02);
    ctx.quadraticCurveTo(-2.7, 0.92, -3.0, 0);
    ctx.quadraticCurveTo(-2.7, -0.92, -1.0, -1.02);
    ctx.quadraticCurveTo(2.2, -1.0, 3.2, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // pont plus clair
    ctx.fillStyle = "rgba(186,140,96,0.9)";
    ctx.beginPath(); ctx.ellipse(-0.2, 0, 2.1, 0.7, 0, 0, TAU); ctx.fill();
    // petit moteur hors-bord a l'arriere (poupe = -x)
    ctx.fillStyle = "rgba(40,40,44,0.95)";
    ctx.strokeStyle = rgba(P.line, 0.6); ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.rect(-3.3, -0.34, 0.6, 0.68); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(70,70,76,0.95)";
    ctx.beginPath(); ctx.rect(-3.1, -0.18, 0.32, 0.36); ctx.fill();
    // helice / remous arriere
    ctx.strokeStyle = rgba(P.foam, 0.4); ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.arc(-3.5, 0, 0.34, 0, TAU); ctx.stroke();
    // le pecheur : assis a l'arriere, pres du moteur (poupe = -x)
    ctx.fillStyle = "rgba(50,38,30,0.95)";
    ctx.beginPath(); ctx.arc(-1.5, 0.45, 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(238,214,138,0.97)";   // chapeau de paille
    ctx.strokeStyle = rgba(P.line, 0.55); ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.ellipse(-1.5, 0.43, 0.78, 0.68, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(196,168,104,0.9)";   // calotte du chapeau
    ctx.beginPath(); ctx.ellipse(-1.5, 0.43, 0.42, 0.36, 0, 0, TAU); ctx.fill();
    // canne a peche : perpendiculaire au bateau (vers tribord = +y), tenue a la main,
    // depassant du flanc, avec un bout de ligne pendant dans l'eau.
    ctx.strokeStyle = "rgba(54,36,22,0.96)"; ctx.lineWidth = 0.07; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-1.5, 1.0); ctx.lineTo(-1.5, 2.4); ctx.stroke();
    ctx.strokeStyle = "rgba(236,232,210,0.9)"; ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.moveTo(-1.5, 2.4); ctx.lineTo(-1.4, 3.2); ctx.stroke();
    ctx.lineCap = "butt";
    ctx.restore();
  }
}

function drawBird(t) {
  if (!bird.active) return;
  // Un oiseau bat des ailes de haut en bas. Vu de dessus, ce battement
  // se lit à l'envergure apparente : grande quand les ailes sont à plat,
  // quasi nulle quand elles montent ou descendent (vues par la tranche).
  // Deux pulsations par cycle (plat-tranche-plat-tranche), d'où |cos|.
  const fl = 14 * (0.18 + 0.82 * Math.abs(Math.cos(bird.ph)));  // demi-envergure en px
  const dir = bird.vx > 0 ? 1 : -1;
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(dir < 0 ? Math.PI : 0);     // orienté dans le sens du vol (avant = +x)
  ctx.scale(bird.sc, bird.sc);
  // ombre portée lointaine sur l'eau, décalée vers le bas
  ctx.fillStyle = "rgba(14,43,58,0.12)";
  ctx.beginPath(); ctx.ellipse(0, 10, 9 + fl, 3, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(10,30,42,0.9)"; ctx.lineWidth = 1.3;
  ctx.lineJoin = "round";
  // ailes : deux formes symétriques perpendiculaires au vol, envergure = fl
  ctx.fillStyle = "rgba(28,40,52,0.92)";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(1, s * 1);
    ctx.quadraticCurveTo(-1, s * fl, -4, s * fl * 0.95);
    ctx.quadraticCurveTo(-6, s * fl * 0.55, -3, s * 1.2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  // corps vu de dessus : ellipse allongée dans le sens du vol
  ctx.fillStyle = "rgba(28,40,52,0.96)";
  ctx.beginPath(); ctx.ellipse(0, 0, 7, 2.6, 0, 0, TAU); ctx.fill();
  ctx.stroke();
  // tête + bec vers l'avant
  ctx.beginPath(); ctx.arc(6, 0, 2.4, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(10.5, 0); ctx.stroke();
  // queue en éventail à l'arrière
  ctx.fillStyle = "rgba(28,40,52,0.88)";
  ctx.beginPath();
  ctx.moveTo(-6, 0); ctx.lineTo(-10, -2.6); ctx.lineTo(-10, 2.6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawCrabs(t) {
  if (!L.crabs || !L.crabs.length) return;
  for (const c of L.crabs) {
    if (!onScreen(c.x, c.y, 30)) continue;
    // cycle : aller droite / pause / aller gauche / pause.
    const cyc = (t * c.spd + c.ph) % 1;
    let dx, pausing, face;
    if (cyc < 0.20) {
      const u = cyc / 0.20; dx = c.amp * (2 * u - 1); pausing = false; face = 1;
    } else if (cyc < 0.50) {
      dx = c.amp; pausing = true; face = 1;
    } else if (cyc < 0.70) {
      const u = (cyc - 0.50) / 0.20; dx = c.amp * (1 - 2 * u); pausing = false; face = -1;
    } else {
      dx = -c.amp; pausing = true; face = -1;
    }
    const px = sX(c.x + dx), py = sY(c.y);
    // ouverture des pinces : clac-clac pendant les pauses
    const claw = pausing ? 0.35 + 0.65 * Math.abs(Math.sin(t * 5 + c.ph)) : 0.5;
    ctx.save();
    ctx.translate(px, py);
    const sc = 1.6 * CFG.K;
    ctx.scale(sc, sc);
    ctx.strokeStyle = rgba(P.line, 0.8); ctx.lineWidth = 0.5 / 1.6; ctx.lineJoin = "round";
    // carapace
    ctx.fillStyle = "rgba(214,96,72,0.96)";
    ctx.beginPath(); ctx.ellipse(0, 0, 0.45, 0.38, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // six pattes en éventail
    ctx.lineWidth = 0.18 / 1.6;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI + (k / 5 - 0.5) * 2.4;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 0.8, Math.sin(a) * 0.8);
    }
    ctx.stroke();
    // deux pinces à l'avant, ouverture = claw
    ctx.fillStyle = "rgba(214,96,72,0.96)";
    for (const sd of [-1, 1]) {
      const cx = face * 0.35, cy = sd * 0.35;
      const op = 0.12 + claw * 0.22;
      ctx.beginPath(); ctx.ellipse(cx, cy, 0.16, 0.11, sd * 0.5, 0, TAU); ctx.fill(); ctx.stroke();
      // pince : deux mandibules qui s'écartent
      ctx.lineWidth = 0.16 / 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + face * (0.14 + op), cy + sd * op);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + face * (0.14 + op), cy - sd * op);
      ctx.stroke();
      ctx.lineWidth = 0.5 / 1.6;
    }
    ctx.restore();
  }
}

/* --------------------------- averses tropicales -------------------------
   Une bande de pluie traverse le lagon dans l'axe du vent : voile gris,
   rides accrues, visibilité réduite. Purement cosmétique, pas de danger. */
let rain = { active: false, x: 0, next: 40, alpha: 0 };
function updateRain(dt) {
  // la bande se deplace lateralement (selon l'axe X, largeur du lagon) dans
  // le sens du vent : voile vertical circulant gauche->droite ou inverse.
  const vx = -Math.cos(L.windFrom) * (8 + L.windPow * 0.6);
  if (!rain.active) {
    rain.next -= dt;
    if (rain.next <= 0) {
      rain.active = true;
      rain.x = vx > 0 ? L.bx0 - 30 : L.bx1 + 30;
      rain.alpha = 0;
    }
    return;
  }
  rain.x += vx * dt;
  const dxB = Math.abs(rain.x - L.bx0), dxE = Math.abs(rain.x - L.bx1);
  const near = Math.min(dxB, dxE);
  rain.alpha = Math.min(1, rain.alpha + dt * 1.5);
  if (near < 30) rain.alpha = Math.max(0, near / 30);
  if (rain.x < L.bx0 - 40 || rain.x > L.bx1 + 40) {
    rain.active = false;
    rain.next = 35 + Math.random() * 45;
    rain.alpha = 0;
  }
}
function drawRain(t) {
  if (!rain.active || rain.alpha <= 0.01) return;
  const px = sX(rain.x), bw = W * 0.30, left = px - bw / 2;
  const a = rain.alpha;
  // voile gris vertical qui assombrit l'eau sous l'averse
  const g = ctx.createLinearGradient(left, 0, left + bw, 0);
  g.addColorStop(0, "rgba(40,52,66,0)");
  g.addColorStop(0.5, "rgba(40,52,66," + (0.34 * a) + ")");
  g.addColorStop(1, "rgba(40,52,66,0)");
  ctx.fillStyle = g; ctx.fillRect(left, 0, bw, H);
  // gouttes de pluie : tombent du haut vers le bas dans la bande verticale,
  // avec une legere derive horizontale due au vent.
  ctx.strokeStyle = "rgba(190,212,228," + (0.32 * a) + ")";
  ctx.lineWidth = 1; ctx.beginPath();
  const drift = -Math.cos(L.windFrom) * 1.6;
  for (let i = 0; i < 70; i++) {
    const x = left + ((i * 53) % bw), y = (i * 37 + t * 220) % H;
    ctx.moveTo(x, y); ctx.lineTo(x + drift, y + 7);
  }
  ctx.stroke();
}

/* --------------------------- image complète ---------------------------- */
function drawWorld(t) {
  ctx.fillStyle = rgbStr(P.oceanDk); ctx.fillRect(0, 0, W, H);
  blit(TER.water, 0, 0);
  drawCaustics(t);
  drawCurrents(t);
  drawWindRipples(t);
  drawSparkles(t);
  drawFauna(t);
  drawCrabs(t);
  blit(TER.shade, 4, 5);
  blit(TER.land, 0, 0);
  drawShoreFoam(t);
  drawReefFoam(t);
  drawCoralFoam(t);
  drawAnchorage(t);
  drawWake();
  drawSinkEffect(t);
  drawFishers(t);
  drawBoat(t);
  drawParts();
  applyLight();
  drawSpotlight();
  drawNavLights();
  drawBird(t);
  drawRain(t);
  // coup au but : l'écran encaisse
  if (B.hitFlash > 0) {
    ctx.fillStyle = "rgba(255,96,74," + (0.34 * B.hitFlash) + ")";
    ctx.fillRect(0, 0, W, H);
  }
}
