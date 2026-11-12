// Hình thu nhỏ trang PDF dùng chung: vẽ lười (chỉ trang đang hiện), cache, và khung xem phóng to.
import { el, icon } from './util.js';
import { openRender, renderPage, canvasToBlob, freeCanvas } from './pdfcore.js';

// Mỗi file PDF một bộ thumbs: mở pdf.js khi cần lần đầu, vẽ tuần tự để không treo máy.
export function makeThumbs(bytes) {
  let pdfP = null, dead = false;
  const cache = new Map();
  const queues = { t: Promise.resolve(), b: Promise.resolve() };
  const open = () => pdfP || (pdfP = openRender(bytes));
  function get(kind, i, scale, quality) {
    const key = kind + i;
    if (!cache.has(key)) {
      cache.set(key, queues[kind] = queues[kind].then(async () => {
        if (dead) return '';
        const pdf = await open();
        const c = await renderPage(pdf, i + 1, { scale, maxPixels: 6e6 });
        const blob = await canvasToBlob(c, 'image/jpeg', quality);
        freeCanvas(c);
        return dead ? '' : URL.createObjectURL(blob);
      }).catch(() => ''));
    }
    return cache.get(key);
  }
  return {
    thumb: (i) => get('t', i, 0.35, 0.72),
    big: (i) => get('b', i, 1.3, 0.85),
    destroy() {
      dead = true;
      for (const p of cache.values()) p.then(u => u && URL.revokeObjectURL(u));
      cache.clear();
      if (pdfP) pdfP.then(d => d.destroy()).catch(() => {});
    },
  };
}

// Theo dõi các thẻ: thẻ nào cuộn tới gần màn hình mới nạp ảnh.
export function thumbObserver(thumbs) {
  const io = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const { img, i } = e.target.__th;
      thumbs.thumb(i).then(u => { if (u) img.src = u; });
    }
  }, { rootMargin: '300px' });
  return {
    watch(node, img, i) { node.__th = { img, i }; io.observe(node); },
    disconnect() { io.disconnect(); },
  };
}

// Khung xem phóng to một trang, có nút trước/sau và phím mũi tên.
export function openLightbox(thumbs, total, start, label = '') {
  let i = Math.min(Math.max(start, 0), total - 1), token = 0;
  const img = el('img', { alt: '' });
  const cap = el('div', { class: 'lb-cap' });
  const prev = el('button', { class: 'btn icon lb-nav', 'aria-label': 'Trang trước', onclick: () => go(-1) }, icon('left', 20));
  const next = el('button', { class: 'btn icon lb-nav', 'aria-label': 'Trang sau', onclick: () => go(1) }, icon('right', 20));
  const closeBtn = el('button', { class: 'btn icon lb-x', 'aria-label': 'Đóng', onclick: close }, icon('x', 20));
  const bg = el('div', { class: 'lb', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === bg || e.target.classList.contains('lb-stage')) close(); } },
    closeBtn, el('div', { class: 'lb-stage' }, prev, img, next), cap);

  async function show() {
    const my = ++token;
    cap.textContent = `${label ? label + ' · ' : ''}Trang ${i + 1}/${total}`;
    prev.disabled = i === 0; next.disabled = i === total - 1;
    img.style.opacity = '.35';
    const u = await thumbs.big(i);
    if (my !== token) return;
    if (u) img.src = u;
    img.style.opacity = '1';
  }
  function go(d) { const j = i + d; if (j < 0 || j >= total) return; i = j; show(); }
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  }
  function close() { token++; document.removeEventListener('keydown', onKey); window.removeEventListener('hashchange', close); bg.remove(); }
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);
  document.body.append(bg);
  show();
}
