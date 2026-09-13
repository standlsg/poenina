"use strict";
/* ==========================================================================
   POE NINA — l'image de fin
   Le pixel art est fourni tel quel : on se contente de le recaler sur la
   grille de pixels du jeu, puis d'isoler le lagon dans un calque à part
   pour le faire onduler ligne par ligne. De vraies petites vagues.
   ========================================================================== */

const EndShot = {
  ready: false, failed: false, loading: false,
  pw: 192, ph: 86,
  base: null,        // l'image, recalée sur la grille du jeu
  sea: null,         // le lagon seul, transparent ailleurs
  seaRows: null,     // lignes qui contiennent de l'eau
  glints: null,      // points où faire scintiller le soleil

  load() {
    if (this.loading || this.base || this.failed) return;
    this.loading = true;
    const img = new Image();
    img.onload = () => { try { this.bake(img); } catch (e) { this.failed = true; } };
    img.onerror = () => { this.failed = true; };
    img.src = "assets/paradise-pixel.jpg";
  },

  bake(img) {
    const pw = this.pw, ph = this.ph = Math.round(pw * img.height / img.width);
    const small = document.createElement("canvas");
    small.width = pw; small.height = ph;
    const g = small.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.drawImage(img, 0, 0, pw, ph);
    this.base = small;
    this.ready = true;

    let dat;
    try { dat = g.getImageData(0, 0, pw, ph); }
    catch (e) { return; }                  // canvas teinté (ouverture en file://)
    const d = dat.data, n = pw * ph;

    /* ---- 1. le lagon au jugé de la couleur : clair, franchement plus
            bleu-vert que rouge, et sous la ligne d'horizon ---- */
    const mask = new Uint8Array(n);
    for (let j = Math.floor(ph * 0.46); j < ph; j++) {
      for (let i = 0; i < pw; i++) {
        const o = (j * pw + i) * 4, r = d[o], gg = d[o + 1], b = d[o + 2];
        if ((r + gg + b) / 3 > 70 && b > r + 24 && gg > r + 4) mask[j * pw + i] = 1;
      }
    }
    /* ---- 2. on ne garde que les grandes plaques LARGES : une étendue
            d'eau est vaste et s'étale ; les yeux turquoise, le maillot de
            bain ou un reflet sur la peau sont petits et étroits. Eux ne
            doivent surtout pas se mettre à onduler. ---- */
    const keep = new Uint8Array(n), seen = new Uint8Array(n), st = [];
    for (let k = 0; k < n; k++) {
      if (!mask[k] || seen[k]) continue;
      const comp = []; st.length = 0; st.push(k); seen[k] = 1;
      let x0 = pw, x1 = 0, y0 = ph, y1 = 0;
      while (st.length) {
        const p = st.pop(); comp.push(p);
        const i = p % pw, j = (p / pw) | 0;
        if (i < x0) x0 = i; if (i > x1) x1 = i;
        if (j < y0) y0 = j; if (j > y1) y1 = j;
        if (i > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; st.push(p - 1); }
        if (i < pw - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; st.push(p + 1); }
        if (j > 0 && mask[p - pw] && !seen[p - pw]) { seen[p - pw] = 1; st.push(p - pw); }
        if (j < ph - 1 && mask[p + pw] && !seen[p + pw]) { seen[p + pw] = 1; st.push(p + pw); }
      }
      if (comp.length >= 300 && (x1 - x0) >= 18 && (y1 - y0) >= 6)
        for (const p of comp) keep[p] = 1;
    }

    /* ---- 3. calque du lagon + points de scintillement ---- */
    const rows = new Uint8Array(ph), glints = [];
    const seaC = document.createElement("canvas");
    seaC.width = pw; seaC.height = ph;
    const sg = seaC.getContext("2d");
    const sdat = sg.createImageData(pw, ph), sd = sdat.data;
    for (let k = 0; k < n; k++) {
      if (!keep[k]) continue;
      const o = k * 4;
      sd[o] = d[o]; sd[o + 1] = d[o + 1]; sd[o + 2] = d[o + 2]; sd[o + 3] = 255;
      const i = k % pw, j = (k / pw) | 0;
      rows[j] = 1;
      if (hash2(i * 7 + 1, j * 13 + 3) > 0.988) glints.push([i, j, hash2(j, i)]);
    }
    sg.putImageData(sdat, 0, 0);
    this.sea = seaC; this.seaRows = rows; this.glints = glints;
  },

  /* dessine l'image animée dans le rectangle (dx, dy) à l'échelle entière s */
  draw(dx, dy, s, t) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, 0, 0, this.pw, this.ph, dx, dy, this.pw * s, this.ph * s);
    if (!this.sea) return;
    // on borne au cadre : une ligne décalée ne doit pas déborder du sous-verre
    ctx.save();
    ctx.beginPath(); ctx.rect(dx, dy, this.pw * s, this.ph * s); ctx.clip();
    // vagues : chaque ligne d'eau glisse d'un pixel ou deux, en décalé
    for (let j = 0; j < this.ph; j++) {
      if (!this.seaRows[j]) continue;
      const off = Math.round(Math.sin(t * 1.6 + j * 0.5) * 1.1
        + Math.sin(t * 0.85 - j * 0.17) * 0.8);
      if (!off) continue;
      ctx.drawImage(this.sea, 0, j, this.pw, 1,
        dx + off * s, dy + j * s, this.pw * s, s);
    }
    // éclats de soleil sur l'eau
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const gl of this.glints) {
      if (Math.sin(t * 2.2 + gl[2] * 40) < 0.86) continue;
      ctx.fillRect(dx + gl[0] * s, dy + gl[1] * s, s, s);
    }
    ctx.restore();
  }
};
