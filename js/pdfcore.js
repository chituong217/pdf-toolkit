// Lõi xử lý PDF: mở file (kể cả file có mật khẩu), render trang, Ghostscript, toạ độ trang xoay.
import { askText } from './util.js';

export const { PDFDocument, StandardFonts, degrees, rgb } = window.PDFLib;
export const pdfjsLib = window.pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.js', import.meta.url).href;

/* ---------- Ghostscript ---------- */
export function runGS({ files, args, out }) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(new URL('./gs-worker.js', import.meta.url)); }
    catch (e) { reject(new Error('Trình duyệt không hỗ trợ Web Worker.')); return; }
    w.onmessage = (e) => {
      w.terminate();
      const d = e.data;
      if (d.ok) resolve(d);
      else {
        const err = new Error(d.error || 'Ghostscript xử lý thất bại.');
        err.logs = d.logs || []; err.code = d.code;
        reject(err);
      }
    };
    w.onerror = () => { w.terminate(); reject(new Error('Không khởi động được bộ xử lý Ghostscript (có thể chưa tải xong).')); };
    const copy = {}, tr = [];
    for (const [k, v] of Object.entries(files)) { copy[k] = v.slice(); tr.push(copy[k].buffer); }
    w.postMessage({ files: copy, args, out }, tr);
  });
}

const GS_BASE = ['-sDEVICE=pdfwrite', '-dNOPAUSE', '-dBATCH', '-dQUIET', '-dSAFER'];
export const gsArgs = (extra, outName = 'out.pdf') => [...GS_BASE, ...extra, '-sOutputFile=' + outName, 'in.pdf'];

export async function gsConvert(bytes, extra) {
  const r = await runGS({ files: { 'in.pdf': bytes }, args: gsArgs(extra), out: 'out.pdf' });
  return r.data;
}

/* ---------- Mở PDF ---------- */
const isEncErr = (e) => /encrypted/i.test((e && e.message) || '');

// Trả về { doc, bytes } — bytes đã được giải mã nếu file có mật khẩu.
export async function loadDoc(bytes) {
  try {
    return { doc: await PDFDocument.load(bytes, { updateMetadata: false }), bytes };
  } catch (e) {
    if (!isEncErr(e)) throw e;
  }
  let pw = '';
  for (let tries = 0; tries < 4; tries++) {
    // Ghostscript báo "thành công" cả khi sai mật khẩu (ra file rỗng), nên kiểm tra mật khẩu bằng pdf.js trước.
    const n = await countPagesWithPassword(bytes, pw);
    if (n > 0) {
      const out = await gsConvert(bytes, ['-sPDFPassword=' + pw]);
      const doc = await PDFDocument.load(out, { updateMetadata: false });
      if (doc.getPageCount() !== n) throw new Error('Không giải mã được file này (số trang không khớp sau khi giải mã).');
      return { doc, bytes: out };
    }
    pw = await askText({
      title: 'File có mật khẩu',
      message: tries ? 'Mật khẩu chưa đúng, thử lại.' : 'Nhập mật khẩu để mở. Nếu file chỉ bị hạn chế chỉnh sửa/in, hãy để trống và bấm OK.',
      type: 'password', okText: 'Mở',
    });
    if (pw === null) { const a = new Error('Đã huỷ'); a.name = 'AbortError'; throw a; }
  }
  throw new Error('Mật khẩu không đúng.');
}

// Trả về số trang nếu mật khẩu đúng, 0 nếu sai/thiếu mật khẩu.
async function countPagesWithPassword(bytes, password) {
  const task = pdfjsLib.getDocument({ data: bytes.slice(), password, isEvalSupported: false });
  try {
    const d = await task.promise; const n = d.numPages; await d.destroy(); return n;
  } catch (e) {
    if (e && e.name === 'PasswordException') return 0;
    throw e;
  }
}

export function openRender(bytes) {
  return pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
}

// Render một trang ra canvas. scale = px/pt (1 = 72dpi). Tự giới hạn số điểm ảnh.
export async function renderPage(pdf, num, { scale = 1, maxPixels = 16e6, canvas } = {}) {
  const page = await pdf.getPage(num);
  let vp = page.getViewport({ scale });
  const px = vp.width * vp.height;
  if (px > maxPixels) vp = page.getViewport({ scale: scale * Math.sqrt(maxPixels / px) });
  const c = canvas || document.createElement('canvas');
  c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();
  return c;
}

export const canvasToBlob = (c, type = 'image/png', q = 0.92) =>
  new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Không tạo được ảnh từ canvas.')), type, q));

export function freeCanvas(c) { c.width = c.height = 1; }

/* ---------- Toạ độ trang (có tính xoay) ---------- */
// Hệ "nhìn thấy": gốc ở góc dưới-trái, y hướng lên. map() đổi sang hệ toạ độ thật của trang.
export function pageFrame(page) {
  const mb = page.getMediaBox();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  const swap = r === 90 || r === 270;
  const map = (vx, vy) => {
    let ux, uy;
    if (r === 0) { ux = vx; uy = vy; }
    else if (r === 90) { ux = mb.width - vy; uy = vx; }
    else if (r === 180) { ux = mb.width - vx; uy = mb.height - vy; }
    else { ux = vy; uy = mb.height - vx; }
    return { x: mb.x + ux, y: mb.y + uy };
  };
  return { W: swap ? mb.height : mb.width, H: swap ? mb.width : mb.height, r, map, mb };
}

// Vẽ ảnh có tâm tại (cx,cy) theo hệ nhìn thấy, xoay `angle` độ ngược chiều kim đồng hồ.
export function drawCentered(page, img, cx, cy, w, h, angle = 0, opacity = 1) {
  const f = pageFrame(page);
  const c = f.map(cx, cy);
  const a = angle + f.r, t = a * Math.PI / 180;
  const x = c.x - (w / 2 * Math.cos(t) - h / 2 * Math.sin(t));
  const y = c.y - (w / 2 * Math.sin(t) + h / 2 * Math.cos(t));
  page.drawImage(img, { x, y, width: w, height: h, rotate: degrees(a), opacity });
}

// Chuyển chữ về dạng Helvetica (WinAnsi) hiển thị được: bỏ dấu tiếng Việt.
export function toWinAnsi(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7e -ÿ]/g, '?');
}

export async function saveDoc(doc) {
  return await doc.save({ useObjectStreams: true });
}

export function pdfBlob(bytes) { return new Blob([bytes], { type: 'application/pdf' }); }
