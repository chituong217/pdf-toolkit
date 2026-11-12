// Bộ định tuyến + trang chủ.
import { el, icon } from './util.js';
import { mergeTool, splitTool, organizeTool, cropTool, img2pdfTool, pdf2imgTool } from './tools-basic.js';
import { scanTool } from './tools-scan.js';
import { compressTool, protectTool, watermarkTool, numbersTool, signTool, ocrTool } from './tools-adv.js';

const TOOLS = [
  { id: 'merge', group: 'Tổ chức file', title: 'Ghép PDF', desc: 'Gộp nhiều file PDF thành một, tự sắp xếp thứ tự.', icon: 'merge', run: mergeTool },
  { id: 'split', group: 'Tổ chức file', title: 'Tách / cắt PDF', desc: 'Trích trang, tách theo khoảng, mỗi trang một file.', icon: 'split', run: splitTool },
  { id: 'organize', group: 'Tổ chức file', title: 'Sắp xếp, xoay, xoá trang', desc: 'Xem thumbnail, kéo thả đổi thứ tự, xoay, xoá trang.', icon: 'organize', run: organizeTool },
  { id: 'crop', group: 'Tổ chức file', title: 'Cắt lề', desc: 'Cắt bớt viền trắng của các trang.', icon: 'crop', run: cropTool },
  { id: 'scan', group: 'Chuyển đổi', title: 'Quét tài liệu', desc: 'Chụp giấy tờ, nắn thẳng, lọc cho rõ chữ rồi xuất PDF.', icon: 'scan', run: scanTool },
  { id: 'img2pdf', group: 'Chuyển đổi', title: 'Ảnh → PDF', desc: 'Biến ảnh JPG/PNG… thành PDF, chọn khổ giấy và lề.', icon: 'img2pdf', run: img2pdfTool },
  { id: 'pdf2img', group: 'Chuyển đổi', title: 'PDF → Ảnh', desc: 'Xuất từng trang ra PNG hoặc JPG chất lượng cao.', icon: 'pdf2img', run: pdf2imgTool },
  { id: 'compress', group: 'Tối ưu & bảo mật', title: 'Nén PDF', desc: 'Giảm dung lượng, giữ chữ hoặc nén cực mạnh.', icon: 'compress', run: compressTool },
  { id: 'protect', group: 'Tối ưu & bảo mật', title: 'Mật khẩu', desc: 'Đặt hoặc gỡ mật khẩu, giới hạn in/sao chép.', icon: 'lock', run: protectTool },
  { id: 'watermark', group: 'Chỉnh sửa', title: 'Watermark', desc: 'Đóng dấu chữ hoặc logo chìm lên các trang.', icon: 'watermark', run: watermarkTool },
  { id: 'numbers', group: 'Chỉnh sửa', title: 'Đánh số trang', desc: 'Thêm số trang với nhiều kiểu và vị trí.', icon: 'numbers', run: numbersTool },
  { id: 'sign', group: 'Chỉnh sửa', title: 'Ký tên & chèn chữ', desc: 'Vẽ chữ ký, chèn ảnh con dấu hoặc văn bản.', icon: 'sign', run: signTool },
  { id: 'ocr', group: 'Nhận dạng', title: 'OCR – nhận dạng chữ', desc: 'PDF scan thành PDF tìm kiếm được, hỗ trợ tiếng Việt.', icon: 'ocr', run: ocrTool },
];

const app = document.getElementById('app');

function home() {
  document.title = 'PDF Toolkit – Công cụ PDF miễn phí, không giới hạn';
  const groups = [...new Set(TOOLS.map(t => t.group))];
  app.replaceChildren(
    el('section', { class: 'hero' },
      el('h1', {}, 'Mọi thứ về PDF, miễn phí và không giới hạn'),
      el('p', {}, 'Ghép, tách, nén, xoay, ký tên, OCR… Tất cả chạy ngay trong trình duyệt của bạn: file không rời khỏi máy, không đăng ký, không giới hạn số lần dùng.')),
    ...groups.flatMap(g => [
      el('div', { class: 'group' }, g),
      el('div', { class: 'grid' }, TOOLS.filter(t => t.group === g).map(t =>
        el('a', { class: 'tool', href: '#/' + t.id },
          el('span', { class: 'ic' }, icon(t.icon, 22)),
          el('span', {}, el('b', {}, t.title), el('small', {}, t.desc)))))]));
}

function tool(t) {
  document.title = t.title + ' – PDF Toolkit';
  const body = el('div');
  app.replaceChildren(
    el('a', { class: 'back', href: '#/' }, icon('left', 16), 'Tất cả công cụ'),
    el('div', { class: 'thead' }, el('span', { class: 'ic' }, icon(t.icon, 24)), el('div', {}, el('h2', {}, t.title), el('p', {}, t.desc))),
    body);
  try { t.run(body); }
  catch (e) { console.error(e); body.append(el('div', { class: 'panel' }, 'Không mở được công cụ này: ' + e.message)); }
}

function route() {
  const id = location.hash.replace(/^#\/?/, '');
  const t = TOOLS.find(x => x.id === id);
  if (t) tool(t); else home();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
