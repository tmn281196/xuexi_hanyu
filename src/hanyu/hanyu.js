/* Tiếng Trung dùng chung cho zh-chunks và zh-svo.

   Đọc giáo trình HSK1 trong hanyu-data (các note chép từ vault Obsidian) cùng
   phần HSK2–4 soạn thêm trong hanyu-plus (ngữ pháp HSK2–6, động từ, từ điển bổ
   sung), rồi:
     - gom từ điển: 500 từ thông dụng, 50 động từ, từ mới 15 bài, cộng bộ từ
       chức năng dựng sẵn ở cuối file (的 了 吗 很 在…) kèm từ loại;
     - gom câu: luyện đặt câu (18 mục ngữ pháp), đặt câu với 50 động từ, hội
       thoại 15 bài, luyện nói, tự giới thiệu;
     - tách câu thành từ: chữ **đậm** trong câu là từ vựng đã được đánh dấu
       (trong một cụm đậm, dấu cách tách các từ), phần còn lại tách bằng khớp
       dài nhất theo từ điển;
     - gắn pinyin cho từng chữ bằng cách chia dòng pinyin của chính câu đó
       thành âm tiết, nên giữ được biến điệu (不→bú, 一→yí) như giáo trình ghi.

   Phần đọc note chạy trong Node (tools/dung-du-lieu.js), ghi kết quả ra
   data.json: note không nằm trong repo nên không lên web. Trên trình duyệt,
   Hanyu.load(base) chỉ tải data.json (trang phải mở qua http, không phải
   file://) và trả về Promise dữ liệu {groups, sents, dict, charPy}. */
