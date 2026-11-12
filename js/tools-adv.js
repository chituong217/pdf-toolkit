// Nhóm công cụ nâng cao: nén, mật khẩu, watermark, đánh số trang, ký tên/chèn, OCR.
import { el, icon, dropzone, readBytes, fmtSize, baseName, busy, progressBar, toast, parseRanges, flatRange, sleep, askText, resultCard, download } from './util.js';
import { PDFDocument, StandardFonts, rgb, degrees, loadDoc, openRender, renderPage, canvasToBlob, freeCanvas, pageFrame, drawCentered, toWinAnsi, gsConvert, saveDoc, pdfBlob } from './pdfcore.js';
import { pdfPicker, showOutputs, field, select, check, seg } from './shared.js';

const PDF = 'application/pdf';
const mm = (v) => v * 72 / 25.4;
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };

function scopeField() {
  const s = { mode: 'all', range: '' };
  const rangeIn = el('input', { type: 'text', placeholder: 'Ví dụ: 2-5, 9', oninput: (e) => s.range = e.target.value });
  const rf = field('Các trang', rangeIn); rf.style.display = 'none';
  const node = el('div', { class: 'fields' },
    field('Áp dụng cho', select([['all', 'Tất cả các trang'], ['odd', 'Trang lẻ'], ['even', 'Trang chẵn'], ['range', 'Một số trang…']], 'all', (v) => { s.mode = v; rf.style.display = v === 'range' ? '' : 'none'; })), rf);
  s.node = node;
  s.indices = (n) => {
    if (s.mode === 'range') return flatRange(s.range, n);
    return Array.from({ length: n }, (_, i) => i).filter(i => s.mode === 'all' || (s.mode === 'odd' ? i % 2 === 0 : i % 2 === 1));
  };
  return s;
}

function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Không đọc được ảnh.')); im.src = src; });
}

/* ================= NÉN PDF ================= */
export function compressTool(root) {
  let info = null;
  const out = el('div'), prog = progressBar();
  const work = el('div', { style: { display: 'none' } });
  const o = { mode: 'gs', level: 'ebook', dpi: '110', q: '60' };
  const gsBox = el('div', { class: 'stack' }), imgBox = el('div', { class: 'stack', style: { display: 'none' } });
  const picker = pdfPicker({
    onLoaded: (i) => { info = i; work.style.display = ''; out.replaceChildren(); },
    onReset: () => { info = null; work.style.display = 'none'; out.replaceChildren(); },
  });
  const modeSeg = seg([['gs', 'Giữ chữ (khuyên dùng)'], ['img', 'Nén cực mạnh (thành ảnh)']], 'gs', (v) => {
    o.mode = v; gsBox.style.display = v === 'gs' ? '' : 'none'; imgBox.style.display = v === 'img' ? '' : 'none';
  });
  gsBox.append(field('Mức nén', select([
    ['printer', 'Nhẹ — giữ chất lượng in (300 dpi)'],
    ['ebook', 'Vừa — đọc trên màn hình (150 dpi)'],
    ['screen', 'Mạnh — nhỏ nhất (72 dpi)']], o.level, v => o.level = v)),
  el('p', { class: 'hint' }, 'Dùng Ghostscript: giảm độ phân giải ảnh, gộp ảnh trùng, tối ưu font. Chữ vẫn bôi chọn và tìm kiếm được.'));
  imgBox.append(el('div', { class: 'fields' },
    field('Độ phân giải', select([['72', '72 dpi (rất nhỏ)'], ['96', '96 dpi'], ['110', '110 dpi'], ['150', '150 dpi']], o.dpi, v => o.dpi = v)),
    field('Chất lượng JPEG', select([['40', 'Thấp (40%)'], ['60', 'Vừa (60%)'], ['80', 'Cao (80%)']], o.q, v => o.q = v))),
  el('p', { class: 'hint warn' }, 'Mỗi trang sẽ được chuyển thành ảnh: file nhỏ nhất có thể, nhưng mất khả năng bôi chọn/tìm kiếm chữ. Hợp với file scan.'));

  const runBtn = el('button', { class: 'btn primary' }, 'Nén file');
  runBtn.addEventListener('click', () => busy(runBtn, async () => {
    out.replaceChildren();
    let bytes;
    if (o.mode === 'gs') {
      prog.set(0.3, 'Đang nén bằng Ghostscript… (file lớn có thể mất vài chục giây)');
      bytes = await gsConvert(info.bytes, ['-dCompatibilityLevel=1.5', '-dPDFSETTINGS=/' + o.level, '-dDetectDuplicateImages=true', '-dCompressFonts=true', '-dSubsetFonts=true']);
    } else {
      const pdf = await openRender(info.bytes);
      const d = await PDFDocument.create();
      const sc = +o.dpi / 72;
      for (let p = 1; p <= info.pages; p++) {
        prog.set((p - 1) / info.pages, `Đang nén trang ${p}/${info.pages}`);
        const f = pageFrame(info.doc.getPage(p - 1));
        const c = await renderPage(pdf, p, { scale: sc, maxPixels: 20e6 });
        const blob = await canvasToBlob(c, 'image/jpeg', +o.q / 100); freeCanvas(c);
        const img = await d.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        d.addPage([f.W, f.H]).drawImage(img, { x: 0, y: 0, width: f.W, height: f.H });
        await sleep(0);
      }
      bytes = await saveDoc(d);
    }
    prog.hide();
    const saved = 1 - bytes.length / info.size;
    if (bytes.length >= info.size) {
      showOutputs(out, [{ name: baseName(info.name) + '_nen.pdf', data: pdfBlob(bytes), type: PDF }],
        { title: 'File này đã được tối ưu sẵn', note: `${fmtSize(info.size)} → ${fmtSize(bytes.length)}, không nhỏ hơn. Thử mức nén mạnh hơn.` });
    } else {
      showOutputs(out, [{ name: baseName(info.name) + '_nen.pdf', data: pdfBlob(bytes), type: PDF }],
        { title: `Giảm ${(saved * 100).toFixed(0)}% dung lượng`, note: `${fmtSize(info.size)} → ${fmtSize(bytes.length)}` });
    }
  }));
  work.append(el('div', { class: 'panel' }, el('div', { class: 'stack' }, modeSeg, gsBox, imgBox, el('div', {}, runBtn), prog.root)));
  root.append(picker, work, out);
}

