"use strict";
/* ==========================================================================
   POE NINA — cuisson du décor
   Le lagon est statique : on le peint une fois par niveau dans trois
   tampons (eau, ombre portée, terre émergée). Chaque image se contente
   ensuite de recopier la portion visible, ce qui laisse tout le budget
   au vivant : caustiques, écume, courants, faune, bateau.
   ========================================================================== */

const TER = { water: null, land: null, shade: null, w: 0, h: 0 };

/* texel <-> monde */
const tX = x => (x - L.bx0) * CFG.TPM;
const tY = y => (L.by1 - y) * CFG.TPM;

const C_WATER = 0, C_CORAL = 1, C_REEF = 2, C_DRY = 3, C_VEG = 4, C_OCEAN = 5;

function mkCanvas(w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
  return { c, g };
}

function bakeTerrain() {
  const TPM = CFG.TPM;
  const w = TER.w = Math.ceil((L.bx1 - L.bx0) * TPM);
  const h = TER.h = Math.ceil((L.by1 - L.by0) * TPM);

  const wat = mkCanvas(w, h), lnd = mkCanvas(w, h), shd = mkCanvas(w, h);
  const iw = wat.g.createImageData(w, h), il = lnd.g.createImageData(w, h);
  const dw = iw.data, dl = il.data;
  const cls = new Uint8Array(w * h);
  const dep = new Float32Array(w * h);

  const bandCol = BANDS.map(b => b.c);
  const coralMix = bandCol.map(c => mixRGB(c, P.coral, 0.62));
  // le platier de la barrière doit rester chaud : sinon on le confond avec la plage
  const reefMix = bandCol.map(c => mixRGB(c, mixRGB(P.coral, P.coralDk, 0.35), 0.66));

  /* ---------------- passe 1 : couleur de chaque texel ------------------ */
  for (let j = 0; j < h; j++) {
    const y = L.by1 - (j + 0.5) / TPM;
    const shore = L.shoreX(y), reef = L.reefX(y);
    const shapes = shapesAt(y);
    for (let i = 0; i < w; i++) {
      const x = L.bx0 + (i + 0.5) / TPM;
      const id = j * w + i;

      /* --- sondage en ligne (copie de probe(), sans allocation) --- */
      const base = L.baseDepth(x, y);
      let d = base, k = C_WATER;
      const ds = (x - shore) * 0.105;
      if (ds < d) { d = ds; k = ds < 0 ? C_DRY : C_WATER; }
      if (x < shore - 16) { d = ds; k = C_VEG; }
      const rd = reef - x;
      if (rd < 26) {
        if (rd <= -8) { d = 40; k = C_OCEAN; }
        else {
          const dr = rd >= 0 ? 0.22 + Math.pow(rd / 26, 0.85) * (base - 0.22) : 0.22 + (-rd) * 0.03;
          if (dr < d) { d = dr; k = dr < 2.6 ? C_REEF : C_WATER; }
        }
      }
      if (shapes && k !== C_OCEAN) for (let s = 0; s < shapes.length; s++) {
        const p = shapes[s], dx = x - p.x, dy = y - p.y, q = dx * dx + dy * dy;
        if (q >= p.rout2) continue;
        const rr = shapeR(p, dx, dy);
        if (q >= rr * rr) continue;
        const dp = p.peak + (base - p.peak) * smoothstep(Math.pow(Math.sqrt(q) / rr, p.sand ? 1.4 : 1.5));
        if (dp < d) { d = dp; k = p.sand ? C_WATER : C_CORAL; }
      }
      dep[id] = d; cls[id] = k;

      /* --- couleur --- */
      let col, n = hash2(i, j);
      if (k === C_OCEAN) {
        const sw = Math.sin(y * 0.055 + x * 0.02) > 0.25 ? 1 : 0;
        col = sw ? P.ocean : P.oceanDk;
      } else if (k === C_DRY) {
        const hgt = -d;
        col = hgt < 0.3 ? P.wet : hgt < 1.5 ? P.sand : P.sandLt;
        if (n > 0.88) col = mixRGB(col, P.sandLt, 0.6);
        else if (n < 0.1) col = mixRGB(col, P.wet, 0.5);
      } else if (k === C_VEG) {
        // taches de végétation irrégulières plutôt qu'un damier
        const m = 1.2 * Math.sin(x * 0.16 + y * 0.09 + 1.3)
          + 0.9 * Math.sin(y * 0.21 - x * 0.13)
          + 0.7 * Math.sin(x * 0.44 + y * 0.38)
          + (hash2(i >> 1, j >> 1) - 0.5) * 1.5;
        col = m > 0.85 ? P.vegLt : m < -0.75 ? P.vegDk : P.veg;
        if (n > 0.95) col = mixRGB(col, P.vegLt, 0.75);
      } else if (d < 0) {
        // patate émergée : facettes chaudes, quelques plaques d'algues
        const hgt = -d;
        col = hgt > 1.05 ? P.rockLt : hgt > 0.5 ? P.rock : mixRGB(P.rock, P.coral, 0.45);
        if (n > 0.82) col = mixRGB(col, P.rockLt, 0.55);
        else if (n < 0.16) col = mixRGB(col, P.algae, 0.5);
      } else {
        const b = bandOf(d);
        col = k === C_CORAL ? coralMix[b] : k === C_REEF ? reefMix[b] : bandCol[b];
        if (n > 0.94) col = mixRGB(col, P.foam, 0.10);
        else if (n < 0.06) col = mixRGB(col, P.line, 0.06);
      }

      const o = id * 4;
      dw[o] = col[0]; dw[o + 1] = col[1]; dw[o + 2] = col[2]; dw[o + 3] = 255;
      if (d < 0.02) {                                // couche émergée
        dl[o] = col[0]; dl[o + 1] = col[1]; dl[o + 2] = col[2]; dl[o + 3] = 255;
      }
    }
  }

  /* ------------- passe 2 : liserés + halo clair au bord ---------------- */
  const LN = P.line, sil = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const id = j * w + i;
    if (dep[id] < 0.02) sil[id] = 1;
  }
  /* 1 = franc (terre, récif), 2 = doux (sable/végétation),
     3 = corail immergé : liseré chaud, présent mais pas noir            */
  const isEdge = (id, nid) => {
    const a = cls[id], b = cls[nid];
    if (a === b) return 0;
    if (a === C_OCEAN || b === C_OCEAN) return 0;
    if ((a === C_DRY && b === C_VEG) || (a === C_VEG && b === C_DRY)) return 2;
    if (a === C_CORAL || b === C_CORAL) return (dep[id] < 0.02 || dep[nid] < 0.02) ? 1 : 3;
    return 1;
  };
  const CORLN = mixRGB(P.line, P.coralDk, 0.55);
  const paint = (o, col, a) => {
    dw[o] = lerp(dw[o], col[0], a); dw[o + 1] = lerp(dw[o + 1], col[1], a); dw[o + 2] = lerp(dw[o + 2], col[2], a);
    if (dl[o + 3]) { dl[o] = dw[o]; dl[o + 1] = dw[o + 1]; dl[o + 2] = dw[o + 2]; }
  };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const id = j * w + i;
    let e = 0;
    if (i + 1 < w) e = Math.max(e, isEdge(id, id + 1));
    if (j + 1 < h) e = Math.max(e, isEdge(id, id + w));
    if (i > 0) e = Math.max(e, isEdge(id, id - 1));
    if (j > 0) e = Math.max(e, isEdge(id, id - w));
    if (e === 1) paint(id * 4, LN, 0.70);
    else if (e === 2) paint(id * 4, LN, 0.22);
    else if (e === 3) paint(id * 4, CORLN, 0.42);
  }
  // frange d'eau claire autour du sec (effet « ça mouille »)
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const id = j * w + i;
    if (sil[id] || dep[id] > 2.2 || cls[id] === C_OCEAN) continue;
    if (sil[id - 1] || sil[id + 1] || sil[id - w] || sil[id + w]) paint(id * 4, P.foam, 0.16);
  }

  wat.g.putImageData(iw, 0, 0);
  lnd.g.putImageData(il, 0, 0);

  /* ------------- passe 3 : ombre portée de ce qui dépasse -------------- */
  const ish = shd.g.createImageData(w, h), dsh = ish.data;
  for (let id = 0; id < w * h; id++) {
    if (!sil[id]) continue;
    const o = id * 4;
    dsh[o] = 10; dsh[o + 1] = 52; dsh[o + 2] = 72; dsh[o + 3] = 96;
  }
  shd.g.putImageData(ish, 0, 0);

  /* ------------- passe 4 : détails peints par-dessus ------------------- */
  paintCoralDetail(wat.g, lnd.g);
  paintDecor(lnd.g, shd.g);

  TER.water = wat.c; TER.land = lnd.c; TER.shade = shd.c;
}

