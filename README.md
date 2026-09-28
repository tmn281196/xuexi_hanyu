# Học tiếng Trung

Hai trang học tiếng Trung. Toàn bộ là file tĩnh (HTML, CSS, JS, JSON), không có backend, không có bước dựng;
đăng trên GitHub Pages: https://tmn281196.github.io/xuexi_hanyu/

| Trang | Nội dung |
|---|---|
| `zh-svo` | Đồ thị câu tiếng Trung HSK1–6, pinyin trên từng từ: động từ, ngữ pháp, hội thoại |
| `zh-chunks` | Từ vựng tiếng Trung theo bài / mục ngữ pháp / nhóm động từ, câu tách sẵn thành từ |

## Cấu trúc

```
src/            cả site, đăng nguyên thư mục này
  index.html            trang mục lục
  zh-svo/, zh-chunks/   hai site tiếng Trung
  hanyu/                dùng chung cho hai site
    data.json           câu đã tách từ, pinyin, từ điển (dựng từ note, xem dưới)
    hanyu.js            đọc note, tách từ, căn pinyin; trên trình duyệt chỉ tải data.json
    hanyu-syntax.js     phân tích cú pháp (chủ ngữ, vị ngữ, tân ngữ, bổ ngữ…), chạy trên trình duyệt
tools/
  dung-du-lieu.js       dựng src/hanyu/data.json từ note (Node)
```

Trang zh-svo tải `data.json` rồi tự phân tích câu ngay trên trình duyệt (`zh-svo/data.js`); zh-chunks dùng thẳng
`data.json`.

## Xem thử

Trang đọc dữ liệu bằng `fetch`, nên phải mở qua http chứ không mở file trực tiếp:

```bash
python -m http.server -d src
```

rồi vào http://localhost:8000.

## Đăng lên GitHub Pages

Đẩy lên nhánh `main` là xong: `.github/workflows/pages.yml` đăng nguyên `src/`.

## Sửa nội dung

- Câu, từ vựng tiếng Trung: note giáo trình không nằm trong repo (để không bị công khai). Sửa note, rồi dựng lại
  `data.json` (cần Node 18+):

  ```bash
  node tools/dung-du-lieu.js <thư mục note>
  ```

  Thư mục note gồm `hanyu-data/` (note HSK1 chép từ vault Obsidian) và `hanyu-plus/` (`ngu-phap.md`,
  `dong-tu.md`, `tu-dien.txt`). Định dạng bảng: `Chữ Hán | Pinyin | Nghĩa`; chữ **đậm** là từ / điểm ngữ pháp
  của mục; dấu cách giữa các chữ Hán là ranh giới từ. Từ mới cần từ loại: thêm dòng `chữ|pinyin|từ loại|nghĩa`
  vào `tu-dien.txt`. Thêm bài HSK1 mới thì thêm tên note vào `HY_LESSONS` trong `src/hanyu/hanyu.js`.
