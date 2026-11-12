// Chạy Ghostscript (WebAssembly) trong Web Worker để không treo giao diện.
importScripts('../vendor/gs.js'); // định nghĩa biến toàn cục `Module` (hàm khởi tạo)

self.onmessage = async (e) => {
  const { files, args, out, wantVersion } = e.data;
  const logs = [];
  try {
    const M = await Module({
      noInitialRun: true,
      locateFile: (f) => new URL('../vendor/' + f, self.location.href).href,
      print: (t) => logs.push(String(t)),
      printErr: (t) => logs.push(String(t)),
    });
    for (const [name, u8] of Object.entries(files || {})) M.FS.writeFile(name, u8);
    let code = 0;
    try {
      const r = M.callMain(args);
      if (typeof r === 'number') code = r;
    } catch (err) {
      code = typeof err === 'number' ? err : (err && typeof err.status === 'number' ? err.status : 1);
    }
    let data = null;
    if (out) { try { data = M.FS.readFile(out); } catch (_) { data = null; } }
    const ok = code === 0 && (!out || (data && data.length > 0));
    self.postMessage({ ok, code, logs, data }, data ? [data.buffer] : []);
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err), logs });
  }
};
