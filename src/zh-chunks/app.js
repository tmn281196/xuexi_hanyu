/* Học tiếng Trung theo từ.
   Dữ liệu: window.ZH_DATA, index.html dựng qua ../hanyu/hanyu.js:
     groups  [{id, kind:'lesson'|'practice', no, title, sub, level, words:[…]}]
     sents   [{id, g, spk, vi, t:[[chữ, pinyin từng âm tiết, đậm, loại 'h'|'x'|'p']]}]
     dict    {từ: [pinyin từng âm tiết, nghĩa, STT trong 500 từ]}
     charPy  {chữ: âm tiết}
   Thẻ là một từ. Câu ví dụ là câu của chính nhóm đó có chứa từ, ưu tiên câu
   đánh dấu từ ấy là từ vựng. */
(function () {
  "use strict";
  const D = window.ZH_DATA;
  if (!D) return;

  const h = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const COLORS = 8;
  const tokText = s => s.t.map(t => t[0]).join("");

  // ------------------------------------------------------------------ thẻ
  const SENTS = D.sents;
  const byWord = new Map();                 // từ -> {bold:[id câu], any:[id câu]}
  SENTS.forEach(s => s.t.forEach(t => {
    if (t[3] !== "h") return;
    let e = byWord.get(t[0]);
    if (!e) byWord.set(t[0], e = { bold: [], any: [] });
    (t[2] ? e.bold : e.any).push(s.id);
  }));

  // Vị trí các token là "từ của thẻ" trong câu. Mẫu có chỗ trống như 太…了
  // khớp từng phần theo đúng thứ tự.
  function targetIdx(toks, w) {
    const idx = new Set();
    if (!w) return idx;
    if (w.includes("…")) {
      const parts = w.split("…").filter(Boolean);
      let p = 0;
      toks.forEach((t, i) => { if (p < parts.length && t[0] === parts[p]) { idx.add(i); p++; } });
      return p === parts.length ? idx : new Set();
    }
    toks.forEach((t, i) => { if (t[3] === "h" && t[0] === w) idx.add(i); });
    return idx;
  }

  function pickExample(w, g) {
    if (w.includes("…")) {
      const hit = s => targetIdx(s.t, w).size > 0;
      return SENTS.find(s => s.g === g.id && hit(s)) || SENTS.find(hit) || null;
    }
    const e = byWord.get(w);
    if (!e) return null;
    const inGroup = id => SENTS[id].g === g.id;
    const id = e.bold.find(inGroup) ?? e.any.find(inGroup) ?? e.bold[0] ?? e.any[0];
    return id == null ? null : SENTS[id];
  }

  const CARDS = [], firstCard = new Map();
  D.groups.forEach((g, gi) => {
    g.idx = gi;
    g.cards = g.words.map(w => {
      const c = { id: CARDS.length, w, g, ex: pickExample(w, g), d: D.dict[w] || null };
      CARDS.push(c);
      if (!firstCard.has(w)) firstCard.set(w, c.id);
      return c;
    });
  });

  // ------------------------------------------------------------------ vẽ câu
  // Một từ là một ô; trong ô, mỗi chữ mang âm tiết của nó, nên chế độ Chữ chỉ
  // cần tách ô ra chứ không phải dựng lại.
  function wordTile(t, cls) {
    const chars = [...t[0]], syl = t[1].split(" "), d = D.dict[t[0]];
    const title = t[1].replace(/ /g, "") + (d && d[1] ? " — " + d[1] : "");
    return '<span class="wd' + cls + '" data-w="' + h(t[0]) + '" title="' + h(title) + '">' +
      chars.map((c, i) => '<span class="z"><ruby>' + h(c) + "<rt>" + h(syl[i] || "") + "</rt></ruby></span>").join("") + "</span>";
  }

  // Câu → ô từ + dãy ô cho thước: mỗi từ một ô, từ nhiều chữ tô màu, từ của thẻ tô đặc.
  function sentence(toks, target) {
    let html = "", chars = 0;
    const slots = [], T = targetIdx(toks, target);
    for (const [i, t] of toks.entries()) {
      if (t[3] === "p") { html += '<span class="p">' + h(t[0]) + "</span>"; continue; }
      if (t[3] === "x") {
        html += '<span class="wd x"><span class="z"><ruby>' + h(t[0]) + "<rt>" + h(t[1].replace(/ /g, "")) + "</rt></ruby></span></span>";
        chars++;
        slots.push({ n: 1 });
        continue;
      }
      const n = [...t[0]].length, isT = T.has(i);
      html += wordTile(t, (n > 1 ? " m" : "") + (isT ? " t" : ""));
      chars += n;
      slots.push({ n, m: n > 1, t: isT });
    }
    return { html, chars, words: slots.length, slots };
  }

  // Thước trí nhớ làm việc: một ô cho mỗi chữ (chế độ Chữ) hoặc mỗi từ (chế độ
  // Từ), trên nền dải 7±2.
  function meter(s, big) {
    const cc = [], wc = [];
    s.slots.forEach(sl => {
      const cell = sl.t ? '<i class="k t"></i>' : sl.m ? '<i class="k"></i>' : "<i></i>";
      for (let i = 0; i < sl.n; i++) cc.push(cell);
      wc.push(cell);
    });
    const row = (cells, n, label, cls) =>
      '<div class="slots ' + cls + (n > 9 ? " over" : "") + '"><span class="band" aria-hidden="true"></span>' + cells.join("") +
      '<span class="lbl"><b>' + n + "</b> " + label + "</span></div>";
    return '<div class="meter' + (big ? " big" : "") + '">' +
      row(cc, s.chars, "chữ", "as-chars") + row(wc, s.words, "từ", "as-words") + "</div>";
  }

  function card(c) {
    // Từ in đậm mà danh sách từ vựng không có: pinyin lấy từ chính câu ví dụ.
    let d = c.d;
    if (!d && c.ex) {
      const t = c.ex.t.find(x => x[0] === c.w);
      if (t) d = [t[1], "", 0];
    }
    let body;
    if (c.ex) {
      const s = sentence(c.ex.t, c.w);
      body = '<p class="sent" lang="zh">' + (c.ex.spk ? '<span class="spk">' + h(c.ex.spk) + "</span>" : "") + s.html + "</p>" +
             '<p class="tr">' + h(c.ex.vi) + "</p>" + meter(s, false);
    }
    else body = '<p class="noex">Chưa có câu ví dụ.</p>';
    return '<article class="card c' + (c.g.idx % COLORS) + '" id="k' + c.id + '">' +
      '<div class="head"><h3 lang="zh">' + h(c.w) + '</h3><span class="py">' + h(d ? d[0].replace(/ /g, "") : "") + "</span>" +
      (d && d[2] ? '<span class="lv" title="Số thứ tự trong 500 từ thông dụng">#' + d[2] + "</span>" : "") + "</div>" +
      '<p class="vi">' + h(d ? d[1] : "") + "</p>" + body + "</article>";
  }

  // ------------------------------------------------------------------ trạng thái
  const fold = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
  // Như en-chunks: không còn mục "Tất cả", mỗi lần một nhóm, chia trang PER
  // thẻ một; tìm kiếm quét mọi nhóm nhưng kết quả cũng chia trang. Địa chỉ
  // #nhóm/trang để quay lại đúng chỗ.
  const PER = 40;
  const state = { group: D.groups[0].id, level: "all", q: "", mode: "words", page: 0 };
  const fromHash = () => {
    const [id, pg] = decodeURIComponent(location.hash.slice(1)).split("/");
    if (D.groups.some(g => g.id === id)) state.group = id;
    state.page = Math.max(0, (parseInt(pg, 10) || 1) - 1);
  };
  const toHash = () => history.replaceState(null, "", "#" + state.group + (state.page ? "/" + (state.page + 1) : ""));
  fromHash();
  try { if (localStorage.getItem("zh-chunks.mode") === "chars") state.mode = "chars"; } catch (e) { /* không có storage */ }

  const $ = s => document.querySelector(s);
  const hub = $("#hub"), list = $("#list"), q = $("#q"), stat = $("#stat");
  const label = g => ({ lesson: "Bài ", practice: "Mục ", verbs: "Nhóm " }[g.kind] || "") + String(g.no).padStart(2, "0");

  // ------------------------------------------------------------------ mục lục
  function renderHub() {
    const btn = g => '<button type="button" class="c' + (g.idx % COLORS) + '" data-g="' + h(g.id) + '"><span class="n">' +
      label(g) + (g.level !== "HSK1" ? " · " + h(g.level) : "") + '</span><h2 lang="zh">' + h(g.title) + "</h2><p>" + h(g.sub) +
      '</p><span class="cnt">' + g.cards.length + " từ</span></button>";
    const block = (title, gs) => '<div class="hubrow"><h3>' + title + '</h3><div class="hubgrid">' + gs.map(btn).join("") + "</div></div>";
    const of = k => D.groups.filter(g => g.kind === k);
    const lessons = of("lesson"), practice = of("practice"), verbs = of("verbs");
    hub.innerHTML =
      block("Giáo trình HSK1 · " + lessons.length + " bài", lessons) +
      block("500 từ thông dụng + HSK2–6 · " + practice.length + " mục ngữ pháp", practice) +
      block("Động từ HSK1–4 · " + verbs.length + " nhóm", verbs);
    hub.addEventListener("click", e => {
      const b = e.target.closest("button[data-g]");
      if (!b) return;
      state.group = b.dataset.g;
      state.q = ""; q.value = ""; state.page = 0; state.level = "all";
      toHash();
      render();
      $("#controls").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Nhóm ghi một khoảng ("HSK2–4", mục 15–18) thì hiện ở mọi cấp trong khoảng đó.
  function inLevel(lv, want) {
    const m = /HSK(\d)(?:–(\d))?/.exec(lv || ""), n = +want.slice(3);
    return !!m && n >= +m[1] && n <= +(m[2] || m[1]);
  }

  function visible(c) {
    if (state.level !== "all" && !inLevel(c.g.level, state.level)) return false;
    if (!state.q) return true;
    const d = c.d || ["", ""];
    return fold([c.w, d[0], d[0].replace(/ /g, ""), d[1], c.ex ? tokText(c.ex) + " " + c.ex.vi : ""].join(" ")).includes(fold(state.q));
  }

  function render() {
    document.body.classList.toggle("mode-chars", state.mode === "chars");
    document.querySelectorAll("#mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));
    document.querySelectorAll("#levels button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.level === state.level)));
    const searching = state.q !== "", byLevel = state.level !== "all";
    // Chọn một trình độ thì gom mọi nhóm thuộc trình độ đó, không chỉ nhóm đang mở.
    hub.querySelectorAll("button").forEach(b => b.classList.toggle("on", !searching && !byLevel && b.dataset.g === state.group));

    const groups = searching || byLevel ? D.groups : D.groups.filter(g => g.id === state.group);
    const items = [];
    for (const g of groups) for (const c of g.cards) if (visible(c)) items.push(c);
    const pages = Math.max(1, Math.ceil(items.length / PER));
    state.page = Math.min(state.page, pages - 1);
    const part = items.slice(state.page * PER, (state.page + 1) * PER);

    // Dựng lại khung nhóm chỉ quanh các thẻ của trang này.
    let html = "", i = 0;
    while (i < part.length) {
      const g = part[i].g, cs = [];
      while (i < part.length && part[i].g === g) cs.push(part[i++]);
      html += '<div class="note c' + (g.idx % COLORS) + '"><h2 class="noteh"><span class="dot"></span>' + label(g) +
        ' <span lang="zh">' + h(g.title) + "</span>" + (g.level !== "HSK1" ? ' <span class="lv">' + h(g.level) + "</span>" : "") + "</h2>" +
        (g.sub && !searching && !state.page ? '<p class="notei">' + h(g.sub) + "</p>" : "") +
        '<div class="cards">' + cs.map(card).join("") + "</div></div>";
    }
    list.innerHTML = html ? pager(pages) + html + pager(pages) : '<p class="empty">Không có từ nào khớp.</p>';
    stat.textContent = items.length + " từ" + (searching ? " khớp “" + state.q + "”" : "") + (byLevel ? " · " + state.level : "") +
      (pages > 1 ? " · trang " + (state.page + 1) + "/" + pages : "");
  }

  // Thanh trang: đầu, cuối, hai trang quanh trang đang xem; chỗ hở là "…".
  function pager(pages) {
    if (pages < 2) return "";
    const cur = state.page, btn = (p, txt, cls) =>
      '<button type="button" data-page="' + p + '"' + (cls ? ' class="' + cls + '"' : "") +
      (p === cur && !cls ? ' aria-current="page"' : "") + ">" + txt + "</button>";
    let out = cur > 0 ? btn(cur - 1, "‹", "step") : '<button type="button" class="step" disabled>‹</button>';
    let last = -1;
    for (let p = 0; p < pages; p++) {
      if (p !== 0 && p !== pages - 1 && Math.abs(p - cur) > 1) continue;
      if (p - last > 1) out += '<span class="gap">…</span>';
      out += btn(p, p + 1);
      last = p;
    }
    out += cur < pages - 1 ? btn(cur + 1, "›", "step") : '<button type="button" class="step" disabled>›</button>';
    return '<nav class="pages" aria-label="Trang">' + out + "</nav>";
  }
  list.addEventListener("click", e => {
    const b = e.target.closest(".pages button[data-page]");
    if (!b) return;
    state.page = +b.dataset.page;
    if (!state.q) toHash();
    render();
    $("#controls").scrollIntoView({ block: "start" });
  });

  let timer = 0;

  // Bấm một từ (ngoài thẻ của chính nó) hoặc một chip: tới thẻ của từ đó.
  function jump(id) {
    const c = CARDS[id];
    if (!c) return;
    state.group = c.g.id; state.q = ""; state.level = "all"; q.value = "";
    state.page = Math.floor(c.g.cards.indexOf(c) / PER);
    toHash();
    render();
    const el = document.getElementById("k" + id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }
  document.addEventListener("click", e => {
    const chip = e.target.closest(".chip[data-card]");
    if (chip) { jump(+chip.dataset.card); return; }
    const wd = e.target.closest(".wd[data-w]");
    if (!wd || !firstCard.has(wd.dataset.w)) return;
    const own = wd.closest(".card");
    if (own && CARDS[+own.id.slice(1)].w === wd.dataset.w) return;
    jump(firstCard.get(wd.dataset.w));
  });

  // ------------------------------------------------------------------ điều khiển
  $("#mode").addEventListener("click", e => {
    const b = e.target.closest("button[data-mode]");
    if (!b) return;
    state.mode = b.dataset.mode;
    try { localStorage.setItem("zh-chunks.mode", state.mode); } catch (err) { /* không có storage */ }
    render();
  });
  $("#levels").addEventListener("click", e => {
    const b = e.target.closest("button[data-level]");
    if (!b) return;
    state.level = b.dataset.level;
    state.page = 0;
    render();
  });
  q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { state.q = q.value.trim(); state.page = 0; render(); }, 120); });
  document.addEventListener("keydown", e => {
    if (e.key === "/" && document.activeElement !== q) { e.preventDefault(); q.focus(); }
  });
  window.addEventListener("hashchange", () => { fromHash(); render(); });

  renderHub();
  render();

  window.ZH_DEBUG = { CARDS, SENTS, sentence };
})();
