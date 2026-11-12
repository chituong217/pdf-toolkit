// Nhóm công cụ cơ bản: ghép, tách, sắp xếp trang, cắt lề, ảnh→PDF, PDF→ảnh.
import { el, icon, dropzone, readBytes, fmtSize, baseName, busy, progressBar, toast, parseRanges, flatRange, sleep } from './util.js';
import { PDFDocument, degrees, loadDoc, openRender, renderPage, canvasToBlob, freeCanvas, pageFrame, saveDoc, pdfBlob } from './pdfcore.js';
import { pdfPicker, sortableList, showOutputs, field, select, check, seg } from './shared.js';
import { makeThumbs, thumbObserver, openLightbox } from './pagegrid.js';

const PDF = 'application/pdf';
const mm = (v) => v * 72 / 25.4;

/* ================= GHÉP FILE ================= */
export function mergeTool(root) {
  const items = [];
  const out = el('div');
  const prog = progressBar();
  const runBtn = el('button', { class: 'btn primary', disabled: true }, 'Ghép thành 1 file PDF');
  // Mỗi dòng: hình trang đầu + tên + nút "Xem các trang" mở dải hình thu nhỏ của cả file.
  function renderItem(it) {
    if (!it.thumbs) it.thumbs = makeThumbs(it.bytes);
    if (it.ob) it.ob.disconnect();
    const first = el('img', { class: 'th', alt: 'Trang 1 của ' + it.name, title: 'Bấm để xem lớn' });
    it.thumbs.thumb(0).then(u => { if (u) first.src = u; });
    first.addEventListener('click', () => openLightbox(it.thumbs, it.pages, 0, it.name));
    const toggle = el('button', { class: 'btn small', onclick: () => { it.open = !it.open; list.refresh(); } },
      icon(it.open ? 'up' : 'down', 14), it.open ? 'Thu gọn' : 'Xem các trang');
    const head = el('div', { class: 'mhead' }, first,
      el('div', { class: 'nm' }, el('b', {}, it.name), el('small', {}, `${it.pages} trang · ${fmtSize(it.size)}`)));
    const body = el('div', { class: 'mbody' }, head, el('div', {}, toggle));
    const frag = document.createDocumentFragment();
    frag.append(body);
    if (it.open) {
      const ob = it.ob = thumbObserver(it.thumbs);
      const strip = el('div', { class: 'mstrip' });
      for (let i = 0; i < it.pages; i++) {
        const img = el('img', { alt: 'Trang ' + (i + 1) });
        const card = el('button', { class: 'mpage', title: 'Bấm để xem lớn', onclick: () => openLightbox(it.thumbs, it.pages, i, it.name) }, img, el('span', {}, String(i + 1)));
        strip.append(card);
        ob.watch(card, img, i);
      }
      frag.append(strip);
    }
    return frag;
  }
  const dropItem = (it) => { if (it.ob) it.ob.disconnect(); if (it.thumbs) it.thumbs.destroy(); };
  const list = sortableList(items, renderItem, update, dropItem);
  const listPanel = el('div', { class: 'panel', style: { display: 'none' } },
    el('h3', {}, 'Thứ tự ghép (kéo thả hoặc dùng mũi tên)'), list.root,
    el('div', { class: 'btns', style: { marginTop: '12px' } },
      el('button', { class: 'btn small', onclick: () => { items.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true })); list.refresh(); } }, 'Sắp xếp theo tên'),
      el('button', { class: 'btn small danger', onclick: () => { items.forEach(dropItem); items.length = 0; list.refresh(); update(); } }, 'Xoá hết')));

  function update() {
    listPanel.style.display = items.length ? '' : 'none';
    runBtn.disabled = items.length < 2;
    runBtn.textContent = items.length < 2 ? 'Chọn ít nhất 2 file để ghép' : `Ghép ${items.length} file thành 1 PDF`;
  }

  const dz = dropzone({
    accept: '.pdf,application/pdf', multiple: true,
    label: 'Chọn nhiều file PDF hoặc kéo thả vào đây', sub: 'Có thể thêm nhiều lần',
    onFiles: (files) => busy(null, async () => {
      for (const f of files) {
        const raw = await readBytes(f);
        const { doc, bytes } = await loadDoc(raw);
        items.push({ name: f.name, size: f.size, bytes, doc, pages: doc.getPageCount() });
        list.refresh(); update();
      }
    }),
  });

  runBtn.addEventListener('click', () => busy(runBtn, async () => {
    out.replaceChildren();
    const merged = await PDFDocument.create();
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      prog.set(i / items.length, `Đang ghép ${i + 1}/${items.length}: ${items[i].name}`);
      const pages = await merged.copyPages(items[i].doc, items[i].doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
      total += pages.length;
      await sleep(0);
    }
    prog.set(0.95, 'Đang lưu file…');
    const bytes = await saveDoc(merged);
    prog.hide();
    showOutputs(out, [{ name: 'ghep.pdf', data: pdfBlob(bytes), type: PDF }], { title: `Đã ghép ${items.length} file (${total} trang)` });
  }));

  root.append(dz, listPanel, el('div', { class: 'panel' }, runBtn, prog.root), out);
  update();
}

