/* Dữ liệu cho ba trang đồ thị của zh-svo, dựng ngay trên trình duyệt.

     data.verbs    {GROUPS, DATA}  động từ HSK1–4, mỗi từ hai câu     → window.SVO_VERBS
     data.grammar  TOPICS          các mục ngữ pháp HSK1–6            → window.TOPICS
     data.dialogue TOPICS          15 bài hội thoại + 6 bài luyện nói → window.TOPICS
     data.stats    số đếm cho trang mục lục

   Câu lấy từ ../hanyu/hanyu.js (đã tách từ, căn pinyin), cú pháp từ
   ../hanyu/hanyu-syntax.js; hai file đó phải nạp trước file này.

   Mỗi câu có dạng {zh, py, vi, spk, p, note?, tokens:[{w, py, pos, vi, func, head}]}
   — graph.js đọc đúng hình dạng này.

   ZhSvo.boot(pick, cfg) dùng chung cho các trang: dựng dữ liệu, gắn các biến
   window mà pick trả về, rồi mới nạp graph.js (graph.js đọc chúng ngay lúc chạy). */
(function(root){
  "use strict";

  const HS = root.HanyuSyntax || (typeof require === "function" ? require("../hanyu/hanyu-syntax.js") : null);

  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"})[c]);
  const pad2 = n => String(n).padStart(2, "0");

  /** Nghĩa gọn cho bảng chi tiết: bỏ nhãn từ loại "(đgt.)" đứng đầu. */
  function zs_gloss(vi){
    return vi.trim().replace(/^\(?\s*(đgt|đg|tt|đt|dt|pht|st|lt|gt)\.\s*\)?\s*/u, "");
  }

  /** "Hội thoại 1 — Ở trường (在学校)" → "Hội thoại 1 · Ở trường (在学校)"; "4. Từ vựng trên lớp (课堂用语)" → "Câu dùng trên lớp (课堂用语)". */
  function zs_sub(sub){
    if(sub === "") return "Bài mẫu";
    if(sub.includes("课堂用语")) return "Câu dùng trên lớp (课堂用语)";
    return sub.replace(/\s*—\s*/gu, " · ");
  }

  function zs_build(d){
    const POS = HS.hs_pos_table(d.dict, d.sents);
    const byG = {};
    for(const s of d.sents) (byG[s.g] ??= []).push(s);

    const sent = s => {
      const W = HS.hs_parse(s.t, POS, d.dict);
      for(const t of W){
        // Pinyin lấy từ câu nên chữ đầu câu viết hoa: hạ xuống, trừ tên riêng.
        if(t.pos !== "PROPN") t.py = t.py.toLowerCase();
        t.vi = zs_gloss(t.vi);
      }
      const row = {
        zh:     s.t.map(t => t[0]).join(""),
        py:     String(s.py),
        vi:     String(s.vi),
        spk:    String(s.spk ?? ""),
        p:      HS.hs_pattern(W),
        tokens: W,
      };
      if(s.gen){
        // Câu ví dụ trong phần ngữ pháp của bài không kèm pinyin: ghép theo
        // từ điển (âm tiết cách nhau, số giữ nguyên) nên đọc theo thanh gốc.
        const py = [];
        for(const t of s.t){
          if(t[3] === "p") continue;
          // Âm tiết dính nhau trong một từ (lǎo shī → lǎoshī), trừ tên
          // riêng nhiều chữ vẫn viết rời (Lǐ Yuè).
          const syl  = String(t[1]).split(" ");
          const name = syl.length > 1 && /^\p{Lu}/u.test(syl[1]);
          py.push(t[3] === "x" ? t[0] : syl.join(name ? " " : ""));
        }
        const p = py.filter(x => x !== "" && x !== "0").join(" ");
        const cs = Array.from(p);
        row.py   = (cs[0] ?? "").toUpperCase() + cs.slice(1).join("");
        row.note = "Pinyin ghép theo từ điển, chưa chỉnh <em>biến điệu</em>.";
      }
      return row;
    };

    // ---- 01 · động từ: mỗi động từ hai câu, câu đầu là câu chính ----
    const GROUPS = [];
    const DATA   = [];
    for(const g of d.groups){
      if(g.kind !== "verbs") continue;
      const from = DATA.length;
      const rows = byG[g.id] ?? [];
      const used = new Set();
      g.words.forEach((v, i) => {
        let mine = [];
        rows.forEach((s, k) => {
          if(!used.has(k) && s.t.some(t => t[2] && t[0] === v)) mine.push(k);
        });
        if(!mine.length){   // không thấy từ in đậm: câu thứ 2i, 2i+1 theo thứ tự
          mine = [2 * i, 2 * i + 1].filter(k => k < rows.length && !used.has(k));
        }
        if(!mine.length) return;
        const e    = d.dict[v] ?? {};
        const note = '<strong lang="zh">' + esc(v) + "</strong> <em>" + esc(e.py ?? "") + "</em> — " + esc(zs_gloss(String(e.vi ?? "")));
        const list = mine.map(k => {
          used.add(k);
          const x = sent(rows[k]);
          x.note = note;
          // Khung quanh chính động từ này, không phải vị ngữ của cả câu;
          // động từ năng nguyện (会 能 可以) thì lấy khung của động từ nó đi kèm.
          const ti = x.tokens.findIndex(t => t.w === v);
          if(ti >= 0) x.p = HS.hs_pattern(x.tokens, x.tokens[ti].func === "aux" ? x.tokens[ti].head : ti);
          return x;
        });
        const main = list.shift();
        DATA.push(Object.assign({verb: v, pattern: main.p}, main, {ex: list}));
      });
      // Nhóm HSK1 giữ tên cũ; nhóm soạn thêm ghi cấp ở đầu cho thanh bên.
      const name = g.title.replace(/^Nhóm\s*\d+\s*:\s*/u, "");
      GROUPS.push({name: (g.level !== "HSK1" ? g.level + " · " : "") + name, from, to: DATA.length});
    }

    // ---- 02 · theo ngữ pháp: mỗi mục một danh sách câu ----
    const grammar = [];
    for(const g of d.groups){
      if(g.kind !== "practice") continue;
      const ex = (byG[g.id] ?? []).map(sent);
      if(!ex.length) continue;
      grammar.push({
        // Tên nhóm trên thanh bên: HSK1, rồi mục 15–18 (mở rộng chung HSK2–4
        // của vault), rồi HSK2 tới HSK6 soạn thêm.
        g: g.level === "HSK2–4" ? "Mở rộng HSK2–4" : g.level,
        n: pad2(g.no) + " · " + g.title,
        b: String(g.sub),
        v: [{v: g.title, ex}],
      });
    }

    // ---- 03 · hội thoại: bài → từng đoạn hội thoại → từng lượt lời ----
    const dialogue = [];
    for(const g of d.groups){
      if(g.kind !== "lesson" && g.kind !== "speak") continue;
      const subs = new Map();
      for(const s of byG[g.id] ?? []){
        const key = zs_sub(String(s.sub));
        if(!subs.has(key)) subs.set(key, []);
        subs.get(key).push(sent(s));
      }
      if(!subs.size) continue;
      dialogue.push({
        g: g.kind === "lesson" ? "Giáo trình HSK1" : "Luyện nói",
        n: g.kind === "lesson" ? "Bài " + g.no + " · " + g.title : g.title,
        b: String(g.title),
        v: [...subs].map(([v, ex]) => ({v, ex})),
      });
    }

    const count = topics => topics.reduce((a, t) => a + t.v.reduce((b, v) => b + v.ex.length, 0), 0);
    return {
      verbs:    {GROUPS, DATA},
      grammar,
      dialogue,
      stats: {
        verbs:         DATA.length,
        verbSents:     DATA.reduce((a, x) => a + 1 + x.ex.length, 0),
        grammar:       grammar.length,
        grammarSents:  count(grammar),
        dialogue:      dialogue.length,
        dialogueSents: count(dialogue),
      },
    };
  }

  let built = null;
  function load(){
    return built ??= root.Hanyu.load("../hanyu/").then(zs_build);
  }

  /** Báo lỗi thay cho sân đồ thị (hay khối data-need) khi không dựng được dữ liệu. */
  function fail(err){
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Không đọc được dữ liệu: " + (err && err.message || err);
    const board = document.querySelector(".board, .hub");
    if(board) board.replaceWith(p);
    else document.querySelector("header")?.after(p);
    console.error(err);
  }

  /** Điền các chỗ <span data-stat="verbs"> từ số đếm; data-minus="50" thì trừ bớt (không xuống dưới 0). */
  function fillStats(data){
    for(const el of document.querySelectorAll("[data-stat]")){
      const v = data.stats[el.dataset.stat] ?? 0;
      el.textContent = Math.max(0, v - (Number(el.dataset.minus) || 0));
    }
  }

  function boot(pick, cfg){
    load().then(data => {
      fillStats(data);
      if(!pick) return;
      Object.assign(window, pick(data));
      window.SVO_PAGE = cfg || {};
      const s = document.createElement("script");
      s.src = "graph.js";
      document.body.appendChild(s);
    }).catch(fail);
  }

  const ZhSvo = {load, boot, build: zs_build};
  root.ZhSvo = ZhSvo;
  if(typeof module === "object" && module.exports) module.exports = ZhSvo;
})(typeof globalThis !== "undefined" ? globalThis : this);
