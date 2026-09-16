"use strict";
/* ==========================================================================
   POE NINA — génération du lagon, sondage du fond, courants
   ========================================================================== */

const K_WATER = 0, K_CORAL = 1, K_REEF = 2, K_SAND = 3, K_DRY = 4, K_VEG = 5, K_OCEAN = 6;
const L = {};

function levelSpec(n) {
  const len = 238 + 37 * (n - 1);          // +~15 % par palier (moitié moins raide)
  const width = 138 - 11 * (n - 1);
  return {
    n, len, width,
    // densités, donc elles suivent la longueur sans qu'on y touche
    patates: Math.round(len * width * [0, 6.3, 7.5, 8.7, 9.9, 11.0, 9.5][n] / 10000),
    sandPatches: Math.round((6 + 3 * n) * 0.7),
    clearance: Math.max(10.5, 16.5 - (n - 1)),
    baseCur: n <= 1 ? 0.16 : 0.22 + 0.085 * (n - 1),
    /* windPow : la force du vent telle qu'elle agit sur la voile et sur le
       fardage (calée sur 12). windKn : ce qu'affiche l'anémomètre, moitié
       moins — les valeurs précédentes n'étaient pas crédibles en lagon.  */
    windPow: 9 + 1.6 * n,
    /* Probabilité de panne PAR SECONDE de moteur en marche : jamais au
       niveau 1, puis de l'ordre d'une panne sur la traversée au niveau 2
       à deux au niveau 6. Un moteur capricieux, pas un moteur mort.     */
    failRate: n < 2 ? 0.0016 : (0.0022 + 0.0014 * (n - 2)) * 1.15,
    /* Le jour est calibré sur le temps qu'il faut vraiment pour traverser :
       une course propre arrive avec encore de la lumière, une course
       hésitante finit dans le noir. Le dernier niveau est nocturne.
       Le coefficient MONTE avec le niveau parce que la vitesse effective
       baisse (chenal étroit, plus de patates, vent dur, dérive) : mesuré
       3,7 m/s au niveau 1 contre 3,2 m/s au niveau 6.                  */
    night: n >= CFG.MAXLEVEL,
    dayLength: len * (0.40 + 0.021 * (n - 1)) * 1.2,
    spineAmp: 0.16 + 0.055 * n
  };
}

/* ---------------- index spatial : bandes horizontales ------------------ */
/* Le lagon est long et étroit : ranger les formes par tranches de y suffit
   et évite toute allocation pendant le sondage (appelé ~1 M de fois).      */
const HBAND = 30;
function buildBands() {
  const nb = Math.ceil((L.by1 - L.by0) / HBAND) + 2;
  L.bands = Array.from({ length: nb }, () => []);
  const add = (list, sand) => list.forEach(p => {
    const rout = p.r * (1 + p.w1 + p.w2);
    const j0 = clamp(Math.floor((p.y - rout - L.by0) / HBAND), 0, nb - 1);
    const j1 = clamp(Math.floor((p.y + rout - L.by0) / HBAND), 0, nb - 1);
    const o = {
      x: p.x, y: p.y, r: p.r, rout2: rout * rout, peak: p.peak, sand,
      w1: p.w1, w2: p.w2, p1: p.p1, p2: p.p2
    };
    for (let j = j0; j <= j1; j++) L.bands[j].push(o);
  });
  add(L.pat, 0); add(L.sandP, 1);
  L.nbands = nb;
}
function shapesAt(y) {
  const j = Math.floor((y - L.by0) / HBAND);
  return (j < 0 || j >= L.nbands) ? null : L.bands[j];
}

