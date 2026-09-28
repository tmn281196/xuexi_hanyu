/* Dựng src/hanyu/data.json từ các note giáo trình (không nằm trong repo).

     node tools/dung-du-lieu.js <thư mục note>

   Thư mục note có hai thư mục con: hanyu-data (note HSK1 chép từ vault Obsidian)
   và hanyu-plus (ngữ pháp HSK2–6, động từ, tu-dien.txt). Chỉ phần trang cần —
   câu đã tách từ, pinyin, từ điển — được ghi ra data.json; bản thân note không
   lên web. */
"use strict";
const fs = require("fs"), path = require("path");
const Hanyu = require("../src/hanyu/hanyu.js");

const dir = process.argv[2];
if (!dir) {
  console.error("Cách dùng: node tools/dung-du-lieu.js <thư mục chứa hanyu-data và hanyu-plus>");
  process.exit(1);
}
const read = p => fs.promises.readFile(path.join(dir, p), "utf8").catch(() => null);
const out = path.join(__dirname, "../src/hanyu/data.json");

Hanyu.build(read).then(d => {
  fs.writeFileSync(out, JSON.stringify(d));
  console.log(`Đã ghi ${path.relative(process.cwd(), out)}: ${d.groups.length} nhóm, ${d.sents.length} câu, ${Object.keys(d.dict).length} từ`);
}).catch(err => {
  console.error(err.message);
  process.exit(1);
});
