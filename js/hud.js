"use strict";
/* ==========================================================================
   POE NINA — interface et écrans
   ========================================================================== */

const UI = {
  ink: "rgb(232,246,250)",
  dim: "rgba(190,222,232,0.78)",
  gold: "rgb(255,201,74)",
  mint: "rgb(150,240,215)",
  warn: "rgb(255,150,130)"
};

function txt(s, x, y, size, col, align, weight) {
  ctx.font = (weight || "bold") + " " + size + "px 'Courier New',monospace";
  ctx.textAlign = align || "left"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function tw(s, size, weight) {
  ctx.font = (weight || "bold") + " " + size + "px 'Courier New',monospace";
  return ctx.measureText(s).width;
}
function panel(x, y, w, h, a) {
  ctx.fillStyle = "rgba(11,38,54," + (a === undefined ? 0.82 : a) + ")";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(6,22,32,0.95)"; ctx.lineWidth = 2;
  ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
  ctx.strokeStyle = "rgba(140,208,224,0.45)"; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function bar(x, y, w, h, v, col, warn) {
  ctx.fillStyle = "rgba(4,18,26,0.8)"; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * clamp(v, 0, 1)), h - 2);
  ctx.strokeStyle = warn ? "rgba(255,150,130,0.95)" : "rgba(160,214,228,0.55)";
  ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/* ------------------------------ soleil --------------------------------- */
function drawSunGauge(x, y, w) {
  const s = clamp(L.sun, 0, 1);
  panel(x, y, w, 23);
  txt(L.night ? "NAVIGATION DE NUIT"
    : s > 0.97 ? "NUIT NOIRE" : s > 0.88 ? "NUIT PROCHE" : s > 0.74 ? "CRÉPUSCULE"
      : s > 0.56 ? "SOIR" : "PLEIN JOUR",
    x + 5, y + 10, 7, s > 0.88 ? UI.warn : UI.dim);
  const bx = x + 5, by = y + 13, bw = w - 10, bh = 7;
  for (let i = 0; i < bw; i += 2) {
    const c = sunParams(i / bw).sky;
    ctx.fillStyle = rgbStr(c); ctx.fillRect(bx + i, by, 2, bh);
  }
  ctx.strokeStyle = "rgba(6,22,32,0.9)"; ctx.lineWidth = 1;
  ctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
  const px = bx + s * bw;
  ctx.fillStyle = "rgb(255,246,208)";
  ctx.beginPath(); ctx.arc(px, by + bh / 2, 3.4, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(6,22,32,0.9)"; ctx.beginPath(); ctx.arc(px, by + bh / 2, 3.4, 0, TAU); ctx.stroke();
  if (!L.night) txt(Math.max(0, Math.round((1 - s) * L.dayLength)) + "s", x + w - 5, y + 10, 7,
    s > 0.8 ? UI.warn : UI.ink, "right");
}

/* --------------------------- rose des vents ---------------------------- */
function drawWindRose(cx, cy, r) {
  panel(cx - r - 7, cy - r - 15, (r + 7) * 2, (r + 7) * 2 + 36);
  txt("VENT " + Math.round(L.windKn) + " KT", cx, cy - r - 4, 7, UI.dim, "center");
  const wa = L.windFrom;
  // secteur mort : plein écran de 55° de part et d'autre du vent
  ctx.fillStyle = "rgba(255,110,100,0.2)";
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, -wa - 55 * D2R, -wa + 55 * D2R); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(255,130,110,0.5)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r, -wa - 55 * D2R, -wa + 55 * D2R); ctx.stroke();
  ctx.strokeStyle = "rgba(160,214,228,0.4)";
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    ctx.strokeStyle = "rgba(160,214,228,0.3)";
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke();
  }
  // flèche du vent (il vient de là et souffle vers le centre)
  const ax = cx + Math.cos(-wa) * r, ay = cy + Math.sin(-wa) * r;
  ctx.strokeStyle = UI.gold; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ax, ay);
  ctx.lineTo(cx + Math.cos(-wa) * 6, cy + Math.sin(-wa) * 6); ctx.stroke();
  ctx.fillStyle = UI.gold;
  const ta = -wa + Math.PI;
  const hx = cx + Math.cos(ta) * -5, hy = cy + Math.sin(ta) * -5;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + Math.cos(ta + 2.5) * 6, hy + Math.sin(ta + 2.5) * 6);
  ctx.lineTo(hx + Math.cos(ta - 2.5) * 6, hy + Math.sin(ta - 2.5) * 6);
  ctx.closePath(); ctx.fill();
  // cap du bateau
  const bh = -B.h;
  ctx.strokeStyle = UI.mint; ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(bh) * r * 0.6, cy - Math.sin(bh) * r * 0.6);
  ctx.lineTo(cx + Math.cos(bh) * r * 0.88, cy + Math.sin(bh) * r * 0.88); ctx.stroke();
  ctx.fillStyle = UI.mint;
  ctx.beginPath(); ctx.arc(cx + Math.cos(bh) * r * 0.88, cy + Math.sin(bh) * r * 0.88, 2.4, 0, TAU); ctx.fill();
  // route fond : vitesse sur le sol (vitesse eau + courant + dérive vent
  // atténuée par l'erre), telle qu'elle est réellement appliquée au bateau.
  const gvx = B.gvx, gvy = B.gvy;
  if (Math.hypot(gvx, gvy) > 0.25) {
    const ga = -Math.atan2(gvy, gvx);
    ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ga) * r * 0.92, cy + Math.sin(ga) * r * 0.92); ctx.stroke();
    ctx.setLineDash([]);
  }
  const a = B.twa;
  txt(Math.round(a) + "°", cx, cy + r + 10, 9, a < 55 ? UI.warn : UI.mint, "center");
  txt(a < 55 ? "VENT DEBOUT" : a < 75 ? "AU PRÈS" : a < 110 ? "AU TRAVERS" : a < 150 ? "AU LARGUE" : "VENT ARR.",
    cx, cy + r + 20, 7, a < 55 ? UI.warn : UI.dim, "center");
}

