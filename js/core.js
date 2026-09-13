"use strict";
/* ==========================================================================
   POE NINA — noyau : maths, palette, lumière
   Vue de dessus (top down). Monde : x = travers du lagon (0 = plage,
   x croissant = vers la barrière), y = le long du lagon (y croissant = but).
   Écran : +x vers la droite, +y vers le HAUT.
   ========================================================================== */

const TAU = Math.PI * 2, D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = t => (t = clamp(t, 0, 1), t * t * (3 - 2 * t));
const KN = 1.94384;                        // m/s -> noeuds

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function hash2(x, y) {                     // bruit blanc déterministe 0..1
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}

/* ---------------------------- couleurs --------------------------------- */
const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/* Saturation : on écarte les canaux de la luminance, en bornant le gain
   canal par canal pour ne jamais écrêter (donc sans dérive de teinte).    */
function satBoost(c, k) {
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  let m = k;
  for (let i = 0; i < 3; i++) {
    const v = c[i];
    if (v > l && l + (v - l) * k > 255) m = Math.min(m, (255 - l) / (v - l));
    if (v < l && l + (v - l) * k < 0) m = Math.min(m, l / (l - v));
  }
  return [l + (c[0] - l) * m, l + (c[1] - l) * m, l + (c[2] - l) * m];
}
const SAT = 1.15;                       // +15 % de saturation sur tout le décor
const hexS = h => satBoost(hexRGB(h), SAT);
const rgbStr = c => "rgb(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + ")";
const rgba = (c, a) => "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + a + ")";
const mixRGB = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

const CFG = {
  K: 4.2,           // pixels internes par mètre
  TPM: 2.1,         // texels par mètre dans le tampon de terrain (= K/2, blit x2)
  DRAFT: 1.15,      // tirant d'eau du catamaran
  SCRAPE: 0.65,     // marge sous quille qui déclenche le frottement
  LOA: 11.3, BEAM: 6.6,
  MAXLEVEL: 6,
  /* Dilatation du temps « physique » : tout ce qui bouge avance 20 % plus
     vite à l'écran, mais les vitesses restent stockées en m/s réels, donc
     les nœuds affichés au HUD ne changent pas.                            */
  VIS: 1.2
};
const kt = mps => mps * KN;             // m/s -> nœuds (kt)

/* Palette : tropical saturé mais doux, gros aplats + liseré bleu nuit.     */
const P = {
  oceanDk: hexS("#0a3c63"),
  ocean: hexS("#0f5480"),
  deep: hexS("#1a7ba8"),
  mid: hexS("#2ba3c6"),
  midLt: hexS("#45c2d8"),
  light: hexS("#6fdde2"),
  shal: hexS("#9deede"),
  shalLt: hexS("#c8f6da"),
  wet: hexS("#e9e5ae"),
  sand: hexS("#f6e6ae"),
  sandLt: hexS("#fdf3cf"),
  veg: hexS("#5fa862"),
  vegLt: hexS("#80c86c"),
  vegDk: hexS("#43854e"),
  coral: hexS("#f78e72"),
  coralDk: hexS("#cd6150"),
  coralLt: hexS("#ffc9ac"),
  rock: hexS("#ef9f83"),
  rockLt: hexS("#ffcfae"),
  algae: hexS("#c98a6e"),
  foam: hexS("#ffffff"),
  line: hexS("#0e2b3a"),
  hull: hexS("#fbf7ec"),
  hullSh: hexS("#dcd6c4"),
  deck: hexS("#f2ece0"),
  tramp: hexS("#d3dfe3"),
  glass: hexS("#3f7f9a"),
  glassLt: hexS("#8fd4dd"),
  bimini: hexS("#f08e78"),
  mast: hexS("#e6e6e6"),
  sail: hexS("#fdf7e4"),
  sailSh: hexS("#e3d6b6"),
  buoy: hexS("#ffc94a"),
  trunk: hexS("#a07a52"),
  trunkDk: hexS("#7d5c3b")
};

/* bandes de profondeur : seuil (m) -> couleur. Le tell du danger n'est PAS
   la bande mais la TEINTE CHAUDE du corail (voir terrain.js).              */
const BANDS = [
  { d: 0.80, c: P.wet },
  { d: 1.60, c: P.shalLt },   // 1.15 m (tirant d'eau) tombe au milieu : subtil
  { d: 2.60, c: P.shal },
  { d: 4.00, c: P.light },
  { d: 6.00, c: P.midLt },
  { d: 8.20, c: P.mid },
  { d: 14.0, c: P.deep },
  { d: 1e9, c: P.ocean }
];
function bandOf(d) { for (let i = 0; i < BANDS.length; i++) if (d < BANDS[i].d) return i; return BANDS.length - 1; }