/* ================= TÁCH FILE ================= */
// Rút gọn danh sách trang đã chọn thành chuỗi khoảng: [0,1,2,4] -> "1-3, 5".
function toRangeText(set) {
  const a = [...set].sort((x, y) => x - y), parts = [];
  for (let i = 0; i < a.length;) {
    let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    parts.push(j > i ? `${a[i] + 1}-${a[j] + 1}` : String(a[i] + 1)); i = j + 1;
  }
  return parts.join(', ');
}

export function splitTool(root) {
  let info = null, thumbs = null, obs = null;
  const out = el('div'), prog = progressBar();
  const opts = el('div', { class: 'panel', style: { display: 'none' } });

  const cleanup = () => { if (obs) obs.disconnect(); if (thumbs) thumbs.destroy(); obs = thumbs = null; };
  const picker = pdfPicker({
    onLoaded: (i) => { cleanup(); info = i; thumbs = makeThumbs(i.bytes); drawOpts(); },
    onReset: () => { cleanup(); info = null; opts.style.display = 'none'; opts.replaceChildren(); out.replaceChildren(); },
  });

  function drawOpts() {
    let mode = 'extract';
    const sel = new Set();
    const rangeIn = el('input', { type: 'text', placeholder: 'Bấm chọn trang bên dưới, hoặc gõ: 1-3, 5, 8-', value: '' });
    const nIn = el('input', { type: 'number', min: '1', value: '1' });
    const rangeField = field('Các trang / khoảng trang', rangeIn, `File có ${info.pages} trang. Dùng dấu phẩy để ngăn cách, "8-" nghĩa là từ trang 8 đến hết.`);
    const nField = field('Số trang mỗi file', nIn);
    const desc = el('p', { class: 'hint' });

    /* --- Lưới chọn trang --- */
    const grid = el('div', { class: 'pgrid pick-grid' });
    const count = el('span', { class: 'hint' });
    const cards = [], boxes = [];
    obs = thumbObserver(thumbs);
    let anchor = null, dragVal = null;
    const refreshCount = () => { count.textContent = sel.size ? `Đã chọn ${sel.size}/${info.pages} trang` : 'Chưa chọn trang nào'; };
    function paint(i) { const on = sel.has(i); cards[i].classList.toggle('sel', on); boxes[i].checked = on; }
    function writeText() { rangeIn.value = toRangeText(sel); refreshCount(); }
    function setSel(i, on) { if (on) sel.add(i); else sel.delete(i); paint(i); writeText(); }
    function setMany(idx, on) { for (const i of idx) { if (on) sel.add(i); else sel.delete(i); paint(i); } writeText(); }
    const all = () => Array.from({ length: info.pages }, (_, i) => i);
    function endDrag() { dragVal = null; window.removeEventListener('pointerup', endDrag); window.removeEventListener('pointercancel', endDrag); }

    for (let i = 0; i < info.pages; i++) {
      const img = el('img', { alt: 'Trang ' + (i + 1), draggable: 'false' });
      const pick = el('input', { type: 'checkbox', class: 'pick', 'aria-label': 'Chọn trang ' + (i + 1),
        onchange: (e) => { setSel(i, e.target.checked); anchor = i; } });
      pick.addEventListener('pointerdown', (e) => e.stopPropagation());
      const zoom = el('button', { class: 'btn icon zoom', title: 'Xem lớn', 'aria-label': 'Xem lớn trang ' + (i + 1),
        onclick: (e) => { e.stopPropagation(); openLightbox(thumbs, info.pages, i, info.name); } }, icon('zoom', 14));
      zoom.addEventListener('pointerdown', (e) => e.stopPropagation());
      const card = el('div', { class: 'pcard selectable' }, pick, zoom, el('div', { class: 'box' }, img), el('div', { class: 'n' }, 'Trang ' + (i + 1)));
      // Chuột: bấm để chọn, kéo qua các trang để chọn cả dải, Shift+bấm chọn từ trang trước đó.
      card.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        e.preventDefault();
        if (e.shiftKey && anchor != null) {
          const [a, b] = anchor < i ? [anchor, i] : [i, anchor];
          setMany(Array.from({ length: b - a + 1 }, (_, k) => a + k), true);
        } else {
          dragVal = !sel.has(i); setSel(i, dragVal); anchor = i;
          window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
        }
      });
      card.addEventListener('pointerenter', (e) => { if (dragVal != null && e.pointerType === 'mouse' && (e.buttons & 1)) setSel(i, dragVal); });
      // Cảm ứng: chạm một lần để chọn (cuộn trang không bị tính là chạm).
      card.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') { setSel(i, !sel.has(i)); anchor = i; } });
      card.addEventListener('dblclick', () => openLightbox(thumbs, info.pages, i, info.name));
      cards.push(card); boxes.push(pick);
      grid.append(card);
      obs.watch(card, img, i);
    }
    const tb = el('div', { class: 'btns', style: { marginBottom: '10px' } },
      el('button', { class: 'btn small', onclick: () => setMany(all(), true) }, 'Chọn tất cả'),
      el('button', { class: 'btn small', onclick: () => setMany(all(), false) }, 'Bỏ chọn'),
      el('button', { class: 'btn small', onclick: () => { const cur = new Set(sel); setMany(all(), false); setMany(all().filter(i => !cur.has(i)), true); } }, 'Đảo chọn'),
      el('button', { class: 'btn small', onclick: () => setMany(all().filter(i => (i + 1) % 2 === 1), true) }, 'Trang lẻ'),
      el('button', { class: 'btn small', onclick: () => setMany(all().filter(i => (i + 1) % 2 === 0), true) }, 'Trang chẵn'));
    const gridBox = el('div', {},
      el('p', { class: 'hint', style: { margin: '0 0 8px' } }, 'Bấm vào trang để chọn, kéo chuột qua nhiều trang để chọn cả dải, Shift+bấm để chọn từ trang trước đó. Bấm biểu tượng kính lúp (hoặc bấm đúp) để xem lớn.'),
      tb, count, el('div', { style: { height: '8px' } }), grid);

    // Gõ tay vào ô trang thì lưới chọn theo; gõ chưa hợp lệ thì giữ nguyên lưới.
    rangeIn.addEventListener('input', () => {
      let next = null;
      try { next = new Set(parseRanges(rangeIn.value, info.pages).flat()); } catch (_) { if (!rangeIn.value.trim()) next = new Set(); }
      if (!next) return;
      sel.clear(); next.forEach(i => sel.add(i));
      for (let i = 0; i < info.pages; i++) paint(i);
      refreshCount();
    });

    const modes = [
      ['extract', 'Trích các trang ra 1 file'],
      ['ranges', 'Tách mỗi khoảng thành 1 file'],
      ['each', 'Mỗi trang 1 file'],
      ['every', 'Chia mỗi N trang'],
    ];
    const modeSel = select(modes, mode, (v) => { mode = v; sync(); });
    function sync() {
      const useRange = mode === 'extract' || mode === 'ranges';
      rangeField.style.display = useRange ? '' : 'none';
      gridBox.style.display = useRange ? '' : 'none';
      nField.style.display = mode === 'every' ? '' : 'none';
      desc.textContent = {
        extract: 'Gộp các trang đã chọn thành một file PDF mới (giữ đúng thứ tự bạn gõ).',
        ranges: 'Mỗi khoảng cách nhau bằng dấu phẩy sẽ thành một file riêng, ví dụ "1-3, 4-6" ra 2 file. Các trang liền nhau chọn từ lưới sẽ thành một khoảng, muốn chia nhỏ hơn hãy gõ tay.',
        each: `Tạo ${info.pages} file, mỗi file 1 trang, đóng gói thành .zip.`,
        every: 'Chia đều thành nhiều file, mỗi file N trang (file cuối có thể ít hơn).',
      }[mode];
    }
    const runBtn = el('button', { class: 'btn primary' }, 'Tách file');
    runBtn.addEventListener('click', () => busy(runBtn, async () => {
      out.replaceChildren();
      const base = baseName(info.name);
      let groups;
      if (mode === 'extract') groups = [parseRanges(rangeIn.value, info.pages).flat()];
      else if (mode === 'ranges') groups = parseRanges(rangeIn.value, info.pages);
      else if (mode === 'each') groups = Array.from({ length: info.pages }, (_, i) => [i]);
      else {
        const n = Math.max(1, Math.floor(+nIn.value || 1)); groups = [];
        for (let i = 0; i < info.pages; i += n) groups.push(Array.from({ length: Math.min(n, info.pages - i) }, (_, k) => i + k));
      }
      const pad = String(groups.length).length;
      const outputs = [];
      for (let g = 0; g < groups.length; g++) {
        prog.set(g / groups.length, `Đang tạo file ${g + 1}/${groups.length}`);
        const d = await PDFDocument.create();
        (await d.copyPages(info.doc, groups[g])).forEach(p => d.addPage(p));
        const first = groups[g][0] + 1, last = groups[g][groups[g].length - 1] + 1;
        const label = groups.length === 1 ? 'trich' : (mode === 'ranges' || mode === 'every' ? `p${first}-${last}` : String(g + 1).padStart(pad, '0'));
        outputs.push({ name: `${base}_${label}.pdf`, data: pdfBlob(await saveDoc(d)), type: PDF });
        if (g % 10 === 9) await sleep(0);
      }
      prog.hide();
      showOutputs(out, outputs, { zipName: base + '_tach.zip', title: outputs.length === 1 ? 'Đã trích xong' : `Đã tách thành ${outputs.length} file` });
    }));
    opts.replaceChildren(el('div', { class: 'stack' }, field('Cách tách', modeSel), rangeField, gridBox, nField, desc, el('div', {}, runBtn), prog.root));
    opts.style.display = '';
    refreshCount();
    sync();
  }
  root.append(picker, opts, out);
}