/* ------------------------------ minimap -------------------------------- */
function drawMinimap(x, y, w, h) {
  panel(x, y, w, h);
  const ox = x + 3, oy = y + 3, iw = w - 6, ih = h - 6;
  const mx = wy => ox + clamp(wy / L.len, -0.04, 1.04) * iw;
  const lo = -12, hi = L.width + 26;
  const my = wx => oy + clamp((wx - lo) / (hi - lo), 0, 1) * ih;
  ctx.save();
  ctx.beginPath(); ctx.rect(ox, oy, iw, ih); ctx.clip();
  ctx.fillStyle = "rgba(38,128,168,0.5)"; ctx.fillRect(ox, oy, iw, ih);
  // plage
  ctx.fillStyle = "rgba(246,230,174,0.85)";
  ctx.beginPath(); ctx.moveTo(ox, oy);
  for (let yy = 0; yy <= L.len; yy += 10) ctx.lineTo(mx(yy), my(L.shoreX(yy)));
  ctx.lineTo(ox + iw, oy); ctx.closePath(); ctx.fill();
  // barrière
  ctx.strokeStyle = "rgba(255,160,132,0.95)"; ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let yy = 0; yy <= L.len; yy += 10) { const p = mx(yy), q = my(L.reefX(yy)); yy ? ctx.lineTo(p, q) : ctx.moveTo(p, q); }
  ctx.stroke();
  // patates
  for (const p of L.pat) {
    ctx.fillStyle = p.emerg ? "rgba(255,148,124,0.95)" : "rgba(240,186,160,0.7)";
    ctx.beginPath();
    ctx.ellipse(mx(p.y), my(p.x), Math.max(1, p.r / L.len * iw), Math.max(1, p.r / (hi - lo) * ih), 0, 0, TAU);
    ctx.fill();
  }
  // trace
  ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < L.trail.length; i += 2) {
    const p = L.trail[i]; i ? ctx.lineTo(mx(p.y), my(p.x)) : ctx.moveTo(mx(p.y), my(p.x));
  }
  ctx.stroke();
  // mouillage
  ctx.strokeStyle = UI.gold; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(mx(L.anch.y), my(L.anch.x), 3.2, 0, TAU); ctx.stroke();
  // bateau
  const bx = mx(B.y), by = my(B.x);
  ctx.strokeStyle = UI.mint; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(bx, by);
  ctx.lineTo(bx + Math.sin(B.h) * 7, by + Math.cos(B.h) * 7); ctx.stroke();
  ctx.fillStyle = UI.mint;
  ctx.beginPath(); ctx.arc(bx, by, 2.4, 0, TAU); ctx.fill();
  ctx.restore();
}

