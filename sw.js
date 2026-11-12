// Service worker: lưu cache để dùng offline. Tăng VERSION mỗi khi cập nhật ứng dụng.
const VERSION = 'v1';
const CACHE = 'pdf-toolkit-' + VERSION;
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/util.js', 'js/shared.js', 'js/pdfcore.js',
  'js/tools-basic.js', 'js/tools-adv.js', 'js/gs-worker.js', 'manifest.webmanifest', 'icons/icon.svg',
  'vendor/pdf-lib.min.js', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('pdf-toolkit-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Cache-first; thư viện nặng (Ghostscript, OCR) được lưu lần đầu khi dùng.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) {
      // Tệp của ứng dụng: trả bản cache ngay và âm thầm cập nhật cho lần mở sau.
      if (!req.url.includes('/vendor/')) {
        fetch(req).then(r => { if (r.ok) caches.open(CACHE).then(c => c.put(req, r)); }).catch(() => {});
      }
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    } catch (err) {
      if (req.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
      throw err;
    }
  })());
});
