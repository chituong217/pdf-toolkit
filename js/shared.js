// Thành phần giao diện dùng chung cho các công cụ.
import { el, icon, dropzone, readBytes, fmtSize, busy, download, makeZip, resultCard } from './util.js';
import { loadDoc } from './pdfcore.js';

// Chọn 1 file PDF → mở (hỏi mật khẩu nếu cần) → gọi onLoaded(info).
export function pdfPicker({ onLoaded, onReset }) {
  const holder = el('div');
  const showDrop = () => {
    holder.replaceChildren(dropzone({
      accept: '.pdf,application/pdf',
      label: 'Chọn file PDF hoặc kéo thả vào đây',
      sub: 'Xử lý ngay trên máy bạn · không giới hạn số file hay dung lượng',
      onFiles: async ([f]) => {
        await busy(null, async () => {
          holder.replaceChildren(el('div', { class: 'panel' }, el('span', { class: 'spin' }), ' Đang đọc file…'));
          try {
            const raw = await readBytes(f);
            const { doc, bytes } = await loadDoc(raw);
            const info = { file: f, name: f.name, size: f.size, bytes, doc, pages: doc.getPageCount() };
            holder.replaceChildren(el('div', { class: 'panel', style: { display: 'flex', gap: '12px', alignItems: 'center' } },
              el('div', { style: { flex: 1, minWidth: 0 } },
                el('b', { style: { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, f.name),
                el('span', { class: 'hint' }, `${fmtSize(f.size)} · ${info.pages} trang`)),
              el('button', { class: 'btn small', onclick: () => { showDrop(); onReset && onReset(); } }, 'Đổi file')));
            onLoaded(info);
          } catch (e) { showDrop(); throw e; }
        });
      },
    }));
  };
  showDrop();
  return holder;
}

// Danh sách sắp xếp được: kéo thả hoặc nút lên/xuống.
export function sortableList(items, renderBody, onChange) {
  const ul = el('ul', { class: 'flist' });
  let dragIdx = null;
  const changed = () => { refresh(); onChange && onChange(); };
  function refresh() {
    ul.replaceChildren(...items.map((it, i) => {
      const li = el('li', { class: 'fitem', draggable: 'true' },
        el('span', { class: 'grip', title: 'Kéo để sắp xếp' }, icon('grip', 18)),
        renderBody(it, i),
        el('div', { class: 'btns', style: { gap: '4px', flexWrap: 'nowrap' } },
          el('button', { class: 'btn icon', title: 'Lên', 'aria-label': 'Lên', disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; changed(); } }, icon('up', 16)),
          el('button', { class: 'btn icon', title: 'Xuống', 'aria-label': 'Xuống', disabled: i === items.length - 1, onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; changed(); } }, icon('down', 16)),
          el('button', { class: 'btn icon danger', title: 'Bỏ', 'aria-label': 'Bỏ', onclick: () => { items.splice(i, 1); changed(); } }, icon('x', 16))));
      li.addEventListener('dragstart', (e) => { dragIdx = i; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch (_) {} });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (e) => e.preventDefault());
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragIdx == null || dragIdx === i) return;
        const [m] = items.splice(dragIdx, 1); items.splice(i, 0, m); dragIdx = null; changed();
      });
      return li;
    }));
  }
  refresh();
  return { root: ul, refresh };
}

// Hiện kết quả: 1 file → nút tải; nhiều file → nút tải .zip.
export function showOutputs(host, outputs, { zipName = 'ket-qua.zip', title = 'Xong rồi!', note = '' } = {}) {
  host.replaceChildren();
  const toU8 = async (d) => d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : d;
  const size = outputs.reduce((a, o) => a + (o.data.size ?? o.data.length), 0);
  const btns = [];
  if (outputs.length === 1) {
    const o = outputs[0];
    btns.push(el('button', { class: 'btn primary', onclick: () => download(o.data, o.name, o.type) }, icon('dl', 18), 'Tải về ' + o.name));
    if (o.type === 'application/pdf') {
      btns.push(el('button', { class: 'btn', onclick: () => {
        const blob = o.data instanceof Blob ? o.data : new Blob([o.data], { type: o.type });
        window.open(URL.createObjectURL(blob), '_blank');
      } }, 'Mở xem'));
    }
  } else {
    btns.push(el('button', { class: 'btn primary', onclick: async () => {
      const files = [];
      for (const o of outputs) files.push({ name: o.name, data: await toU8(o.data) });
      download(makeZip(files), zipName, 'application/zip');
    } }, icon('dl', 18), `Tải tất cả (${outputs.length} file, .zip)`));
    if (outputs.length <= 6) {
      for (const o of outputs) btns.push(el('button', { class: 'btn small', onclick: () => download(o.data, o.name, o.type) }, o.name));
    }
  }
  host.append(resultCard(title, `${outputs.length} file · ${fmtSize(size)}${note ? ' · ' + note : ''}`, btns));
  host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function field(label, control, hint) {
  return el('div', { class: 'field' }, el('label', {}, label), control, hint ? el('span', { class: 'hint' }, hint) : null);
}
export function select(options, value, onchange) {
  const s = el('select', { onchange: onchange ? (e) => onchange(e.target.value) : null },
    options.map(([v, t]) => el('option', { value: v }, t)));
  s.value = value;
  return s;
}
export function check(label, checked, onchange) {
  const i = el('input', { type: 'checkbox', onchange: onchange ? (e) => onchange(e.target.checked) : null });
  i.checked = !!checked;
  return el('label', { class: 'check' }, i, label);
}
export function seg(options, value, onchange) {
  const root = el('div', { class: 'seg', role: 'group' });
  const draw = (cur) => root.replaceChildren(...options.map(([v, t]) =>
    el('button', { type: 'button', 'aria-pressed': String(v === cur), onclick: () => { draw(v); onchange(v); } }, t)));
  draw(value);
  return root;
}