/* -------------------------------- HUD ---------------------------------- */
function drawHUD(t) {
  const pad = 6, lw = 104;
  panel(pad, pad, lw, 16);
  txt("NIVEAU " + L.n + " / " + CFG.MAXLEVEL, pad + 6, pad + 12, 9, UI.ink);
  drawSunGauge(pad, pad + 20, lw);

  const slot = W - (pad + lw + 8) - 84;            // place libre entre les deux flancs
  const mw = clamp(slot, 110, 250);
  const mx = clamp(W / 2 - mw / 2, pad + lw + 8, W - 80 - mw);
  drawMinimap(mx, pad, mw, 36);
  const rem = Math.round(Math.hypot(L.anch.x - B.x, L.anch.y - B.y));
  txt("MOUILLAGE À " + rem + " M", mx + mw / 2, pad + 50, 8, UI.ink, "center");

  drawWindRose(W - 42, 50, 26);

   /* --- bas gauche : vitesse surface (principale), vitesse fond, gaz --- */
  const by = H - 58, bw = 112;
  panel(pad, by, bw, 52);
  txt("VITESSE SUR L'EAU", pad + 7, by + 11, 7, UI.dim);
  // sous ancre : le bateau est fixé au fond. L'eau (courant + dérive vent)
  // s'écoule sur la coque immobile : la vitesse eau vaut le flux, la
  // vitesse fond est nulle. Sinon : vitesse propre (erre).
  const waterSp = B.anchored
    ? Math.hypot(B.cx + B.lx, B.cy + B.ly) * KN
    : Math.hypot(B.vx, B.vy) * KN;
  txt(waterSp.toFixed(1), pad + 7, by + 27, 19, UI.mint);
  txt("KT", pad + 9 + tw(waterSp.toFixed(1), 19), by + 27, 8, UI.dim);
  // vitesse fond : nulle sous ancre (fixé au fond) ; sinon surface + courant
  const groundSp = B.anchored ? 0
    : Math.hypot(B.vx + B.cx + B.lx, B.vy + B.cy + B.ly) * KN;
  txt("fond " + groundSp.toFixed(1) + " kt",
    pad + 7, by + 38, 7, UI.dim);
  txt("GAZ", pad + 7, by + 48, 7, UI.dim);
  bar(pad + 30, by + 42, bw - 38, 6, (B.thr + 0.4) / 1.4, "rgb(122,208,236)");
  const hoisting = B.sailUp > 0.02 && B.sailUp < 0.98;
  const st = B.engineDead > 0 ? "MOTEUR EN PANNE"
    : B.starting > 0 ? "DÉMARRAGE…"
      : !B.engineOn ? (B.sailUp > 0.5 ? "MOTEUR COUPÉ — À LA VOILE" : "MOTEUR COUPÉ")
        : B.sputter > 0 ? "LE MOTEUR TOUSSE"
          : B.temp > 0.88 ? "MOTEUR EN SURCHAUFFE"
            : B.temp > 0.7 ? "MOTEUR CHAUD"
              : (B.sailUp > 0.5 ? "MOTEUR + VOILE" : "AU MOTEUR");
  txt(st + (hoisting ? "  (voile " + Math.round(B.sailUp * 100) + " %)" : ""),
    pad + 2, by - 6, 8, (B.engineDead > 0 || B.temp > 0.7) ? UI.warn : UI.dim);

  /* --- sondeur --- */
  const dx = pad + bw + 8, dw = 92;
  panel(dx, by, dw, 52);
  txt("SOUS QUILLE", dx + 6, by + 12, 7, UI.dim);
  const cl = clamp(B.clearance / 5, 0, 1);
  const col = B.clearance < CFG.SCRAPE ? "rgb(248,110,98)" : B.clearance < 1.6 ? "rgb(248,200,104)" : "rgb(126,224,180)";
  txt((B.clearance > 8 ? "> 8.0" : B.clearance.toFixed(1)) + " M", dx + 6, by + 32, 15, col);
  bar(dx + 6, by + 38, dw - 12, 7, cl, col, B.clearance < CFG.SCRAPE);
  txt("tirant d'eau 1.15 m", dx + 6, by + 50, 6, UI.dim);

  /* --- état de la coque : trois chances --- */
  const hxp = dx + dw + 8, hwp = 64;
  panel(hxp, by, hwp, 52);
  txt("COQUE", hxp + 6, by + 12, 7, B.hull < 2 ? UI.warn : UI.dim);
  for (let i = 0; i < HULL_MAX; i++) {
    const ix = hxp + 11 + i * 19, iy = by + 28, ok = i < B.hull;
    // petite silhouette de catamaran vue de dessus
    ctx.fillStyle = ok ? "rgb(250,246,236)" : "rgba(120,60,60,0.5)";
    ctx.strokeStyle = ok ? "rgba(6,22,32,0.9)" : "rgba(248,110,98,0.85)";
    ctx.lineWidth = 1;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(ix + s * 3.2, iy, 2.1, 6, 0, 0, TAU);
      ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = ok ? "rgb(240,142,120)" : "rgba(120,60,60,0.5)";
    ctx.fillRect(ix - 3, iy + 1, 6, 4);
    ctx.strokeRect(ix - 3.5, iy + 0.5, 7, 5);
    if (!ok) {
      ctx.strokeStyle = "rgba(248,110,98,0.95)"; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ix - 6, iy - 6); ctx.lineTo(ix + 6, iy + 6);
      ctx.moveTo(ix + 6, iy - 6); ctx.lineTo(ix - 6, iy + 6);
      ctx.stroke();
    }
  }
  txt(B.hull > 1 ? B.hull + " chances" : "dernière !", hxp + 6, by + 48, 6,
    B.hull < 2 ? UI.warn : UI.dim);

  /* --- huile & température moteur --- */
  const mxp = hxp + hwp + 8, mwp = 86;
  panel(mxp, by, mwp, 52);
  const lowOil = B.oil < 0.28;
  txt("MOTEUR", mxp + 6, by + 12, 7, (lowOil || B.temp > 0.7) ? UI.warn : UI.dim);
  txt("HUILE", mxp + 6, by + 25, 7, lowOil ? UI.warn : UI.dim);
  bar(mxp + 36, by + 19, mwp - 44, 7, B.oil,
    B.oil < 0.15 ? "rgb(248,110,98)" : lowOil ? "rgb(248,200,104)" : "rgb(226,196,120)", lowOil);
  const tcol = B.temp > 0.88 ? "rgb(248,96,84)" : B.temp > 0.7 ? "rgb(248,180,96)" : "rgb(130,208,236)";
  txt("TEMP", mxp + 6, by + 40, 7, B.temp > 0.7 ? UI.warn : UI.dim);
  bar(mxp + 36, by + 34, mwp - 44, 7, B.temp, tcol, B.temp > 0.88);
  // repère de la zone rouge, à 88 %
  const rz = mxp + 37 + (mwp - 46) * 0.88;
  ctx.strokeStyle = "rgba(255,120,100,0.9)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(rz, by + 33); ctx.lineTo(rz, by + 42); ctx.stroke();
  txt(B.oil <= 0 ? "plus d'huile !" : B.temp > 0.88 ? "surchauffe !" : "E pour couper",
    mxp + 6, by + 50, 6, (B.oil <= 0 || B.temp > 0.88) ? UI.warn : UI.dim);

  /* --- courant --- */
  const cm = Math.hypot(B.cx, B.cy);
  if (cm > 0.04 && mxp + mwp + 80 < W) {
    const cw = 66, cxp = W - pad - cw, cyp = H - 58;
    panel(cxp, cyp, cw, 52);
    txt("COURANT", cxp + cw / 2, cyp + 12, 7, UI.dim, "center");
    const px = cxp + cw / 2, py = cyp + 30;
    const ca = -Math.atan2(B.cy, B.cx);
    ctx.strokeStyle = "rgb(170,228,248)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px - Math.cos(ca) * 11, py - Math.sin(ca) * 11);
    ctx.lineTo(px + Math.cos(ca) * 11, py + Math.sin(ca) * 11); ctx.stroke();
    ctx.fillStyle = "rgb(170,228,248)";
    const ex = px + Math.cos(ca) * 11, ey = py + Math.sin(ca) * 11;
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(ca) * 4, ey + Math.sin(ca) * 4);
    ctx.lineTo(ex + Math.cos(ca + 2.5) * 5, ey + Math.sin(ca + 2.5) * 5);
    ctx.lineTo(ex + Math.cos(ca - 2.5) * 5, ey + Math.sin(ca - 2.5) * 5);
    ctx.closePath(); ctx.fill();
    txt((cm * KN).toFixed(1) + " KT", cxp + cw / 2, cyp + 48, 7, UI.ink, "center");
  }

  /* --- messages --- */
  let msg = null, mc = UI.gold;
  // barres de progression du mouillage (sans messages texte — voir menu pause)
  if (B.anchorRaise) {
    bar(W / 2 - 66, H - 86, 132, 8, 1 - B.anchorDrop, UI.gold);
  } else if (Input.anchor || B.anchoring > 0) {
    if (B.anchoring > 0) {
      bar(W / 2 - 66, H - 86, 132, 8, B.anchoring / 1.6, UI.gold);
    }
  } else if (B.engineDead > 0 && B.sailUp < 0.5) {
    msg = "PAS DE MOTEUR —  ESPACE  POUR ENVOYER LA VOILE"; mc = UI.warn;
  }
  if (Game.msg && Game.msgT > 0) { msg = Game.msg; mc = UI.gold; }
  if (msg) {
    const m = tw(msg, 9) + 18;
    panel(W / 2 - m / 2, H - 76, m, 17);
    txt(msg, W / 2, H - 64, 9, mc, "center");
  }
}