/* ================= SẮP XẾP / XOAY / XOÁ TRANG ================= */
export function organizeTool(root) {
  let info = null, pdf = null;
  let state = [];
  const urls = new Map();   // src -> Promise<url>
  let queue = Promise.resolve();
  const out = el('div'), prog = progressBar();
  const work = el('div', { style: { display: 'none' } });
  const grid = el('div', { class: 'pgrid' });
  const count = el('span', { class: 'hint' });
  let observer = null;

  const picker = pdfPicker({
    onLoaded: async (i) => {
      info = i; pdf = await openRender(i.bytes);
      urls.clear(); queue = Promise.resolve();
      state = Array.from({ length: i.pages }, (_, k) => ({ src: k, rot: 0, del: false, sel: false }));
      work.style.display = ''; out.replaceChildren(); draw();
    },
    onReset: () => { info = null; work.style.display = 'none'; out.replaceChildren(); grid.replaceChildren(); },
  });

  function getThumb(src) {
    if (!urls.has(src)) {
      urls.set(src, queue = queue.then(async () => {
        const c = await renderPage(pdf, src + 1, { scale: 0.35 });
        const blob = await canvasToBlob(c, 'image/jpeg', 0.72);
        freeCanvas(c);
        return URL.createObjectURL(blob);
      }).catch(() => ''));
    }
    return urls.get(src);
  }

  function draw() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) {
        observer.unobserve(e.target);
        const img = e.target.querySelector('img');
        getThumb(+e.target.dataset.src).then(u => { if (u) img.src = u; });
      }
    }, { rootMargin: '300px' });
    let dragFrom = null;
    grid.replaceChildren(...state.map((s, i) => {
      const img = el('img', { alt: 'Trang ' + (s.src + 1), draggable: 'false' });
      if (s.rot) img.style.transform = `rotate(${s.rot}deg)` + (s.rot % 180 ? ' scale(.72)' : '');
      const pick = el('input', { type: 'checkbox', class: 'pick', 'aria-label': 'Chọn trang ' + (s.src + 1), onchange: (e) => { s.sel = e.target.checked; card.classList.toggle('sel', s.sel); } });
      pick.checked = s.sel;
      const mv = (d) => { const j = i + d; if (j < 0 || j >= state.length) return; [state[i], state[j]] = [state[j], state[i]]; draw(); };
      const tb = el('div', { class: 'tb' },
        el('button', { class: 'btn icon', title: 'Dời sang trái', 'aria-label': 'Dời sang trái', onclick: () => mv(-1) }, icon('left', 14)),
        el('button', { class: 'btn icon', title: 'Xoay phải 90°', 'aria-label': 'Xoay phải', onclick: () => { s.rot = (s.rot + 90) % 360; draw(); } }, icon('cw', 14)),
        el('button', { class: 'btn icon danger', title: s.del ? 'Khôi phục' : 'Xoá trang', 'aria-label': 'Xoá hoặc khôi phục', onclick: () => { s.del = !s.del; draw(); } }, icon(s.del ? 'ccw' : 'trash', 14)),
        el('button', { class: 'btn icon', title: 'Dời sang phải', 'aria-label': 'Dời sang phải', onclick: () => mv(1) }, icon('right', 14)));
      const card = el('div', { class: 'pcard' + (s.sel ? ' sel' : '') + (s.del ? ' del' : ''), draggable: 'true', 'data-src': s.src },
        pick,
        el('div', { class: 'box', onclick: () => { s.sel = !s.sel; pick.checked = s.sel; card.classList.toggle('sel', s.sel); } }, img),
        el('div', { class: 'n' }, `Trang ${s.src + 1}` + (s.del ? ' (xoá)' : '')), tb);
      card.addEventListener('dragstart', (e) => { dragFrom = i; try { e.dataTransfer.setData('text/plain', String(i)); } catch (_) {} });
      card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('dragover'); });
      card.addEventListener('dragleave', () => card.classList.remove('dragover'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragFrom == null || dragFrom === i) return;
        const [m] = state.splice(dragFrom, 1); state.splice(i, 0, m); dragFrom = null; draw();
      });
      observer.observe(card);
      return card;
    }));
    const keep = state.filter(s => !s.del).length;
    count.textContent = `${keep}/${state.length} trang sẽ được xuất · ${state.filter(s => s.sel).length} trang đang chọn`;
  }

  const act = (fn) => () => { fn(); draw(); };
  const selected = () => state.filter(s => s.sel);
  const toolbar = el('div', { class: 'btns', style: { marginBottom: '12px' } },
    el('button', { class: 'btn small', onclick: act(() => state.forEach(s => s.sel = true)) }, 'Chọn tất cả'),
    el('button', { class: 'btn small', onclick: act(() => state.forEach(s => s.sel = false)) }, 'Bỏ chọn'),
    el('button', { class: 'btn small', onclick: act(() => selected().forEach(s => s.rot = (s.rot + 90) % 360)) }, icon('cw', 14), 'Xoay phải'),
    el('button', { class: 'btn small', onclick: act(() => selected().forEach(s => s.rot = (s.rot + 270) % 360)) }, icon('ccw', 14), 'Xoay trái'),
    el('button', { class: 'btn small danger', onclick: act(() => selected().forEach(s => { s.del = true; s.sel = false; })) }, icon('trash', 14), 'Xoá đã chọn'),
    el('button', { class: 'btn small', onclick: act(() => { if (!selected().length) return toast('Hãy chọn vài trang trước.'); state.forEach(s => { if (!s.sel) s.del = true; }); }) }, 'Chỉ giữ trang đã chọn'),
    el('button', { class: 'btn small', onclick: act(() => state.reverse()) }, 'Đảo thứ tự'),
    el('button', { class: 'btn small', onclick: act(() => state.forEach(s => { s.del = false; s.rot = 0; s.sel = false; }) ) }, 'Hoàn tác xoay/xoá'));

  const runBtn = el('button', { class: 'btn primary' }, 'Tạo file PDF mới');
  runBtn.addEventListener('click', () => busy(runBtn, async () => {
    out.replaceChildren();
    const keep = state.filter(s => !s.del);
    if (!keep.length) throw new Error('Bạn đã xoá hết các trang. Hãy giữ lại ít nhất 1 trang.');
    const d = await PDFDocument.create();
    const pages = await d.copyPages(info.doc, keep.map(s => s.src));
    pages.forEach((p, i) => {
      if (keep[i].rot) p.setRotation(degrees((((p.getRotation().angle + keep[i].rot) % 360) + 360) % 360));
      d.addPage(p);
    });
    const bytes = await saveDoc(d);
    showOutputs(out, [{ name: baseName(info.name) + '_sapxep.pdf', data: pdfBlob(bytes), type: PDF }], { title: `Đã tạo file ${keep.length} trang` });
  }));

  work.append(el('div', { class: 'panel' },
    el('p', { class: 'hint', style: { marginTop: 0 } }, 'Bấm vào trang để chọn. Kéo thả để đổi vị trí (hoặc dùng mũi tên ◀ ▶ trên điện thoại).'),
    toolbar, count, el('div', { style: { height: '10px' } }), grid),
    el('div', { class: 'panel' }, runBtn, prog.root));
  root.append(picker, work, out);
}