/* ================= MẬT KHẨU ================= */
export function protectTool(root) {
  const out = el('div');
  const body = el('div');
  let mode = 'lock';
  const modeSeg = seg([['lock', 'Đặt mật khẩu'], ['unlock', 'Gỡ mật khẩu']], 'lock', (v) => { mode = v; out.replaceChildren(); draw(); });

  function draw() { body.replaceChildren(mode === 'lock' ? lockUI() : unlockUI()); }

  function lockUI() {
    let info = null;
    const work = el('div', { style: { display: 'none' } });
    const pw = el('input', { type: 'password', autocomplete: 'new-password' });
    const pw2 = el('input', { type: 'password', autocomplete: 'new-password' });
    const own = el('input', { type: 'password', autocomplete: 'new-password' });
    const perm = { print: true, copy: true, edit: true };
    const picker = pdfPicker({ onLoaded: (i) => { info = i; work.style.display = ''; out.replaceChildren(); }, onReset: () => { info = null; work.style.display = 'none'; } });
    const runBtn = el('button', { class: 'btn primary' }, 'Đặt mật khẩu');
    runBtn.addEventListener('click', () => busy(runBtn, async () => {
      out.replaceChildren();
      if (!pw.value) throw new Error('Hãy nhập mật khẩu.');
      if (pw.value !== pw2.value) throw new Error('Hai lần nhập mật khẩu chưa khớp.');
      let ownerPw = own.value;
      if (!ownerPw) { const a = new Uint8Array(12); crypto.getRandomValues(a); ownerPw = [...a].map(x => x.toString(36)).join('') + pw.value; }
      let allowed = 0;
      if (perm.print) allowed |= 4 | 2048;
      if (perm.copy) allowed |= 16 | 512;
      if (perm.edit) allowed |= 8 | 32 | 256 | 1024;
      const P = (0xfffff0c0 | allowed) | 0;
      const base = ['-sUserPassword=' + pw.value, '-sOwnerPassword=' + ownerPw, '-dPermissions=' + P];
      let bytes, lastErr;
      for (const enc of [['-dCompatibilityLevel=1.7', '-dEncryptionR=6', '-dKeyLength=256'], ['-dCompatibilityLevel=1.6', '-dEncryptionR=4', '-dKeyLength=128'], ['-dEncryptionR=3', '-dKeyLength=128']]) {
        try { bytes = await gsConvert(info.bytes, [...enc, ...base]); break; } catch (e) { lastErr = e; }
      }
      if (!bytes) throw lastErr || new Error('Không mã hoá được file.');
      showOutputs(out, [{ name: baseName(info.name) + '_baomat.pdf', data: pdfBlob(bytes), type: PDF }], { title: 'Đã đặt mật khẩu', note: 'Hãy nhớ mật khẩu — không có cách khôi phục nếu quên.' });
    }));
    work.append(el('div', { class: 'panel' }, el('div', { class: 'stack' },
      el('div', { class: 'fields' }, field('Mật khẩu để mở file', pw), field('Nhập lại mật khẩu', pw2)),
      el('div', { class: 'lab', style: { fontSize: '13px', fontWeight: 600, color: 'var(--muted)' } }, 'Cho phép người mở file:'),
      el('div', { class: 'btns', style: { gap: '18px' } },
        check('In', true, v => perm.print = v), check('Sao chép chữ', true, v => perm.copy = v), check('Chỉnh sửa', true, v => perm.edit = v)),
      field('Mật khẩu quản trị (tuỳ chọn)', own, 'Dùng để đổi quyền sau này. Để trống thì hệ thống tự tạo ngẫu nhiên.'),
      el('div', {}, runBtn))));
    return el('div', {}, picker, work);
  }

  function unlockUI() {
    const dz = dropzone({
      accept: '.pdf,application/pdf', label: 'Chọn file PDF đang có mật khẩu', sub: 'Bạn cần biết mật khẩu để gỡ',
      onFiles: ([f]) => busy(null, async () => {
        out.replaceChildren();
        const raw = await readBytes(f);
        const { bytes } = await loadDoc(raw); // tự hỏi mật khẩu nếu cần
        if (bytes === raw) { toast('File này không có mật khẩu hoặc hạn chế nào cả.'); return; }
        showOutputs(out, [{ name: baseName(f.name) + '_mokhoa.pdf', data: pdfBlob(bytes), type: PDF }], { title: 'Đã gỡ mật khẩu' });
      }),
    });
    return el('div', {}, dz, el('p', { class: 'hint' }, 'Chỉ dùng cho file của bạn hoặc file bạn được phép mở. Công cụ không thể đoán/phá mật khẩu.'));
  }
  draw();
  root.append(el('div', { class: 'panel' }, modeSeg), body, out);
}

