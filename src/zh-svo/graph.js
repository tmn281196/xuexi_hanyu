/* Đồ thị cây cho câu tiếng Trung — dùng chung cho ba trang đồ thị của zh-svo.

   Tách từ engine của en-svo, đổi sang bộ nhãn ngữ pháp tiếng Trung
   (主语 谓语 宾语 补语 定语 状语), thêm pinyin trên từng nút và nghĩa trong
   bảng chi tiết. Script không mang dữ liệu; trang nhúng sẵn:
     window.SVO_VERBS  {GROUPS, DATA}  động từ + câu, cho thanh bên dạng chip
     window.TOPICS     [{g, n, b, v:[{v, ex}]}]  mục → nhóm câu → câu
   Mỗi câu: {zh, py, vi, spk, p, note?, tokens:[{w, py, pos, func, head, vi}]}.

   window.SVO_PAGE khai báo trang cần gì:
     start   chỉ số DATA vẽ sẵn khi mở trang
*/
(function(){
  "use strict";

  const PAGE   = window.SVO_PAGE  || {};
  const VERBS  = window.SVO_VERBS || {};
  const DATA   = VERBS.DATA || [];
  const GROUPS = PAGE.groups || VERBS.GROUPS || [];

  // k: màu · req: core (nòng cốt) | req (bắt buộc) | opt (tùy ý) | fn (từ chức năng)
  const FUNC_INFO = {
    subj: {ab:"subj",  zh:"主语",     vi:"chủ ngữ",                 k:"s", req:"core"},
    pred: {ab:"pred",  zh:"谓语",     vi:"vị ngữ",                  k:"v", req:"core"},
    obj:  {ab:"obj",   zh:"宾语",     vi:"tân ngữ",                 k:"o", req:"req"},
    iobj: {ab:"iobj",  zh:"间接宾语", vi:"tân ngữ gián tiếp",       k:"o", req:"req"},
    comp: {ab:"comp",  zh:"补语",     vi:"bổ ngữ",                  k:"c", req:"req"},
    vcomp:{ab:"vcomp", zh:"连动",     vi:"động từ nối tiếp",        k:"c", req:"req"},
    pobj: {ab:"pobj",  zh:"介词宾语", vi:"tân ngữ của giới từ",     k:"c", req:"req"},
    conj: {ab:"conj",  zh:"分句",     vi:"vế câu nối tiếp",         k:"v", req:"opt"},
    attr: {ab:"attr",  zh:"定语",     vi:"định ngữ",                k:"m", req:"opt"},
    adv:  {ab:"adv",   zh:"状语",     vi:"trạng ngữ",               k:"m", req:"opt"},
    det:  {ab:"det",   zh:"数量/指示", vi:"số, lượng từ, chỉ thị",  k:"m", req:"fn"},
    aux:  {ab:"aux",   zh:"能愿动词", vi:"động từ năng nguyện",     k:"v", req:"fn"},
    asp:  {ab:"asp",   zh:"动态助词", vi:"trợ từ động thái",        k:"v", req:"fn"},
    de:   {ab:"de",    zh:"结构助词", vi:"trợ từ kết cấu",          k:"m", req:"fn"},
    sfp:  {ab:"sfp",   zh:"语气助词", vi:"trợ từ ngữ khí",          k:"m", req:"fn"},
    mark: {ab:"mark",  zh:"关联词",   vi:"từ nối",                  k:"m", req:"fn"},
    topic:{ab:"topic", zh:"主题",     vi:"chủ đề (đưa lên đầu câu)", k:"o", req:"req"},
    voc:  {ab:"voc",   zh:"独立语",   vi:"lời gọi, thán từ",        k:"m", req:"opt"}
  };
  const REQ_VI = {
    core:{t:"nòng cốt", cls:"req"},
    req:{t:"bắt buộc — bỏ đi câu sai", cls:"req"},
    opt:{t:"tùy ý — bỏ đi câu vẫn đúng", cls:"opt"},
    fn:{t:"từ chức năng", cls:""}
  };
  const POS_VI = {PRON:"đại từ 代词", NOUN:"danh từ 名词", PROPN:"danh từ riêng 专有名词",
    VERB:"động từ 动词", AUX:"động từ năng nguyện 能愿动词", ADP:"giới từ 介词", NUM:"số từ 数词",
    CLF:"lượng từ 量词", TIME:"từ chỉ thời gian 时间词", PART:"trợ từ 助词", ADJ:"tính từ 形容词",
    ADV:"phó từ 副词", CCONJ:"liên từ 连词", SCONJ:"liên từ 连词", INTJ:"thán từ 叹词"};
  const CHUNK_LAB = {topic:"T · chủ đề", voc:"lời gọi", subj:"S · chủ ngữ", pred:"V · vị ngữ", obj:"O · tân ngữ", iobj:"O₁ · tân ngữ gián tiếp",
    comp:"C · bổ ngữ", vcomp:"V₂ · động từ nối tiếp", adv:"A · trạng ngữ", conj:"vế sau",
    sfp:"ngữ khí", mark:"từ nối"};
  const MAJOR = new Set(["topic","voc","subj","pred","obj","iobj","comp","vcomp","adv","conj","sfp","mark"]);
  const DROPPABLE = new Set(["attr","adv","det"]);   // ẩn khi xem khung câu

  // Nhãn lạ không làm vỡ đồ thị: rơi về nhóm "từ phụ" và hiện nguyên tên.
  function funcInfo(f){
    return FUNC_INFO[f] || {ab:f, zh:"", vi:f, k:"m", req:"fn"};
  }

  // ---------- trạng thái ----------
  const stage = document.getElementById("stage");
  const wires = document.getElementById("wires");

  let cur = PAGE.start || 0, zoom = 1;
  const pan = {x:0, y:0};
  let sel = null;
  let nodes = [], edges = [], els = [], lines = [], rails = [], spineLn = null;
  const show = {core:false, free:false};
  const view = {cx:0, cy:0, ax:3, ay:2.4};

  // Sơ đồ cố định, không mô phỏng lực và không kéo được từng node: cùng một câu
  // thì luôn ra cùng một hình. Mọi xương xiên cùng một góc 60°:
  //   row  khoảng cách giữa hai tầng      run  độ lệch ngang của một xương
  //   gap0 chân xương đầu tiên cách từ (0: mọc ngay từ node)
  //   step khoảng cách giữa hai chân xương
  //   gap  khe giữa hai cụm xương kề nhau main khoảng cách tối thiểu trên sống
  const FISH = {row:1.9, run:1.9 / Math.tan(Math.PI / 3), gap0:0, step:1.9, gap:1.7, main:2.2};
  // Mạch chính: vị ngữ gốc cùng chủ ngữ, tân ngữ, bổ ngữ treo thẳng vào nó —
  // nằm trên một đường ngang theo thứ tự trong câu. Động từ nối tiếp (连动) cũng
  // lên mạch và kéo theo tân ngữ của nó: 我 去 商店 买 东西 là một mạch liền.
  // Định ngữ, trạng ngữ, trợ từ... là nhánh phụ, treo xuống dưới từ nó bổ sung.
  const SPINE = new Set(["topic","subj","obj","iobj","comp","vcomp"]);
  const CHAIN = new Set(["vcomp"]);

  // Trạng ngữ, trợ từ ngữ khí, từ nối chỉ thành khối riêng khi treo vào động
  // từ; 最 trong 我最好的朋友 treo vào tính từ làm định ngữ, nên thuộc khối tân ngữ.
  const CLAUSE_ONLY = new Set(["adv","sfp","mark"]);
  function isChunk(toks, c){
    const f = toks[c].func;
    if(!MAJOR.has(f)) return false;
    if(!CLAUSE_ONLY.has(f) || toks[c].head < 0) return true;
    const h = toks[toks[c].head];
    return h.head < 0 || ["pred","conj","vcomp"].includes(h.func) || ["VERB","AUX"].includes(h.pos);
  }
  function chunkOf(toks, i){
    let c = i, guard = 0;
    while(!isChunk(toks, c) && toks[c].head >= 0 && guard++ < 20) c = toks[c].head;
    return toks[c].func;
  }
  function inFrame(toks, i){
    let c = i, guard = 0;
    while(guard++ < 20){
      if(DROPPABLE.has(toks[c].func)) return false;
      if(toks[c].head < 0) return true;
      c = toks[c].head;
    }
    return true;
  }

  let curSent = null;

  function build(idx){
    if(!DATA[idx]) return;
    cur = idx;
    buildSentence(DATA[idx]);
  }

  // Một động từ có thể có nhiều câu: câu chính nằm ngay trong DATA[idx], các
  // câu thêm nằm trong DATA[idx].ex — cùng hình dạng. Gộp lại thành một danh
  // sách để thanh chấm đi qua; setPager() tự ẩn khi chỉ có một câu.
  function variantsOf(idx){
    const d = DATA[idx];
    if(!d) return [];
    return [d].concat(Array.isArray(d.ex) ? d.ex : []);
  }

  function showVariant(idx, k){
    const list = variantsOf(idx);
    if(!list[k]) return;
    cur = idx; sel = null;
    buildSentence(list[k]);
    // Nhãn thanh chấm là KHUNG của câu đang vẽ, không phải tên động từ: tên động
    // từ đã nằm ở chip đang sáng bên cạnh, còn khung thì đổi theo từng câu.
    setPager(list.length, k, list[k].p || DATA[idx].verb, kk=>showVariant(idx, kk), list.map(s=>s.zh));
  }

  function buildSentence(sent){
    const s = sent; curSent = s;
    const toks = s.tokens, n = toks.length;
    nodes = []; edges = [];
    stage.classList.toggle("tight", n > 6);

    toks.forEach((t,i)=>{
      const info = funcInfo(t.func);
      nodes.push({
        i, head:t.head, func:t.func, main:false, up:false, x:0, y:0, depth:0, fx:0, fy:0, rail:0,
        label:t.w, tag:info.ab, k:info.k, req:info.req, chunk:chunkOf(toks,i),
        frame:inFrame(toks,i), root:t.head < 0
      });
    });
    toks.forEach((t,i)=>{
      if(t.head >= 0) edges.push({a:i, b:t.head, k:nodes[i].k, opt:nodes[i].req === "opt"});
    });

    pan.x = 0; pan.y = 0;
    layout();
    renderDom(s);
  }

  function renderDom(s){
    stage.querySelectorAll(".node").forEach(el=>el.remove());
    els = nodes.map(nd=>{
      const el = document.createElement("div");
      el.className = "node k-" + nd.k + (nd.root ? " root" : "") + (nd.req === "opt" ? " opt" : "");
      el.innerHTML = '<span class="node-in"><i class="dot"></i>' +
                     '<span class="lbl"><span class="w" lang="zh"></span><span class="p"></span>' +
                     '<span class="t"></span></span></span>';
      el.querySelector(".w").textContent = nd.label;
      el.querySelector(".p").textContent = s.tokens[nd.i].py || "";
      el.querySelector(".t").textContent = nd.tag;
      stage.appendChild(el);
      return el;
    });

    while(wires.firstChild) wires.removeChild(wires.firstChild);
    spineLn = document.createElementNS("http://www.w3.org/2000/svg","path");
    spineLn.setAttribute("class", "spine");
    wires.appendChild(spineLn);
    // "Thanh" của một xương: đoạn ngang nối từ đó với chân các xương con.
    rails = nodes.map(nd=>{
      const ln = document.createElementNS("http://www.w3.org/2000/svg","path");
      ln.setAttribute("stroke", "var(--" + (nd.k === "m" ? "mod" : nd.k) + ")");
      ln.setAttribute("stroke-width", "1.6");
      wires.appendChild(ln);
      return ln;
    });
    lines = edges.map(e=>{
      const ln = document.createElementNS("http://www.w3.org/2000/svg","path");
      ln.setAttribute("stroke", "var(--" + (e.k === "m" ? "mod" : e.k) + ")");
      ln.setAttribute("stroke-width", "1.6");
      if(e.opt) ln.setAttribute("stroke-dasharray","5 4");
      wires.appendChild(ln);
      return ln;
    });

    buildRibbon(s);
    showNote();
    draw();
  }

  // ---------- bố cục xương cá ----------
  // Sống cá là mạch chính, nằm ngang, đầu cá ở bên phải. Mỗi thành phần phụ là
  // một xương xiên 60°, mọc ngay từ node mà nó bổ sung, ngọn chĩa ra sau về
  // phía đuôi. Từ có nhiều xương cùng một phía thì các xương sau mọc lùi dần
  // về bên trái dọc sống (hoặc dọc thanh của từ đó). Xương của một từ luân phiên trên / dưới. Từ
  // phụ lại có xương con thì từ đó kéo một thanh ngang về phía đuôi, xương con
  // mọc từ thanh ấy với cùng góc và đi tiếp ra xa sống. Chân xương gần từ nhất
  // thuộc về từ đứng sau cùng trong câu. Khi "Chỉ khung câu" bật thì chỉ xếp
  // các node còn hiện, không chừa lỗ.
  function layout(){
    const vis = nodes.filter(nodeVisible);
    if(!vis.length) return;
    const on = new Set(vis.map(nd=>nd.i));
    nodes.forEach(nd=>{ nd.main = false; });
    vis.forEach(nd=>{ if(nd.head < 0 || !on.has(nd.head)) nd.main = true; });
    for(let grew = true, guard = 0; grew && guard++ < 30;){
      grew = false;
      vis.forEach(nd=>{
        if(nd.main) return;
        const h = nodes[nd.head];
        if(h.main && SPINE.has(nd.func) && (h.root || CHAIN.has(h.func))){ nd.main = true; grew = true; }
      });
    }

    const kids = new Map(vis.map(nd=>[nd.i, []]));
    vis.forEach(nd=>{ if(!nd.main) kids.get(nd.head).push(nd.i); });

    // Xếp các xương ks mọc ra từ nd về phía s (+1 trên, -1 dưới), từ phải sang
    // trái. Chân xương sau lùi đủ xa để cả cụm của nó nằm lọt bên trái cụm
    // trước, nên hai cụm cùng tầng không bao giờ chồng nhau. Trả về mép trái.
    function bones(nd, ks, s){
      let left = nd.x, foot = nd.x - FISH.gap0;
      ks.forEach((k, j)=>{
        const c = nodes[k];
        if(j) foot = Math.min(foot - FISH.step, left - FISH.gap + FISH.run);
        c.fx = foot; c.fy = nd.y;
        nd.rail = Math.min(nd.rail, foot);
        c.x = foot - FISH.run; c.y = nd.y + s * FISH.row;
        c.depth = nd.depth + 1; c.up = s > 0; c.rail = c.x;
        left = Math.min(left, c.depth < 30 ? bones(c, kids.get(c.i).slice().reverse(), s) : c.x);
      });
      return left;
    }

    // Các từ trên sống xếp từ phải sang trái; mỗi từ đứng bên trái cả cụm
    // xương của từ kế sau nó, để xương chạm sống giữa hai từ luôn thuộc về từ
    // bên phải.
    const spine = vis.filter(nd=>nd.main);
    let next = null;
    for(let m = spine.length - 1; m >= 0; m--){
      const nd = spine[m];
      nd.x = next ? Math.min(next.x - FISH.main, next.left - FISH.gap) : 0;
      nd.y = 0; nd.depth = 0; nd.up = false; nd.rail = nd.x;
      const ks = kids.get(nd.i).slice().reverse();
      const left = Math.min(nd.x,
        bones(nd, ks.filter((k,j)=>j % 2 === 0), 1),
        bones(nd, ks.filter((k,j)=>j % 2 === 1), -1));
      next = {x:nd.x, left};
    }
    view.spL = Math.min(...spine.map(nd=>nd.rail));
    view.spR = Math.max(...spine.map(nd=>nd.x));

    let x0 = view.spL, x1 = view.spR, y0 = 0, y1 = 0;
    vis.forEach(nd=>{
      x0 = Math.min(x0, nd.x); x1 = Math.max(x1, nd.x);
      y0 = Math.min(y0, nd.y); y1 = Math.max(y1, nd.y);
    });
    view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2;
    view.ax = Math.max(0.9, (x1 - x0) / 2); view.ay = Math.max(0.7, (y1 - y0) / 2);
  }

  function unitPx(){
    const w = stage.clientWidth, h = stage.clientHeight;
    return Math.min(w/(2*view.ax + 3.4), h/(2*view.ay + 3.8)) * zoom;
  }

  function project(p){
    const w = stage.clientWidth, h = stage.clientHeight, unit = unitPx();
    return {
      x: w/2 + (p.x - view.cx)*unit + pan.x,
      y: h/2 - (p.y - view.cy)*unit + pan.y,
      s: 1
    };
  }

  function nodeVisible(nd){ return show.core ? nd.frame : true; }

  function draw(){
    const pr = nodes.map(project);
    nodes.forEach((nd,i)=>{
      const el = els[i], p = pr[i];
      if(!nodeVisible(nd)){ el.hidden = true; return; }
      el.hidden = false;
      el.classList.toggle("main", nd.main);
      el.classList.toggle("up", !!nd.up);
      el.style.transform = "translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px)";
    });

    // Sống cá: từ chân xương xa nhất bên trái tới quá từ cuối một chút.
    if(spineLn){
      const a = project({x:view.spL - 0.4, y:0}), b = project({x:view.spR + 0.6, y:0});
      spineLn.setAttribute("d", "M" + a.x.toFixed(1) + " " + a.y.toFixed(1) + "H" + b.x.toFixed(1));
    }

    const near = i => sel === null || sel === i || nodes[sel].head === i;
    nodes.forEach((nd,i)=>{
      const rl = rails[i];
      if(!rl) return;
      if(nd.main || !nodeVisible(nd) || nd.rail > nd.x - 0.01 || !near(i)){ rl.setAttribute("visibility","hidden"); return; }
      const p = pr[i], r = project({x:nd.rail, y:nd.y});
      rl.setAttribute("visibility","visible");
      rl.setAttribute("d", "M" + (p.x - 6).toFixed(1) + " " + p.y.toFixed(1) + "H" + r.x.toFixed(1));
    });

    edges.forEach((e,i)=>{
      const ln = lines[i], c = nodes[e.a];
      // quan hệ giữa hai từ cùng trên sống đã nằm trong đường ngang
      let vis = nodeVisible(c) && nodeVisible(nodes[e.b]) && !c.main;
      if(vis && sel !== null) vis = (e.a === sel || e.b === sel);
      if(!vis){ ln.setAttribute("visibility","hidden"); return; }
      ln.setAttribute("visibility","visible");
      // Xương: từ chân trên sống / thanh của từ chi phối, xiên tới chấm của từ
      // phụ thuộc, dừng trước chấm một chút.
      const f = project({x:c.fx, y:c.fy}), q = pr[e.a], p = pr[e.b];
      const dx = q.x - f.x, dy = q.y - f.y, L = Math.sqrt(dx*dx + dy*dy) || 1, t = Math.max(0, 1 - 7 / L);
      const s0 = Math.abs(f.x - p.x) + Math.abs(f.y - p.y) < 1 ? Math.min(0.5, 7 / L) : 0;   // mọc từ chấm: chừa chấm ra
      ln.setAttribute("d", "M" + (f.x + dx*s0).toFixed(1) + " " + (f.y + dy*s0).toFixed(1) +
                           "L" + (f.x + dx*t).toFixed(1) + " " + (f.y + dy*t).toFixed(1));
    });
  }

  // ---------- phân trang câu ----------
  const pagerEl = document.getElementById("pager");

  function mkPg(txt, cls, on, title){
    const b = document.createElement("button");
    b.type = "button"; b.className = "pg" + (cls ? " " + cls : ""); b.textContent = txt;
    if(title) b.title = title;
    if(on) b.addEventListener("click", on); else b.disabled = true;
    return b;
  }

  function sentenceOf(btn){
    const el = btn.querySelector(".s");
    return el ? el.textContent : (btn.title || "");
  }

  function setPager(n, idx, label, onPick, titles){
    pagerEl.innerHTML = "";
    if(!n || n < 2){ pagerEl.hidden = true; return; }
    pagerEl.hidden = false;
    pagerEl.appendChild(mkPg("‹", "", idx > 0 ? ()=>onPick(idx - 1) : null));
    // Một mục ngữ pháp có tới vài chục câu: quá 12 chấm thì hàng chấm dài hơn
    // cả sân, nên thay bằng bộ đếm "k / n"; danh sách câu đầy đủ nằm bên dưới.
    if(n > 12){
      const c = mkPg((idx + 1) + " / " + n, "cnt", null);
      c.disabled = false;
      pagerEl.appendChild(c);
    }else for(let k = 0; k < n; k++){
      const d = mkPg("", "pgdot", ()=>onPick(k), (k + 1) + ". " + (titles && titles[k] ? titles[k] : ""));
      if(k === idx) d.setAttribute("aria-current", "true");
      pagerEl.appendChild(d);
    }
    pagerEl.appendChild(mkPg("›", "", idx < n - 1 ? ()=>onPick(idx + 1) : null));
    // Nhãn đứng SAU cụm nút, không phải trước. Nó là thứ mô tả câu đang xem chứ
    // không phải nút bấm, nên để lẫn vào đầu hàng thì dễ tưởng là bấm được --
    // nhất là khi nó cũng là một thẻ .pg như mấy nút kia.
    if(label){ const l = mkPg(label, "lab", null); l.disabled = false; pagerEl.appendChild(l); }
  }

  function select(nd){ sel = (sel === nd.i) ? null : nd.i; applySel(); }

  function applySel(){
    const s = curSent;
    if(sel === null){
      els.forEach(el=>el.classList.remove("sel","dim"));
      showNote(); draw(); return;
    }
    const near = new Set([sel]);
    edges.forEach(e=>{ if(e.a === sel) near.add(e.b); if(e.b === sel) near.add(e.a); });
    els.forEach((el,i)=>{
      el.classList.toggle("sel", i === sel);
      el.classList.toggle("dim", !near.has(i));
    });
    showDetail(s); draw();
  }

  const panelEl = document.getElementById("panel");

  function showNote(){
    panelEl.hidden = true;
    document.getElementById("panel-body").innerHTML = "";
  }

  function showDetail(s){
    panelEl.hidden = false;
    const body = document.getElementById("panel-body");
    const t = s.tokens[sel], info = funcInfo(t.func), nd = nodes[sel], rq = REQ_VI[info.req];
    const kids = s.tokens.map((x,i)=>x.head === sel ? x.w : null).filter(Boolean);
    document.getElementById("panel-title").textContent = "Chi tiết";
    let html = '<div class="detail"><p class="word" lang="zh">' + esc(t.w) + '</p>' +
               (t.py ? '<p class="wpy">' + esc(t.py) + '</p>' : '') +
               (t.vi ? '<p class="wvi">' + esc(t.vi) + '</p>' : '') + '<dl>';
    html += '<dt>Từ loại</dt><dd>' + (POS_VI[t.pos] || t.pos) + ' <span class="code">' + t.pos + '</span></dd>';
    html += '<dt>Chức vụ</dt><dd>' + info.vi + (info.zh ? ' <span lang="zh">' + info.zh + '</span>' : '') +
            ' <span class="code">' + info.ab + '</span></dd>';
    html += '<dt>Vai trò</dt><dd><span class="pill ' + rq.cls + '">' + rq.t + '</span></dd>';
    html += '<dt>Thuộc cụm</dt><dd>' + (CHUNK_LAB[nd.chunk] || "—") + '</dd>';
    html += '<dt>Gắn vào</dt><dd>' + (t.head >= 0 ? '<em lang="zh">' + esc(s.tokens[t.head].w) + '</em>' : 'gốc câu') + '</dd>';
    html += '<dt>Kéo theo</dt><dd lang="zh">' + (kids.length ? esc(kids.join("、")) : "—") + '</dd>';
    html += '</dl></div>';
    body.innerHTML = html;
    const back = document.createElement("button");
    back.className = "backlink"; back.textContent = "← bỏ chọn";
    back.addEventListener("click", ()=>{ sel = null; applySel(); });
    body.appendChild(back);
  }

  function esc(x){
    return String(x).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
  }

  // Tiếng Trung viết liền: các từ trong một khối nối không dấu cách, pinyin
  // của khối nằm ngay dưới, cách nhau theo từ.
  function buildRibbon(s){
    const rib = document.getElementById("ribbon");
    rib.innerHTML = "";
    const groups = [];
    s.tokens.forEach((t,i)=>{
      const f = chunkOf(s.tokens, i);
      const last = groups[groups.length-1];
      if(last && last.f === f){ last.words.push(t.w); last.py.push(t.py || ""); }
      else groups.push({f, words:[t.w], py:[t.py || ""]});
    });
    groups.forEach(g=>{
      const info = funcInfo(g.f);
      const div = document.createElement("div");
      div.className = "chunk k-" + info.k + (info.req === "opt" ? " opt" : "");
      const py  = document.createElement("span"); py.className = "cpy"; py.textContent = g.py.filter(Boolean).join(" ");
      const txt = document.createElement("span"); txt.className = "txt"; txt.lang = "zh"; txt.textContent = g.words.join("");
      const lab = document.createElement("span"); lab.className = "lab"; lab.textContent = CHUNK_LAB[g.f] || "";
      div.appendChild(py); div.appendChild(txt); div.appendChild(lab);
      rib.appendChild(div);
    });
    const spk = document.getElementById("spk");
    if(spk){ spk.textContent = s.spk ? s.spk + ":" : ""; spk.hidden = !s.spk; }
    const pyEl = document.getElementById("spy");
    if(pyEl) pyEl.textContent = s.py || "";
    document.getElementById("vi").textContent = s.vi || "";

    // Ghi chú của câu (trang Động từ: pinyin và nghĩa của động từ đang xem).
    // Chèn bằng innerHTML vì có <strong>/<em>; nội dung đã được data.js thoát
    // ký tự, không phải chữ người dùng nhập.
    const noteEl = document.getElementById("snote");
    if(noteEl){
      if(s.note){ noteEl.innerHTML = s.note; noteEl.hidden = false; }
      else { noteEl.innerHTML = ""; noteEl.hidden = true; }
    }
  }

  const chips = document.getElementById("chips");
  const chipEls = [], groupHeads = [], groupWraps = [];

  function openGroup(g){
    groupWraps.forEach((w,k)=>{
      const on = k === g;
      w.hidden = !on;
      groupHeads[k].setAttribute("aria-expanded", on ? "true" : "false");
    });
  }

  function addGroup(name){
    const h = document.createElement("button");
    h.className = "vgroup"; h.type = "button";
    h.setAttribute("aria-expanded","false");
    h.textContent = name;
    const w = document.createElement("div");
    w.className = "gwrap"; w.hidden = true;
    const g = groupHeads.length;
    // luôn giữ đúng một nhóm mở: bấm lại nhóm đang mở thì không đóng
    h.addEventListener("click", ()=>openGroup(g));
    chips.appendChild(h); chips.appendChild(w);
    groupHeads.push(h); groupWraps.push(w);
    return w;
  }

  GROUPS.forEach(g=>{
    const wrap = addGroup(g.name);
    for(let i = g.from; i < g.to; i++){
      const d = DATA[i];
      const b = document.createElement("button");
      b.className = "chip"; b.type = "button"; b.setAttribute("role","tab");
      b.setAttribute("aria-selected", i === cur ? "true" : "false");
      b.innerHTML = '<span class="verb" lang="zh"></span><span class="pat"></span>';
      b.querySelector(".verb").textContent = d.verb;
      // Một động từ có nhiều câu thì cũng có nhiều khung, nên dán mỗi khung của
      // câu đầu lên chip là nói sai. "+n" cho biết còn n khung nữa ở thanh chấm
      // dưới sân; khung của câu ĐANG vẽ thì hiện ngay trên thanh chấm đó.
      const nvar = variantsOf(i).length;
      b.querySelector(".pat").textContent = d.pattern + (nvar > 1 ? "  +" + (nvar - 1) : "");
      b.title = variantsOf(i).map((s,k)=>(k + 1) + ". " + s.zh).join("\n");
      b.addEventListener("click", ()=>{
        chipEls.forEach((c,j)=>c.setAttribute("aria-selected", j === i ? "true" : "false"));
        showVariant(i, 0);
        if(exbar) exbar.hidden = true;
      });
      chipEls[i] = b;
      wrap.appendChild(b);
    }
  });

  // Kéo ở đâu cũng là dời cả cây; bấm (không kéo) vào một từ thì chọn từ đó.
  let drag = null;
  stage.addEventListener("pointerdown", ev=>{
    // các nút nổi trong sân (thanh chấm, nút zoom) phải tự nhận click:
    // nếu để stage bắt con trỏ thì nút không bao giờ nhận được sự kiện
    if(ev.target.closest && ev.target.closest(".pager, .ctrls, .panel, .helpbtn, .axes")) return;
    const nEl = ev.target.closest && ev.target.closest(".node");
    stage.setPointerCapture(ev.pointerId);
    drag = {x:ev.clientX, y:ev.clientY, px:pan.x, py:pan.y, i:nEl ? els.indexOf(nEl) : -1, moved:false};
  });
  stage.addEventListener("pointermove", ev=>{
    if(!drag) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if(!drag.moved && Math.abs(dx) + Math.abs(dy) > 4){ drag.moved = true; stage.classList.add("dragging"); }
    if(!drag.moved) return;
    pan.x = drag.px + dx;
    pan.y = drag.py + dy;
    draw();
  });
  function endDrag(){
    if(!drag) return;
    if(!drag.moved){
      if(drag.i >= 0) select(nodes[drag.i]);
      else { sel = null; applySel(); }
    }
    drag = null;
    stage.classList.remove("dragging");
  }
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener("wheel", ev=>{
    ev.preventDefault();
    zoom = Math.max(0.55, Math.min(2.2, zoom * (ev.deltaY > 0 ? 0.92 : 1.08)));
    draw();
  }, {passive:false});

  document.getElementById("zin").addEventListener("click", ()=>{ zoom = Math.min(2.2, zoom*1.15); draw(); });
  document.getElementById("zout").addEventListener("click", ()=>{ zoom = Math.max(0.55, zoom/1.15); draw(); });
  document.getElementById("reset").addEventListener("click", ()=>{
    zoom = 1; pan.x = 0; pan.y = 0; draw();
  });
  document.getElementById("t-core").addEventListener("change", e=>{
    show.core = e.target.checked;
    if(show.core && sel !== null && !nodes[sel].frame) sel = null;
    layout();
    applySel();
  });


  // ---------- mục → nhóm câu → câu: xổ ngay trên thanh bên ----------
  // TOPICS[i].g là tên nhóm trên thanh bên (HSK1 / HSK2–4, Giáo trình / Luyện
  // nói): đổi tên nhóm thì mở một nhóm mới. Mục chỉ có một nhóm câu thì bấm
  // vào là vẽ luôn, không xổ thêm một tầng nút chỉ có một nút.
  const TOPICS = window.TOPICS || [];
  let topen = -1, vcur = -1, ecur = -1;
  const tpChips = [], tpWraps = [];

  const exbar = document.getElementById("exbar");
  const exrows = document.getElementById("exrows");

  function renderExRows(){
    const t = TOPICS[topen], v = t.v[vcur];
    document.getElementById("exbar-t").innerHTML =
      esc(t.n) + (t.v.length > 1 ? " · <b>" + esc(v.v) + "</b>" : "") + " · " + v.ex.length + " câu";
    exrows.innerHTML = "";
    v.ex.forEach((e,k)=>{
      const b = document.createElement("button");
      b.className = "exrow"; b.type = "button";
      if(k === ecur) b.setAttribute("aria-current", "true");
      b.innerHTML = '<span class="i"></span><span class="s"><span class="zh" lang="zh"></span><span class="g"></span></span>';
      b.querySelector(".i").textContent = e.spk || String(k + 1).padStart(2,"0");
      b.querySelector(".zh").textContent = e.zh;
      b.querySelector(".g").textContent = e.vi;
      b.addEventListener("click", ()=>showEx(k));
      exrows.appendChild(b);
    });
    exbar.hidden = false;
    // Giữ câu đang xem trong khung danh sách. Chỉ cuộn chính danh sách:
    // scrollIntoView() cuộn luôn cả trang, kéo sân đồ thị ra khỏi màn hình.
    const on = exrows.querySelector('[aria-current="true"]');
    if(on && exrows.scrollHeight > exrows.clientHeight){
      const r = on.getBoundingClientRect(), c = exrows.getBoundingClientRect();
      if(r.top < c.top) exrows.scrollTop += r.top - c.top;
      else if(r.bottom > c.bottom) exrows.scrollTop += r.bottom - c.bottom;
    }
  }

  function showEx(k){
    const v = TOPICS[topen].v[vcur];
    ecur = k; sel = null;
    chipEls.forEach(c=>c.setAttribute("aria-selected","false"));
    buildSentence(v.ex[k]);
    setPager(v.ex.length, k, v.ex[k].p || v.v, showEx, v.ex.map(e=>e.zh));
    renderExRows();
  }

  function pickSub(i, j){
    topen = i; vcur = j;
    tpWraps[i].querySelectorAll(".tv").forEach((t,k)=>
      t.setAttribute("aria-selected", k === j ? "true" : "false"));
    showEx(0);
  }

  function toggleTopic(i){
    const single = TOPICS[i].v.length === 1;
    const open = topen === i && (single ? tpChips[i].getAttribute("aria-expanded") === "true" : !tpWraps[i].hidden);
    tpWraps.forEach((wr,k)=>{ wr.hidden = true; tpChips[k].setAttribute("aria-expanded","false"); });
    if(open && !single) return;
    topen = i; vcur = -1;
    tpChips[i].setAttribute("aria-expanded","true");
    if(single){ pickSub(i, 0); return; }
    const wr = tpWraps[i];
    wr.hidden = false;
    if(!wr.childElementCount){
      TOPICS[i].v.forEach((v,j)=>{
        const b = document.createElement("button");
        b.className = "tv"; b.type = "button"; b.setAttribute("role","tab");
        b.setAttribute("aria-selected","false");
        b.textContent = v.v;
        b.title = v.ex.length + " câu";
        b.addEventListener("click", ()=>pickSub(i, j));
        wr.appendChild(b);
      });
    }
    pickSub(i, 0);
  }

  let twrap = null, tgroup = null;
  TOPICS.forEach((t,i)=>{
    const g = t.g || "Chủ đề";
    if(g !== tgroup){ twrap = addGroup(g); tgroup = g; }
    const b = document.createElement("button");
    b.className = "chip tp" + (t.v.length === 1 ? " one" : ""); b.type = "button";
    b.setAttribute("aria-expanded","false");
    b.innerHTML = '<span class="verb"></span>';
    b.querySelector(".verb").textContent = t.n;
    b.title = t.b || t.n;
    b.addEventListener("click", ()=>toggleTopic(i));
    twrap.appendChild(b);
    const wr = document.createElement("div");
    wr.className = "tvwrap"; wr.hidden = true;
    twrap.appendChild(wr);
    tpChips.push(b); tpWraps.push(wr);
  });

  window.addEventListener("resize", draw);

  // Chú dẫn cách đọc đồ thị: giấu sau nút "?" thay vì hiện thường trực.
  // Bấm ra ngoài thì đóng lại, để khỏi che mất một góc sân.
  const helpBtn = document.getElementById("helpbtn"), axesEl = document.getElementById("axes");
  if(helpBtn && axesEl){
    const moHelp = on => { axesEl.hidden = !on; helpBtn.setAttribute("aria-expanded", on ? "true" : "false"); };
    helpBtn.addEventListener("click", ev=>{ ev.stopPropagation(); moHelp(axesEl.hidden); });
    document.addEventListener("click", ev=>{
      if(!axesEl.hidden && !axesEl.contains(ev.target) && ev.target !== helpBtn) moHelp(false);
    });
    document.addEventListener("keydown", ev=>{ if(ev.key === "Escape" && !axesEl.hidden) moHelp(false); });
  }

  // ---------- khởi động ----------
  openGroup(0);

  if(DATA.length){
    showVariant(cur, 0);
  }else if(TOPICS.length){
    toggleTopic(0);
  }
})();
