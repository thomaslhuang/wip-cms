// Crop and rotate a picture (the crop button on a picture in a post).
//
// The frame stays put in the middle; the picture moves under it. Drag to move it, use the
// slider (or pinch, or scroll) to zoom, turn it a quarter at a time, or straighten it a few
// degrees. Shapes: the picture's own, the shape of the other pictures beside it (a carousel
// whose pictures are almost but not quite the same shape, say: this makes them exactly the
// same), and the usual ones.
//
// Saving puts the cropped picture under the same name, in the same format, so everywhere that
// uses it updates. The first crop keeps the uncropped original in .cms-trash/originals/, and
// crops always start from that, so Crop again can still reach the whole picture (lib/media.js).
import { h, icon, toast } from "./util.js";
import { api } from "./api.js";
import { t } from "./i18n.js";
import { uploadEdge } from "./media.js";

const COMMON = [[1, 1], [4, 5], [3, 4], [2, 3], [4, 3], [3, 2], [16, 9]];
const FORMATS = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

// 1.5 -> "3:2"; 1.4718 -> "1.47:1"
export function ratioName(r) {
  const all = [...COMMON, [9, 16], [5, 4], [5, 7], [7, 5]];
  const hit = all.find(([a, b]) => Math.abs(a / b - r) / r < 0.004);
  return hit ? `${hit[0]}:${hit[1]}` : r >= 1 ? `${r.toFixed(2)}:1` : `1:${(1 / r).toFixed(2)}`;
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(t("Couldn't open that picture.")));
  img.src = src;
});

// The shape most of the others share (to within 1.5%): they may differ a little themselves,
// so it's the one with the most others close to it. null if there are no others.
async function othersShape(urls) {
  const sizes = (await Promise.all(urls.map((u) => loadImage(u).then((i) => i.naturalWidth / i.naturalHeight, () => null)))).filter(Boolean);
  if (!sizes.length) return null;
  let best = sizes[0], bestCount = 0;
  for (const r of sizes) {
    const near = sizes.filter((x) => Math.abs(x - r) / r < 0.015);
    if (near.length > bestCount) { bestCount = near.length; best = near.reduce((a, b) => a + b, 0) / near.length; }
  }
  return best;
}

