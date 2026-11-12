// Quét tài liệu: chụp/chọn ảnh → kéo 4 góc nắn thẳng → bộ lọc → xuất PDF (tuỳ chọn OCR).
import { el, icon, dropzone, busy, progressBar, toast, sleep } from './util.js';
import { PDFDocument, canvasToBlob, freeCanvas, saveDoc, pdfBlob } from './pdfcore.js';
import { showOutputs, field, select, seg } from './shared.js';

const MAX_SRC = 3200;           // cạnh dài tối đa của ảnh gốc lưu lại (tiết kiệm RAM trên điện thoại)
const A4 = [595.28, 841.89];
const FILTERS = [['color', 'Màu rõ'], ['doc', 'Tài liệu'], ['bw', 'Đen trắng'], ['orig', 'Gốc']];
const INSET = 0.02;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const defaultCorners = () => [[INSET, INSET], [1 - INSET, INSET], [1 - INSET, 1 - INSET], [INSET, 1 - INSET]]; // TL, TR, BR, BL

/* ---------------- Xử lý ảnh (thuần JS, chạy trên máy) ---------------- */

function loadImg(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Không đọc được ảnh này.'));
    im.src = url;
  });
}

function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Kích thước ảnh sau khi nắn thẳng, theo độ dài cạnh của khung, giới hạn cạnh dài ≤ cap.
export function outSize(corners, sw, sh, cap) {
  const P = corners.map(([x, y]) => [x * sw, y * sh]);
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const W = Math.max(dist(P[0], P[1]), dist(P[3], P[2]));
  const H = Math.max(dist(P[0], P[3]), dist(P[1], P[2]));
  const k = Math.min(1, cap / Math.max(W, H, 1));
  return [Math.max(8, Math.round(W * k)), Math.max(8, Math.round(H * k))];
}

// Nắn phối cảnh: ánh xạ hình vuông đơn vị → tứ giác nguồn (Heckbert), lấy mẫu song tuyến tính.
export function warp(src, corners, outW, outH) {
  const sw = src.width, sh = src.height, sd = src.data;
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = corners.map(([x, y]) => [x * sw, y * sh]);
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let a, b, d, e, g = 0, h = 0;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = x1 - x0; b = x3 - x0; d = y1 - y0; e = y3 - y0;
  } else {
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; d = y1 - y0 + g * y1; e = y3 - y0 + h * y3;
  }
  const c = x0, f = y0;
  const out = new ImageData(outW, outH), od = out.data;
  const mx = sw - 1, my = sh - 1;
  let o = 0;
  for (let j = 0; j < outH; j++) {
    const v = (j + 0.5) / outH;
    for (let i = 0; i < outW; i++, o += 4) {
      const u = (i + 0.5) / outW;
      const den = g * u + h * v + 1;
      let x = (a * u + b * v + c) / den - 0.5, y = (d * u + e * v + f) / den - 0.5;
      x = x < 0 ? 0 : x > mx ? mx : x; y = y < 0 ? 0 : y > my ? my : y;
      const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
      const xj = xi < mx ? xi + 1 : xi, yj = yi < my ? yi + 1 : yi;
      const p00 = (yi * sw + xi) * 4, p10 = (yi * sw + xj) * 4, p01 = (yj * sw + xi) * 4, p11 = (yj * sw + xj) * 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      od[o] = sd[p00] * w00 + sd[p10] * w10 + sd[p01] * w01 + sd[p11] * w11;
      od[o + 1] = sd[p00 + 1] * w00 + sd[p10 + 1] * w10 + sd[p01 + 1] * w01 + sd[p11 + 1] * w11;
      od[o + 2] = sd[p00 + 2] * w00 + sd[p10 + 2] * w10 + sd[p01 + 2] * w01 + sd[p11 + 2] * w11;
      od[o + 3] = 255;
    }
  }
  return out;
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w; let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / n;
      acc += src[row + clamp(x + r + 1, 0, w - 1)] - src[row + clamp(x - r, 0, w - 1)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x];
    }
  }
  return out;
}

const GAMMA = (() => { const t = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) t[i] = 255 * Math.pow(i / 255, 1.25); return t; })();