/* ------------------------- sondage du fond ----------------------------- */
/* renvoie {d: profondeur en m (<0 = émergé), k: nature du fond}            */
function probe(x, y) {
  const base = L.baseDepth(x, y);
  let d = base, k = K_SAND;

  const sx = L.shoreX(y);
  const ds = (x - sx) * 0.105;              // talus de plage
  if (ds < d) { d = ds; k = ds < 0 ? K_DRY : K_SAND; }
  if (x < sx - 16) { d = ds; k = K_VEG; }

  const rd = L.reefX(y) - x;                // > 0 : dans le lagon
  if (rd < 26) {
    if (rd <= -8) return { d: 40, k: K_OCEAN };
    const dr = rd >= 0 ? 0.22 + Math.pow(rd / 26, 0.85) * (base - 0.22) : 0.22 + (-rd) * 0.03;
    // la nature du fond suit le haut-fond, pas une distance arbitraire
    if (dr < d) { d = dr; k = dr < 2.6 ? K_REEF : K_SAND; }
  }

  const near = shapesAt(y);
  if (near) for (let i = 0; i < near.length; i++) {
    const p = near[i], dx = x - p.x, dy = y - p.y, q = dx * dx + dy * dy;
    if (q >= p.rout2) continue;
    const rr = shapeR(p, dx, dy);
    if (q >= rr * rr) continue;
    const dp = p.peak + (base - p.peak) * smoothstep(Math.pow(Math.sqrt(q) / rr, p.sand ? 1.4 : 1.5));
    if (dp < d) { d = dp; k = p.sand ? K_SAND : K_CORAL; }
  }
  return { d, k };
}

/* rayon d'une patate selon la direction : des formes lobées, pas des ronds */
function shapeR(p, dx, dy) {
  const a = Math.atan2(dy, dx);
  return p.r * 0.86 * (1 + p.w1 * Math.sin(3 * a + p.p1) + p.w2 * Math.sin(5 * a + p.p2));
}
/* ------------------------- champ de courant ----------------------------
   L'eau d'un lagon ne part pas dans n'importe quelle direction : elle
   longe le chenal, et elle contourne les obstacles en accélérant sur
   leurs flancs. Trois termes, dans cet ordre.                           */
function currentAt(x, y, t) {
  /* 1. Le courant suit le chenal : on prend la tangente à l'épine dorsale,
        d'amplitude qui respire le long du lagon (le flot s'inverse comme
        une marée) et lentement dans le temps.                           */
  const sl = (L.spineX(y + 8) - L.spineX(y - 8)) / 16;
  const inv = 1 / Math.hypot(sl, 1);
  const ux = sl * inv, uy = inv;
  /* Deux échelles (≈300 m et ≈840 m) pour que même le lagon le plus court
     traverse plusieurs veines, avec des renverses où le courant redescend
     le lagon. Sans ça, un niveau entier pouvait tomber dans une zone morte. */
  let a0 = 0.15
    + 0.85 * Math.sin(y * 0.021 + L.curPhase)
    + 0.40 * Math.sin(y * 0.0075 - L.curPhase * 1.7);
  // plancher : une renverse ralentit le courant, elle ne l'annule jamais
  a0 = (a0 < 0 ? -1 : 1) * Math.max(0.5, Math.abs(a0));
  const amp = L.baseCur * a0 * (1 + 0.22 * Math.sin(t * 0.06 + L.curPhase));
  let cx = ux * amp, cy = uy * amp;

  /* 2. Venturi : autour d'une patate, l'eau ne traverse pas, elle passe
        à côté en accélérant. C'est l'écoulement potentiel autour d'un
        cylindre : nul au nez de l'obstacle, doublé par le travers.      */
  const near = shapesAt(y);
  if (near) for (let i = 0; i < near.length; i++) {
    const p = near[i];
    if (p.sand) continue;                       // un haut-fond de sable ne bloque pas
    const dx = x - p.x, dy = y - p.y;
    const a = p.r * 1.1, a2 = a * a;
    let r2 = dx * dx + dy * dy;
    if (r2 > a2 * 30) continue;                 // influence jusqu'à ~5 rayons
    if (r2 < a2) r2 = a2;
    const r = Math.sqrt(r2), rx = dx / r, ry = dy / r;
    const k = a2 / r2 * amp * 1.25, dot = ux * rx + uy * ry;
    cx -= k * (2 * dot * rx - ux);
    cy -= k * (2 * dot * ry - uy);
    // tourbillon : rotation autour de la patate, plus forte pres de l'obstacle
    // (decroissance 1/r, pas 1/r²) et alternance sens/horaire. Le courant
    // dominant reste le moteur principal, le tourbillon dechire le sillage.
    const spin = Math.sin(t * 0.5 + p.x * 0.07 + p.y * 0.05);
    const wk = (a / r) * 0.55 * amp * spin;
    cx += -ry * wk;
    cy += rx * wk;
  }

  /* 3. Ni la plage ni la barrière ne laissent passer l'eau : on éteint
        progressivement la composante qui pointe dedans.                 */
  const dS = x - L.shoreX(y), dR = L.reefX(y) - x;
  if (cx < 0) cx *= clamp(dS / 24, 0, 1);
  else cx *= clamp(dR / 24, 0, 1);
  return [cx, cy];
}