/* ================= WATERMARK ================= */
function makeTextCanvas(text, color, bold) {
  const lines = String(text).split('\n'), px = 160, pad = 24;
  const font = `${bold ? '700 ' : ''}${px}px system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  const m = document.createElement('canvas').getContext('2d'); m.font = font;
  const wmax = Math.max(1, ...lines.map(l => m.measureText(l).width));
  const c = document.createElement('canvas');
  c.width = Math.ceil(wmax + pad * 2); c.height = Math.ceil(lines.length * px * 1.25 + pad * 2);
  const ctx = c.getContext('2d'); ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, pad + (wmax - ctx.measureText(l).width) / 2, pad + i * px * 1.25));
  return c;
}
function wmPlacements(W, H, ar, o) {
  const w = W * o.size / 100, h = w / ar, out = [];
  if (o.layout === 'center') return [{ cx: W / 2, cy: H / 2, w, h, angle: o.angle }];
  const sx = w * 1.6, sy = Math.max(h * 2.6, w * 0.5);
  let row = 0;
  for (let y = sy / 2; y < H + sy; y += sy, row++) {
    for (let x = -sx / 2 + (row % 2) * sx / 2; x < W + sx; x += sx) {
      out.push({ cx: x, cy: y, w, h, angle: o.angle });
      if (out.length > 400) return out;
    }
  }
  return out;
}

export function watermarkTool(root) {
  let info = null, pdf = null, base = null;
  const out = el('div');
  const work = el('div', { style: { display: 'none' } });
  const o = { type: 'text', text: 'BẢN SAO', color: '#c8322a', bold: true, size: 55, opacity: 25, angle: 45, layout: 'center', img: null };
  const scope = scopeField();
  const prev = el('canvas', { style: { maxWidth: '100%', height: 'auto', boxShadow: '0 2px 12px rgba(0,0,0,.25)', background: '#fff' } });
  let wmCanvas = null, pageDims = { W: 595, H: 842 }, raf = 0;

  const rebuild = () => {
    if (o.type === 'text') wmCanvas = o.text.trim() ? makeTextCanvas(o.text, o.color, o.bold) : null;
    else wmCanvas = o.img;
    schedule();
  };
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawPrev); };
  function drawPrev() {
    if (!base) return;
    prev.width = base.width; prev.height = base.height;
    const ctx = prev.getContext('2d'); ctx.drawImage(base, 0, 0);
    if (!wmCanvas) return;
    const s = base.width / pageDims.W;
    ctx.globalAlpha = o.opacity / 100;
    for (const p of wmPlacements(pageDims.W, pageDims.H, wmCanvas.width / wmCanvas.height, o)) {
      ctx.save(); ctx.translate(p.cx * s, (pageDims.H - p.cy) * s); ctx.rotate(-p.angle * Math.PI / 180);
      ctx.drawImage(wmCanvas, -p.w * s / 2, -p.h * s / 2, p.w * s, p.h * s); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  const picker = pdfPicker({
    onLoaded: async (i) => {
      info = i; out.replaceChildren(); pdf = await openRender(i.bytes);
      base = await renderPage(pdf, 1, { scale: 0.8 });
      const f = pageFrame(i.doc.getPage(0)); pageDims = { W: f.W, H: f.H };
      work.style.display = ''; rebuild();
    },
    onReset: () => { info = null; base = null; work.style.display = 'none'; out.replaceChildren(); },
  });

  const textBox = el('div', { class: 'stack' });
  const imgBox = el('div', { class: 'stack', style: { display: 'none' } });
  const txt = el('textarea', { rows: '2', oninput: (e) => { o.text = e.target.value; rebuild(); } }); txt.value = o.text;
  textBox.append(field('Nội dung chữ', txt, 'Có thể xuống dòng. Hỗ trợ tiếng Việt có dấu.'),
    el('div', { class: 'fields' }, field('Màu chữ', el('input', { type: 'color', value: o.color, oninput: (e) => { o.color = e.target.value; rebuild(); } })),
      el('div', { class: 'field' }, el('span', { class: 'lab' }, 'Kiểu chữ'), check('In đậm', true, v => { o.bold = v; rebuild(); }))));
  imgBox.append(dropzone({
    accept: 'image/*', label: 'Chọn ảnh/logo làm watermark', sub: 'Ảnh PNG nền trong suốt cho kết quả đẹp nhất',
    onFiles: ([f]) => busy(null, async () => {
      const url = URL.createObjectURL(f); const im = await loadImage(url);
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      o.img = c; rebuild(); toast('Đã chọn ảnh: ' + f.name);
    }),
  }));

  const typeSeg = seg([['text', 'Chữ'], ['image', 'Ảnh / logo']], 'text', (v) => {
    o.type = v; textBox.style.display = v === 'text' ? '' : 'none'; imgBox.style.display = v === 'image' ? '' : 'none'; rebuild();
  });
  const slider = (label, key, min, max, step, unit) => {
    const val = el('span', {}, o[key] + unit);
    const i = el('input', { type: 'range', min, max, step, value: o[key], oninput: (e) => { o[key] = +e.target.value; val.textContent = o[key] + unit; schedule(); } });
    return el('div', { class: 'field' }, el('label', {}, label + ': ', val), i);
  };

  const runBtn = el('button', { class: 'btn primary' }, 'Đóng watermark vào PDF');
  runBtn.addEventListener('click', () => busy(runBtn, async () => {
    out.replaceChildren();
    if (!wmCanvas) throw new Error(o.type === 'text' ? 'Hãy nhập nội dung chữ.' : 'Hãy chọn ảnh watermark.');
    const idx = scope.indices(info.pages);
    const { doc } = await loadDoc(info.bytes);
    const blob = await canvasToBlob(wmCanvas, 'image/png');
    const img = await doc.embedPng(new Uint8Array(await blob.arrayBuffer()));
    const ar = wmCanvas.width / wmCanvas.height;
    for (const i of idx) {
      const page = doc.getPage(i), f = pageFrame(page);
      for (const p of wmPlacements(f.W, f.H, ar, o)) drawCentered(page, img, p.cx, p.cy, p.w, p.h, p.angle, o.opacity / 100);
    }
    showOutputs(out, [{ name: baseName(info.name) + '_watermark.pdf', data: pdfBlob(await saveDoc(doc)), type: PDF }], { title: `Đã đóng watermark ${idx.length} trang` });
  }));

  work.append(el('div', { class: 'panel' }, el('div', { class: 'stack' }, typeSeg, textBox, imgBox,
    el('div', { class: 'fields' }, slider('Kích thước', 'size', 10, 100, 1, '%'), slider('Độ đậm', 'opacity', 5, 100, 1, '%'), slider('Góc xoay', 'angle', -90, 90, 1, '°')),
    el('div', { class: 'fields' }, field('Bố cục', select([['center', 'Một dấu ở giữa trang'], ['tile', 'Lặp kín cả trang']], o.layout, v => { o.layout = v; schedule(); })), scope.node))),
    el('div', { class: 'panel center' }, el('p', { class: 'hint', style: { marginTop: 0 } }, 'Xem trước (trang 1)'), prev),
    el('div', { class: 'panel' }, runBtn));
  root.append(picker, work, out);
}

/* ================= ĐÁNH SỐ TRANG ================= */
export function numbersTool(root) {
  let info = null, pdf = null, base = null, raf = 0, dims = { W: 595, H: 842 };
  const out = el('div'), work = el('div', { style: { display: 'none' } });
  const o = { fmt: '{n}', pos: 'bc', size: 11, margin: 10, from: 1, to: '', start: 1, color: '#000000' };
  const prev = el('canvas', { style: { maxWidth: '100%', height: 'auto', boxShadow: '0 2px 12px rgba(0,0,0,.25)', background: '#fff' } });
  const label = (n, total) => o.fmt.replace('{n}', n).replace('{total}', total);
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawPrev); };
  function layout(tw, W, H) {
    const M = mm(o.margin), vy = o.pos[0] === 'b' ? M : H - M - o.size * 0.72;
    const vx = o.pos[1] === 'l' ? M : o.pos[1] === 'c' ? (W - tw) / 2 : W - M - tw;
    return { vx, vy };
  }
  function drawPrev() {
    if (!base) return;
    prev.width = base.width; prev.height = base.height;
    const ctx = prev.getContext('2d'); ctx.drawImage(base, 0, 0);
    const s = base.width / dims.W; ctx.font = `${o.size * s}px Helvetica, Arial, sans-serif`; ctx.fillStyle = o.color;
    const t = toWinAnsi(label(o.start, o.start + Math.max(0, info.pages - o.from)));
    const { vx, vy } = layout(ctx.measureText(t).width / s, dims.W, dims.H);
    ctx.fillText(t, vx * s, (dims.H - vy) * s);
  }
  const picker = pdfPicker({
    onLoaded: async (i) => {
      info = i; out.replaceChildren(); pdf = await openRender(i.bytes);
      base = await renderPage(pdf, 1, { scale: 0.7 });
      const f = pageFrame(i.doc.getPage(0)); dims = { W: f.W, H: f.H };
      work.style.display = ''; schedule();
    },
    onReset: () => { info = null; base = null; work.style.display = 'none'; out.replaceChildren(); },
  });
  const numIn = (lab, key, min, hint) => field(lab, el('input', { type: 'number', min, value: String(o[key]), oninput: (e) => { o[key] = e.target.value === '' ? (key === 'to' ? '' : min) : +e.target.value; schedule(); } }), hint);
  const runBtn = el('button', { class: 'btn primary' }, 'Đánh số trang');
  runBtn.addEventListener('click', () => busy(runBtn, async () => {
    out.replaceChildren();
    const from = Math.max(1, Math.min(info.pages, +o.from || 1)), to = o.to === '' ? info.pages : Math.max(from, Math.min(info.pages, +o.to));
    const { doc } = await loadDoc(info.bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const total = o.start + (to - from);
    for (let p = from; p <= to; p++) {
      const page = doc.getPage(p - 1), f = pageFrame(page);
      const t = toWinAnsi(label(o.start + p - from, total));
      const tw = font.widthOfTextAtSize(t, o.size);
      const { vx, vy } = layout(tw, f.W, f.H);
      const m = f.map(vx, vy);
      page.drawText(t, { x: m.x, y: m.y, size: o.size, font, color: hexRgb(o.color), rotate: degrees(f.r) });
    }
    showOutputs(out, [{ name: baseName(info.name) + '_danhso.pdf', data: pdfBlob(await saveDoc(doc)), type: PDF }], { title: `Đã đánh số ${to - from + 1} trang` });
  }));
  work.append(el('div', { class: 'panel' }, el('div', { class: 'stack' },
    el('div', { class: 'fields' },
      field('Kiểu hiển thị', select([['{n}', '1, 2, 3'], ['Trang {n}', 'Trang 1'], ['{n}/{total}', '1/10'], ['Trang {n} / {total}', 'Trang 1 / 10'], ['- {n} -', '- 1 -']], o.fmt, v => { o.fmt = v; schedule(); })),
      field('Vị trí', select([['bc', 'Dưới, giữa'], ['br', 'Dưới, phải'], ['bl', 'Dưới, trái'], ['tc', 'Trên, giữa'], ['tr', 'Trên, phải'], ['tl', 'Trên, trái']], o.pos, v => { o.pos = v; schedule(); })),
      field('Màu', el('input', { type: 'color', value: o.color, oninput: (e) => { o.color = e.target.value; schedule(); } }))),
    el('div', { class: 'fields' }, numIn('Cỡ chữ (pt)', 'size', 6), numIn('Cách mép (mm)', 'margin', 2),
      numIn('Bắt đầu từ trang', 'from', 1), numIn('Đến trang', 'to', 1, 'Để trống = hết file'), numIn('Số đầu tiên', 'start', 0, 'VD: bỏ bìa thì trang 2 mang số 1'))),
    el('p', { class: 'hint' }, 'Chữ dùng font Helvetica nên dấu tiếng Việt sẽ được bỏ dấu (ví dụ "Trang" vẫn đúng).')),
    el('div', { class: 'panel center' }, el('p', { class: 'hint', style: { marginTop: 0 } }, 'Xem trước (trang 1)'), prev),
    el('div', { class: 'panel' }, runBtn));
  root.append(picker, work, out);
}

/* ================= KÝ TÊN & CHÈN ================= */
export function signTool(root) {
  let info = null, pdf = null, cur = 1, selId = null, uid = 0;
  const places = [];            // {id,page,fx,fy,fw,asset}
  const out = el('div'), work = el('div', { style: { display: 'none' } });
  const stage = el('div', { class: 'stage' });
  const pageLab = el('span', {}, '');
  const ctrl = el('div', { class: 'btns', style: { justifyContent: 'center', marginTop: '10px', minHeight: '40px' } });
  let canvasEl = null;

  const picker = pdfPicker({
    onLoaded: async (i) => { info = i; pdf = await openRender(i.bytes); cur = 1; places.length = 0; selId = null; out.replaceChildren(); work.style.display = ''; await showPage(); },
    onReset: () => { info = null; places.length = 0; work.style.display = 'none'; out.replaceChildren(); },
  });

  async function showPage() {
    pageLab.textContent = `Trang ${cur} / ${info.pages}`;
    canvasEl = await renderPage(pdf, cur, { scale: 1.1, maxPixels: 4e6 });
    drawOverlay();
  }
  function drawOverlay() {
    stage.replaceChildren(canvasEl);
    const ratio = canvasEl.width / canvasEl.height;
    for (const p of places.filter(p => p.page === cur)) {
      const fh = p.fw * ratio / p.asset.ar;
      const box = el('div', { class: 'ph' + (p.id === selId ? ' sel' : ''), style: { left: (p.fx - p.fw / 2) * 100 + '%', top: (p.fy - fh / 2) * 100 + '%', width: p.fw * 100 + '%', height: fh * 100 + '%' } },
        el('img', { src: p.asset.url, alt: 'Chữ ký' }));
      box.addEventListener('pointerdown', (e) => {
        e.preventDefault(); selId = p.id; box.setPointerCapture(e.pointerId);
        const r = stage.getBoundingClientRect(), dx = (e.clientX - r.left) / r.width - p.fx, dy = (e.clientY - r.top) / r.height - p.fy;
        const mv = (ev) => {
          const rr = stage.getBoundingClientRect();
          p.fx = Math.min(1, Math.max(0, (ev.clientX - rr.left) / rr.width - dx)); p.fy = Math.min(1, Math.max(0, (ev.clientY - rr.top) / rr.height - dy));
          box.style.left = (p.fx - p.fw / 2) * 100 + '%'; box.style.top = (p.fy - fh / 2) * 100 + '%';
        };
        const up = () => { box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up); drawOverlay(); drawCtrl(); };
        box.addEventListener('pointermove', mv); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
        stage.querySelectorAll('.ph').forEach(x => x.classList.remove('sel')); box.classList.add('sel');
      });
      stage.append(box);
    }
    drawCtrl();
  }
  function drawCtrl() {
    const p = places.find(x => x.id === selId && x.page === cur);
    if (!p) { ctrl.replaceChildren(el('span', { class: 'hint' }, places.length ? 'Bấm vào một chữ ký để chọn, kéo để di chuyển.' : 'Chưa có gì. Hãy tạo chữ ký hoặc chèn chữ ở bên trên.')); return; }
    const sl = el('input', { type: 'range', min: '3', max: '70', value: String(Math.round(p.fw * 100)), style: { width: '160px', accentColor: 'var(--accent)' }, oninput: (e) => { p.fw = +e.target.value / 100; drawOverlay(); } });
    ctrl.replaceChildren(el('label', { class: 'check' }, 'Kích thước', sl),
      el('button', { class: 'btn small', onclick: () => { for (let n = 1; n <= info.pages; n++) if (n !== cur) places.push({ ...p, id: ++uid, page: n }); toast(`Đã nhân bản sang ${info.pages - 1} trang còn lại.`); drawCtrl(); } }, 'Nhân bản sang mọi trang'),
      el('button', { class: 'btn small danger', onclick: () => { places.splice(places.indexOf(p), 1); selId = null; drawOverlay(); } }, icon('trash', 14), 'Xoá'));
  }
  const addAsset = (canvas) => {
    const asset = { canvas, ar: canvas.width / canvas.height, url: canvas.toDataURL('image/png') };
    const p = { id: ++uid, page: cur, fx: 0.5, fy: 0.5, fw: 0.25, asset }; places.push(p); selId = p.id; drawOverlay();
    toast('Đã thêm vào trang ' + cur + '. Kéo để đặt đúng chỗ.');
  };

  /* ---- vẽ chữ ký ---- */
  const pad = el('canvas', { class: 'sigpad', width: 1040, height: 360 });
  const pctx = pad.getContext('2d'); let drawing = false, bb = null, last = null;
  const resetPad = () => { pctx.clearRect(0, 0, pad.width, pad.height); bb = null; };
  const pt = (e) => { const r = pad.getBoundingClientRect(); return { x: (e.clientX - r.left) * pad.width / r.width, y: (e.clientY - r.top) * pad.height / r.height }; };
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); drawing = true; pad.setPointerCapture(e.pointerId); last = pt(e); pctx.beginPath(); pctx.arc(last.x, last.y, 3, 0, 7); pctx.fillStyle = '#10205a'; pctx.fill(); upd(last); });
  pad.addEventListener('pointermove', (e) => {
    if (!drawing) return; const p = pt(e);
    pctx.strokeStyle = '#10205a'; pctx.lineWidth = 6; pctx.lineCap = 'round'; pctx.lineJoin = 'round';
    pctx.beginPath(); pctx.moveTo(last.x, last.y); pctx.lineTo(p.x, p.y); pctx.stroke(); last = p; upd(p);
  });
  const end = () => { drawing = false; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  function upd(p) { bb = bb ? { x0: Math.min(bb.x0, p.x), y0: Math.min(bb.y0, p.y), x1: Math.max(bb.x1, p.x), y1: Math.max(bb.y1, p.y) } : { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; }
  const useDrawn = () => {
    if (!bb) return toast('Hãy ký vào khung trước.', true);
    const m = 10, x = Math.max(0, bb.x0 - m), y = Math.max(0, bb.y0 - m), w = Math.min(pad.width, bb.x1 + m) - x, h = Math.min(pad.height, bb.y1 + m) - y;
    const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
    c.getContext('2d').drawImage(pad, x, y, w, h, 0, 0, c.width, c.height); addAsset(c);
  };

  /* ---- tải ảnh chữ ký ---- */
  let rmBg = true;
  const upload = dropzone({
    accept: 'image/*', label: 'Hoặc tải ảnh chữ ký / con dấu', sub: 'Ảnh chụp chữ ký trên giấy trắng cũng được',
    onFiles: ([f]) => busy(null, async () => {
      const url = URL.createObjectURL(f); const im = await loadImage(url);
      const k = Math.min(1, 1200 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      if (rmBg) {
        const d = ctx.getImageData(0, 0, c.width, c.height), a = d.data;
        for (let i = 0; i < a.length; i += 4) { const mn = Math.min(a[i], a[i + 1], a[i + 2]); if (mn > 235) a[i + 3] = 0; else if (mn > 195) a[i + 3] = Math.round(a[i + 3] * (235 - mn) / 40); }
        ctx.putImageData(d, 0, 0);
      }
      addAsset(c);
    }),
  });

  const addText = async () => {
    const t = await askText({ title: 'Chèn văn bản', message: 'Ví dụ: họ tên, ngày tháng, "Đã duyệt"…', okText: 'Chèn' });
    if (!t || !t.trim()) return;
    addAsset(makeTextCanvas(t.trim(), '#111111', false));
  };

  const nav = (d) => async () => { const n = cur + d; if (n < 1 || n > info.pages) return; cur = n; selId = null; await showPage(); };
  const runBtn = el('button', { class: 'btn primary' }, 'Lưu PDF đã ký');
  runBtn.addEventListener('click', () => busy(runBtn, async () => {
    out.replaceChildren();
    if (!places.length) throw new Error('Bạn chưa thêm chữ ký hay văn bản nào.');
    const { doc } = await loadDoc(info.bytes);
    const emb = new Map();
    for (const p of places) {
      let img = emb.get(p.asset);
      if (!img) { const b = await canvasToBlob(p.asset.canvas, 'image/png'); img = await doc.embedPng(new Uint8Array(await b.arrayBuffer())); emb.set(p.asset, img); }
      const page = doc.getPage(p.page - 1), f = pageFrame(page);
      const w = p.fw * f.W, h = w / p.asset.ar;
      drawCentered(page, img, p.fx * f.W, f.H - p.fy * f.H, w, h, 0, 1);
    }
    showOutputs(out, [{ name: baseName(info.name) + '_daky.pdf', data: pdfBlob(await saveDoc(doc)), type: PDF }], { title: `Đã chèn ${places.length} mục vào PDF` });
  }));

  work.append(
    el('div', { class: 'panel' }, el('h3', {}, '1. Tạo chữ ký'),
      el('div', { class: 'stack' }, pad,
        el('div', { class: 'btns' }, el('button', { class: 'btn primary', onclick: useDrawn }, 'Thêm chữ ký vừa vẽ vào trang'), el('button', { class: 'btn', onclick: resetPad }, icon('eraser', 16), 'Xoá khung'),
          el('button', { class: 'btn', onclick: addText }, icon('text', 16), 'Chèn văn bản')),
        upload, check('Tự xoá nền trắng khi tải ảnh', true, v => rmBg = v))),
    el('div', { class: 'panel center' }, el('h3', { style: { textAlign: 'left' } }, '2. Đặt vào đúng vị trí'),
      el('div', { class: 'pagenav' }, el('button', { class: 'btn small', onclick: nav(-1) }, icon('left', 14), 'Trang trước'), pageLab, el('button', { class: 'btn small', onclick: nav(1) }, 'Trang sau', icon('right', 14))),
      stage, ctrl),
    el('div', { class: 'panel' }, runBtn));
  root.append(picker, work, out);
}

/* ================= OCR ================= */
function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = el('script', { src }); s.onload = () => res(); s.onerror = () => rej(new Error('Không tải được bộ nhận dạng chữ (OCR).'));
    document.head.append(s);
  });
}

export function ocrTool(root) {
  let info = null, worker = null, cancel = false;
  const out = el('div'), prog = progressBar(), work = el('div', { style: { display: 'none' } });
  const o = { lang: 'vie+eng', dpi: '200', what: 'both' };
  const rangeIn = el('input', { type: 'text', placeholder: 'Để trống = tất cả các trang' });
  const picker = pdfPicker({ onLoaded: (i) => { info = i; work.style.display = ''; out.replaceChildren(); }, onReset: () => { info = null; work.style.display = 'none'; out.replaceChildren(); } });
  const runBtn = el('button', { class: 'btn primary' }, 'Bắt đầu nhận dạng chữ');
  const stopBtn = el('button', { class: 'btn danger', style: { display: 'none' }, onclick: () => { cancel = true; if (worker) worker.terminate(); } }, 'Dừng');

  runBtn.addEventListener('click', () => busy(runBtn, async () => {
    out.replaceChildren(); cancel = false;
    const V = new URL('../vendor/', import.meta.url).href;
    prog.set(0.02, 'Đang chuẩn bị bộ nhận dạng chữ…');
    await loadScript(V + 'tesseract.min.js');
    const idx = rangeIn.value.trim() ? flatRange(rangeIn.value, info.pages) : info.doc.getPageIndices();
    const wantPdf = o.what !== 'txt', wantTxt = o.what !== 'pdf';
    let cur = '', text = '', done = 0;
    worker = await Tesseract.createWorker(o.lang, 1, {
      workerPath: V + 'tesseract-worker.min.js', corePath: V, langPath: V + 'tessdata', gzip: true,
      logger: (m) => { if (m.status === 'recognizing text' && !cancel) prog.set((done + m.progress) / idx.length, `${cur} · ${Math.round(m.progress * 100)}%`); },
    });
    stopBtn.style.display = '';
    const pdf = await openRender(info.bytes);
    const merged = wantPdf ? await PDFDocument.create() : null;
    try {
      for (const i of idx) {
        if (cancel) break;
        cur = `Trang ${i + 1} (${done + 1}/${idx.length})`;
        const c = await renderPage(pdf, i + 1, { scale: +o.dpi / 72, maxPixels: 16e6 });
        const f = pageFrame(info.doc.getPage(i));
        const { data } = await worker.recognize(c, {}, { pdf: wantPdf, text: true });
        freeCanvas(c);
        if (wantTxt) text += `\n\n=== Trang ${i + 1} ===\n\n` + data.text.trim();
        if (wantPdf) {
          const part = await PDFDocument.load(new Uint8Array(data.pdf));
          const [pg] = await merged.copyPages(part, [0]);
          const { width, height } = pg.getSize();
          if (Math.abs(width - f.W) > 0.5 || Math.abs(height - f.H) > 0.5) pg.scale(f.W / width, f.H / height);
          merged.addPage(pg);
        }
        done++;
      }
    } finally { stopBtn.style.display = 'none'; try { await worker.terminate(); } catch (_) {} worker = null; }
    prog.hide();
    if (cancel) { toast('Đã dừng.'); if (!done) return; }
    const outputs = [];
    if (wantPdf) outputs.push({ name: baseName(info.name) + '_ocr.pdf', data: pdfBlob(await saveDoc(merged)), type: PDF });
    if (wantTxt) outputs.push({ name: baseName(info.name) + '_ocr.txt', data: new Blob([text.trim() + '\n'], { type: 'text/plain;charset=utf-8' }), type: 'text/plain' });
    showOutputs(out, outputs, { zipName: baseName(info.name) + '_ocr.zip', title: `Đã nhận dạng chữ ${done} trang` });
  }));

  work.append(el('div', { class: 'panel' }, el('div', { class: 'stack' },
    el('div', { class: 'fields' },
      field('Ngôn ngữ trong tài liệu', select([['vie+eng', 'Tiếng Việt + Anh'], ['vie', 'Tiếng Việt'], ['eng', 'Tiếng Anh']], o.lang, v => o.lang = v)),
      field('Kết quả', select([['both', 'PDF tìm kiếm được + file văn bản'], ['pdf', 'Chỉ PDF tìm kiếm được'], ['txt', 'Chỉ file văn bản (.txt)']], o.what, v => o.what = v)),
      field('Độ phân giải quét', select([['150', '150 dpi (nhanh)'], ['200', '200 dpi (cân bằng)'], ['300', '300 dpi (chính xác hơn, chậm)']], o.dpi, v => o.dpi = v)),
      field('Các trang', rangeIn, 'VD: 1-5. OCR khá chậm, nên thử vài trang trước.')),
    el('p', { class: 'hint' }, 'Biến PDF scan/ảnh chụp thành PDF có thể bôi chọn và tìm kiếm chữ. Lần đầu có thể tải thêm vài MB dữ liệu ngôn ngữ (đã kèm sẵn trong app).'),
    el('div', { class: 'btns' }, runBtn, stopBtn), prog.root)));
  root.append(picker, work, out);
}