// Bộ lọc tại chỗ. Ước lượng màu nền giấy (lọc max + làm mờ trên lưới thô) rồi chia cho nền → giấy trắng đều, chữ đậm.
export function applyFilter(img, kind) {
  if (kind === 'orig') return img;
  const w = img.width, h = img.height, d = img.data;
  const s = Math.max(1, Math.round(Math.max(w, h) / 320));
  const gw = Math.ceil(w / s), gh = Math.ceil(h / s);
  let grid = new Float32Array(gw * gh);
  for (let y = 0; y < h; y++) {
    const row = ((y / s) | 0) * gw;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const k = row + ((x / s) | 0);
      if (l > grid[k]) grid[k] = l;
    }
  }
  const r = Math.max(2, Math.round(gw / 14));
  grid = boxBlur(boxBlur(grid, gw, gh, r), gw, gh, Math.max(1, r >> 1));
  for (let y = 0; y < h; y++) {
    const fy = clamp((y + 0.5) / s - 0.5, 0, gh - 1), y0 = fy | 0, y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = clamp((x + 0.5) / s - 0.5, 0, gw - 1), x0 = fx | 0, x1 = Math.min(gw - 1, x0 + 1), tx = fx - x0;
      const bg = Math.max(40, (grid[y0 * gw + x0] * (1 - tx) + grid[y0 * gw + x1] * tx) * (1 - ty) + (grid[y1 * gw + x0] * (1 - tx) + grid[y1 * gw + x1] * tx) * ty);
      const i = (y * w + x) * 4;
      if (kind === 'color') {
        const k = 255 / bg;
        d[i] = GAMMA[Math.min(255, d[i] * k) | 0]; d[i + 1] = GAMMA[Math.min(255, d[i + 1] * k) | 0]; d[i + 2] = GAMMA[Math.min(255, d[i + 2] * k) | 0];
      } else {
        const t = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / bg;
        const v = kind === 'bw' ? (t > 0.8 ? 255 : 0) : clamp((t - 0.55) / 0.35, 0, 1) * 255;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
  }
  return img;
}

function rotateCanvas(c, rot) {
  if (!rot) return c;
  const swap = rot % 180 !== 0;
  const r = canvasOf(swap ? c.height : c.width, swap ? c.width : c.height);
  const ctx = r.getContext('2d');
  ctx.translate(r.width / 2, r.height / 2); ctx.rotate(rot * Math.PI / 180);
  ctx.drawImage(c, -c.width / 2, -c.height / 2);
  return r;
}

// Dựng canvas kết quả từ dữ liệu nguồn + khung + bộ lọc + xoay.
function render(srcData, srcW, srcH, it, cap) {
  const [W, H] = outSize(it.corners, srcW, srcH, cap);
  const out = applyFilter(warp(srcData, it.corners, W, H), it.filter);
  const c = canvasOf(W, H); c.getContext('2d').putImageData(out, 0, 0);
  const r = rotateCanvas(c, it.rot);
  if (r !== c) freeCanvas(c);
  return r;
}

async function ingest(file) {
  const url0 = URL.createObjectURL(file);
  try {
    const im = await loadImg(url0);
    const k = Math.min(1, MAX_SRC / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
    const c = canvasOf(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(im, 0, 0, w, h);
    const blob = await canvasToBlob(c, 'image/jpeg', 0.9);
    const thumb = thumbOf(c);
    freeCanvas(c);
    return { name: file.name, blob, url: URL.createObjectURL(blob), w, h, thumb, corners: defaultCorners(), filter: 'color', rot: 0 };
  } finally { URL.revokeObjectURL(url0); }
}

function thumbOf(c) {
  const k = Math.min(1, 140 / Math.max(c.width, c.height));
  const t = canvasOf(Math.max(1, Math.round(c.width * k)), Math.max(1, Math.round(c.height * k)));
  t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
  const u = t.toDataURL('image/jpeg', 0.6); freeCanvas(t); return u;
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = el('script', { src }); s.onload = () => res(); s.onerror = () => rej(new Error('Không tải được bộ nhận dạng chữ (OCR).'));
    document.head.append(s);
  });
}

/* ---------------- Giao diện ---------------- */