/* ================= CẮT LỀ ================= */
export function cropTool(root) {
  let info = null;
  const out = el('div');
  const work = el('div', { style: { display: 'none' } });
  const m = { top: 10, bottom: 10, left: 10, right: 10 };
  const ov = el('div', { class: 'cropov' });
  const stage = el('div', { class: 'stage' });
  let vis = { W: 595, H: 842 };

  const picker = pdfPicker({
    onLoaded: async (i) => {
      info = i; out.replaceChildren();
      const pdf = await openRender(i.bytes);
      const c = await renderPage(pdf, 1, { scale: 0.9 });
      const f = pageFrame(i.doc.getPage(0));
      vis = { W: f.W, H: f.H };
      stage.replaceChildren(c, ov);
      work.style.display = ''; drawOv();
    },
    onReset: () => { info = null; work.style.display = 'none'; out.replaceChildren(); },
  });

  function drawOv() {
    const pc = (mmv, dim) => Math.min(100, Math.max(0, mm(mmv) / dim * 100));
    const t = pc(m.top, vis.H), b = pc(m.bottom, vis.H), l = pc(m.left, vis.W), r = pc(m.right, vis.W);
    const s = (css) => el('i', { style: css });
    ov.replaceChildren(
      s({ left: 0, right: 0, top: 0, height: t + '%' }), s({ left: 0, right: 0, bottom: 0, height: b + '%' }),
      s({ left: 0, top: t + '%', bottom: b + '%', width: l + '%' }), s({ right: 0, top: t + '%', bottom: b + '%', width: r + '%' }),
      el('b', { style: { left: l + '%', right: r + '%', top: t + '%', bottom: b + '%' } }));
  }

  const num = (k, label) => {
    const i = el('input', { type: 'number', min: '0', step: '1', value: String(m[k]), oninput: (e) => { m[k] = Math.max(0, +e.target.value || 0); drawOv(); } });
    return field(label, i);
  };
  let scope = 'all';
  const rangeIn = el('input', { type: 'text', placeholder: 'Ví dụ: 2-10', value: '' });
  const rangeF = field('Các trang áp dụng', rangeIn);
  rangeF.style.display = 'none';
  const runBtn = el('button', { class: 'btn primary' }, 'Cắt và tạo PDF');
  runBtn.addEventListener('click', () => busy(runBtn, async () => {
    out.replaceChildren();
    const idx = scope === 'all' ? info.doc.getPageIndices() : flatRange(rangeIn.value, info.pages);
    const { doc } = await loadDoc(info.bytes); // bản mới để không làm hỏng bản đang dùng
    for (const i of idx) {
      const page = doc.getPage(i);
      const f = pageFrame(page);
      const L = mm(m.left), R = mm(m.right), T = mm(m.top), B = mm(m.bottom);
      if (L + R >= f.W - 10 || T + B >= f.H - 10) throw new Error(`Lề quá lớn so với kích thước trang ${i + 1}.`);
      const p1 = f.map(L, B), p2 = f.map(f.W - R, f.H - T);
      const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y), w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
      page.setCropBox(x, y, w, h);
      page.setMediaBox(x, y, w, h);
    }
    showOutputs(out, [{ name: baseName(info.name) + '_cat.pdf', data: pdfBlob(await saveDoc(doc)), type: PDF }], { title: `Đã cắt lề ${idx.length} trang` });
  }));

  work.append(el('div', { class: 'panel' },
    el('h3', {}, 'Cắt bớt lề (đơn vị: mm)'),
    el('div', { class: 'fields' }, num('top', 'Lề trên'), num('bottom', 'Lề dưới'), num('left', 'Lề trái'), num('right', 'Lề phải')),
    el('div', { style: { height: '12px' } }),
    el('div', { class: 'fields' },
      field('Áp dụng cho', select([['all', 'Tất cả các trang'], ['range', 'Một số trang']], scope, (v) => { scope = v; rangeF.style.display = v === 'range' ? '' : 'none'; })), rangeF)),
    el('div', { class: 'panel center' }, el('p', { class: 'hint', style: { marginTop: 0 } }, 'Phần tô đỏ sẽ bị cắt bỏ (xem trước trên trang 1)'), stage),
    el('div', { class: 'panel' }, runBtn, el('p', { class: 'hint' }, 'Lưu ý: nội dung bị cắt chỉ bị ẩn khỏi vùng hiển thị, không bị xoá khỏi file.')));
  root.append(picker, work, out);
}