/* ------------------- validation : le chenal passe-t-il ? ---------------- */
function pathExists() {
  const C = 3, need = CFG.DRAFT + 0.4, needC = CFG.PATATE + 0.4;
  const x0 = L.bx0, y0 = 0, w = Math.ceil((L.bx1 - x0) / C), h = Math.ceil(L.len / C);
  const free = new Uint8Array(w * h);
  const dep = new Float32Array(w * h), knd = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const pr = probe(x0 + i * C + C / 2, y0 + j * C + C / 2);
    dep[j * w + i] = pr.d; knd[j * w + i] = pr.k;
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const th = knd[j * w + i] === K_CORAL ? needC : need;
    let good = dep[j * w + i] > th ? 1 : 0;
    for (let dj = -1; dj <= 1 && good; dj++) for (let di = -1; di <= 1; di++) {
      const jj = j + dj, ii = i + di;
      if (jj < 0 || jj >= h || ii < 0 || ii >= w) { good = 0; break; }
      const th2 = knd[jj * w + ii] === K_CORAL ? needC : need;
      if (dep[jj * w + ii] <= th2) { good = 0; break; }
    }
    free[j * w + i] = good;
  }
  const ci = (x, y) => [Math.round((x - x0 - C / 2) / C), Math.round((y - y0 - C / 2) / C)];
  const [si, sj] = ci(L.start.x, L.start.y), [ai, aj] = ci(L.anch.x, L.anch.y);
  if (si < 0 || sj < 0 || si >= w || sj >= h || !free[sj * w + si]) return false;
  const target = clamp(aj, 0, h - 1) * w + clamp(ai, 0, w - 1);
  const seen = new Uint8Array(w * h), st = [sj * w + si]; seen[sj * w + si] = 1;
  while (st.length) {
    const id = st.pop(); if (id === target) return true;
    const i = id % w, j = (id / w) | 0;
    for (let q = 0; q < 4; q++) {
      const ii = i + (q === 0 ? 1 : q === 1 ? -1 : 0), jj = j + (q === 2 ? 1 : q === 3 ? -1 : 0);
      if (ii < 0 || ii >= w || jj < 0 || jj >= h) continue;
      const nid = jj * w + ii;
      if (seen[nid] || !free[nid]) continue;
      seen[nid] = 1; st.push(nid);
    }
  }
  return false;
}