export function scanTool(root) {
  const items = [];
  let cur = -1, view = null, token = 0, raf = 0;
  const out = el('div'), prog = progressBar();
  const o = { q: 'std', ocr: false, lang: 'vie+eng' };

  /* --- Thêm trang --- */
  const camIn = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
  camIn.addEventListener('change', () => { if (camIn.files.length) addFiles([...camIn.files]); camIn.value = ''; });
  const camBtn = el('button', { class: 'btn primary', onclick: () => camIn.click() }, icon('scan', 18), 'Chụp bằng camera');
  const dz = dropzone({
    accept: 'image/*', multiple: true, label: 'Chọn ảnh giấy tờ hoặc kéo thả vào đây',
    sub: 'Có thể chọn nhiều ảnh · ảnh chỉ được xử lý trên máy bạn',
    onFiles: (files) => addFiles(files.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }))),
  });
  async function addFiles(files) {
    await busy(null, async () => {
      const first = items.length;
      for (const f of files) {
        try { items.push(await ingest(f)); }
        catch (e) { toast(`${f.name}: ${e.message}`, true); }
        await sleep(0);
      }
      if (items.length > first) choose(first);
      drawStrip(); updateAll();
    });
  }

  /* --- Dải trang --- */
  const strip = el('div', { class: 'sstrip' });
  function drawStrip() {
    strip.replaceChildren(...items.map((it, i) => el('button', { class: 'spage' + (i === cur ? ' on' : ''), title: 'Chỉnh trang ' + (i + 1), onclick: () => choose(i) },
      el('img', { src: it.thumb, alt: 'Trang ' + (i + 1), draggable: 'false' }), el('span', {}, String(i + 1)))));
    const on = strip.querySelector('.on');
    if (on) strip.scrollLeft = Math.max(0, on.offsetLeft - strip.clientWidth / 2 + on.offsetWidth / 2);
    if (strip.parentElement) strip.parentElement.style.display = items.length ? '' : 'none';
  }

  /* --- Khung chỉnh --- */
  const stage = el('div', { class: 'sstage' });
  const stageImg = el('img', { alt: '', draggable: 'false' });
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'sov'); svg.setAttribute('viewBox', '0 0 1 1'); svg.setAttribute('preserveAspectRatio', 'none');
  const poly = document.createElementNS(NS, 'polygon'); svg.append(poly);
  const handles = [0, 1, 2, 3].map((k) => el('div', { class: 'shandle', 'data-k': k, role: 'slider', 'aria-label': 'Góc ' + (k + 1) }));
  stage.append(stageImg, svg, ...handles);
  const prevCanvas = el('canvas', { class: 'sprev' });
  const prevBox = el('div', { class: 'sprevbox' }, el('div', { class: 'hint', style: { marginBottom: '6px' } }, 'Kết quả'), prevCanvas);
  const filterHost = el('div');

  let drag = -1;
  handles.forEach((h, k) => {
    h.addEventListener('pointerdown', (e) => { e.preventDefault(); drag = k; try { h.setPointerCapture(e.pointerId); } catch (_) {} h.classList.add('on'); });
    h.addEventListener('pointermove', (e) => {
      if (drag !== k || cur < 0) return;
      const r = stageImg.getBoundingClientRect();
      items[cur].corners[k] = [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)];
      layout(); schedule();
    });
    const end = () => { if (drag !== k) return; drag = -1; h.classList.remove('on'); refreshThumb(); };
    h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
    // Bàn phím: mũi tên nhích góc
    h.setAttribute('tabindex', '0');
    h.addEventListener('keydown', (e) => {
      const st = e.shiftKey ? 0.02 : 0.005, m = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
      if (!m || cur < 0) return; e.preventDefault();
      const c = items[cur].corners[k]; items[cur].corners[k] = [clamp(c[0] + m[0], 0, 1), clamp(c[1] + m[1], 0, 1)];
      layout(); schedule(); refreshThumb();
    });
  });
  function layout() {
    if (cur < 0) return;
    const cs = items[cur].corners;
    handles.forEach((h, k) => { h.style.left = cs[k][0] * 100 + '%'; h.style.top = cs[k][1] * 100 + '%'; });
    poly.setAttribute('points', cs.map(c => c.join(',')).join(' '));
  }
  function schedule() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; renderPrev(); }); }
  function renderPrev() {
    if (!view || cur < 0 || view.it !== items[cur]) return;
    const r = render(view.data, view.w, view.h, items[cur], 760);
    prevCanvas.width = r.width; prevCanvas.height = r.height;
    prevCanvas.getContext('2d').drawImage(r, 0, 0);
    if (r !== prevCanvas) freeCanvas(r);
  }
  function refreshThumb() {
    if (cur < 0 || !view || view.it !== items[cur]) return;
    items[cur].thumb = thumbOf(prevCanvas);
    const im = strip.children[cur] && strip.children[cur].querySelector('img'); if (im) im.src = items[cur].thumb;
  }

  async function choose(i) {
    cur = i; const it = items[i]; const my = ++token;
    drawStrip();
    editor.style.display = '';
    stageImg.src = it.url; layout();
    filterHost.replaceChildren(seg(FILTERS, it.filter, (v) => { it.filter = v; renderPrev(); refreshThumb(); }));
    title.textContent = `Trang ${i + 1}/${items.length}`;
    nav();
    // Nạp ảnh ở độ phân giải xem trước để nắn nhanh khi kéo.
    const im = await loadImg(it.url); if (my !== token) return;
    const k = Math.min(1, 1000 / Math.max(it.w, it.h));
    const c = canvasOf(Math.max(1, Math.round(it.w * k)), Math.max(1, Math.round(it.h * k)));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    view = { it, w: c.width, h: c.height, data: c.getContext('2d').getImageData(0, 0, c.width, c.height) };
    freeCanvas(c);
    renderPrev(); refreshThumb();
  }

  const title = el('h3', {}, '');
  const bPrev = el('button', { class: 'btn small', onclick: () => move(-1) }, icon('left', 14), 'Dời trước');
  const bNext = el('button', { class: 'btn small', onclick: () => move(1) }, 'Dời sau', icon('right', 14));
  function nav() { bPrev.disabled = cur <= 0; bNext.disabled = cur >= items.length - 1; }
  function move(d) {
    const j = cur + d; if (j < 0 || j >= items.length) return;
    [items[cur], items[j]] = [items[j], items[cur]]; cur = j; drawStrip(); title.textContent = `Trang ${cur + 1}/${items.length}`; nav();
  }
  function rot(d) { if (cur < 0) return; items[cur].rot = (items[cur].rot + d + 360) % 360; renderPrev(); refreshThumb(); }
  function del() {
    if (cur < 0) return;
    URL.revokeObjectURL(items[cur].url); items.splice(cur, 1); view = null; token++;
    if (!items.length) { cur = -1; drawStrip(); updateAll(); return; }
    choose(Math.min(cur, items.length - 1)); updateAll();
  }
  const editor = el('div', { class: 'panel', style: { display: 'none' } },
    title,
    el('p', { class: 'hint', style: { marginTop: 0 } }, 'Kéo 4 góc tròn cho khớp 4 góc tờ giấy. Ảnh ở phần Kết quả sẽ được nắn thẳng như máy scan.'),
    el('div', { class: 'scan-edit' }, stage, prevBox),
    el('div', { class: 'stack', style: { marginTop: '12px' } },
      filterHost,
      el('div', { class: 'btns' },
        el('button', { class: 'btn small', onclick: () => rot(270) }, icon('ccw', 14), 'Xoay trái'),
        el('button', { class: 'btn small', onclick: () => rot(90) }, icon('cw', 14), 'Xoay phải'),
        el('button', { class: 'btn small', onclick: () => { if (cur < 0) return; items[cur].corners = defaultCorners(); layout(); renderPrev(); refreshThumb(); } }, 'Đặt lại khung'),
        el('button', { class: 'btn small', onclick: () => { if (cur < 0) return; items.forEach(x => x.filter = items[cur].filter); toast('Đã áp dụng bộ lọc này cho tất cả trang.'); } }, 'Dùng bộ lọc này cho mọi trang')),
      el('div', { class: 'btns' }, bPrev, bNext,
        el('button', { class: 'btn small danger', onclick: del }, icon('trash', 14), 'Xoá trang này'))));

  /* --- Xuất PDF --- */
  const runBtn = el('button', { class: 'btn primary', disabled: true }, 'Tạo PDF');
  const exportPanel = el('div', { class: 'panel', style: { display: 'none' } }, el('div', { class: 'stack' },
    el('div', { class: 'fields' },
      field('Chất lượng', select([['std', 'Chuẩn (nhẹ, đủ rõ để in A4)'], ['hi', 'Cao (nét hơn, file nặng hơn)']], o.q, v => o.q = v)),
      field('Nhận dạng chữ (OCR)', select([['0', 'Không'], ['vie+eng', 'Có: tiếng Việt + Anh'], ['vie', 'Có: tiếng Việt'], ['eng', 'Có: tiếng Anh']], '0', v => { o.ocr = v !== '0'; if (o.ocr) o.lang = v; }),
        'Bật thì PDF bôi chọn/tìm kiếm được chữ, nhưng xuất chậm hơn.')),
    el('div', {}, runBtn), prog.root));
  function updateAll() {
    exportPanel.style.display = items.length ? '' : 'none';
    editor.style.display = items.length ? '' : 'none';
    runBtn.disabled = !items.length;
    runBtn.textContent = items.length ? `Tạo PDF ${items.length} trang` : 'Thêm ảnh trước';
    if (cur >= 0) { title.textContent = `Trang ${cur + 1}/${items.length}`; nav(); }
  }

  runBtn.addEventListener('click', () => busy(runBtn, async () => {
    out.replaceChildren();
    const cap = o.q === 'hi' ? 3000 : 2000;
    const doc = await PDFDocument.create();
    let worker = null;
    if (o.ocr) {
      const V = new URL('../vendor/', import.meta.url).href;
      prog.set(0.02, 'Đang chuẩn bị bộ nhận dạng chữ…');
      await loadScript(V + 'tesseract.min.js');
      worker = await Tesseract.createWorker(o.lang, 1, { workerPath: V + 'tesseract-worker.min.js', corePath: V, langPath: V + 'tessdata', gzip: true });
    }
    try {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        prog.set(i / items.length, `Đang xử lý trang ${i + 1}/${items.length}`);
        const im = await loadImg(it.url);
        const sc = canvasOf(it.w, it.h), sctx = sc.getContext('2d'); sctx.drawImage(im, 0, 0);
        const data = sctx.getImageData(0, 0, it.w, it.h); freeCanvas(sc);
        const c = render(data, it.w, it.h, it, cap);
        // Trang: vừa khít khổ A4 (theo chiều dọc/ngang của ảnh), giữ nguyên tỉ lệ.
        const box = c.width > c.height ? [A4[1], A4[0]] : A4;
        const s = Math.min(box[0] / c.width, box[1] / c.height), pw = c.width * s, ph = c.height * s;
        if (worker) {
          const { data: r } = await worker.recognize(c, {}, { pdf: true });
          const part = await PDFDocument.load(new Uint8Array(r.pdf));
          const [pg] = await doc.copyPages(part, [0]);
          const sz = pg.getSize(); pg.scale(pw / sz.width, ph / sz.height);
          doc.addPage(pg);
        } else {
          const blob = await canvasToBlob(c, 'image/jpeg', it.filter === 'bw' ? 0.8 : 0.86);
          const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
          const page = doc.addPage([pw, ph]);
          page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
        }
        freeCanvas(c);
        await sleep(0);
      }
    } finally { if (worker) { try { await worker.terminate(); } catch (_) {} } }
    prog.set(0.97, 'Đang lưu…');
    const bytes = await saveDoc(doc); prog.hide();
    showOutputs(out, [{ name: 'scan.pdf', data: pdfBlob(bytes), type: 'application/pdf' }], { title: `Đã tạo PDF ${items.length} trang${o.ocr ? ' (có nhận dạng chữ)' : ''}` });
  }));

  root.append(
    el('div', { class: 'panel' }, el('div', { class: 'btns', style: { marginBottom: '12px' } }, camBtn, camIn), dz),
    el('div', { class: 'panel', style: { padding: '10px' } }, strip), editor, exportPanel, out);
  drawStrip();
}