/* ================= ẢNH → PDF ================= */
function exifOrientation(u8) {
  try {
    if (u8[0] !== 0xff || u8[1] !== 0xd8) return 1;
    let p = 2;
    while (p + 4 < u8.length && u8[p] === 0xff) {
      const mk = u8[p + 1], len = (u8[p + 2] << 8) | u8[p + 3];
      if (mk === 0xe1 && u8[p + 4] === 0x45 && u8[p + 5] === 0x78) { // "Ex"
        const t = p + 10, le = u8[t] === 0x49;
        const g16 = (o) => le ? u8[o] | (u8[o + 1] << 8) : (u8[o] << 8) | u8[o + 1];
        const g32 = (o) => le ? (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0 : ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0;
        const ifd = t + g32(t + 4), n = g16(ifd);
        for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (g16(e) === 0x0112) return g16(e + 8); }
        return 1;
      }
      p += 2 + len;
    }
  } catch (_) {}
  return 1;
}
function loadImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob), im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Không đọc được ảnh (định dạng chưa được trình duyệt hỗ trợ).')); };
    im.src = url;
  });
}
// Trả về { kind:'jpg'|'png', bytes, w, h }
async function prepareImage(file, quality) {
  const raw = await readBytes(file);
  const isJpg = raw[0] === 0xff && raw[1] === 0xd8;
  const isPng = raw[0] === 0x89 && raw[1] === 0x50 && raw[2] === 0x4e && raw[3] === 0x47;
  const maxDim = { orig: Infinity, med: 2400, low: 1600 }[quality];
  const jq = { orig: 0.92, med: 0.8, low: 0.6 }[quality];
  const needCanvas = quality !== 'orig' || (!isJpg && !isPng) || (isJpg && exifOrientation(raw) !== 1);
  if (!needCanvas) return { kind: isJpg ? 'jpg' : 'png', bytes: raw };
  const im = await loadImage(file);
  let w = im.naturalWidth, h = im.naturalHeight;
  const k = Math.min(1, maxDim / Math.max(w, h));
  w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const keepAlpha = quality === 'orig' && !isJpg;
  if (!keepAlpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(im, 0, 0, w, h);
  const blob = await canvasToBlob(c, keepAlpha ? 'image/png' : 'image/jpeg', jq);
  freeCanvas(c);
  return { kind: keepAlpha ? 'png' : 'jpg', bytes: new Uint8Array(await blob.arrayBuffer()) };
}

export function img2pdfTool(root) {
  const items = [];
  const out = el('div'), prog = progressBar();
  const o = { size: 'a4auto', margin: '10', quality: 'orig' };
  const runBtn = el('button', { class: 'btn primary', disabled: true }, 'Tạo PDF');
  const list = sortableList(items, (it) => el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flex: 1, minWidth: 0 } },
    el('img', { class: 'th', src: it.url, alt: '' }),
    el('div', { class: 'nm' }, el('b', {}, it.file.name), el('small', {}, fmtSize(it.file.size)))), update);
  const listPanel = el('div', { class: 'panel', style: { display: 'none' } }, el('h3', {}, 'Thứ tự trang'), list.root);
  function update() {
    listPanel.style.display = items.length ? '' : 'none';
    runBtn.disabled = !items.length;
    runBtn.textContent = items.length ? `Tạo PDF từ ${items.length} ảnh` : 'Chọn ảnh trước';
  }
  const dz = dropzone({
    accept: 'image/*', multiple: true, label: 'Chọn ảnh hoặc kéo thả vào đây', sub: 'JPG, PNG, WebP, GIF, BMP… (có thể chọn nhiều ảnh)',
    onFiles: (files) => {
      files.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
      for (const f of files) items.push({ file: f, url: URL.createObjectURL(f) });
      list.refresh(); update();
    },
  });
  const optsPanel = el('div', { class: 'panel' }, el('div', { class: 'fields' },
    field('Khổ giấy', select([['a4auto', 'A4 (tự chọn dọc/ngang)'], ['a4p', 'A4 dọc'], ['a4l', 'A4 ngang'], ['letter', 'Letter'], ['fit', 'Vừa khít từng ảnh']], o.size, v => o.size = v)),
    field('Lề', select([['0', 'Không lề'], ['10', '10 mm'], ['20', '20 mm']], o.margin, v => o.margin = v)),
    field('Chất lượng ảnh', select([['orig', 'Giữ nguyên bản gốc'], ['med', 'Nén vừa (nhẹ hơn nhiều)'], ['low', 'Nén mạnh (rất nhẹ)']], o.quality, v => o.quality = v))));

  runBtn.addEventListener('click', () => busy(runBtn, async () => {
    out.replaceChildren();
    const doc = await PDFDocument.create();
    const M = mm(+o.margin);
    for (let i = 0; i < items.length; i++) {
      prog.set(i / items.length, `Đang xử lý ảnh ${i + 1}/${items.length}`);
      const p = await prepareImage(items[i].file, o.quality);
      let img;
      try { img = p.kind === 'jpg' ? await doc.embedJpg(p.bytes) : await doc.embedPng(p.bytes); }
      catch (e) { // ảnh lạ: ép qua canvas
        const q = await prepareImage(items[i].file, o.quality === 'orig' ? 'med' : o.quality);
        img = await doc.embedJpg(q.bytes);
      }
      const iw = img.width, ih = img.height;
      let pw, ph;
      if (o.size === 'fit') { pw = iw * 0.75 + 2 * M; ph = ih * 0.75 + 2 * M; }
      else {
        const base = o.size === 'letter' ? [612, 792] : [595.28, 841.89];
        const land = o.size === 'a4l' || (o.size === 'a4auto' && iw > ih);
        [pw, ph] = land ? [base[1], base[0]] : base;
      }
      const page = doc.addPage([pw, ph]);
      const aw = pw - 2 * M, ah = ph - 2 * M;
      const s = o.size === 'fit' ? 0.75 : Math.min(aw / iw, ah / ih);
      const w = iw * s, h = ih * s;
      page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    prog.set(0.97, 'Đang lưu…');
    const bytes = await saveDoc(doc); prog.hide();
    showOutputs(out, [{ name: 'anh-sang-pdf.pdf', data: pdfBlob(bytes), type: PDF }], { title: `Đã tạo PDF ${items.length} trang` });
  }));
  root.append(dz, listPanel, optsPanel, el('div', { class: 'panel' }, runBtn, prog.root), out);
  update();
}