/* =============================== écrans ================================= */
function skyGradient(a, b, c) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, a); g.addColorStop(0.55, b); g.addColorStop(1, c);
  return g;
}

/* ---------------------- décor de l'écran d'accueil ----------------------
   Tout est vu de dessus, comme le jeu : gros aplats, liseré bleu nuit,
   ombre portée décalée en bas à droite (lumière en haut à gauche).       */

/* ligne de rivage de l'accueil (une seule source de vérité) */
const titleShore = x => H - 46 - Math.sin(x * 0.021 + 1) * 10 - Math.sin(x * 0.05) * 4;
const pxw = v => Math.max(1, v);                  // un trait ne descend pas sous 1 px

/* Faré sur pilotis vu du ciel : toit à quatre pans (arête faîtière au
   milieu, croupes en diagonale), terrasse en planches autour, échelle côté
   large. x,y = centre du toit ; s = échelle (1 ≈ 33 px de large).        */
function titleFare(x, y, s, t) {
  const w = 26 * s, h = 18 * s;                   // emprise du toit
  const ox = 3.5 * s, oy = 4 * s;                 // débord de la terrasse
  const ink = "rgba(14,43,58,0.85)";
  const x0 = x - w / 2, x1 = x + w / 2, y0 = y - h / 2, y1 = y + h / 2;
  const rx0 = x - w * 0.22, rx1 = x + w * 0.22;   // extrémités de l'arête

  // ombre portée dans l'eau
  ctx.fillStyle = "rgba(10,40,58,0.22)";
  ctx.fillRect(x0 - ox + 3 * s, y0 - oy + 4 * s, w + ox * 2, h + oy * 2);

  // échelle qui descend dans le lagon, côté large
  ctx.strokeStyle = "#8a6742"; ctx.lineWidth = pxw(1.2 * s);
  ctx.beginPath();
  ctx.moveTo(x - 2.4 * s, y0 - oy); ctx.lineTo(x - 2.4 * s, y0 - oy - 6 * s);
  ctx.moveTo(x + 2.4 * s, y0 - oy); ctx.lineTo(x + 2.4 * s, y0 - oy - 6 * s);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i <= 2; i++) {
    const yy = y0 - oy - i * 2 * s;
    ctx.moveTo(x - 2.4 * s, yy); ctx.lineTo(x + 2.4 * s, yy);
  }
  ctx.stroke();

  // pilotis qui dépassent de la terrasse, dans l'ombre
  ctx.fillStyle = "#6d4f33";
  const pl = pxw(2 * s);
  for (const cx of [x0 - ox, x1 + ox - pl]) for (const cy of [y0 - oy, y1 + oy - pl])
    ctx.fillRect(cx + 1.5 * s, cy + 2 * s, pl, pl);

  // terrasse : planches dans le sens de la largeur
  ctx.fillStyle = "#dcb583";
  ctx.fillRect(x0 - ox, y0 - oy, w + ox * 2, h + oy * 2);
  ctx.strokeStyle = "rgba(125,92,59,0.38)"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let yy = y0 - oy + 3 * s; yy < y1 + oy; yy += 3 * s) {
    const r = Math.round(yy) + 0.5;
    ctx.moveTo(x0 - ox, r); ctx.lineTo(x1 + ox, r);
  }
  ctx.stroke();
  ctx.strokeStyle = ink; ctx.lineWidth = pxw(1.2 * s);
  ctx.strokeRect(x0 - ox, y0 - oy, w + ox * 2, h + oy * 2);
  // transat sur la terrasse, côté lagon
  if (s > 0.75) {
    ctx.fillStyle = "#f4eddc";
    ctx.fillRect(x - 5 * s, y0 - oy + 1.2 * s, 4 * s, 2 * s);
    ctx.fillStyle = "rgba(14,43,58,0.5)";
    ctx.fillRect(x - 5 * s, y0 - oy + 1.2 * s, 4 * s, 1);
  }

  // toit de pandanus : pan au soleil en haut, pan à l'ombre en bas
  const face = (pts, col) => {
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath(); ctx.fill();
  };
  face([x0, y0, x1, y0, rx1, y, rx0, y], "#d7a869");   // au soleil
  face([x0, y1, x1, y1, rx1, y, rx0, y], "#7f5c3c");   // à l'ombre
  face([x0, y0, rx0, y, x0, y1], "#bc8d55");
  face([x1, y0, rx1, y, x1, y1], "#9a7146");
  // rangs de chaume, parallèles aux égouts
  ctx.strokeStyle = "rgba(14,43,58,0.20)"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i <= 2; i++) {
    const u = i / 3, yA = y0 + (y - y0) * u, yB = y1 + (y - y1) * u;
    const hw = w / 2 - (w / 2 - w * 0.22) * u;
    ctx.moveTo(x - hw, Math.round(yA) + 0.5); ctx.lineTo(x + hw, Math.round(yA) + 0.5);
    ctx.moveTo(x - hw, Math.round(yB) + 0.5); ctx.lineTo(x + hw, Math.round(yB) + 0.5);
  }
  ctx.stroke();
  // liseré : silhouette, arête et croupes
  ctx.strokeStyle = ink; ctx.lineWidth = pxw(1.3 * s);
  ctx.strokeRect(x0, y0, w, h);
  ctx.lineWidth = pxw(1 * s);
  ctx.beginPath();
  ctx.moveTo(rx0, y); ctx.lineTo(rx1, y);
  ctx.moveTo(x0, y0); ctx.lineTo(rx0, y); ctx.lineTo(x0, y1);
  ctx.moveTo(x1, y0); ctx.lineTo(rx1, y); ctx.lineTo(x1, y1);
  ctx.stroke();
  // l'eau qui bat contre les pilotis : deux clapots qui ondulent
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  for (let i = 0; i < 2; i++) {
    const ph = t * 1.6 + i * 2.1, dw = (w + ox * 2) * 0.3;
    ctx.fillRect(x + (i ? 1 : -1) * dw * 0.72 - dw / 2 + Math.sin(ph) * 1.6 * s,
      y1 + oy + (1.6 + Math.cos(ph) * 0.5) * s, dw, pxw(1 * s));
  }
}