// url: the picture (its address on the site). others: addresses of the pictures beside it.
// Resolves with { ratio } once saved, or null if canceled.
export function openCrop({ url, others = [] }) {
  const clean = String(url).split("?")[0];
  const ext = (clean.match(/\.(webp|jpe?g|png)$/i) || [])[1]?.toLowerCase();
  if (!ext) { toast(t("Only WebP, JPEG and PNG pictures can be cropped here."), "error"); return Promise.resolve(null); }

  return new Promise(async (resolve) => {
    let img, match;
    try {
      [img, match] = await Promise.all([loadImage("/api/media/original?" + new URLSearchParams({ url: clean }) + "&v=" + Date.now()), othersShape(others.filter((o) => String(o).split("?")[0] !== clean))]);
    } catch (e) { toast(e.message, "error"); return resolve(null); }
    const W = img.naturalWidth, H = img.naturalHeight;

    // ----- what's being shown -----
    let quarter = 0;      // quarter turns (0–3)
    let fine = 0;         // straightening, in degrees (−15 to 15)
    let zoom = 1;         // 1 = the smallest that still fills the frame
    let ox = 0, oy = 0;   // where the picture's middle is, from the frame's middle (screen px)
    const turned = () => quarter % 2 === 1;
    const ownRatio = () => (turned() ? H / W : W / H);
    let ratioKey = match && Math.abs(match - W / H) / match > 0.002 ? "match" : "own";
    const ratio = () => (ratioKey === "own" ? ownRatio() : ratioKey === "match" ? match : Number(ratioKey));
    const angle = () => ((quarter * 90 + fine) * Math.PI) / 180;

    // ----- the stage -----
    const canvas = h("canvas", { class: "crop-canvas" });
    const stageBox = h("div", { class: "crop-stage" }, canvas);
    let SW = 0, SH = 0, fw = 0, fh = 0;
    const frameSize = () => {
      const r = ratio(), pad = 28;
      fw = Math.min(SW - pad * 2, (SH - pad * 2) * r);
      fh = fw / r;
    };
    // the least scale (screen px per picture px) at which the picture covers the frame
    const minScale = () => {
      const a = angle(), c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
      const ex = (fw / 2) * c + (fh / 2) * s, ey = (fw / 2) * s + (fh / 2) * c;
      return Math.max((2 * ex) / W, (2 * ey) / H);
    };
    const scale = () => minScale() * zoom;
    // does the picture, placed at (x, y), cover the whole frame?
    const covers = (x, y) => {
      const a = -angle(), c = Math.cos(a), s = Math.sin(a), k = scale();
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([sx, sy]) => {
        const px = (sx * fw) / 2 - x, py = (sy * fh) / 2 - y;
        const ix = (px * c - py * s) / k, iy = (px * s + py * c) / k;
        return Math.abs(ix) <= W / 2 + 0.01 && Math.abs(iy) <= H / 2 + 0.01;
      });
    };
    // move toward (x, y) as far as it can go, one direction at a time (so it slides along an edge)
    const along = (fromX, fromY, toX, toY) => {
      if (covers(toX, toY)) return [toX, toY];
      let lo = 0, hi = 1;
      for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (covers(fromX + (toX - fromX) * m, fromY + (toY - fromY) * m)) lo = m; else hi = m; }
      return [fromX + (toX - fromX) * lo, fromY + (toY - fromY) * lo];
    };
    const moveTo = (x, y) => {
      if (!covers(ox, oy)) { ox = 0; oy = 0; }    // after a turn or a new shape: start from the middle
      [ox] = along(ox, oy, x, oy);
      [, oy] = along(ox, oy, ox, y);
    };
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(SW * dpr); canvas.height = Math.round(SH * dpr);
      canvas.style.width = SW + "px"; canvas.style.height = SH + "px";
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, SW, SH);
      ctx.save();
      ctx.translate(SW / 2 + ox, SH / 2 + oy);
      ctx.rotate(angle());
      ctx.scale(scale(), scale());
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, -W / 2, -H / 2);
      ctx.restore();
      // everything outside the frame dimmed; the frame with thirds
      const x0 = (SW - fw) / 2, y0 = (SH - fh) / 2;
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.beginPath(); ctx.rect(0, 0, SW, SH); ctx.rect(x0, y0, fw, fh); ctx.fill("evenodd");
      ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, fw, fh);
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const f of [1 / 3, 2 / 3]) { ctx.moveTo(x0 + fw * f, y0); ctx.lineTo(x0 + fw * f, y0 + fh); ctx.moveTo(x0, y0 + fh * f); ctx.lineTo(x0 + fw, y0 + fh * f); }
      ctx.stroke();
      sizeNote.textContent = (() => { const [ow, oh] = outSize(); return `${ow} × ${oh}px · ${ratioName(ow / oh)}`; })();
    };
    const relayout = () => {
      const r = stageBox.getBoundingClientRect();
      SW = Math.max(200, r.width); SH = Math.max(200, r.height);
      frameSize();
      moveTo(ox, oy);
      draw();
    };

    // ----- the size it's saved at: the picture's own pixels, no bigger than the upload limit -----
    const outSize = () => {
      let ow = fw / scale(), oh = fh / scale();
      const cap = uploadEdge();
      if (Math.max(ow, oh) > cap) { const k = cap / Math.max(ow, oh); ow *= k; oh *= k; }
      ow = Math.max(1, Math.round(ow));
      return [ow, Math.max(1, Math.round(ow / ratio()))];
    };

    // ----- moving and zooming -----
    canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const x0 = e.clientX - ox, y0 = e.clientY - oy;
      const move = (ev) => { moveTo(ev.clientX - x0, ev.clientY - y0); draw(); };
      const up = () => { canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); };
      canvas.addEventListener("pointermove", move);
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", up);
    });
    const setZoom = (z) => {
      const before = scale();
      zoom = Math.min(6, Math.max(1, z));
      // zoom around the frame's middle
      const k = scale() / before;
      ox *= k; oy *= k;
      moveTo(ox, oy);
      zoomSlider.value = String(zoom);
      zoomSlider.dispatchEvent(new Event("input"));
      draw();
    };
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002))); }, { passive: false });
    const zoomSlider = h("input", { type: "range", min: 1, max: 6, step: 0.01, value: 1, "aria-label": t("Zoom"), oninput: () => { if (Number(zoomSlider.value) !== zoom) setZoom(Number(zoomSlider.value)); } });
    const fineSlider = h("input", { type: "range", min: -15, max: 15, step: 0.1, value: 0, "aria-label": t("Straighten"),
      oninput: () => { fine = Number(fineSlider.value); fineValue.textContent = `${fine.toFixed(1)}°`; relayout(); },
      ondblclick: () => { fineSlider.value = "0"; fineSlider.dispatchEvent(new Event("input")); } });
    const fineValue = h("span", { class: "crop-value" }, "0.0°");
    const turn = (d) => { quarter = (quarter + d + 4) % 4; relayout(); };

    // ----- shapes -----
    const shapeBtns = h("div", { class: "crop-shapes" });
    const drawShapes = () => {
      const opts = [
        ["own", t("Original")],
        ...(match ? [["match", t("Match the others ({shape})", { shape: ratioName(match) })]] : []),
        ...COMMON.map(([a, b]) => [String(a / b), `${a}:${b}`]),
      ];
      shapeBtns.replaceChildren(...opts.map(([key, label]) => h("button", { class: "btn small" + (key === ratioKey ? " on" : ""), "aria-pressed": String(key === ratioKey),
        onclick: () => { ratioKey = key; drawShapes(); relayout(); } }, label)));
      // a portrait version of a landscape shape and back: the common shapes have a turn button
    };
    const flip = () => { if (!["own", "match"].includes(ratioKey)) { ratioKey = String(1 / Number(ratioKey)); drawShapes(); relayout(); } };

    // ----- the window -----
    const sizeNote = h("span", { class: "muted small crop-size" });
    const close = (value) => { window.removeEventListener("resize", relayout); document.removeEventListener("keydown", keys); overlay.remove(); resolve(value); };
    const save = async () => {
      saveBtn.disabled = true;
      try {
        const [ow, oh] = outSize();
        const out = h("canvas", { width: ow, height: oh });
        const ctx = out.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        // the frame (fw × fh on screen) becomes the whole new picture (ow × oh)
        ctx.translate(ow / 2, oh / 2);
        ctx.scale(ow / fw, oh / fh);
        ctx.translate(ox, oy);
        ctx.rotate(angle());
        ctx.scale(scale(), scale());
        ctx.drawImage(img, -W / 2, -H / 2);
        const type = FORMATS[ext];
        const blob = await new Promise((r) => out.toBlob(r, type, type === "image/png" ? undefined : ext === "webp" ? 0.86 : 0.9));
        if (!blob || blob.type !== type) throw new Error(t("This browser can't save pictures as {format}. Try Chrome.", { format: ext.toUpperCase() }));
        await api.replaceMedia(clean, blob, true);
        const stamp = "?v=" + Date.now();
        document.querySelectorAll("img").forEach((i) => { const u = i.getAttribute("src") || ""; if (u.split("?")[0] === clean) i.src = clean + stamp; });
        toast(t("Cropped {name}", { name: decodeURI(clean.split("/").pop()) }));
        close({ ratio: ow / oh });
      } catch (e) { toast(e.message, "error"); saveBtn.disabled = false; }
    };
    const keys = (e) => {
      if (e.key === "Escape") close(null);
      else if (e.key === "Enter" && !e.target.closest?.("button")) save();
      else if (e.key.startsWith("Arrow") && !e.target.closest?.("input")) {
        const step = e.shiftKey ? 10 : 1;
        moveTo(ox + (e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0), oy + (e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0));
        draw(); e.preventDefault();
      }
    };
    const saveBtn = h("button", { class: "btn primary", onclick: save }, t("Save"));
    const overlay = h("div", { class: "overlay" }, h("div", { class: "dialog crop-dialog", role: "dialog", "aria-label": t("Crop and rotate") },
      h("p", { class: "dialog-title" }, t("Crop and rotate")),
      stageBox,
      h("div", { class: "crop-tools" },
        h("button", { class: "icon-btn", title: t("Turn left"), "aria-label": t("Turn left"), onclick: () => turn(-1) }, icon("rotate-ccw")),
        h("button", { class: "icon-btn", title: t("Turn right"), "aria-label": t("Turn right"), onclick: () => turn(1) }, icon("rotate-cw")),
        h("label", { class: "crop-slider" }, h("span", { class: "small" }, t("Straighten")), fineSlider, fineValue),
        h("label", { class: "crop-slider" }, h("span", { class: "small" }, t("Zoom")), zoomSlider)),
      h("div", { class: "crop-shape-row" }, shapeBtns,
        h("button", { class: "icon-btn", title: t("Portrait / landscape"), "aria-label": t("Portrait / landscape"), onclick: flip }, icon("arrows"))),
      h("p", { class: "muted small" }, t("Drag the picture to move it; scroll or pinch to zoom. It's saved under the same name, so everywhere it's used updates, and the uncropped original is kept, so you can crop it again later.")),
      h("div", { class: "dialog-buttons" },
        sizeNote,
        h("button", { class: "btn", onclick: () => { quarter = 0; fine = 0; fineSlider.value = "0"; fineSlider.dispatchEvent(new Event("input")); ratioKey = "own"; drawShapes(); ox = oy = 0; setZoom(1); relayout(); } }, t("Reset")),
        h("button", { class: "btn", onclick: () => close(null) }, t("Cancel")),
        saveBtn)));
    document.body.append(overlay);
    document.addEventListener("keydown", keys);
    window.addEventListener("resize", relayout);
    drawShapes();
    requestAnimationFrame(relayout);
  });
}