/* ------------------------- lumière du jour ----------------------------- */
/* On étalonne l'image finale : multiply (chaud, assombrit) + voile (aplatit
   le contraste => lire l'eau devient dur au crépuscule).                   */
const SUNKEY = [
  { t: 0.00, mul: [255, 255, 252], veil: [255, 250, 230], va: 0.00, sky: [90, 200, 225] },
  { t: 0.42, mul: [255, 248, 228], veil: [255, 238, 196], va: 0.05, sky: [96, 198, 220] },
  { t: 0.63, mul: [255, 212, 158], veil: [255, 188, 126], va: 0.13, sky: [240, 180, 140] },
  { t: 0.79, mul: [240, 156, 136], veil: [244, 136, 122], va: 0.21, sky: [232, 128, 128] },
  { t: 0.91, mul: [180, 136, 178], veil: [130, 100, 176], va: 0.24, sky: [130, 96, 160] },
  { t: 1.00, mul: [96, 92, 140], veil: [30, 36, 92], va: 0.40, sky: [40, 46, 92] }
];
const NIGHT_SUN = 0.93;                 // valeur de départ d'un niveau nocturne
/* 0 en plein jour, 1 en pleine nuit : pilote la désaturation et la portée
   de vue autour du bateau.                                                */
const nightAmount = () => clamp((L.sun - 0.80) / 0.20, 0, 1);
let SUN = SUNKEY[0];
function sunParams(s) {
  s = clamp(s, 0, 1);
  for (let i = 0; i < SUNKEY.length - 1; i++) {
    const a = SUNKEY[i], b = SUNKEY[i + 1];
    if (s <= b.t) {
      const u = (s - a.t) / (b.t - a.t);
      return {
        mul: mixRGB(a.mul, b.mul, u), veil: mixRGB(a.veil, b.veil, u),
        va: lerp(a.va, b.va, u), sky: mixRGB(a.sky, b.sky, u)
      };
    }
  }
  return SUNKEY[SUNKEY.length - 1];
}

/* ------------------------ étiquettes du clavier ------------------------
   Le jeu lit les POSITIONS physiques des touches (e.code), donc le même
   geste marche en AZERTY, en QWERTY ou en QWERTZ. Seuls les libellés
   affichés changent : la touche « avant » est marquée Z sur un AZERTY et
   W sur un QWERTY. On part de l'AZERTY, puis on corrige dès qu'on sait.  */
const KB = { up: "Z", left: "Q", down: "S", right: "D", anchor: "A", known: false };
const KB_CODE = { KeyW: "up", KeyA: "left", KeyS: "down", KeyD: "right", KeyQ: "anchor" };

/* 1) Chromium sait donner la correspondance complète, sans rien presser. */
function kbDetect() {
  try {
    if (!navigator.keyboard || !navigator.keyboard.getLayoutMap) return;
    navigator.keyboard.getLayoutMap().then(map => {
      for (const code in KB_CODE) {
        const c = map.get(code);
        if (c && c.length === 1) { KB[KB_CODE[code]] = c.toUpperCase(); KB.known = true; }
      }
    }).catch(() => { });
  } catch (e) { }
}
/* 2) Ailleurs (Firefox, Safari), on apprend à la première frappe. */
function kbLearn(e) {
  const slot = KB_CODE[e.code];
  if (!slot) return;
  const c = (e.key || "");
  if (c.length === 1 && /[a-zA-Z]/.test(c)) { KB[slot] = c.toUpperCase(); KB.known = true; }
}

/* --------------------------- canvas & caméra --------------------------- */
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d", { alpha: false });
let W = 720, H = 450, PIX = 2;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  PIX = Math.max(2, Math.round(w / 740));
  W = Math.ceil(w / PIX); H = Math.ceil(h / PIX);
  cv.width = W; cv.height = H;
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener("resize", resize);

const cam = { x: 0, y: 0, shake: 0 };
let SHX = 0, SHY = 0;
/* monde -> écran (y inversé) */
const sX = x => (x - cam.x) * CFG.K + W * 0.5 + SHX;
const sY = y => -(y - cam.y) * CFG.K + H * 0.5 + SHY;
/* écran -> monde */
const wX = px => (px - W * 0.5 - SHX) / CFG.K + cam.x;
const wY = py => -(py - H * 0.5 - SHY) / CFG.K + cam.y;
const onScreen = (x, y, m) => {
  const px = sX(x), py = sY(y); m = m || 0;
  return px > -m && px < W + m && py > -m && py < H + m;
};