/* contour lobé d'une forme, en coordonnées texel */
function lobePath(g, p, scale) {
  const T = CFG.TPM, cx = tX(p.x), cy = tY(p.y), sc = scale === undefined ? 1 : scale;
  g.beginPath();
  for (let i = 0; i <= 56; i++) {
    const a = i / 56 * TAU;
    const r = p.r * (1 + p.w1 * Math.sin(3 * a + p.p1) + p.w2 * Math.sin(5 * a + p.p2)) * sc * T;
    const x = cx + Math.cos(a) * r, y = cy - Math.sin(a) * r;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}

/* ---- lobes de corail : reliefs, mouchetis, facettes cell-shading ------ */
function paintCoralDetail(gw, gl) {
  const T = CFG.TPM;
  for (const p of L.pat) {
    const cx = tX(p.x), cy = tY(p.y), R = p.r * T;
    // mouchetis dans l'eau, à l'intérieur de la patate
    gw.save();
    lobePath(gw, p, 0.99); gw.clip();
    for (const lb of p.lobes) {
      const x = cx + Math.cos(lb.a) * lb.d * R, y = cy - Math.sin(lb.a) * lb.d * R;
      gw.fillStyle = rgba(P.coralDk, 0.26);
      gw.beginPath(); gw.arc(x, y, lb.s * R, 0, TAU); gw.fill();
      gw.fillStyle = rgba(P.coralLt, 0.22);
      gw.beginPath(); gw.arc(x - lb.s * R * 0.28, y - lb.s * R * 0.3, lb.s * R * 0.55, 0, TAU); gw.fill();
    }
    gw.restore();
    if (!p.emerg) continue;
    // têtes de corail hors d'eau : facette claire en haut à gauche + liseré
    for (const lb of p.lobes) {
      const x = cx + Math.cos(lb.a) * lb.d * R * 0.6, y = cy - Math.sin(lb.a) * lb.d * R * 0.6;
      const r = Math.max(2, lb.s * R * 0.8);
      gl.fillStyle = rgbStr(P.rock);
      gl.beginPath(); gl.arc(x, y, r, 0, TAU); gl.fill();
      gl.fillStyle = rgba(P.rockLt, 0.92);
      gl.beginPath(); gl.arc(x - r * 0.26, y - r * 0.3, r * 0.6, 0, TAU); gl.fill();
      gl.strokeStyle = rgba(mixRGB(P.line, P.coralDk, 0.35), 0.62); gl.lineWidth = Math.max(1, T * 0.5);
      gl.beginPath(); gl.arc(x, y, r, 0, TAU); gl.stroke();
    }
  }
}

/* ---------------- cocotiers, cailloux, farés (vue de dessus) ----------- */
function paintDecor(gl, gs) {
  const T = CFG.TPM, LW = Math.max(1, T * 0.55);

  /* cailloux : facettes irrégulières, deux tons, comme taillées */
  for (const r of L.rocks) {
    const x = tX(r.x), y = tY(r.y), R = r.r * T;
    const face = [];
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + r.ph;
      const rr2 = R * (0.72 + 0.34 * hash2(i * 13 + (r.x | 0), (r.y | 0)));
      face.push([x + Math.cos(a) * rr2, y + Math.sin(a) * rr2 * 0.86]);
    }
    const trace = (g, dx, dy) => {
      g.beginPath();
      face.forEach((p, i) => i ? g.lineTo(p[0] + dx, p[1] + dy) : g.moveTo(p[0] + dx, p[1] + dy));
      g.closePath();
    };
    gs.fillStyle = "rgba(10,52,72,0.4)"; trace(gs, T * 1.3, T * 1.7); gs.fill();
    gl.fillStyle = "rgb(146,164,172)"; trace(gl, 0, 0); gl.fill();
    // facette éclairée en haut à gauche
    gl.save(); trace(gl, 0, 0); gl.clip();
    gl.fillStyle = "rgb(190,206,210)";
    gl.beginPath();
    gl.moveTo(x - R * 1.2, y - R * 1.2); gl.lineTo(x + R * 1.2, y - R * 1.2);
    gl.lineTo(x - R * 1.2, y + R * 0.5); gl.closePath(); gl.fill();
    gl.restore();
    gl.strokeStyle = rgba(P.line, 0.8); gl.lineWidth = LW; trace(gl, 0, 0); gl.stroke();
  }

  for (const hut of L.huts) {
    const x = tX(hut.x), y = tY(hut.y), s = 5.2 * T;
    gs.fillStyle = "rgba(10,52,72,0.42)";
    gs.save(); gs.translate(x + T * 1.6, y + T * 2); gs.rotate(hut.a);
    gs.fillRect(-s / 2, -s / 2, s, s); gs.restore();
    gl.save(); gl.translate(x, y); gl.rotate(hut.a);
    gl.fillStyle = "rgb(168,124,82)";
    gl.beginPath(); gl.moveTo(-s / 2, -s / 2); gl.lineTo(s / 2, -s / 2); gl.lineTo(s / 2, s / 2); gl.lineTo(-s / 2, s / 2); gl.closePath(); gl.fill();
    gl.fillStyle = "rgb(196,150,102)";
    gl.beginPath(); gl.moveTo(-s / 2, -s / 2); gl.lineTo(s / 2, -s / 2); gl.lineTo(0, 0); gl.closePath(); gl.fill();
    gl.fillStyle = "rgb(140,100,66)";
    gl.beginPath(); gl.moveTo(-s / 2, s / 2); gl.lineTo(s / 2, s / 2); gl.lineTo(0, 0); gl.closePath(); gl.fill();
    gl.strokeStyle = rgba(P.line, 0.9); gl.lineWidth = LW;
    gl.strokeRect(-s / 2, -s / 2, s, s);
    gl.beginPath(); gl.moveTo(-s / 2, -s / 2); gl.lineTo(s / 2, s / 2); gl.moveTo(s / 2, -s / 2); gl.lineTo(-s / 2, s / 2); gl.stroke();
    gl.restore();
  }

  for (const p of L.palms) {
    const x = tX(p.x), y = tY(p.y), R = p.r * T;
    const lx = Math.cos(p.lean) * R * 0.28, ly = Math.sin(p.lean) * R * 0.28;
    // ombre de la couronne, décalée vers le bas-droite
    gs.fillStyle = "rgba(10,52,72,0.4)";
    gs.beginPath(); gs.ellipse(x + R * 0.42 + T * 1.5, y + R * 0.42 + T * 2, R * 0.95, R * 0.8, 0, 0, TAU); gs.fill();
    // tronc vu de dessus
    gl.strokeStyle = rgbStr(P.trunkDk); gl.lineWidth = Math.max(2, T * 1.5);
    gl.beginPath(); gl.moveTo(x - lx * 1.6, y - ly * 1.6); gl.lineTo(x + lx, y + ly); gl.stroke();
    // palmes
    const tones = [P.vegLt, P.veg, P.vegDk];
    for (let f = 0; f < p.fronds; f++) {
      const a = p.ph + f / p.fronds * TAU;
      const ex = x + lx + Math.cos(a) * R, ey = y + ly + Math.sin(a) * R;
      const mx = x + lx + Math.cos(a) * R * 0.55, my = y + ly + Math.sin(a) * R * 0.55;
      const nx = -Math.sin(a), ny = Math.cos(a), wdt = R * 0.26;
      gl.fillStyle = rgbStr(tones[f % 3]);
      gl.beginPath();
      gl.moveTo(x + lx, y + ly);
      gl.quadraticCurveTo(mx + nx * wdt, my + ny * wdt, ex, ey);
      gl.quadraticCurveTo(mx - nx * wdt, my - ny * wdt, x + lx, y + ly);
      gl.closePath(); gl.fill();
      gl.strokeStyle = rgba(P.line, 0.55); gl.lineWidth = Math.max(1, T * 0.4); gl.stroke();
    }
    // coeur
    gl.fillStyle = rgbStr(P.trunk);
    gl.beginPath(); gl.arc(x + lx, y + ly, Math.max(1.4, R * 0.15), 0, TAU); gl.fill();
    gl.strokeStyle = rgba(P.line, 0.8); gl.lineWidth = Math.max(1, T * 0.4); gl.stroke();
  }
}

/* ======================= caustiques & étincelles ======================== */
let CAUS = null;
function makeCaustics(S, freq, soft) {
  const { c, g } = mkCanvas(S, S);
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S * TAU, v = y / S * TAU;
    let n = Math.sin(u * freq) + Math.sin(v * freq)
      + 0.75 * Math.sin((u + v) * (freq + 1) + 1.1)
      + 0.55 * Math.sin((u - v) * (freq + 2) - 0.4)
      + 0.35 * Math.sin(u * (freq + 3) + 2.2)
      + 0.3 * Math.sin(v * (freq + 4) - 1.7);
    n = Math.abs(n) / 3.3;
    const a = Math.pow(1 - clamp(n, 0, 1), soft) * 255;
    const i = (y * S + x) * 4;
    d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = a;
  }
  g.putImageData(img, 0, 0);
  return c;
}
function initCaustics() {
  if (CAUS) return;
  const a = makeCaustics(128, 2, 7), b = makeCaustics(96, 3, 9);
  CAUS = { a: ctx.createPattern(a, "repeat"), b: ctx.createPattern(b, "repeat") };
}