/* Ponton de bois, de la plage vers le large. */
function titleDock(x, yTop, yBot, s) {
  const w = 6.5 * s;
  ctx.fillStyle = "rgba(10,40,58,0.22)";
  ctx.fillRect(x - w / 2 + 3 * s, yTop + 4 * s, w, yBot - yTop);
  ctx.fillStyle = "#c9a06c";
  ctx.fillRect(x - w / 2, yTop, w, yBot - yTop);
  ctx.strokeStyle = "rgba(125,92,59,0.5)"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let yy = yTop + 2.6 * s; yy < yBot; yy += 2.6 * s) {
    const r = Math.round(yy) + 0.5;
    ctx.moveTo(x - w / 2, r); ctx.lineTo(x + w / 2, r);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(14,43,58,0.85)"; ctx.lineWidth = pxw(1.2 * s);
  ctx.beginPath();
  ctx.moveTo(x - w / 2, yBot); ctx.lineTo(x - w / 2, yTop);
  ctx.lineTo(x + w / 2, yTop); ctx.lineTo(x + w / 2, yBot);
  ctx.stroke();
  // pilotis qui dépassent de part et d'autre
  ctx.fillStyle = "#7d5c3b";
  const p = pxw(1.7 * s);
  for (let yy = yTop + 5 * s; yy < yBot - 3 * s; yy += 11 * s) {
    ctx.fillRect(x - w / 2 - p, yy, p, p);
    ctx.fillRect(x + w / 2, yy, p, p);
  }
}

/* Un ponton et ses farés. huts = [côté (-1 ou 1), position sur le ponton]. */
function titleFareGroup(x, s, t, huts) {
  const len = 56 * s, yb = titleShore(x) + 2 * s;
  titleDock(x, yb - len, yb, s);
  for (const hut of huts) titleFare(x + hut[0] * 18 * s, yb - len * hut[1], s, t + hut[1] * 2.4);
}

