# PDF Toolkit

Bộ công cụ PDF miễn phí, **không giới hạn**, chạy hoàn toàn trong trình duyệt (file không bị tải lên server).

**Tính năng:** ghép · tách/cắt · sắp xếp/xoay/xoá trang · cắt lề · ảnh→PDF · PDF→ảnh · nén (Ghostscript) · đặt/gỡ mật khẩu · watermark · đánh số trang · ký tên & chèn chữ · OCR tiếng Việt/Anh.

Là PWA: mở trên iPhone → Chia sẻ → "Thêm vào Màn hình chính" để dùng như app, có thể offline.

## Công nghệ
pdf-lib, PDF.js, Ghostscript (WebAssembly), Tesseract.js. Tất cả đã nằm sẵn trong thư mục `vendor/`, không cần build, không phụ thuộc CDN.

## Chạy thử trên máy
```
python -m http.server 8080
```
rồi mở http://localhost:8080 (cần chạy qua http, mở trực tiếp file:// sẽ không hoạt động).

## Cập nhật
Sửa mã xong, tăng `VERSION` trong `sw.js` để người dùng nhận bản mới.