/* --------------------------- construction ------------------------------ */
function buildLevel(n, seedExtra) {
  const S = levelSpec(n);
  const rng = mulberry32(1337 + n * 7919 + (seedExtra | 0) * 104729);
  for (const k in S) L[k] = S[k];
  L.rng = rng;

  const sp = [rng() * TAU, rng() * TAU, rng() * TAU, rng() * TAU];
  L.shoreX = y => -4 + 7.5 * Math.sin(y * 0.0112 + sp[0]) + 4 * Math.sin(y * 0.0281 + sp[1]);
  L.reefX = y => S.width + 6.5 * Math.sin(y * 0.0086 + sp[2]) + 3.5 * Math.sin(y * 0.0203 + sp[3]);
  // fond marbré : les bandes de couleur dessinent des contours organiques
  L.baseDepth = (x, y) => clamp(5.5
    + 2.3 * Math.sin(x * 0.019 + y * 0.0074 + sp[0])
    + 1.5 * Math.sin(y * 0.0163 - x * 0.0102 + sp[1])
    + 0.9 * Math.sin(x * 0.047 + y * 0.031 + sp[2])
    + 0.45 * Math.sin(y * 0.084 - x * 0.062 + sp[3]), 3.3, 11.0);

  const q = [rng() * TAU, rng() * TAU, rng() * TAU];
  L.spineX = y => {
    const s = L.shoreX(y), r = L.reefX(y), m = 25;
    const u = 0.5 + S.spineAmp * Math.sin(y * 0.0093 + q[0])
      + S.spineAmp * 0.62 * Math.sin(y * 0.0211 + q[1])
      + S.spineAmp * 0.35 * Math.sin(y * 0.0407 + q[2]);
    return s + m + clamp(u, 0.04, 0.96) * (r - s - 2 * m);
  };

  L.start = { x: L.spineX(20), y: 20 };
  L.anch = { x: L.spineX(S.len - 26), y: S.len - 26, r: 13.5 };

  // bornes du monde utile
  let xmin = 1e9, xmax = -1e9;
  for (let y = -40; y <= S.len + 70; y += 8) { xmin = Math.min(xmin, L.shoreX(y)); xmax = Math.max(xmax, L.reefX(y)); }
  L.bx0 = Math.floor(xmin - 58); L.bx1 = Math.ceil(xmax + 34);
  L.by0 = -46; L.by1 = S.len + 72;

  /* ---- patates & taches de sable ---- */
  let tries = 0, ok = false, want = S.patates;
  while (!ok && tries < 20) {
    tries++;
    L.pat = []; L.sandP = [];
    const clash = (x, y, r) => L.pat.some(p => Math.hypot(p.x - x, p.y - y) < p.r + r + 3);
    let guard = 0;
    while (L.pat.length < want && guard < want * 500) {
      guard++;
      const y = 30 + rng() * (S.len - 62);
      const sx = L.shoreX(y), rx = L.reefX(y);
      const x = sx + 15 + rng() * (rx - sx - 28);
      const r = 3.8 + rng() * (5.8 + n * 0.55);
      if (Math.abs(x - L.spineX(y)) < r + S.clearance) continue;
      if (Math.hypot(x - L.anch.x, y - L.anch.y) < r + 21) continue;
      if (Math.hypot(x - L.start.x, y - L.start.y) < r + 26) continue;
      if (clash(x, y, r)) continue;
      const emerg = rng() < 0.36;
      const nk = 3 + (rng() * 4 | 0);
      L.pat.push({
        x, y, r, emerg, ph: rng() * TAU,
        w1: 0.10 + rng() * 0.14, w2: 0.04 + rng() * 0.08, p1: rng() * TAU, p2: rng() * TAU,
        peak: emerg ? -0.55 - rng() * 0.95 : 0.16 + rng() * 0.8,
        lobes: Array.from({ length: nk }, () => ({
          a: rng() * TAU, d: 0.15 + rng() * 0.5, s: 0.2 + rng() * 0.3, h: 0.3 + rng() * 1.1
        }))
      });
    }
    guard = 0;
    while (L.sandP.length < S.sandPatches && guard < S.sandPatches * 400) {
      guard++;
      const y = 30 + rng() * (S.len - 60);
      const sx = L.shoreX(y), rx = L.reefX(y);
      const x = sx + 18 + rng() * (rx - sx - 34);
      const r = 12 + rng() * 20;
      if (Math.hypot(x - L.start.x, y - L.start.y) < r + 10) continue;
      if (L.pat.some(p => Math.hypot(p.x - x, p.y - y) < p.r + r + 2)) continue;
      L.sandP.push({
        x, y, r, peak: 1.35 + rng() * 1.7,
        w1: 0.12 + rng() * 0.18, w2: 0.05 + rng() * 0.1, p1: rng() * TAU, p2: rng() * TAU
      });
    }
    buildBands();
    ok = pathExists();
    if (!ok) want = Math.max(4, Math.round(want * 0.86));
  }
  L.patates = L.pat.length;

  /* ---- courant : une seule phase à tirer, le reste est géométrique ---- */
  L.curPhase = rng() * TAU;
  L.baseCur = S.baseCur;
  // pointe atteignable : respiration (×1,40 × 1,22) puis venturi au travers (×2)
  L.maxCur = S.baseCur * 1.4 * 1.22 * 2;

  /* ---- vent : direction tirée au sort, mais l'allure qu'impose l'axe du
     lagon se durcit de niveau en niveau. Niveau 1 : du largue au vent
     arrière, on se laisse pousser. Niveau 6 : du travers au vent debout,
     il faut tirer des bords dans un chenal étroit.                       */
  const u = clamp((n - 1) / (CFG.MAXLEVEL - 1), 0, 1);
  const twaMin = lerp(82, 14, u), twaMax = lerp(178, 94, u);
  L.windTwa = twaMin + rng() * (twaMax - twaMin);        // allure dans l'axe
  if (L.night) {
    // Niveau nocturne : brise de terre de biais. Vent venant du 315° (cap
    // boussole écran), entre 300° et 330°. En convention monde (cap boussole
    // = 90 - windFrom_deg) ça donne windFrom ∈ [2π/3, 5π/6] -> souffle vers
    // la diagonale bas-droite. Avec le cap π/2 du bateau, twa = 30-60° :
    // du près, il faut tirer des bords.
    L.windFrom = lerp(2 * Math.PI / 3, 5 * Math.PI / 6, rng());
    L.windTwa = (L.windFrom - Math.PI / 2) * R2D;
  } else {
    L.windFrom = Math.PI / 2 + (rng() < 0.5 ? 1 : -1) * L.windTwa * D2R;
  }
  L.windFrom0 = L.windFrom;          // cap de référence pour la dérive lente
  L.windDrift = (rng() < 0.5 ? 1 : -1) * (0.014 + 0.012 * n / CFG.MAXLEVEL); // rad/s
  L.windPow0 = S.windPow;              // vent nominal (brise de mer établie)
  L.windPow = S.windPow;               // vent effectif (recalculé chaque frame)
  L.windKn = S.windPow / 2;            // anémomètre (suit le vent effectif)
  L.gustPhase = rng() * TAU;           // phase des rafales de transition thermique
  L.duskFlash = L.night;               // repères de transition vent (déjà passés la nuit)
  L.landFlash = L.night;

  /* ---- décor ---- */
  L.palms = [];
  for (let y = L.by0; y < L.by1; y += 6 + rng() * 11) {
    const sx = L.shoreX(y), nP = 1 + (rng() * 2 | 0);
    for (let i = 0; i < nP; i++) {
      L.palms.push({
        x: sx - 7 - rng() * 34, y: y + (rng() - 0.5) * 7,
        r: 3.0 + rng() * 2.2, ph: rng() * TAU,
        fronds: 6 + (rng() * 3 | 0), lean: (rng() - 0.5) * 1.6,
        tone: rng()
      });
    }
  }
  L.rocks = [];
  for (let y = L.by0; y < L.by1; y += 24 + rng() * 60) {
    const sx = L.shoreX(y);
    L.rocks.push({ x: sx + (rng() - 0.5) * 8, y, r: 1.4 + rng() * 2.4, ph: rng() * TAU });
  }
  L.crabs = [];
  for (let y = L.by0; y < L.by1; y += 11) {
    if (rng() < 0.82) continue;
    const sx = L.shoreX(y) - 3 - rng() * 6;
    L.crabs.push({
      x: sx, y, amp: 2.4 + rng() * 2.2, ph: rng() * TAU,
      spd: 0.10 + rng() * 0.05
    });
  }
  L.huts = [];
  for (let i = 0; i < 2 + (n > 2 ? 1 : 0); i++) {
    const y = 70 + rng() * (S.len - 140), sx = L.shoreX(y);
    L.huts.push({ x: sx - 13 - rng() * 12, y, a: (rng() - 0.5) * 0.6 });
  }

  /* ---- faune ---- */
  L.fauna = [];
  const kinds = ["raie", "tortue", "banc", "requin", "dauphin", "banc", "raie", "banc", "tortue"];
  for (let i = 0; i < 18 + n * 3; i++) {
    const y = rng() * S.len, sx = L.shoreX(y), rx = L.reefX(y);
    L.fauna.push(makeFauna(kinds[(rng() * kinds.length) | 0], sx + 14 + rng() * (rx - sx - 28), y, rng));
  }

  /* ---- pêcheurs : barques locales qui errent dans le lagon ----
     Niveaux 3 à 5 seulement (le 6 est nocturne : ils sont rentrés).
     Une barque tous les ~100 m, jamais au démarrage ni à l'arrivée.   */
  L.fishers = [];
  if (n >= 3 && n < CFG.MAXLEVEL) {
    for (let y = 70; y < S.len - 70; y += 100 + rng() * 22) {
      const sx = L.shoreX(y), rx = L.reefX(y);
      const cx = sx + (rx - sx) * (0.30 + rng() * 0.40);
      const mode = rng() < 0.5 ? "circle" : "pendulum";
      L.fishers.push({
        bx: cx, by: y, x: cx, y: y, h: rng() * TAU, ph: rng() * TAU,
        mode, amp: 7 + rng() * 6, spd: 0.34 + rng() * 0.16, h0: rng() * TAU,
        sunken: 0, drifted: false, dx: 0, dy: 0, beached: false
      });
    }
  }

  L.time = 0;
  L.sun = L.night ? NIGHT_SUN : 0;      // le dernier niveau démarre de nuit
  L.nightFlashed = L.night;
  L.trail = [];
  SUN = sunParams(L.sun);
}