function titleScreen(t) {
  /* Géométrie du panneau calculée d'abord : le décor de la plage s'y adapte
     pour ne jamais passer derrière le texte.                             */
  const cxx = W / 2;
  const bwp = Math.min(320, W - 16);
  const twoCol = bwp >= 300;                 // sinon on empile, sans chevauchement
  const bhp = (twoCol ? 101 : 146) + (KB.known ? 0 : 12);
  const bxp = cxx - bwp / 2, byp = H * 0.37;

  ctx.fillStyle = skyGradient("#0d4f7c", "#1f97c0", "#6fe0e0");
  ctx.fillRect(0, 0, W, H);
  // bandes d'eau + caustiques
  if (CAUS) {
    ctx.save(); ctx.globalAlpha = 0.22; ctx.globalCompositeOperation = "overlay";
    ctx.translate(t * 6, t * 3); ctx.fillStyle = CAUS.a;
    ctx.fillRect(-t * 6, -t * 3, W, H); ctx.restore();
  }
  // plage en bas
  ctx.fillStyle = "#f6e6ae";
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, titleShore(x));
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 6) {
    const y = titleShore(x) - 2 + Math.sin(x * 0.14 + t * 2) * 1.6;
    x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  /* Farés sur pilotis, côté plage : le ponton part du sable et dessert les
     cabanes. Au large c'est la route du catamaran, il leur passerait dessus.
     L'échelle s'ajuste à l'eau libre restante sous le panneau.          */
  const fRoom = Math.min(titleShore(W * 0.15), titleShore(W * 0.85)) - (byp + bhp + 10);
  const fs = clamp(Math.min(fRoom / 62, W / 620), 0.5, 1);
  titleFareGroup(W * 0.15, fs, t, [[-1, 0.44], [1, 0.82]]);
  titleFareGroup(W * 0.85, fs * 0.9, t + 2.3, [[1, 0.62]]);
  // cocotiers
  for (const px of [W * 0.1, W * 0.86, W * 0.2]) {
    const py = H - 26 + (px > W / 2 ? 6 : 0);
    ctx.fillStyle = "rgba(14,43,58,0.25)";
    ctx.beginPath(); ctx.ellipse(px + 8, py + 6, 16, 8, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#7d5c3b"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 4, py - 6); ctx.stroke();
    for (let f = 0; f < 7; f++) {
      const a = f / 7 * TAU + Math.sin(t * 0.8 + f) * 0.06;
      ctx.fillStyle = f % 2 ? "#5fa862" : "#80c86c";
      const ex = px + 4 + Math.cos(a) * 16, ey = py - 6 + Math.sin(a) * 12;
      ctx.beginPath(); ctx.moveTo(px + 4, py - 6);
      ctx.quadraticCurveTo((px + 4 + ex) / 2 - Math.sin(a) * 5, (py - 6 + ey) / 2 + Math.cos(a) * 5, ex, ey);
      ctx.quadraticCurveTo((px + 4 + ex) / 2 + Math.sin(a) * 5, (py - 6 + ey) / 2 - Math.cos(a) * 5, px + 4, py - 6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(14,43,58,0.45)"; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  // petit catamaran qui traverse
  const bx = (t * 26) % (W + 120) - 60, byy = H * 0.3 + Math.sin(t * 1.6) * 3;
  ctx.save(); ctx.translate(bx, byy); ctx.scale(1.5, 1.5);
  ctx.fillStyle = "rgba(14,43,58,0.25)";
  ctx.beginPath(); ctx.ellipse(2, 3, 13, 6, 0, 0, TAU); ctx.fill();
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#fbf7ec";
    ctx.beginPath(); ctx.ellipse(0, s * 4, 12, 2.4, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#0e2b3a"; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.fillStyle = "#f2ece0"; ctx.fillRect(-4, -3, 9, 6);
  ctx.strokeStyle = "#0e2b3a"; ctx.strokeRect(-4, -3, 9, 6);
  ctx.fillStyle = "#f08e78"; ctx.fillRect(-10, -3, 6, 6);
  ctx.strokeRect(-10, -3, 6, 6);
  ctx.fillStyle = "#fdf7e4";
  ctx.beginPath(); ctx.moveTo(3, 0); ctx.quadraticCurveTo(-2, 9, -7, 5);
  ctx.quadraticCurveTo(-2, 4, 3, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#0e2b3a"; ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(bx - 16, byy + 4); ctx.lineTo(bx - 52, byy + 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx - 16, byy - 4); ctx.lineTo(bx - 52, byy - 5); ctx.stroke();

  // titre (taille bornée pour tenir sur les fenêtres étroites)
  const ty = H * 0.26;
  const ts = Math.min(44, (W - 40) / 5);
  txt("POE NINA", cxx + 3, ty + 3, ts, "rgba(9,42,60,0.45)", "center");
  txt("POE NINA", cxx, ty, ts, "#fff6d8", "center");
  txt("cap sur le mouillage", cxx, ty + 18, 11, "rgba(255,248,225,0.95)", "center");

  panel(bxp, byp, bwp, bhp, 0.72);
  /* libellés courts : deux colonnes de ~27 caractères, sans chevauchement.
     Les lettres viennent de KB, donc elles suivent le clavier du joueur. */
  const keys = [
    [KB.up + " / " + KB.down, "gaz, marche arrière"],
    [KB.left + " / " + KB.right, "la barre"],
    ["ESPACE", "la voile"],
    ["E", "couper le moteur"],
    [KB.anchor, "mouiller l'ancre"],
    ["P", "pause"]
  ];
  keys.forEach((r, i) => {
    const col = twoCol ? i % 2 : 0, row = twoCol ? (i >> 1) : i;
    const x = bxp + 14 + col * (bwp / 2 - 6);
    const y = byp + 16 + row * 15;
    txt(r[0], x, y, 9, UI.gold);
    txt(r[1], x + tw(r[0], 9) + 7, y, 8, UI.ink);
  });
  const ty2 = byp + (twoCol ? 67 : 112);
  /* taille ajustée à la largeur du panneau : ces lignes sont longues et
     ne doivent jamais déborder, même sur une fenêtre étroite.          */
  const desc = ["Trois chocs sur le corail et le cata coule.",
    "L'huile part vite : la voile d'abord, le moteur en secours.",
    "Et arrive au mouillage avant la nuit."];
  const ds = Math.min(8, (bwp - 26) / (Math.max(...desc.map(s => s.length)) * 0.61));
  desc.forEach((s, i) => txt(s, cxx, ty2 + i * (ds + 4), ds, UI.dim, "center"));
  /* Navigateur qui ne sait pas dire le clavier (Firefox, Safari) : on donne
     l'équivalent QWERTY, jusqu'à ce que la première touche nous renseigne. */
  if (!KB.known)
    txt("clavier QWERTY : W A S D, ancre Q", cxx, ty2 + 3 * (ds + 4), ds,
      "rgba(255,201,74,0.8)", "center");

  const bl = 0.55 + 0.45 * Math.sin(t * 3.4);
  const py = Math.max(H * 0.68, byp + bhp + 26);
  if (Game.best > 1) {
    txt("ESPACE  reprendre au niveau " + Game.best, cxx, py, 12, "rgba(255,250,220," + bl + ")", "center");
    txt("N  nouvelle partie (depuis le niveau 1)", cxx, py + 15, 8, "rgba(255,255,255,0.7)", "center");
  } else {
    txt("APPUIE SUR  ESPACE", cxx, py, 13, "rgba(255,250,220," + bl + ")", "center");
  }
}

const LEVEL_NAMES = ["Le lagon d'Avatoru", "La passe de Tiputa", "Les patates de Rangiroa",
  "Le chenal de Fakarava", "Le labyrinthe de Toau", "La longue traversée de Raroia"];

function briefScreen(t) {
  ctx.fillStyle = "rgba(7,26,40,0.78)"; ctx.fillRect(0, 0, W, H);
  const bw = Math.min(320, W - 16), bh = 202, bx = W / 2 - bw / 2, by = H / 2 - bh / 2;
  panel(bx, by, bw, bh, 0.92);
  txt("NIVEAU " + L.n, W / 2, by + 26, 21, "#fff2cf", "center");
  txt(LEVEL_NAMES[Math.min(5, L.n - 1)], W / 2, by + 41, 9, UI.ink, "center");
  ctx.strokeStyle = "rgba(140,208,224,0.3)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(bx + 20, by + 49); ctx.lineTo(bx + bw - 20, by + 49); ctx.stroke();

  const dirs = ["E", "NE", "N", "NO", "O", "SO", "S", "SE"];
  const di = Math.round(((L.windFrom % TAU + TAU) % TAU) / TAU * 8) % 8;
  const a = L.windTwa;
  const allure = a < 42 ? "VENT DEBOUT — il faudra tirer des bords"
    : a < 75 ? "au près — ça va tirer" : a < 110 ? "au travers"
      : a < 150 ? "au largue" : "vent arrière — poussé dans le dos";
  const rows = [
    ["longueur du lagon", Math.round(L.len) + " m"],
    ["largeur navigable", Math.round(L.width) + " m"],
    ["patates repérées", L.pat.length],
    ["courant du chenal", (L.baseCur * 1.4 * 1.22 * KN).toFixed(1) + " kt"],
    ["venturi sur patates", "jusqu'à " + (L.maxCur * KN).toFixed(1) + " kt"],
    ["vent", "de " + dirs[di] + ", " + Math.round(L.windKn) + " kt"],
    ["allure dans l'axe", Math.round(a) + "°"],
    ["lumière", L.night ? "AUCUNE — de nuit" : "jour : " + Math.round(L.dayLength) + " s"],
    ["fiabilité moteur", L.failRate < 0.0015 ? "correcte" : L.failRate < 0.0025 ? "douteuse" : "inquiétante"]
  ];
  rows.forEach((r, i) => {
    txt(r[0], bx + 24, by + 62 + i * 12, 8, UI.dim);
    txt(String(r[1]), bx + bw - 24, by + 62 + i * 12, 8, "#ffe9b5", "right");
  });
  txt(L.night ? "TRAVERSÉE DE NUIT — " + allure : allure,
    W / 2, by + bh - 28, 8, (L.night || a < 75) ? UI.warn : UI.mint, "center");
  const bl = 0.55 + 0.45 * Math.sin(t * 3.6);
  txt("ESPACE POUR LARGUER LES AMARRES", W / 2, by + bh - 9, 9, "rgba(255,250,220," + bl + ")", "center");
}

const DEATHS = {
  patate: ["LE CATA A COULÉ", "Une patate de trop : la coque a cédé.", "Le corail se lit à la couleur : taches CHAUDES = danger."],
  barriere: ["LE CATA A COULÉ", "La barrière de corail a eu le dernier mot.", "Le bourrelet d'écume blanche marque le récif : reste dedans."],
  sable: ["ÉCHOUÉ POUR DE BON", "Plus de coque pour se dégager du sable.", "Surveille la jauge SOUS QUILLE en approchant de la plage."],
  large: ["LE CATA A COULÉ", "Tu es sorti du lagon.", "Le mouillage est à l'intérieur, pas dehors."],
  nuit: ["LA NUIT EST TOMBÉE", "On ne lit plus l'eau dans le noir.", "La minimap reste ton seul instrument fiable."]
};

function overlayEnd(t) {
  const dead = Game.state === "dead";
  ctx.fillStyle = dead ? "rgba(52,14,26,0.55)" : "rgba(10,44,48,0.5)";
  ctx.fillRect(0, 0, W, H);
  const bw = Math.min(306, W - 16), bh = 112, bx = W / 2 - bw / 2, by = H / 2 - bh / 2 - 10;
  panel(bx, by, bw, bh, 0.92);
  const bl = 0.55 + 0.45 * Math.sin(t * 3.6);
  if (dead) {
    const T = DEATHS[B.dead] || DEATHS.patate;
    txt(T[0], W / 2, by + 28, 21, "#ffc7b4", "center");
    txt(T[1], W / 2, by + 47, 9, "rgba(242,238,238,0.96)", "center");
    txt(T[2], W / 2, by + 64, 8, "rgba(230,226,226,0.75)", "center");
    txt("remonté du lagon : " + Math.round(clamp(B.y, 0, L.len)) + " / " + Math.round(L.len) + " m",
      W / 2, by + 84, 8, "rgba(255,225,180,0.9)", "center");
    txt("ESPACE  recommencer le niveau", W / 2, by + bh - 10, 9, "rgba(255,250,220," + bl + ")", "center");
  } else {
    txt("MOUILLÉ !", W / 2, by + 30, 23, "#c8ffe0", "center");
    txt("Niveau " + L.n + " passé — le cata est à l'abri.", W / 2, by + 50, 9, "rgba(242,250,250,0.96)", "center");
    txt((L.night ? "arrivé de nuit" : "jour restant " + Math.round((1 - L.sun) * L.dayLength) + " s") +
      "   ·   coque " + B.hull + "/" + HULL_MAX + "   ·   huile " + Math.round(B.oil * 100) + " %",
      W / 2, by + 70, 8, "rgba(255,235,180,0.92)", "center");
    txt(L.n >= CFG.MAXLEVEL ? "ESPACE  —  et voilà" : "ESPACE  niveau suivant",
      W / 2, by + bh - 10, 9, "rgba(255,250,220," + bl + ")", "center");
  }
}

function doneScreen(t) {
  EndShot.load();
  ctx.fillStyle = "#071a28"; ctx.fillRect(0, 0, W, H);

  if (EndShot.ready) {
    // échelle entière : les pixels de la photo restent carrés
    /* on réserve la place du texte SOUS l'image : jamais un mot sur les
       visages. D'où la hauteur retirée avant de choisir l'échelle, puis
       l'ensemble image + texte est centré comme un bloc.                 */
    const TXT = 92;
    const s = Math.max(1, Math.floor(Math.min(W / EndShot.pw, (H - TXT) / EndShot.ph)));
    const iw = EndShot.pw * s, ih = EndShot.ph * s;
    const dx = Math.round((W - iw) / 2);
    const dy = Math.round(Math.max(6, (H - ih - TXT) / 2));
    EndShot.draw(dx, dy, s, t);
    // liseré, comme tout le reste du jeu
    ctx.strokeStyle = "rgba(6,22,32,0.95)"; ctx.lineWidth = 3;
    ctx.strokeRect(dx - 1.5, dy - 1.5, iw + 3, ih + 3);
    ctx.strokeStyle = "rgba(160,225,240,0.35)"; ctx.lineWidth = 1;
    ctx.strokeRect(dx + 0.5, dy + 0.5, iw - 1, ih - 1);
    // un peu de ciel étoilé au-dessus et en dessous
    for (let i = 0; i < 40; i++) {
      const x = (i * 97) % W, y = (i * 61) % H;
      if (y > dy - 4 && y < dy + ih + 4) continue;
      ctx.fillStyle = "rgba(200,235,250," + (0.1 + 0.4 * Math.abs(Math.sin(t * 1.3 + i))) + ")";
      ctx.fillRect(x, y, 1, 1);
    }
    doneText(t, dy + ih + 30);
  } else {
    ctx.fillStyle = skyGradient("#1d3a63", "#8a6fa8", "#f2b78e");
    ctx.fillRect(0, 0, W, H);
    doneText(t, H * 0.42);
  }
}

/* le texte de fin : il respire, sans clignoter agressivement */
function doneText(t, y) {
  const bl1 = 0.86 + 0.14 * Math.sin(t * 2.1);
  const bl2 = 0.78 + 0.22 * Math.sin(t * 2.1 + 1.1);
  const bl3 = 0.5 + 0.5 * Math.sin(t * 3.2);
  const ts = Math.min(23, (W - 40) / 10.5);
  txt("Welcome to Paradise !", W / 2 + 2, y + 2, ts, "rgba(6,20,30,0.55)", "center");
  txt("Welcome to Paradise !", W / 2, y, ts, "rgba(255,246,214," + bl1 + ")", "center");
  txt("THE END", W / 2 + 2, y + ts + 8, ts * 0.62, "rgba(6,20,30,0.5)", "center");
  txt("THE END", W / 2, y + ts + 6, ts * 0.62, "rgba(170,242,224," + bl2 + ")", "center");
  txt("ESPACE  pour une nouvelle partie", W / 2, y + ts + 28, 9,
    "rgba(255,250,220," + bl3 + ")", "center");
}

function pauseOverlay(t) {
  ctx.fillStyle = "rgba(7,22,36,0.72)"; ctx.fillRect(0, 0, W, H);
  const bw = Math.min(280, W - 16), bh = 146, bx = W / 2 - bw / 2, by = H / 2 - bh / 2;
  panel(bx, by, bw, bh, 0.92);
  txt("PAUSE", W / 2, by + 30, 24, "#fff2cf", "center");
  ctx.strokeStyle = "rgba(140,208,224,0.3)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(bx + 20, by + 40); ctx.lineTo(bx + bw - 20, by + 40); ctx.stroke();
  const bl = 0.6 + 0.4 * Math.sin(t * 3.4);
  const rows = [
    ["ESPACE / P", "reprendre la partie", "rgba(255,250,220," + bl + ")"],
    ["R", "recommencer ce niveau", UI.ink],
    ["N", "nouvelle partie (niveau 1)", UI.ink],
    ["M", "couper le son", UI.dim],
    ["A", "ancre", UI.dim]
  ];
  rows.forEach((r, i) => {
    const y = by + 58 + i * 16;
    txt(r[0], bx + 22, y, 9, UI.gold);
    txt(r[1], bx + 108, y, 8, r[2]);
  });
}

function loadingOverlay(txtLine) {
  ctx.fillStyle = "#0b2636"; ctx.fillRect(0, 0, W, H);
  txt(txtLine || "ON PEINT LE LAGON…", W / 2, H / 2, 12, "#9fe4e8", "center");
}
