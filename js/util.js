// Tiện ích dùng chung: DOM, tải file, ZIP, khoảng trang, hộp thoại.

export function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') e.value = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

const ICONS = {
  merge: '<path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-1.2 2.9L4 22"/><path d="m20 22-5-5"/>',
  split: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.2-2.9L3 3"/><path d="m15 9 6-6"/>',
  organize: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  img2pdf: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  pdf2img: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  compress: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="m14 10 7-7"/><path d="m3 21 7-7"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  watermark: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  numbers: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="m10 3-2 18"/><path d="m16 3-2 18"/>',
  sign: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  ocr: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8h8"/><path d="M7 12h10"/><path d="M7 16h6"/>',
  cw: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  ccw: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  left: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  right: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  up: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  upload: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/>',
  dl: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>',
  text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  eraser: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
};
export function icon(name, size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}

export function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

export function baseName(name) {
  return String(name || 'file').replace(/\.[^.]+$/, '');
}

export function download(data, name, type = 'application/pdf') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
}

export function toast(msg, isErr = false, ms = 4200) {
  const box = document.getElementById('toasts');
  const t = el('div', { class: 'toast' + (isErr ? ' err' : ''), role: isErr ? 'alert' : 'status' }, msg);
  box.append(t);
  setTimeout(() => t.remove(), isErr ? Math.max(ms, 7000) : ms);
}

export function friendlyError(e) {
  const m = (e && e.message) || String(e);
  if (e && e.name === 'AbortError') return 'Đã huỷ.';
  if (/password/i.test(m) && /incorrect|wrong|invalid/i.test(m)) return 'Mật khẩu không đúng.';
  if (/Invalid PDF|No PDF header|Failed to parse|InvalidPDF/i.test(m)) return 'File này không phải PDF hợp lệ hoặc đã bị hỏng.';
  if (/memory|allocation|out of/i.test(m)) return 'Hết bộ nhớ khi xử lý file này. Thử file nhỏ hơn hoặc đóng bớt tab khác.';
  return m;
}

// Chạy tác vụ dài: khoá nút, hiện lỗi thân thiện.
export async function busy(btn, fn) {
  const old = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = ''; btn.append(el('span', { class: 'spin' }), ' Đang xử lý…'); }
  try { return await fn(); }
  catch (e) { console.error(e); toast(friendlyError(e), true); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = old; } }
}

export function progressBar() {
  const fill = el('i');
  const txt = el('div', { class: 'ptext' });
  const root = el('div', { style: { display: 'none' } }, el('div', { class: 'bar' }, fill), txt);
  return {
    root,
    set(frac, text) {
      root.style.display = '';
      fill.style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
      if (text != null) txt.textContent = text;
    },
    hide() { root.style.display = 'none'; },
  };
}

// Vùng kéo thả / chọn file
export function dropzone({ accept, multiple = false, label, sub, onFiles }) {
  const input = el('input', { type: 'file', accept, multiple: multiple || null });
  const root = el('div', { class: 'drop', tabindex: '0', role: 'button' },
    icon('upload', 30),
    el('b', {}, label || (multiple ? 'Chọn file hoặc kéo thả vào đây' : 'Chọn file hoặc kéo thả vào đây')),
    el('span', {}, sub || ''),
    input);
  const accepts = (accept || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const ok = (f) => !accepts.length || accepts.some(a =>
    a.startsWith('.') ? f.name.toLowerCase().endsWith(a) :
    a.endsWith('/*') ? f.type.startsWith(a.slice(0, -1)) : f.type === a);
  const take = (list) => {
    let files = [...list].filter(ok);
    if (!files.length) { toast('Loại file này không được hỗ trợ ở công cụ này.', true); return; }
    if (!multiple) files = files.slice(0, 1);
    onFiles(files);
  };
  root.addEventListener('click', () => input.click());
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('change', () => { if (input.files.length) take(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach(t => root.addEventListener(t, e => { e.preventDefault(); root.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => root.addEventListener(t, e => { e.preventDefault(); root.classList.remove('over'); }));
  root.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) take(e.dataTransfer.files); });
  return root;
}

export async function readBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

/* ---------- ZIP (không nén, đủ cho PDF/ảnh) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const nameB = enc.encode(f.name);
    const crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, nameB.length, true);
    parts.push(new Uint8Array(lh.buffer), nameB, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, nameB.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + size;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/* ---------- Khoảng trang: "1-3, 5, 8-" ---------- */
export function parseRanges(str, n) {
  const groups = [];
  for (let part of String(str).split(/[,;]+/)) {
    part = part.trim();
    if (!part) continue;
    let m;
    if ((m = part.match(/^(\d*)\s*-\s*(\d*)$/))) {
      if (!m[1] && !m[2]) throw new Error('Khoảng trang không hợp lệ: "' + part + '"');
      const a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : n;
      if (a < 1 || b > n || a > b) throw new Error(`Khoảng "${part}" nằm ngoài 1–${n} (file có ${n} trang).`);
      groups.push(Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i));
    } else if (/^\d+$/.test(part)) {
      const p = +part;
      if (p < 1 || p > n) throw new Error(`Trang ${p} không tồn tại (file có ${n} trang).`);
      groups.push([p - 1]);
    } else throw new Error('Không hiểu "' + part + '". Ví dụ đúng: 1-3, 5, 8-');
  }
  if (!groups.length) throw new Error('Bạn chưa nhập số trang.');
  return groups;
}
export const flatRange = (str, n) => [...new Set(parseRanges(str, n).flat())].sort((a, b) => a - b);

/* ---------- Hộp thoại ---------- */
export function askText({ title, message, type = 'text', okText = 'OK', placeholder = '' }) {
  return new Promise((resolve) => {
    const input = el('input', { type, placeholder, autocomplete: 'off' });
    const field = el('div', { class: 'field' }, input);
    const done = (v) => { bg.remove(); resolve(v); };
    const ok = el('button', { class: 'btn primary', onclick: () => done(input.value) }, okText);
    const cancel = el('button', { class: 'btn', onclick: () => done(null) }, 'Huỷ');
    const bg = el('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) done(null); } },
      el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        el('h3', {}, title), message ? el('p', {}, message) : null, field,
        el('div', { class: 'btns' }, cancel, ok)));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value); if (e.key === 'Escape') done(null); });
    document.body.append(bg);
    input.focus();
  });
}

export function resultCard(title, meta, buttons) {
  return el('div', { class: 'result' },
    el('h3', {}, title),
    meta ? el('div', { class: 'meta' }, meta) : null,
    el('div', { class: 'btns' }, buttons));
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