(function(root){
  "use strict";

  const HY_DATA = "hanyu-data/";
  const HY_PLUS = "hanyu-plus/";

  const HY_PRACTICE = "HSK1 - Luyện đặt câu (500 từ)";
  const HY_COMMON   = "Từ vựng thường gặp (500 từ)";
  const HY_VERBS    = "Top 50 động từ cơ bản";
  const HY_VERB_EX  = "Đặt câu với 50 động từ";
  const HY_SPEAK    = "HSK1 - Luyện nói - 5 đề";
  const HY_SELF     = "Giới thiệu bản thân - 陈明日";
  // Trình duyệt không liệt kê được thư mục: thêm bài mới thì thêm tên note vào đây.
  const HY_LESSONS  = [
    "HSK1 - Bài 01 - 你好！",
    "HSK1 - Bài 02 - 谢谢你！",
    "HSK1 - Bài 03 - 你叫什么名字？",
    "HSK1 - Bài 04 - 她是我的汉语老师。",
    "HSK1 - Bài 05 - 她女儿今年二十岁。",
    "HSK1 - Bài 06 - 我会说汉语。",
    "HSK1 - Bài 07 - 今天几号？",
    "HSK1 - Bài 08 - 我想喝茶。",
    "HSK1 - Bài 09 - 他儿子在哪儿工作？",
    "HSK1 - Bài 10 - 我能坐这儿吗？",
    "HSK1 - Bài 11 - 现在几点？",
    "HSK1 - Bài 12 - 明天天气怎么样？",
    "HSK1 - Bài 13 - 他在学做中国菜呢。",
    "HSK1 - Bài 14 - 她买了不少衣服。",
    "HSK1 - Bài 15 - 我是坐飞机来的。",
  ];
  const HY_NOTES = [HY_PRACTICE, HY_COMMON, HY_VERBS, HY_VERB_EX, HY_SPEAK, HY_SELF, ...HY_LESSONS];
  const HY_PLUS_FILES = ["dong-tu.md", "ngu-phap.md", "tu-dien.txt"];

  // ---------------------------------------------------------------- tiện ích

  // trim() của JS cắt cả khoảng trắng Unicode (　); giữ đúng bộ ký tự hẹp như trước.
  const WS = " \\t\\n\\r\\0\\x0B";
  const reTrim = new RegExp("^[" + WS + "]+|[" + WS + "]+$", "g");
  const reRtrim = new RegExp("[" + WS + "]+$");
  const trim  = s => s.replace(reTrim, "");
  const rtrim = s => s.replace(reRtrim, "");
  const chars = s => Array.from(s);
  const clen  = s => chars(s).length;
  const W     = "\\p{L}\\p{N}_";   // chữ của \w khi có Unicode

  /** Tách theo regex nhưng chỉ ở chỗ khớp đầu tiên (preg_split với limit 2). */
  function split2(s, re){
    const m = re.exec(s);
    return m ? [s.slice(0, m.index), s.slice(m.index + m[0].length)] : [s, ""];
  }

  // Chữ Hán, ghi tường minh theo dải mã.
  const HY_HAN = "\\u3007\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF";
  const HY_CJK_PUNC = "，。！？；：、…“”‘’（）「」";
  const HY_GRAM_SUB = "Ngữ pháp trong bài (语法)";
  const reHan = new RegExp("[" + HY_HAN + "]", "u");
  const reAllHan = new RegExp("^[" + HY_HAN + "]+$", "u");
  const hy_is_han = s => reHan.test(s);

  // ---------------------------------------------------------------- đọc note

  function hy_note(files, name){
    const text = files[HY_DATA + name + ".md"];
    if(text == null) throw new Error("Thiếu: " + name);
    return text.replace(/\r\n/g, "\n").replace(/^---\n[\s\S]*?\n---\n/, "");
  }

  /** Tiêu đề markdown thành chữ trơn: bỏ #, **, *, emoji đầu dòng. */
  function hy_heading(line){
    let t = line.replace(/^#+\s*/, "");
    t = t.split("**").join("").split("*").join("").split("`").join("");
    t = t.replace(/^[^\p{L}\p{N}]+/u, "");
    return trim(t);
  }

  /** Mọi bảng markdown trong note, kèm tiêu đề cấp 1-3 đang bao nó. */
  function hy_tables(text){
    const lines  = text.split("\n");
    const h      = ["", "", ""];
    const tables = [];
    const n      = lines.length;
    for(let i = 0; i < n; i++){
      const line = rtrim(lines[i]);
      const m = /^(#{1,3})\s/.exec(line);
      if(m){
        const lvl = m[1].length - 1;
        h[lvl] = hy_heading(line);
        for(let k = lvl + 1; k < 3; k++) h[k] = "";
        continue;
      }
      if(line === "" || line[0] !== "|" || i + 1 >= n || !/^\|\s*:?-{2,}/.test(trim(lines[i + 1]))) continue;
      const table = {h: h.slice(), head: hy_cells(line), rows: []};
      for(i += 2; i < n && trim(lines[i]).startsWith("|"); i++){
        table.rows.push(hy_cells(rtrim(lines[i])));
      }
      i--;
      tables.push(table);
    }
    return tables;
  }

  function hy_cells(line){
    line = trim(line);
    line = line.endsWith("|") ? line.slice(1, -1) : line.slice(1);
    return line.split("|").map(trim);
  }

  const reItalic = new RegExp("(?<![" + W + "*])\\*(?!\\s)(.+?)(?<!\\s)\\*(?![" + W + "*])", "gu");
  function hy_plain(s){
    s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/gu, "$1");
    s = s.split("**").join("").split("`").join("").split("<br>").join(" ");
    s = s.replace(reItalic, "$1");
    return trim(s);
  }

  // ------------------------------------------------------- câu ví dụ ngữ pháp

  const reGramOk = new RegExp("^(?:\\*\\*|[" + HY_HAN + HY_CJK_PUNC + "0-9])+$", "u");
  const reGramStrip = new RegExp("[" + HY_CJK_PUNC + "0-9]", "gu");
  const reLatin = /[a-zA-ZÀ-ỹ]/u;

  /**
   * Một ô / một dòng có phải là câu trọn vẹn thuần chữ Hán không.
   * Phần ngữ pháp của bài viết ví dụ theo nhiều kiểu, nên chỉ nhận câu kết thúc
   * bằng 。？！ và có ít nhất 3 chữ: bỏ mẩu câu, từ rời và số đếm.
   */
  function hy_gram_sentence(s){
    s = trim(s.split("`").join(""));
    s = s.replace(/^\s*(?:[（(]\s*\p{Nd}+\s*[)）]|\p{Nd}+[.、)])\s*/u, "");
    s = s.replace(/^(?:Ví dụ trong bài|Ví dụ|VD)\s*[:：]\s*/u, "");
    s = trim(s).replace(/^[QA]\s*[:：]\s*/u, "");
    s = s.replace(/\s+/gu, "");
    const bare = s.split("**").join("");
    if(s === "" || reLatin.test(bare)) return null;
    if(!reGramOk.test(s) || !/[。！？]$/u.test(bare)) return null;
    return clen(bare.replace(reGramStrip, "")) >= 3 ? s : null;
  }

  /**
   * Câu ví dụ trong phần "Ngữ pháp (语法)" / "Chú thích (注释)" của một bài.
   * Bỏ câu sai (đánh dấu ✗) và bảng khung câu ("Chủ ngữ | 会 | Động từ"), vì
   * bảng đó chia câu ra từng cột nên mỗi ô chỉ là một mẩu.
   * Trả về [câu, pinyin (có thể rỗng), nghĩa].
   */
  function hy_grammar(text){
    const out   = [];
    let sec     = "";
    const lines = text.split(/\r\n|\r|\n/u);
    const n     = lines.length;
    for(let i = 0; i < n; i++){
      const ln = rtrim(lines[i]);
      const m = /^(#{2,3})\s/u.exec(ln);
      if(m){
        if(m[1].length === 2) sec = hy_heading(ln);
        continue;
      }
      if(!/Ngữ pháp|语法|Chú thích|注释/u.test(sec) || /[✗✘×]/u.test(ln)) continue;
      if(trim(ln).startsWith("|") && i + 1 < n && /^\|\s*:?-{2,}/.test(trim(lines[i + 1]))){
        const head = hy_cells(ln).map(x => x.toLowerCase());
        let keep = false;
        for(const name of head) keep = keep || /ví dụ|chữ hán|câu|pinyin/u.test(name);
        let iPy = null, iVi = null;
        head.forEach((name, k) => {
          if(iPy === null && name.includes("pinyin")) iPy = k;
          if(iVi === null && (name.includes("nghĩa") || name.includes("dịch"))) iVi = k;
        });
        for(i += 2; i < n && trim(lines[i]).startsWith("|"); i++){
          const r = hy_cells(rtrim(lines[i]));
          if(!keep || /[✗✘×]/u.test(r.join(""))) continue;
          let zh = null, at = null;
          for(let k = 0; k < r.length; k++){
            if(k === iPy || k === iVi) continue;
            const z = hy_gram_sentence(hy_plain(r[k]));
            if(z !== null){ zh = z; at = k; break; }
          }
          if(zh === null) continue;
          let vi = iVi !== null ? hy_plain(r[iVi] ?? "") : "";
          if(vi === ""){
            for(let k = 0; k < r.length; k++){
              const c = hy_plain(r[k]);
              if(k !== at && k !== iPy && c !== "" && reLatin.test(c)){ vi = c; break; }
            }
          }
          out.push([zh, iPy !== null ? hy_plain(r[iPy] ?? "") : "", hy_gram_gloss(vi)]);
        }
        i--;
        continue;
      }
      let t = trim(ln);
      if(!/^(?:>\s*)*[-*]\s+/u.test(t)) continue;
      t = t.replace(/^(?:>\s*)*[-*]\s+/u, "");
      t = hy_plain(t.replace(/^(?:[✓✔])\s*/u, ""));
      const [zh, vi] = split2(t, /\s+[—–]\s+/u);
      for(const cand of zh.split(/\s*(?:\/|→|➜)\s*/u)){
        const z = hy_gram_sentence(cand);
        if(z !== null) out.push([z, "", hy_gram_gloss(trim(vi))]);
      }
    }
    return out;
  }

  /** Nhãn cột ("Khẳng định", "Nghi vấn") không phải nghĩa của câu. */
  function hy_gram_gloss(vi){
    return /^(khẳng định|phủ định|nghi vấn)$/iu.test(trim(vi)) ? "" : trim(vi);
  }

  // ---------------------------------------------------------------- dựng dữ liệu

  const isDigits = s => /^[0-9]+$/.test(s);

  function hy_build(files){
    const dict   = Object.create(null);   // chữ Hán => {py, vi, pos, n (STT 500), v (nhóm động từ), l (bài)}
    const groups = {};
    const sents  = [];
    const gram   = {};   // bài => câu ví dụ trong phần ngữ pháp, nối vào cuối

    // 500 từ thông dụng
    for(const t of hy_tables(hy_note(files, HY_COMMON))){
      for(const r of t.rows){
        if(r.length >= 4 && isDigits(r[0]) && hy_is_han(r[1])){
          hy_dict_add(dict, r[1], {py: r[2], vi: hy_plain(r[3]), n: parseInt(r[0], 10)});
        }
      }
    }
    // 50 động từ, theo 5 nhóm
    const verbGroups = {};
    // Nhóm 6 trở đi soạn thêm: bảng từ và bảng câu nằm chung một file.
    const verbTables = hy_plus_tables(files, "dong-tu.md");
    const verbLevel  = {};
    for(const t of hy_tables(hy_note(files, HY_VERBS)).concat(verbTables)){
      for(const r of t.rows){
        if(r.length >= 4 && isDigits(r[0]) && hy_is_han(r[1])){
          const g = t.h[1];
          (verbGroups[g] ??= []).push(r[1]);
          verbLevel[g] = hy_level(t.h[0]);
          hy_dict_add(dict, r[1], {py: r[2], vi: hy_plain(r[3]), pos: "VERB", v: g});
        }
      }
    }
    // 15 bài: từ mới + hội thoại
    for(const name of HY_LESSONS.slice().sort()){
      const m = /Bài (\d+) - (.+)$/u.exec(name);
      if(!m) continue;
      const no    = parseInt(m[1], 10);
      const gid   = "bai-" + String(no).padStart(2, "0");
      const text  = hy_note(files, name);
      const words = [];
      const am    = /^#\s.*?\*(.+?)\*\s*$/mu.exec(text);
      const alias = am ? trim(am[1]) : "";
      for(const t of hy_tables(text)){
        const head = t.head.join("|").toLowerCase();
        if(!head.includes("chữ hán") || !head.includes("pinyin")) continue;
        // "Từ vựng (生词)": từ mới. "Từ vựng trên lớp (课堂用语)" là câu khẩu
        // lệnh có dịch nghĩa, nên xếp cùng hội thoại làm câu ví dụ.
        if(t.h[1].includes("生词")){
          for(const r of t.rows){
            if(r.length < 3 || !hy_is_han(r[0])) continue;
            // "少 / 不少" là hai từ trong một ô; pinyin chia theo cùng cách nếu khớp số.
            const ws  = r[0].split(/\s*\/\s*/u).map(hy_clean_word);
            const pys = r[1].split(/\s*\/\s*/u).map(hy_clean_word);
            ws.forEach((w, i) => {
              if(w === "" || !hy_is_han(w)) return;
              const py = pys.length === ws.length ? pys[i] : (i === 0 ? pys[0] : "");
              hy_dict_add(dict, w, {py, vi: hy_plain(r[r.length - 1]), l: no});
              words.push(w);
            });
          }
        }
        else if(t.h[1].includes("Hội thoại") || t.h[1].includes("课堂用语")){
          for(const r of t.rows){
            if(r.length >= 3 && hy_is_han(r[0])) sents.push(hy_sentence_row(r, gid, t.h[2] || t.h[1], false));
          }
        }
      }
      groups[gid] = {id: gid, kind: "lesson", no, title: trim(m[2]), sub: alias,
                     level: "HSK1", words: [...new Set(words)]};
      gram[gid] = hy_grammar(text);
    }

    // Luyện đặt câu: 18 mục của vault, phần A (HSK1) và phần B (HSK2–4), rồi
    // mục 19 trở đi soạn thêm theo HSK2 tới HSK6. Cấp lấy từ tiêu đề phần.
    for(const t of hy_tables(hy_note(files, HY_PRACTICE)).concat(hy_plus_tables(files, "ngu-phap.md"))){
      const m = /^(\d+)\.\s*(.+)$/u.exec(t.h[1]);
      if(!m || !(t.head[0] ?? "").toLowerCase().includes("chữ hán")) continue;
      const no  = parseInt(m[1], 10);
      const gid = "muc-" + String(no).padStart(2, "0");
      if(!groups[gid]){
        const [title, sub] = split2(m[2], /\s+—\s+/u);
        groups[gid] = {id: gid, kind: "practice", no, title: trim(title), sub: trim(sub),
                       level: hy_level(t.h[0]), words: []};
      }
      for(const r of t.rows){
        if(r.length >= 3 && hy_is_han(r[0])) sents.push(hy_sentence_row(r, gid, "", true));
      }
    }
    // Đặt câu với 50 động từ
    for(const t of hy_tables(hy_note(files, HY_VERB_EX)).concat(verbTables)){
      if(!t.h[1].includes("Nhóm")) continue;
      const m = /Nhóm\s*(\d+)/u.exec(t.h[1]);
      const gid = "dt-" + (m ? m[1] : "0");
      if(!groups[gid]){
        // "Nhóm 2: Hành động hàng ngày" → title "Hành động hàng ngày": số
        // nhóm đã nằm trong 'no', trang tự ghép lại.
        groups[gid] = {id: gid, kind: "verbs", no: parseInt(gid.slice(3), 10) || 0,
                       title: t.h[1].replace(/^Nhóm\s*\d+\s*:\s*/u, ""),
                       sub: "", level: verbLevel[t.h[1]] ?? "HSK1", words: verbGroups[t.h[1]] ?? []};
      }
      for(const r of t.rows){
        if(r.length >= 3 && hy_is_han(r[0])) sents.push(hy_sentence_row(r, gid, "", true));
      }
    }
    // Luyện nói 5 đề
    for(const t of hy_tables(hy_note(files, HY_SPEAK))){
      const m = /^Đề\s*(\d+)\s*[—-]\s*(.+)$/u.exec(t.h[1]);
      if(!m) continue;
      const gid = "de-" + m[1];
      if(!groups[gid]){
        groups[gid] = {id: gid, kind: "speak", no: parseInt(m[1], 10), title: trim(m[2]), sub: "",
                       level: "HSK1", words: []};
      }
      for(const r of t.rows){
        if(r.length >= 3 && hy_is_han(r[0])) sents.push(hy_sentence_row(r, gid, t.h[2], false));
      }
    }
    // Tự giới thiệu: cả câu in đậm, nên bỏ đậm đi
    for(const t of hy_tables(hy_note(files, HY_SELF))){
      if(!(t.head[0] ?? "").toLowerCase().includes("chữ hán")) continue;
      groups["tu-gioi-thieu"] ??= {id: "tu-gioi-thieu", kind: "speak", no: 6, title: "Tự giới thiệu",
                                   sub: "", level: "HSK1", words: []};
      for(const r of t.rows){
        if(r.length >= 3 && hy_is_han(r[0])){
          const row = r.slice();
          row[0] = row[0].split("**").join("");
          sents.push(hy_sentence_row(row, "tu-gioi-thieu", "", false));
        }
      }
    }

    // Câu ví dụ của phần ngữ pháp, xếp sau cùng để câu hội thoại vẫn là câu
    // mẫu chính của mỗi từ. Câu đã có ở chỗ khác thì bỏ, khỏi trùng.
    const seenRaw = new Set(sents.map(s => s.raw.split("**").join("")));
    for(const gid in gram){
      for(const r of gram[gid]){
        const key = r[0].split("**").join("");
        if(seenRaw.has(key)) continue;
        seenRaw.add(key);
        const row = hy_sentence_row([r[0], r[1], r[2]], gid, HY_GRAM_SUB, false);
        row.gen = r[1] === "";   // không có pinyin sẵn: ghép từ từ điển
        sents.push(row);
      }
    }

    // Từ chức năng dựng sẵn và từ điển của phần soạn thêm: chỉ thêm chỗ kho
    // chưa có, và bổ sung từ loại.
    const lex = Object.assign({}, hy_plus_lexicon(files), hy_lexicon());
    const lexKeys = Object.keys(hy_lexicon()).concat(Object.keys(hy_plus_lexicon(files)).filter(w => !(w in hy_lexicon())));
    for(const w of lexKeys){
      const [py, pos, vi] = lex[w];
      if(dict[w]) dict[w].pos ??= pos;
      else dict[w] = {py, vi, pos, b: 1};
    }

    // Tách từ + pinyin cho mọi câu
    const charPy = hy_char_pinyin(dict);
    const maxLen = Math.max(...Object.keys(dict).map(clen));
    sents.forEach((s, i) => {
      s.id = i;
      s.t  = hy_segment(s.raw, dict, maxLen);
      s.ok = hy_align(s.t, s.py, dict, charPy);
      delete s.raw;
    });

    // Từ của từng mục luyện đặt câu: từ in đậm, lần đầu xuất hiện ở mục đó.
    const seen = new Set();
    const practice = s => (groups[s.g]?.kind ?? "") === "practice";
    for(const s of sents){
      if(!practice(s)) continue;
      for(const tok of s.t){
        if(tok[2] && tok[3] === "h" && !seen.has(tok[0])){
          seen.add(tok[0]);
          groups[s.g].words.push(tok[0]);
        }
      }
    }
    // Phần luyện đặt câu dùng đủ 500 từ, nhưng vài từ (phần lớn là từ chức năng:
    // 这个, 他们, 还是…) không được in đậm ở câu nào. Gắn mỗi từ đó vào mục có câu
    // đầu tiên chứa nó, để từ nào trong 500 từ cũng có thẻ.
    for(const w in dict){
      if(!dict[w].n || seen.has(w)) continue;
      found: for(const s of sents){
        if(!practice(s)) continue;
        for(const tok of s.t){
          if(tok[0] === w){
            seen.add(w);
            groups[s.g].words.push(w);
            break found;
          }
        }
      }
    }

    // Pinyin từng âm tiết cho mỗi từ trong từ điển ("péng yǒu"), để trang tự
    // tách câu người dùng gõ vào mà vẫn gắn được pinyin cho từng chữ.
    for(const w in dict){
      const e  = dict[w];
      const cs = chars(w);
      const syl = hy_syllables(String(e.py ?? ""));
      e.ps = syl.length === cs.length ? syl.join(" ") : cs.map(c => charPy[c] ?? "").join(" ");
    }

    return {groups: Object.values(groups), sents, dict, charPy};
  }

  /** Bảng của một file trong hanyu-plus; thiếu file thì coi như không có gì. */
  function hy_plus_tables(files, file){
    const text = files[HY_PLUS + file];
    return text != null ? hy_tables(text.replace(/\r\n/g, "\n")) : [];
  }

  /** Từ điển của phần soạn thêm: mỗi dòng "chữ|pinyin|từ loại|nghĩa", dòng # là chú thích. */
  function hy_plus_lexicon(files){
    const text = files[HY_PLUS + "tu-dien.txt"];
    const lex  = {};
    for(const line of text != null ? text.split("\n") : []){
      const f = trim(line).split("|");
      if(f.length === 4 && f[0] !== "" && f[0][0] !== "#") lex[f[0]] = [f[1], f[2], f[3]];
    }
    return lex;
  }

  /** Cấp HSK ghi trong tiêu đề phần: "Phần B — Mở rộng (HSK2–4)" → HSK2–4, "Phần D — HSK3" → HSK3; không ghi thì HSK1. */
  function hy_level(heading){
    const m = /HSK\s*(\d)(?:\s*[–-]\s*(\d))?/u.exec(heading);
    if(!m) return "HSK1";
    return "HSK" + m[1] + (m[2] ? "–" + m[2] : "");
  }

  /** Ô "Chữ Hán" / "Pinyin" của bảng từ mới: bỏ ghi chú trong ngoặc, dấu (*) và dấu câu cuối. "……" thành "…". */
  function hy_clean_word(s){
    s = hy_plain(s);
    s = s.replace(/\s*[（(][^）)]*[）)]|\s*\*+\s*$/gu, "");
    s = s.split("……").join("…").split("...").join("…");
    return s.replace(/^[\s！!。？?，,]+|[\s！!。？?，,]+$/gu, "");
  }

  function hy_dict_add(dict, w, e){
    w = trim(w);
    if(w === "" || !hy_is_han(w)) return;
    if(!dict[w]){ dict[w] = e; return; }
    for(const k in e) dict[w][k] ??= e[k];
  }

  /** Một hàng bảng câu: [chữ Hán, pinyin, nghĩa]. "A: …" là người nói; "(#377)" trong nghĩa là số tra 500 từ. */
  function hy_sentence_row(r, gid, sub, keepBold){
    let zh  = trim(r[0]);
    let spk = null;
    const m = /^([A-Z])\s*[:：]\s*/u.exec(zh);
    if(m){
      spk = m[1];
      zh  = trim(zh.slice(m[0].length));
    }
    if(!keepBold) zh = zh.split("**").join("");
    const vi = trim(r[2].replace(/\(#\d+\)\s*/g, ""));
    return {g: gid, sub, spk, raw: zh, py: hy_plain(r[1]), vi: hy_plain(vi)};
  }

  // ---------------------------------------------------------------- tách từ

  const reChunk = new RegExp("[" + HY_HAN + "]+|[0-9A-Za-z.%]+|[^" + HY_HAN + "0-9A-Za-z\\s]|\\s+", "gu");

  /**
   * Câu → token [chữ, pinyin, đậm, loại]; loại: 'h' từ chữ Hán, 'x' số / chữ Latin, 'p' dấu câu.
   * Chữ in đậm là từ đã đánh dấu sẵn; trong một cụm đậm, dấu cách tách từ.
   */
  function hy_segment(raw, dict, maxLen){
    const toks = [];
    for(const part of raw.split(/(\*\*.+?\*\*)/u)){
      if(part === "") continue;
      if(part.startsWith("**") && part.endsWith("**") && clen(part) > 4){
        for(const piece of trim(part.slice(2, -2)).split(/\s+/u)){
          if(piece === "") continue;
          if(dict[piece] || clen(piece) <= 2 || !reAllHan.test(piece)){
            toks.push([piece, "", 1, hy_is_han(piece) ? "h" : "x"]);
          }
          else {
            for(const w of hy_maxmatch(piece, dict, maxLen)) toks.push([w, "", 1, "h"]);
          }
        }
        continue;
      }
      // phần thường: dấu câu, số/Latin, và chuỗi chữ Hán
      for(const [chunk] of part.matchAll(reChunk)){
        if(trim(chunk) === "") continue;
        if(reAllHan.test(chunk)){
          for(const w of hy_maxmatch(chunk, dict, maxLen)) toks.push([w, "", 0, "h"]);
        }
        else {
          toks.push([chunk, "", 0, /^[0-9A-Za-z]/.test(chunk) ? "x" : "p"]);
        }
      }
    }
    return toks;
  }

  const HY_NUM = "零一二三四五六七八九十百千万两";

  /** Khớp dài nhất từ trái sang; chuỗi chữ số Hán không có trong từ điển gộp thành một số. */
  function hy_maxmatch(han, dict, maxLen){
    const cs  = chars(han);
    const n   = cs.length;
    const out = [];
    for(let i = 0; i < n;){
      let best = 1;
      for(let len = Math.min(maxLen, n - i); len > 1; len--){
        if(dict[cs.slice(i, i + len).join("")]){ best = len; break; }
      }
      if(best === 1 && HY_NUM.includes(cs[i])){
        while(i + best < n && HY_NUM.includes(cs[i + best])) best++;
      }
      out.push(cs.slice(i, i + best).join(""));
      i += best;
    }
    // 们 là hậu tố số nhiều: 孩子们, 同学们 là một từ.
    for(let i = out.length - 1; i > 0; i--){
      if(out[i] === "们" && !HY_NUM.includes(chars(out[i - 1]).pop())){
        out[i - 1] += "们";
        out.splice(i, 1);
      }
    }
    // Hai chữ liền nhau mà từ điển không biết chữ nào thì gần như chắc là một
    // từ hai chữ chưa có trong từ điển (风景); chuỗi dài hơn thì để nguyên.
    const unk = w => clen(w) === 1 && !dict[w] && !HY_NUM.includes(w);
    const res = [];
    for(let i = 0, m = out.length; i < m; i++){
      if(unk(out[i]) && i + 1 < m && unk(out[i + 1])
         && !(i > 0 && unk(out[i - 1])) && !(i + 2 < m && unk(out[i + 2]))){
        res.push(out[i] + out[++i]);
        continue;
      }
      res.push(out[i]);
    }
    return res;
  }

  // ---------------------------------------------------------------- pinyin

  const TONE = {"ā":"a","á":"a","ǎ":"a","à":"a","ē":"e","é":"e","ě":"e","è":"e","ī":"i","í":"i","ǐ":"i","ì":"i",
                "ō":"o","ó":"o","ǒ":"o","ò":"o","ū":"u","ú":"u","ǔ":"u","ù":"u","ǖ":"v","ǘ":"v","ǚ":"v","ǜ":"v","ü":"v"};
  const hy_py_norm = s => s.toLowerCase().replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/g, c => TONE[c]);

  const reSyl = /^(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(?:iang|iong|uang|ueng|iao|ian|ing|uai|uan|ang|eng|ong|ai|ei|ao|ou|an|en|er|ia|ie|iu|in|ua|uo|ui|un|ve|ue|a|o|e|i|u|v)r?$/;
  function hy_is_syl(s, first){
    if(!first && /^[aoe]/.test(s)) return false;   // âm tiết mở đầu bằng a/o/e giữa từ phải có dấu ' đứng trước
    return reSyl.test(s);
  }

  /**
   * Dòng pinyin → danh sách âm tiết, giữ nguyên dấu thanh. Mỗi cụm chữ Latin
   * được chia theo khớp dài nhất có quay lui.
   */
  function hy_syllables(py){
    const out = [];
    for(const [word] of py.matchAll(/\p{L}+/gu)){   // dấu ' và dấu câu là ranh giới
      const cs   = chars(word);
      const norm = chars(hy_py_norm(word));
      if(cs.length !== norm.length) return [];
      const split = hy_syl_split(norm, 0, true);
      if(split === null) return [];
      for(const [a, b] of split) out.push(cs.slice(a, b).join(""));
    }
    return out;
  }

  function hy_syl_split(norm, at, first){
    const n = norm.length;
    if(at === n) return [];
    for(let len = Math.min(7, n - at); len >= 1; len--){
      if(!hy_is_syl(norm.slice(at, at + len).join(""), first)) continue;
      const rest = hy_syl_split(norm, at + len, false);
      if(rest !== null) return [[at, at + len], ...rest];
    }
    return null;
  }

  /** Pinyin từng chữ, rút từ các từ nhiều chữ trong từ điển (dùng khi không chia được dòng pinyin của câu). */
  function hy_char_pinyin(dict){
    const map = {};
    for(const w in dict){
      const cs  = chars(w);
      const syl = hy_syllables(String(dict[w].py ?? ""));
      if(syl.length === cs.length) cs.forEach((c, k) => { map[c] ??= syl[k]; });
    }
    return map;
  }

  /**
   * Gắn pinyin vào token, từng chữ một, từ dòng pinyin của câu.
   *   - "儿" đọc dính (yìdiǎnr) không có âm tiết riêng;
   *   - một con số (50岁) nhận hết số âm tiết dư ra (wǔshí);
   *   - chữ Latin, hay số chữ không khớp số âm tiết: lấy pinyin từ từ điển.
   * Trả về true nếu dùng được pinyin của chính câu.
   */
  function hy_align(toks, py, dict, charPy){
    const syl   = hy_syllables(py);
    const units = [];            // [chỉ số token, 'c' chữ Hán | 'd' con số, chữ]
    let latin   = false;
    toks.forEach((t, k) => {
      if(t[3] === "h"){
        for(const c of chars(t[0])) units.push([k, "c", c]);
      }
      else if(t[3] === "x"){
        if(/^\d+$/.test(t[0])) units.push([k, "d", t[0]]);
        else latin = true;
      }
    });
    const nd = units.filter(u => u[1] === "d").length;
    const nc = units.length - nd;
    const ns = syl.length;

    let assign = null;
    if(ns && !latin && nd === 0){
      assign = [];
      let j = 0;
      for(let i = 0; i < units.length; i++){
        const [k, , c] = units[i];
        const prev = j > 0 ? hy_py_norm(syl[j - 1]) : "";
        if(c === "儿" && prev !== "" && prev !== "er" && prev.endsWith("r") && (nc - i) > (ns - j)){
          assign.push([k, ""]);
          continue;
        }
        if(j >= ns){ assign = null; break; }
        assign.push([k, syl[j++]]);
      }
      if(assign !== null && j !== ns) assign = null;
    }
    else if(ns && !latin && nd === 1 && ns - nc >= 1 && !units.map(u => u[2]).join("").includes("儿")){
      assign = [];
      let j = 0;
      for(const [k, type] of units){
        const take = type === "d" ? ns - nc : 1;
        assign.push([k, syl.slice(j, j + take).join("")]);
        j += take;
      }
    }

    // Pinyin của token là các âm tiết cách nhau một dấu cách, đúng một âm tiết
    // cho mỗi chữ ("péng yǒu"; "儿" đọc dính để trống), để trang còn tách được
    // về từng chữ. Con số giữ nguyên các âm tiết của nó.
    if(assign !== null){
      const per = new Map();
      for(const [k, s] of assign){
        if(!per.has(k)) per.set(k, []);
        per.get(k).push(s);
      }
      for(const [k, list] of per){
        toks[k][1] = toks[k][3] === "x" ? hy_syllables(list[0]).join(" ") : list.join(" ");
      }
      return true;
    }
    for(const t of toks){
      if(t[3] !== "h") continue;
      const cs = chars(t[0]);
      const s  = dict[t[0]] ? hy_syllables(String(dict[t[0]].py ?? "")) : [];
      t[1] = s.length === cs.length ? s.join(" ") : cs.map(c => charPy[c] ?? "").join(" ");
    }
    return false;
  }

  // ---------------------------------------------------------------- từ chức năng

  /**
   * Từ HSK1 hay gặp mà danh sách từ vựng thường không liệt kê riêng: đại từ,
   * trợ từ, phó từ, giới từ, lượng từ, số, từ chỉ thời gian. Dùng để tách từ
   * phần không in đậm, và cho trang phân tích câu biết từ loại.
   * Từ loại theo Universal Dependencies, thêm CLF (lượng từ) và TIME (từ chỉ thời gian).
   * Trả về {chữ: [pinyin, từ loại, nghĩa]}.
   */
  let LEX = null;
  function hy_lexicon(){
    if(LEX) return LEX;
    const raw = `
我|wǒ|PRON|tôi
你|nǐ|PRON|bạn
您|nín|PRON|ngài, ông, bà
他|tā|PRON|anh ấy
她|tā|PRON|cô ấy
它|tā|PRON|nó
我们|wǒmen|PRON|chúng tôi
你们|nǐmen|PRON|các bạn
他们|tāmen|PRON|họ
她们|tāmen|PRON|họ (nữ)
咱们|zánmen|PRON|chúng ta
大家|dàjiā|PRON|mọi người
自己|zìjǐ|PRON|tự mình
这|zhè|PRON|này, đây
那|nà|PRON|kia, đó
哪|nǎ|PRON|nào
这儿|zhèr|PRON|ở đây
那儿|nàr|PRON|ở đó
哪儿|nǎr|PRON|ở đâu
这里|zhèlǐ|PRON|ở đây
那里|nàlǐ|PRON|ở đó
哪里|nǎlǐ|PRON|ở đâu
这个|zhège|PRON|cái này
那个|nàge|PRON|cái kia
谁|shéi|PRON|ai
什么|shénme|PRON|cái gì
怎么|zěnme|PRON|thế nào, sao
怎么样|zěnmeyàng|PRON|thế nào
多少|duōshao|PRON|bao nhiêu
几|jǐ|NUM|mấy
为什么|wèishénme|PRON|tại sao
的|de|PART|(trợ từ kết cấu)
地|de|PART|(trợ từ trạng ngữ)
得|de|PART|(trợ từ bổ ngữ)
了|le|PART|rồi, đã
着|zhe|PART|đang (trạng thái)
过|guo|PART|đã từng
吗|ma|PART|không? (hỏi)
呢|ne|PART|còn…?; đang
吧|ba|PART|nhé, đi
啊|a|PART|à, nhỉ
呀|ya|PART|à
很|hěn|ADV|rất
太|tài|ADV|quá
真|zhēn|ADV|thật
也|yě|ADV|cũng
都|dōu|ADV|đều
不|bù|ADV|không
没|méi|ADV|không, chưa
没有|méiyǒu|ADV|không, chưa có
别|bié|ADV|đừng
还|hái|ADV|còn, vẫn
就|jiù|ADV|thì, liền, chính
才|cái|ADV|mới
再|zài|ADV|lại, nữa
又|yòu|ADV|lại
已经|yǐjīng|ADV|đã
常常|chángcháng|ADV|thường
经常|jīngcháng|ADV|thường xuyên
一起|yìqǐ|ADV|cùng nhau
非常|fēicháng|ADV|vô cùng
特别|tèbié|ADV|đặc biệt
最|zuì|ADV|nhất
更|gèng|ADV|hơn
一定|yídìng|ADV|nhất định
正在|zhèngzài|ADV|đang
总是|zǒngshì|ADV|luôn luôn
只|zhǐ|ADV|chỉ
多|duō|ADJ|nhiều
少|shǎo|ADJ|ít
在|zài|ADP|ở, tại
从|cóng|ADP|từ
跟|gēn|ADP|với
给|gěi|ADP|cho
对|duì|ADP|đối với
向|xiàng|ADP|hướng về
往|wǎng|ADP|về phía
离|lí|ADP|cách
比|bǐ|ADP|so với
把|bǎ|ADP|(đưa tân ngữ lên trước)
被|bèi|ADP|bị, được
和|hé|CCONJ|và
但是|dànshì|CCONJ|nhưng
可是|kěshì|CCONJ|nhưng
还是|háishi|CCONJ|hay là
或者|huòzhě|CCONJ|hoặc
而且|érqiě|CCONJ|hơn nữa
因为|yīnwèi|SCONJ|bởi vì
所以|suǒyǐ|SCONJ|cho nên
如果|rúguǒ|SCONJ|nếu
虽然|suīrán|SCONJ|tuy
会|huì|AUX|biết, sẽ
能|néng|AUX|có thể
可以|kěyǐ|AUX|có thể, được phép
想|xiǎng|AUX|muốn
要|yào|AUX|muốn, sẽ, phải
应该|yīnggāi|AUX|nên
是|shì|VERB|là
有|yǒu|VERB|có
叫|jiào|VERB|gọi, tên là
个|gè|CLF|cái, chiếc
本|běn|CLF|quyển
口|kǒu|CLF|(người trong nhà)
块|kuài|CLF|đồng (tiền)
岁|suì|CLF|tuổi
杯|bēi|CLF|cốc
件|jiàn|CLF|chiếc (áo, việc)
位|wèi|CLF|vị (người)
次|cì|CLF|lần
家|jiā|NOUN|nhà
点|diǎn|CLF|giờ
分|fēn|CLF|phút
号|hào|CLF|ngày (trong tháng)
月|yuè|NOUN|tháng
年|nián|NOUN|năm
天|tiān|NOUN|ngày
一|yī|NUM|một
二|èr|NUM|hai
两|liǎng|NUM|hai
三|sān|NUM|ba
四|sì|NUM|bốn
五|wǔ|NUM|năm
六|liù|NUM|sáu
七|qī|NUM|bảy
八|bā|NUM|tám
九|jiǔ|NUM|chín
十|shí|NUM|mười
百|bǎi|NUM|trăm
千|qiān|NUM|nghìn
万|wàn|NUM|vạn
今天|jīntiān|TIME|hôm nay
明天|míngtiān|TIME|ngày mai
昨天|zuótiān|TIME|hôm qua
现在|xiànzài|TIME|bây giờ
今年|jīnnián|TIME|năm nay
明年|míngnián|TIME|năm sau
去年|qùnián|TIME|năm ngoái
上午|shàngwǔ|TIME|buổi sáng
中午|zhōngwǔ|TIME|buổi trưa
下午|xiàwǔ|TIME|buổi chiều
早上|zǎoshang|TIME|sáng sớm
晚上|wǎnshang|TIME|buổi tối
星期|xīngqī|NOUN|tuần, thứ
星期一|xīngqīyī|TIME|thứ Hai
星期二|xīngqī'èr|TIME|thứ Ba
星期三|xīngqīsān|TIME|thứ Tư
星期四|xīngqīsì|TIME|thứ Năm
星期五|xīngqīwǔ|TIME|thứ Sáu
星期六|xīngqīliù|TIME|thứ Bảy
星期天|xīngqītiān|TIME|Chủ nhật
星期日|xīngqīrì|TIME|Chủ nhật
一共|yígòng|ADV|tổng cộng
时候|shíhou|NOUN|lúc
以后|yǐhòu|TIME|sau này
以前|yǐqián|TIME|trước đây
刚才|gāngcái|TIME|vừa nãy
上|shàng|NOUN|trên
下|xià|NOUN|dưới
里|lǐ|NOUN|trong
前面|qiánmiàn|NOUN|phía trước
后面|hòumiàn|NOUN|phía sau
中国|Zhōngguó|PROPN|Trung Quốc
越南|Yuènán|PROPN|Việt Nam
北京|Běijīng|PROPN|Bắc Kinh
汉语|Hànyǔ|NOUN|tiếng Hán
中文|Zhōngwén|NOUN|tiếng Trung
人|rén|NOUN|người
好|hǎo|ADJ|tốt, khỏe
大|dà|ADJ|to
小|xiǎo|ADJ|nhỏ
高兴|gāoxìng|ADJ|vui
认识|rènshi|VERB|quen biết
谢谢|xièxie|VERB|cảm ơn
不客气|bú kèqi|INTJ|đừng khách sáo
没关系|méi guānxi|INTJ|không sao
对不起|duìbuqǐ|INTJ|xin lỗi
再见|zàijiàn|INTJ|tạm biệt
请|qǐng|VERB|mời, xin
喂|wèi|INTJ|alô
嘿|hēi|INTJ|này, ê
李|Lǐ|PROPN|(họ) Lý
王|Wáng|PROPN|(họ) Vương
张|Zhāng|PROPN|(họ) Trương
陈明日|Chén Míngrì|PROPN|Trần Minh Nhật
明日|Míngrì|PROPN|Minh Nhật
胡志明市|Húzhìmíng Shì|PROPN|TP. Hồ Chí Minh
姐姐|jiějie|NOUN|chị gái
姐妹|jiěmèi|NOUN|chị em
黑板|hēibǎn|NOUN|bảng đen
图书馆|túshūguǎn|NOUN|thư viện
大学生|dàxuéshēng|NOUN|sinh viên
软件|ruǎnjiàn|NOUN|phần mềm
工程师|gōngchéngshī|NOUN|kỹ sư
爱好|àihào|NOUN|sở thích
技术|jìshù|NOUN|kỹ thuật
研究|yánjiū|VERB|nghiên cứu
军人|jūnrén|NOUN|quân nhân
小偷|xiǎotōu|NOUN|kẻ trộm
春天|chūntiān|TIME|mùa xuân
真相|zhēnxiàng|NOUN|sự thật
答案|dá'àn|NOUN|đáp án
信心|xìnxīn|NOUN|niềm tin
现实|xiànshí|NOUN|hiện thực
历史|lìshǐ|NOUN|lịch sử
旁边|pángbiān|NOUN|bên cạnh
梦|mèng|NOUN|giấc mơ
门|mén|NOUN|cửa
课|kè|NOUN|bài học, tiết học
班|bān|NOUN|lớp
案|àn|NOUN|vụ án
大声|dàshēng|ADV|to tiếng
先|xiān|ADV|trước
该|gāi|AUX|nên
新|xīn|ADJ|mới
早|zǎo|ADJ|sớm
快|kuài|ADJ|nhanh
慢|màn|ADJ|chậm
行|xíng|ADJ|được
正确|zhèngquè|ADJ|đúng
难忘|nánwàng|ADJ|khó quên
共同|gòngtóng|ADJ|chung
好玩|hǎowán|ADJ|vui, hay
见面|jiànmiàn|VERB|gặp mặt
前进|qiánjìn|VERB|tiến lên
开会|kāihuì|VERB|họp
出发|chūfā|VERB|xuất phát
答应|dāying|VERB|đồng ý, hứa
懂|dǒng|VERB|hiểu
带|dài|VERB|mang
偷|tōu|VERB|trộm
玩|wán|VERB|chơi
办|bàn|VERB|làm, xử lý
帮帮|bāngbang|VERB|giúp một chút
谢|xiè|VERB|cảm ơn
遍|biàn|CLF|lượt, lần
条|tiáo|CLF|(lượng từ) cái, con, tin
名|míng|CLF|(lượng từ) người, hạng
刻|kè|CLF|khắc (15 phút)
半|bàn|NUM|rưỡi, nửa
超出|chāochū|VERB|vượt quá
想像|xiǎngxiàng|VERB|tưởng tượng
十二|shí'èr|NUM|mười hai
二十|èrshí|NUM|hai mươi
三十|sānshí|NUM|ba mươi
一百|yībǎi|NUM|một trăm
们|men|PART|(hậu tố số nhiều)
孩子们|háizimen|NOUN|bọn trẻ, các con
先生们|xiānshengmen|NOUN|các quý ông
事|shì|NOUN|việc, chuyện
话|huà|NOUN|lời nói
意见|yìjiàn|NOUN|ý kiến
心|xīn|NOUN|trái tim, lòng
晚饭|wǎnfàn|NOUN|bữa tối
饭|fàn|NOUN|cơm, bữa ăn
病|bìng|NOUN|bệnh
城市|chéngshì|NOUN|thành phố
会议|huìyì|NOUN|cuộc họp
风景|fēngjǐng|NOUN|phong cảnh
句子|jùzi|NOUN|câu
梦想|mèngxiǎng|NOUN|ước mơ
打|dǎ|VERB|đánh; gọi (điện thoại)
到|dào|VERB|đến
等|děng|VERB|đợi
见|jiàn|VERB|gặp, thấy
要走|yào zǒu|VERB|phải đi, sắp đi
保密|bǎomì|VERB|giữ bí mật
后悔|hòuhuǐ|VERB|hối hận
做饭|zuò fàn|VERB|nấu cơm
长大|zhǎngdà|VERB|lớn lên
变|biàn|VERB|thay đổi
在乎|zàihu|VERB|để tâm, quan tâm
碰|pèng|VERB|chạm, đụng
管|guǎn|VERB|quản, để ý tới
像|xiàng|VERB|giống, như
忘|wàng|VERB|quên
赢|yíng|VERB|thắng
睡|shuì|VERB|ngủ
迟到|chídào|VERB|đến muộn
活|huó|VERB|sống
失败|shībài|VERB|thất bại
值得|zhídé|VERB|đáng
帮|bāng|VERB|giúp
为|wèi|ADP|vì, cho
美|měi|ADJ|đẹp
黑|hēi|ADJ|tối, đen
失望|shīwàng|ADJ|thất vọng
高|gāo|ADJ|cao
疼|téng|ADJ|đau
复杂|fùzá|ADJ|phức tạp
难|nán|ADJ|khó
善良|shànliáng|ADJ|lương thiện
宝贵|bǎoguì|ADJ|quý giá
棒|bàng|ADJ|giỏi, tuyệt
精彩|jīngcǎi|ADJ|đặc sắc, hay
错|cuò|ADJ|sai
晚|wǎn|ADJ|muộn
好久|hǎojiǔ|ADJ|lâu lắm
久|jiǔ|ADJ|lâu
着急|zháojí|ADJ|sốt ruột, vội
幸福|xìngfú|ADJ|hạnh phúc
穷|qióng|ADJ|nghèo
长|cháng|ADJ|dài
多大|duōdà|PRON|bao nhiêu tuổi, lớn cỡ nào
岁数|suìshu|NOUN|số tuổi
年纪|niánjì|NOUN|tuổi tác`;
    LEX = {};
    for(const line of raw.trim().split("\n")){
      const [w, py, pos, vi] = line.split("|");
      LEX[w] = [py, pos, vi];
    }
    return LEX;
  }

  // ---------------------------------------------------------------- nạp

  /** Tải mọi file nguồn về một bảng {đường dẫn: nội dung | null}. */
  async function readAll(read){
    const paths = HY_NOTES.map(n => HY_DATA + n + ".md").concat(HY_PLUS_FILES.map(f => HY_PLUS + f));
    const texts = await Promise.all(paths.map(p => read(p)));
    const files = {};
    paths.forEach((p, i) => { files[p] = texts[i]; });
    return files;
  }

  /** Dựng dữ liệu; read(đường dẫn tương đối) trả về Promise nội dung, hay null nếu thiếu file. */
  async function build(read){
    return hy_build(await readAll(read));
  }

  const cache = new Map();
  /** Tải data.json (dựng sẵn bằng tools/dung-du-lieu.js) từ thư mục base; gọi nhiều lần chỉ tải một lần. */
  function load(base = "../hanyu/"){
    if(!cache.has(base)){
      cache.set(base, fetch(base + "data.json").then(r => {
        if(!r.ok) throw new Error("Không tải được " + base + "data.json (" + r.status + ")");
        return r.json();
      }));
    }
    return cache.get(base);
  }

  const Hanyu = {load, build, hy_syllables, hy_is_han};
  root.Hanyu = Hanyu;
  if(typeof module === "object" && module.exports) module.exports = Hanyu;
})(typeof globalThis !== "undefined" ? globalThis : this);