/* ================= PDF → ẢNH ================= */
export function pdf2imgTool(root) {
  let info = null;
  const out = el('div'), prog = progressBar();
  const work = el('div', { style: { display: 'none' } });
  const o = { fmt: 'png', dpi: '150' };
  const rangeIn = el('input', { type: 'text', placeholder: 'Để trống = tất cả các trang' });
  const runBtn = el('button', { class: 'btn primary' }, 'Chuyển thành ảnh');
  const picker = pdfPicker({
    onLoaded: (i) => { info = i; work.style.display = ''; out.replaceChildren(); },
    onReset: () => { info = null; work.style.display = 'none'; out.replaceChildren(); },
  });
  runBtn.addEventListener('click', () => busy(runBtn, async () => {
    out.replaceChildren();
    const idx = rangeIn.value.trim() ? flatRange(rangeIn.value, info.pages) : info.doc.getPageIndices();
    const pdf = await openRender(info.bytes);
    const base = baseName(info.name), ext = o.fmt === 'png' ? 'png' : 'jpg';
    const pad = String(info.pages).length;
    const outputs = [];
    for (let k = 0; k < idx.length; k++) {
      prog.set(k / idx.length, `Đang xuất trang ${idx[k] + 1} (${k + 1}/${idx.length})`);
      const c = await renderPage(pdf, idx[k] + 1, { scale: +o.dpi / 72, maxPixels: 24e6 });
      const blob = await canvasToBlob(c, o.fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92);
      freeCanvas(c);
      outputs.push({ name: `${base}_trang-${String(idx[k] + 1).padStart(pad, '0')}.${ext}`, data: blob, type: blob.type });
      await sleep(0);
    }
    prog.hide();
    showOutputs(out, outputs, { zipName: base + '_anh.zip', title: `Đã xuất ${outputs.length} ảnh` });
  }));
  work.append(el('div', { class: 'panel' }, el('div', { class: 'fields' },
    field('Định dạng', select([['png', 'PNG (nét, nặng hơn)'], ['jpg', 'JPG (nhẹ hơn)']], o.fmt, v => o.fmt = v)),
    field('Độ phân giải', select([['72', '72 dpi (nhỏ)'], ['110', '110 dpi'], ['150', '150 dpi (khuyên dùng)'], ['200', '200 dpi'], ['300', '300 dpi (in ấn)']], o.dpi, v => o.dpi = v)),
    field('Các trang', rangeIn, 'Ví dụ: 1-3, 7')),
    el('div', { style: { marginTop: '14px' } }, runBtn), prog.root));
  root.append(picker, work, out);
}
