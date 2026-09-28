/* Phân tích cú pháp câu tiếng Trung trình độ HSK1 cho zh-svo, bằng luật.

   Không dùng thư viện NLP nào, nên đây là một bộ luật nhỏ viết riêng cho câu
   ngắn của giáo trình, theo ngữ pháp dạy học quen thuộc
   (主语 · 谓语 · 宾语 · 补语 · 定语 · 状语):

     1. Từ loại: bộ từ chức năng dựng sẵn trong hanyu.js, gợi ý trong nghĩa của
        bảng từ mới ("đgt.", "tt.", "phó từ"…), còn lại bỏ phiếu theo ngữ cảnh
        trong cả kho câu (sau 很 là tính từ, sau 会/能 là động từ, sau lượng từ
        là danh từ…), cuối cùng đoán theo chữ cuối (…子, …人, …师 là danh từ).
     2. Mỗi vế câu (tách ở ，。！？；) có một vị ngữ trung tâm: động từ đầu tiên
        không nằm trong cụm giới từ; động từ năng nguyện nhường chỗ cho động từ
        theo sau nó; không có động từ thì lấy tính từ, rồi danh từ (今天星期一).
     3. Trước vị ngữ: chủ ngữ, và trạng ngữ — thời gian, phó từ, cụm giới từ —
        vì tiếng Trung đặt trạng ngữ TRƯỚC động từ. Sau vị ngữ: tân ngữ, bổ ngữ
        (得 + tính từ, kết quả, xu hướng, số lượng), động từ nối tiếp, trợ từ.
     4. Trong cụm danh từ: từ cuối là trung tâm; chỉ thị, số, lượng từ là hạn
        định; phần còn lại là định ngữ, 的 gắn vào định ngữ của nó.

   Kết quả mỗi câu là danh sách token {w, py, pos, vi, func, head} theo đúng
   định dạng graph.js đọc, với bộ nhãn tiếng Trung khai ở zh-svo/graph.js.
   Luật đúng với phần lớn câu HSK1; câu dài nhiều mệnh đề thì chỉ là gần đúng. */
(function(root){
  "use strict";

  const S = s => new Set(s.split(" "));
  const HS_NP   = S("NOUN PRON PROPN NUM CLF TIME");
  const HS_DEM  = S("这 那 哪 这个 那个 哪个 这些 那些 每 各 一些 有些 整个 所有 别的 任何 每个 多大 这种 那种 哪种 这样的");
  const HS_ASP  = S("了 过 着");
  const HS_SFP  = S("吗 呢 吧 啊 呀 嘛 哦 啦");
  const HS_DIR  = S("来 去 下 回来 回去 上来 下来 起来 出来 进来 过来 出去 进去 上去 下去 过去");
  // Bổ ngữ xu hướng một chữ chỉ theo sau động từ một chữ: 关上, 吹开, 举起, 逃走;
  // sau động từ hai chữ thì là động từ thứ hai (我决定走).
  const HS_DIR1 = S("上 起 出 进 回 开 走");
  const HS_RES  = S("懂 完 到 好 见 错 清楚 干净 住 会 成 干 掉 满 光");
  // Sau các động từ này, động từ kế tiếp là việc được mời / sai làm, không phải bổ
  // ngữ xu hướng của chúng: 请进, 让开 không bổ sung cho 请, 让.
  const HS_CAUS = S("请 让 叫 使");
  // 把 / 被 dẫn tân ngữ lên trước động từ chính; cụm của chúng luôn là trạng ngữ
  // cho động từ phía sau, kể cả khi đứng sau một động từ khác (请把门关上).
  const HS_BA   = S("把 被 将");
  const HS_NUM_CH = "一二两三四五六七八九十几";   // chữ mở đầu một cụm số lượng
  const HS_TUNIT = S("点 点钟 号 星期 月 年 天 周 分钟 小时 秒 会儿");   // cụm số + đơn vị này là thời gian
  const HS_PERS = S("我 你 您 他 她 它 我们 你们 他们 她们 咱们 大家");   // đại từ nhân xưng
  // Giới từ đứng sau động từ làm bổ ngữ: 住在北京, 送给他, 走到门口, 飞往上海.
  const HS_POSTP = S("在 给 到 往 向 自 于");
  const HS_QTY  = S("一下 一点 一点儿 一会儿 一下儿");
  const HS_DEG  = S("很 太 非常 特别 真 最 更 挺 比较 有点儿 有点 十分 越来越 多么 这么 那么");
  const HS_DITR = S("给 教 问 告诉 送 借 还 找 请");
  const HS_CLV  = S("觉得 认为 希望 知道 听说 说 想 以为 发现 相信 看见 记得 忘了 担心 怕 觉 肯定 同意 发誓 保证 承认 感觉 猜");
  const HS_PREP_VERB = S("在 给 到");       // không có động từ nào sau thì chính là động từ
  const HS_HOW  = S("怎么 如何 怎样 这么 那么 这样 那样");   // đại từ đứng trước động từ làm trạng ngữ
  const HS_SUB  = S("如果 要是 因为 虽然 除非 只要 即使 既然 尽管 当 不管 无论 不论 哪怕 就算 由于");   // mở đầu vế phụ
  const HS_COORD = S("和 跟 或者 还是 与 以及");   // nối hai danh từ trong một cụm
  const HS_WHEN = S("后 以后 之后 前 以前 之前 时候 时");   // 下班后, 吃饭的时候: cả cụm là trạng ngữ thời gian
  const HS_AUXW = S("会 能 想 要 可以 应该 愿意 能够 必须 不能 还要 可能");
  const HS_CLV_CAUS = new Set([...HS_CLV, ...HS_CAUS, "是", "有", "在"]);
  const HS_RES_DIR1 = new Set([...HS_RES, ...HS_DIR1]);

  const clen = s => Array.from(s).length;
  const first = s => Array.from(s)[0] ?? "";
  const last = s => Array.from(s).pop() ?? "";
  const numStart = w => HS_NUM_CH.includes(first(w));

  // ---------------------------------------------------------------- từ loại

  // \b của nhãn tiếng Việt: chữ có dấu cũng là chữ.
  const E = "(?![\\p{L}\\p{N}_])";
  const HINTS = [
    [/năng nguyện/u, "AUX"],
    [/lượng từ/u, "CLF"],
    [new RegExp("^\\(?\\s*(đgt|đg|động từ)" + E, "u"), "VERB"],
    [new RegExp("^\\(?\\s*(tt|tính từ)" + E, "u"), "ADJ"],
    [new RegExp("^\\(?\\s*(đt|đại từ)" + E, "u"), "PRON"],
    [new RegExp("^\\(?\\s*(dt|danh từ)" + E, "u"), "NOUN"],
    [new RegExp("^\\(?\\s*(phó|pht|phó từ)" + E, "u"), "ADV"],
    [new RegExp("^\\(?\\s*(st|số từ)" + E, "u"), "NUM"],
    [new RegExp("^\\(?\\s*(trợ từ|tr)" + E, "u"), "PART"],
    [new RegExp("^\\(?\\s*(giới từ|gt)" + E, "u"), "ADP"],
    [new RegExp("^\\(?\\s*(liên từ|lt)" + E, "u"), "CCONJ"],
    [new RegExp("^\\(?\\s*(thán từ)" + E, "u"), "INTJ"],
    [new RegExp("^\\(?\\s*(danh từ riêng|dtr)" + E, "u"), "PROPN"],
  ];

  /** Gợi ý từ loại trong cột nghĩa của bảng từ mới: "đgt.", "(tt.)", "phó từ"… */
  function hs_pos_hint(vi){
    const v = vi.toLowerCase();
    for(const [re, pos] of HINTS) if(re.test(v)) return pos;
    return null;
  }

  /**
   * Từ loại gán tay cho từ vựng của giáo trình (500 từ thông dụng, 50 động từ,
   * từ mới 15 bài) — danh sách 500 từ không ghi từ loại, và phần lớn lỗi phân
   * tích bắt nguồn từ đó. Ưu tiên cao nhất: nhóm "50 động từ" xếp 累, 忙 vào động
   * từ, nhưng trong câu chúng chạy như tính từ (我很累).
   * Từ mới thêm vào kho mà chưa có ở đây thì rơi xuống gợi ý nghĩa và bỏ phiếu.
   */
  const OVERRIDE = {
    NOUN:  "丈夫 上帝 上面 下面 世界 主意 之间 事儿 事实 事情 人们 人类 任务 伙计 信息 个人 家伙 兄弟 凶手 先生 儿子 "
         + "全部 公司 分钟 博士 原因 名字 咖啡 哥哥 问题 国家 地方 报告 外面 大学 太太 夫人 女人 女儿 女士 女孩 妻子 "
         + "姑娘 婚礼 妈妈 孩子 学校 家庭 家里 宝贝 小姐 小子 小孩 小时 屁股 尸体 弟弟 律师 情况 想法 意思 意义 房子 "
         + "房间 手机 手术 政府 故事 新闻 方式 方法 时间 朋友 未来 东西 案子 样子 机会 武器 死亡 母亲 比赛 法官 消息 "
         + "混蛋 照片 父母 父亲 爸爸 玩笑 现场 理由 生命 生意 生日 生活 男人 男孩 病人 白痴 监狱 目标 眼睛 礼物 秘密 "
         + "节目 精神 系统 约会 组织 结果 经历 总统 美元 老兄 老师 声音 能力 自由 兴趣 行动 行为 衣服 里面 计划 证据 "
         + "警察 身上 身边 身体 办法 游戏 选手 部分 医生 医院 错误 钥匙 长官 关系 电影 电视 电话 音乐 头发 飞机 学生 "
         + "国 同学 菜 汉字 字 书 茶 米饭 商店 杯子 钱 猫 狗 椅子 桌子 电脑 前 天气 雨 水果 水 苹果 车 后 饭店 出租车 风景",
    PROPN: "李月 王方 谢朋 大卫 纽约 美国",
    VERB:  "下来 下去 了解 介意 代表 以为 来自 保持 保证 保护 信任 做到 伤害 出来 出去 出现 加入 加油 原谅 参加 同意 "
         + "告诉 喜欢 回来 回到 回去 回家 回答 坚持 失去 存在 安排 完成 害怕 小心 工作 希望 带来 帮助 帮忙 建议 得到 "
         + "忘记 想像 想到 想想 感到 感觉 感谢 成功 成为 打算 打开 找到 承认 抓住 投票 拜托 接受 控制 撒谎 拥有 担心 "
         + "支持 收到 改变 放弃 放松 明白 有关 检查 欢迎 决定 治疗 注意 准备 照顾 犯罪 理解 留下 发现 发生 发誓 相信 "
         + "看到 看看 看见 睡觉 知道 确定 等等 结婚 结束 继续 考虑 联系 听到 听说 处理 表演 表现 要求 见到 觉得 解决 "
         + "解释 讨厌 记住 记得 记录 试试 认为 说话 调查 谈谈 谋杀 证明 变成 负责 起来 跳舞 进来 进入 进去 进行 遇到 "
         + "过来 道歉 选择 还有 开始 开枪 关心 阻止 离开 需要 说 讲 问 听 看 读 写 吃 喝 做 去 来 回 走 坐 起床 学习 "
         + "上班 下班 上课 下课 考试 练习 教 学 爱 让 找 买 卖 用 吃饭 住 下雨 打电话 开",
    ADJ:   "高兴 晚 一样 不同 不好 不行 不错 冷静 努力 危险 可爱 可怜 唯一 奇怪 安全 完美 容易 年轻 幸运 很多 必要 快乐 抱歉 "
         + "整个 正常 清楚 漂亮 生气 痛苦 疯狂 直接 真正 简单 糟糕 紧张 聪明 亲爱 该死 重要 开心 随便 麻烦 累 忙 好吃 热 冷 不少",
    ADV:   "一下 一直 不再 不用 不要 也许 其实 到底 到处 刚刚 另外 只是 只有 可能 大概 好像 好好 如此 完全 实在 就是 "
         + "很快 从来 从没 或许 是否 有点 本来 根本 比较 永远 无法 然后 甚至 当然 的确 看来 真是 真的 确实 突然 简直 "
         + "终于 绝对 肯定 至少 这么 那么 重新 难道 显然 首先 马上 也是 太…了 一共 为什么",
    PRON:  "一切 任何 其中 其他 别人 别的 各位 多久 如何 它们 干吗 怎样 所有 有些 有人 每个 这些 这样 这种 这边 那些 那样 那种 那边",
    NUM:   "多少 一些 一个 一点 一点儿 第一 第二",
    CLF:   "些",
    TIME:  "之前 之后 今晚 昨晚 最后 最近 每天 当时 这次 那天 那时 过去 星期一 星期二 星期三 星期四 星期五 星期六 星期日 星期天",
    AUX:   "不能 必须 能够 愿意 还要",
    ADP:   "作为 对于 为了 直到 通过 关于 除了",
    CCONJ: "不过 并且 以及 否则",
    SCONJ: "不管 即使 只要 除非",
    PART:  "来说 极了 而已",
    INTJ:  "是的 晚安",
  };
  let overMap = null;
  function hs_pos_override(){
    if(overMap) return overMap;
    overMap = new Map();
    for(const pos in OVERRIDE){
      for(const w of OVERRIDE[pos].split(/\s+/u)) if(w !== "") overMap.set(w, pos);
    }
    return overMap;
  }

  const PREV_VERB = S("会 能 想 要 可以 应该 别 不要 不想 不会 得 去 来 一起");
  const PREV_NOUN = S("个 本 位 口 件 杯 只 张 条 种 的 这 那 这个 那个 一些 每 些 家");
  const PREV_PREP = S("在 从 跟 给 对 往 离 把 被 比");

  /** Từ loại cho mọi từ trong kho: gán tay, từ điển, gợi ý nghĩa, rồi bỏ phiếu theo ngữ cảnh. */
  function hs_pos_table(dict, sents){
    const over = hs_pos_override();
    const pos  = new Map();
    for(const w in dict){
      const e = dict[w];
      pos.set(w, over.get(w) ?? e.pos ?? hs_pos_hint(String(e.vi ?? "")) ?? null);
    }
    for(const [w, p] of over) if(pos.get(w) == null) pos.set(w, p);
    const votes = new Map();
    const vote = (w, p, n = 1) => {
      if(!votes.has(w)) votes.set(w, new Map());
      const vs = votes.get(w);
      vs.set(p, (vs.get(p) ?? 0) + n);
    };
    for(const s of sents){
      const t = s.t, n = t.length;
      for(let i = 0; i < n; i++){
        if(t[i][3] !== "h") continue;
        const w    = t[i][0];
        const prev = i > 0 && t[i - 1][3] === "h" ? t[i - 1][0] : "";
        const next = i + 1 < n && t[i + 1][3] === "h" ? t[i + 1][0] : "";
        if(HS_DEG.has(prev)) vote(w, "ADJ", 3);
        if(PREV_VERB.has(prev)) vote(w, "VERB", 2);
        if(HS_ASP.has(next) || next === "得") vote(w, "VERB", 1);
        if(PREV_NOUN.has(prev)) vote(w, "NOUN", 2);
        if(PREV_PREP.has(prev)) vote(w, "NOUN", 1);
        if(next === "的" && prev === "") vote(w, "NOUN", 1);
      }
    }
    for(const [w, vs] of votes){
      if(pos.get(w)) continue;
      // sắp giảm dần, hòa phiếu thì giữ thứ tự gặp trước
      pos.set(w, [...vs].sort((a, b) => b[1] - a[1])[0][0]);
    }
    for(const [w, p] of pos) pos.set(w, p ?? hs_guess(w));
    return pos;
  }

  /** Không có manh mối nào: đoán theo chữ cuối. */
  function hs_guess(w){
    if(/^[0-9零一二三四五六七八九十百千万两]+$/u.test(w)) return "NUM";
    return "NOUN";   // …们, …子, …人, …师: danh từ; không đoán được gì hơn thì cũng vậy
  }

  // ---------------------------------------------------------------- phân tích

  /**
   * Câu (token của hanyu.js) → token đồ thị {w, py, pos, vi, func, head}, bỏ dấu câu.
   * Vế sau gắn vào vị ngữ của vế đầu bằng nhãn conj.
   */
  function hs_parse(toks, POS, dict){
    const W       = [];
    const clauses = [];
    let cur       = [];
    let isEnum    = false;   // vừa gặp dấu 、: token sau là một vế liệt kê mới
    const enumAt  = [];
    for(const t of toks){
      if(t[3] === "p"){
        if(/[，,。！!？?；;：:]/u.test(t[0]) && cur.length){
          clauses.push(cur);
          cur = [];
        }
        isEnum = t[0] === "、";
        continue;
      }
      if(isEnum){
        enumAt.push(W.length);
        isEnum = false;
      }
      cur.push(W.length);
      W.push({
        w:    t[0],
        py:   t[1].split(" ").join(""),
        pos:  t[3] === "x" ? "NUM" : (POS.get(t[0]) ?? hs_guess(t[0])),
        vi:   String(dict[t[0]]?.vi ?? ""),
        func: "",
        head: -1,
      });
    }
    if(cur.length) clauses.push(cur);
    for(const i of enumAt) W[i].enum = true;   // chỉ dùng trong lúc phân tích, xóa trước khi trả về
    // Vế chỉ là cụm giới từ hay từ chỉ thời gian (对我来说，… / 明天，…) làm trạng
    // ngữ cho vế có vị ngữ đứng sau nó; các vế có vị ngữ khác nối vào vế chính.
    const roots = [];
    const cix   = [];   // các token của từng vế
    let kind    = [];   // theo vế: '' thường, 'topic' chủ đề tách dấu phẩy, 'voc' lời gọi
    for(const ix of clauses){
      const r = hs_clause(W, ix);
      if(r !== null){
        let onlyTime = true;
        for(const i of ix) onlyTime = onlyTime && (W[i].pos === "TIME" || W[i].pos === "ADV");
        roots.push([r, W[r].pos === "ADP" || onlyTime || HS_SUB.has(W[ix[0]].w)]);
        kind.push(hs_nominal_kind(W, ix, r));
        cix.push(ix);
      }
    }
    // Vế chỉ là một cụm danh từ đứng cạnh vế có vị ngữ: 这么多菜，我们吃得完吗
    // (chủ đề), 老兄，好久不见 / 谢谢你，医生 (lời gọi). Chỉ tính khi câu còn vế
    // khác không phải loại này.
    const verbal = [];
    roots.forEach((_, k) => { if(kind[k] === "") verbal.push(k); });
    if(!verbal.length) kind = roots.map(() => "");
    // Vế chính: vế thường đầu tiên có vị ngữ động từ / tính từ; không có thì vế
    // thường đầu tiên (他呢？他是你同学吗: vế chính là vế sau).
    let main = null;
    const NOMINAL = S("NOUN PRON PROPN NUM CLF");
    for(const needVerb of [true, false]){
      roots.forEach(([r, adv], k) => {
        if(main === null && !adv && kind[k] === "" && (!needVerb || !NOMINAL.has(W[r].pos))) main = r;
      });
    }
    main ??= roots[0]?.[0] ?? null;
    roots.forEach(([r, adv], k) => {
      if(kind[k] !== ""){
        // chủ đề gắn vào vế có vị ngữ ngay sau nó (hay trước, nếu nó đứng cuối)
        let to = main;
        for(const v of verbal){
          if(v > k){ to = roots[v][0]; break; }
        }
        // cả vế là một cụm danh từ: dựng lại cho đúng (李 là định ngữ của 小姐,
        // 这么多 bổ nghĩa cho 菜), rồi gắn đầu cụm vào vế đích
        hs_np(W, cix[k], 0, cix[k].length, -1, kind[k]);
        const h = cix[k][hs_np_head(W, cix[k], 0, cix[k].length)];
        W[h].func = kind[k];
        W[h].head = kind[k] === "voc" ? main : to;
        return;
      }
      if(r === main){
        W[r].func = "pred";
        W[r].head = -1;
        return;
      }
      let next = main;
      for(let j = k + 1; j < roots.length; j++){
        if(!roots[j][1]){ next = roots[j][0]; break; }
      }
      // vế thường khác: bỏ qua các vế chủ đề / lời gọi khi tìm vế đích
      for(let j = k + 1; adv && j < roots.length; j++){
        if(!roots[j][1] && kind[j] === ""){ next = roots[j][0]; break; }
      }
      W[r].func = adv ? "adv" : "conj";
      W[r].head = adv ? next : main;
    });
    for(const w of W){
      w.func = w.func || "adv";
      delete w.enum;
    }
    return W;
  }

  /** Một vế câu: gán nhãn tại chỗ trong W, trả về chỉ số vị ngữ trung tâm. */
  function hs_clause(W, ix){
    const n = ix.length;
    if(n === 0) return null;
    const P   = k => W[ix[k]].pos;   // đọc tại chỗ: vòng dưới sửa từ loại (会 → AUX, 在 → VERB)
    const T   = k => W[ix[k]].w;
    const set = (k, func, headK) => {
      W[ix[k]].func = func;
      W[ix[k]].head = headK < 0 ? -1 : ix[headK];
    };
    const setPos = (k, p) => { W[ix[k]].pos = p; };
    const at = i => ix.indexOf(i);
    const inP = (k, ...ps) => ps.includes(P(k));

    // Từ nối đầu vế: 因为, 所以, 但是, 如果… và thán từ 喂, 啊.
    let start = 0;
    const marks = [];
    while(start < n && inP(start, "SCONJ", "CCONJ", "INTJ")) marks.push(start++);
    if(start >= n){
      for(const m of marks) set(m, "mark", -1);
      return ix[marks[0]];
    }

    // Vế chỉ là một danh sách danh từ (爸爸、妈妈和我): cả vế là một cụm ngang hàng.
    let list = false, allN = true;
    for(let k = start; k < n; k++){
      allN = allN && (inP(k, "NOUN", "PRON", "PROPN") || HS_COORD.has(T(k)));
      list = list || HS_COORD.has(T(k)) || !!W[ix[k]].enum;
    }
    if(allN && list && n - start > 1){
      hs_np(W, ix, start, n, -1, "pred");
      for(const m of marks) set(m, "mark", hs_np_head(W, ix, start, n));
      for(const i of ix.slice(start)){
        if(W[i].head === -1 && W[i].func === "pred") return i;
      }
    }

    // Cấu trúc chữ 的 làm chủ ngữ: 他说的是事实 = [他说的] 是 [事实]. Phần trước
    // 的 là một vế riêng, cả cụm làm chủ ngữ cho 是.
    for(let k = start + 1; k + 1 < n; k++){
      if(T(k) === "的" && T(k + 1) === "是"){
        let verb = false;
        for(let j = start; j < k; j++) verb = verb || P(j) === "VERB";
        if(!verb) break;
        const r1 = hs_clause(W, ix.slice(start, k));
        const r2 = hs_clause(W, ix.slice(k + 1));
        W[r1].func = "subj";
        W[r1].head = r2;
        W[r2].func = "pred";
        W[r2].head = -1;
        set(k, "de", at(r1));
        for(const m of marks) set(m, "mark", k + 1);
        return r2;
      }
    }

    // 下班后我们一起吃饭 / 吃饭的时候…: một vế động từ + 后/时候 là trạng ngữ thời
    // gian cho phần sau. 后, 时候 là trung tâm; vế trước làm định ngữ của nó.
    for(let k = start + 1; k + 1 < n; k++){
      if(!HS_WHEN.has(T(k)) || !hs_any_pred(P, T, k + 1, n)) continue;
      const end = T(k - 1) === "的" ? k - 1 : k;
      let verb = false;
      for(let j = start; j < end; j++) verb = verb || P(j) === "VERB";
      if(!verb || end <= start) break;
      const r1 = hs_clause(W, ix.slice(start, end));
      const r2 = hs_clause(W, ix.slice(k + 1));
      W[r1].func = "attr";
      W[r1].head = ix[k];
      if(end < k) set(end, "de", at(r1));
      set(k, "adv", at(r2));
      for(const m of marks) set(m, "mark", at(r2));
      return r2;
    }

    // 他说的话我不相信: [chủ ngữ + động từ] 的 [danh từ] ở đầu vế mà phía sau
    // còn vị ngữ khác thì cả cụm là danh từ có định ngữ, đứng đầu phần sau.
    for(let k = start; k + 2 < n; k++){
      if(P(k) !== "VERB") continue;
      if(T(k) === "是" || T(k + 1) !== "的" || !hs_np_like(P(k + 2), T(k + 2)) || T(k + 2) === "的"
         || k > start && P(k - 1) === "ADP"){
        break;   // chỉ xét động từ đầu tiên của vế; sau giới từ thì là tân ngữ của nó
      }
      // cụm danh từ sau 的 dừng trước đại từ (他说的话 | 我不相信)
      let j = k + 2;
      while(j < n && hs_np_like(P(j), T(j)) && !(j > k + 2 && inP(j, "PRON", "PROPN"))) j++;
      let pred = false;
      for(let a = j; a < n; a++) pred = pred || inP(a, "VERB", "ADJ", "AUX");
      if(!pred) break;
      const head = ix[hs_np_head(W, ix, k + 2, j)];
      const r1 = hs_clause(W, ix.slice(start, k + 1));
      const r2 = hs_clause(W, ix.slice(k + 2));
      W[r1].func = "attr";
      W[r1].head = head;
      set(k + 1, "de", at(r1));
      for(const m of marks) set(m, "mark", at(r2));
      return r2;
    }

    // 学汉语要花很多时间, 玩手机会影响学习: vế mở đầu bằng động từ (không có chủ
    // ngữ) mà sau đó còn "trợ động từ + động từ" thì cụm động từ đầu là chủ ngữ.
    if(P(start) === "VERB" && !HS_CLV_CAUS.has(T(start))){
      for(let a = start + 1; a + 1 < n; a++){
        const neg = T(a) === "不要" || T(a) === "别";
        if((HS_AUXW.has(T(a)) || neg) && inP(a + 1, "VERB", "ADJ")){
          let noV = true;
          for(let j = start + 1; j < a; j++) noV = noV && !inP(j, "VERB", "AUX");
          if(!noV) break;
          const r1 = hs_clause(W, ix.slice(start, a));
          const r2 = hs_clause(W, ix.slice(a));
          W[r1].func = neg ? "adv" : "subj";
          W[r1].head = r2;
          for(const m of marks) set(m, "mark", at(r2));
          return r2;
        }
      }
    }

    // Động từ năng nguyện (会 能 想 要 可以…) theo sau là động từ thì làm trợ động
    // từ; không thì chính nó là động từ (我要这个, 我想你). Quyết theo vị trí chứ
    // không theo từ điển, và ghi luôn từ loại đúng vào token.
    for(let k = start; k < n; k++){
      if(HS_AUXW.has(T(k)) || P(k) === "AUX"){
        let j = k + 1;
        while(j < n && (P(j) === "ADV" || HS_AUXW.has(T(j)) || HS_HOW.has(T(j)))) j++;
        setPos(k, j < n && inP(j, "VERB", "ADJ", "ADP") ? "AUX" : "VERB");
      }
    }
    // 没(有) trước động từ, tính từ là phó từ phủ định (我没去); trước danh từ là
    // động từ "không có" (我没有时间). Động từ đứng sau 的 hay sau chỉ thị là danh
    // từ: 我的想像, 别的选择 (trừ 是: 他说的是事实).
    for(let k = start; k < n; k++){
      const w = T(k);
      if(w === "没有" || w === "没"){
        let j = k + 1;
        while(j < n && P(j) === "ADV") j++;
        setPos(k, j < n && inP(j, "VERB", "ADJ", "AUX", "ADP") ? "ADV" : "VERB");
      }
      // Có bổ ngữ hay trợ từ động thái theo sau thì vẫn là động từ: 把旧的修好.
      else if(P(k) === "VERB" && k > start && (T(k - 1) === "的" || HS_DEM.has(T(k - 1)))
              && w !== "是" && !HS_AUXW.has(w)
              && !(k + 1 < n && (hs_np_like(P(k + 1), T(k + 1))
                   || HS_RES.has(T(k + 1)) || HS_DIR.has(T(k + 1)) || HS_ASP.has(T(k + 1))))){
        setPos(k, "NOUN");
      }
    }

    // 在 / 给 / 到 mà phía sau không còn động từ nào thì cũng là động từ (我在家).
    const isV = [];
    const V = k => isV[k] ?? false;
    for(let k = start; k < n; k++) isV[k] = P(k) === "VERB";
    for(let k = start; k < n; k++){
      // Đứng ngay sau động từ thì vẫn là giới từ, làm bổ ngữ: 坐在我后面, 送给他.
      if(P(k) === "ADP" && HS_PREP_VERB.has(T(k)) && !(k > start && P(k - 1) === "VERB")){
        let later = false;
        for(let j = k + 1; j < n; j++){
          if(V(j)){ later = true; break; }
        }
        if(!later){
          isV[k] = true;
          setPos(k, "VERB");
        }
      }
    }

    // Vài từ đổi từ loại theo vị trí:
    //   下大雨, 下功夫: 下 ở đầu vế hay sau phó từ, trước danh từ là động từ;
    //   以真实的故事为基础: 为 sau cụm 以 là động từ "làm", không phải giới từ;
    //   我肯定他会来: 肯定 trước một đại từ còn động từ theo sau là "chắc chắn rằng".
    let seenYi = false;
    for(let k = start; k < n; k++){
      const w = T(k);
      seenYi = seenYi || w === "以";
      let toVerb = false;
      if(w === "下" && k + 1 < n && P(k + 1) === "NOUN"
         && (k === start || inP(k - 1, "ADV", "AUX", "SCONJ", "CCONJ"))){
        toVerb = true;
      }
      if(w === "为" && seenYi){
        toVerb = true;
        for(let j = k - 1; j >= start && T(j) !== "以"; j--){
          isV[j] = false;
          if(P(j) === "VERB") setPos(j, "NOUN");
        }
      }
      // 是对的, 你说得对, 对了: 对 mà sau nó không có cụm danh từ là tính từ "đúng"
      if(w === "对" && P(k) === "ADP"){
        let np = false;
        for(let j = k + 1; j < n; j++) np = np || T(j) !== "的" && hs_np_like(P(j), T(j));
        if(!np) setPos(k, "ADJ");
      }
      // 我通过了考试: giới từ mà có 了 / 过 theo ngay sau là động từ
      if(P(k) === "ADP" && k + 1 < n && HS_ASP.has(T(k + 1))) toVerb = true;
      // 天快黑了, 快来吃吧: 快 ngay trước động từ / tính từ là phó từ "sắp, mau"
      if(w === "快" && k + 1 < n && inP(k + 1, "VERB", "ADJ")){
        isV[k] = false;
        setPos(k, "ADV");
      }
      // 他病了: danh từ đứng ngay sau chủ ngữ đại từ và trước 了 là động từ
      if(P(k) === "NOUN" && k > start && k + 1 < n && T(k + 1) === "了"
         && (P(k - 1) === "PROPN" || HS_PERS.has(T(k - 1)))){
        toVerb = true;
      }
      if(w === "肯定" && k + 1 < n && inP(k + 1, "PRON", "PROPN")){
        for(let j = k + 2; j < n; j++) toVerb = toVerb || V(j) || P(j) === "AUX";
      }
      if(toVerb){
        isV[k] = true;
        setPos(k, "VERB");
      }
    }

    // 医生给我检查身体, 我给你打电话: 给 + cụm danh từ + động từ thì 给 là giới từ
    // "cho"; còn 给我一杯水 (sau cụm là số lượng) thì 给 vẫn là động từ "đưa".
    // 用手指, 用剪刀剪: 用 cũng vậy, thành giới từ "bằng".
    for(let k = start; k + 2 < n; k++){
      let cong = false;   // 从…到…
      if(T(k) === "到") for(let j = start; j <= k; j++) cong = cong || T(j) === "从";
      if(!(T(k) === "给" || T(k) === "用" || cong) || !V(k)
         || !inP(k + 1, "PRON", "PROPN", "NOUN", "TIME", "NUM")){
        continue;
      }
      let j = k + 1;
      while(j < n && (inP(j, "PRON", "PROPN", "NOUN") || cong && hs_np_like(P(j), T(j)))) j++;
      while(j < n && (inP(j, "ADV", "AUX") || P(j) === "ADP" && j + 1 < n && hs_np_like(P(j + 1), T(j + 1)))){
        if(P(j) === "ADP"){   // cụm giới từ chen giữa: 用剪刀[把纸]剪开
          j++;
          while(j < n && hs_np_like(P(j), T(j)) && !V(j)) j++;
          continue;
        }
        j++;
      }
      if(j < n && V(j)){
        isV[k] = false;
        setPos(k, "ADP");
      }
    }

    // 他不小心踢到了桌子: 不小心 (vô ý) đứng trước một động từ khác là trạng ngữ
    // cách thức, không phải vị ngữ "cẩn thận" bị phủ định.
    for(let k = start + 1; k + 1 < n; k++){
      if(T(k) !== "小心" || T(k - 1) !== "不") continue;
      for(let j = k + 1; j < n; j++){
        if(V(j)){
          isV[k] = false;
          setPos(k, "ADV");
          break;
        }
      }
    }

    // 把工作做完, 被批评: từ ngay sau 把 / 被 mà phía sau còn động từ khác thì là
    // tân ngữ của 把 (danh từ), không phải vị ngữ, dù từ điển ghi là động từ.
    for(let k = start; k + 1 < n; k++){
      if(P(k) !== "ADP" || !HS_BA.has(T(k)) || !V(k + 1)) continue;
      for(let j = k + 2; j < n; j++){
        // 被翻译成: 成 là bổ ngữ của 翻译, không phải động từ thứ hai.
        if(V(j) && !HS_RES.has(T(j)) && !HS_DIR.has(T(j))){
          isV[k + 1] = false;
          setPos(k + 1, "NOUN");
          break;
        }
      }
    }

    // 连睡觉的时间: giới từ + [động từ 的 danh từ], động từ đó chỉ là định ngữ.
    for(let k = start; k + 3 < n; k++){
      if(P(k) === "ADP" && !V(k) && V(k + 1) && T(k + 2) === "的" && hs_np_like(P(k + 3), T(k + 3))){
        isV[k + 1] = false;
      }
    }

    // Cụm giới từ trước động từ: giới từ + cụm danh từ ngay sau nó.
    const inPP = new Map();
    for(let k = start; k < n; k++){
      if(P(k) === "ADP" && !V(k)){
        // Tân ngữ của giới từ có thể là "tính từ + 的" (把旧的修好).
        let j = k + 1;
        while(j < n && !V(j)
              && (hs_np_like(P(j), T(j)) || inP(j, "ADJ", "VERB") && j + 1 < n && T(j + 1) === "的"
                  || T(j) === "的" && j > k + 1)
              && !(j > k + 1 && hs_np_break(P(j - 1), P(j), j + 1 < n ? T(j + 1) : "", T(j), T(j - 1)))){
          inPP.set(j, k);
          j++;
        }
      }
    }

    // 是…的 nhấn mạnh (我是坐飞机来的, 你们是什么时候认识的): 是 chỉ đánh dấu,
    // vị ngữ thật là động từ đứng giữa.
    const skip = new Set();
    if(n > 2 && T(n - 1) === "的"){
      outer: for(let k = start; k < n - 1; k++){
        if(T(k) === "是"){
          for(let j = k + 1; j < n - 1; j++){
            if(V(j)){
              skip.add(k);
              break outer;
            }
          }
        }
      }
    }

    // Vị ngữ trung tâm.
    let root = null;
    if(V(start) && start + 1 < n){
      let a = start + 1;
      while(a < n && (P(a) === "ADV" || HS_DEG.has(T(a)))) a++;
      if(a > start + 1 && a < n && P(a) === "ADJ" && hs_only_particles(T, a + 1, n)){
        isV[start] = false;
        setPos(start, "NOUN");
      }
    }
    // 我忙得连睡觉的时间都没有: tính từ / động từ ngay trước 得 là vị ngữ, dù sau
    // 得 còn động từ khác (đó là bổ ngữ trình độ).
    for(let k = start + 1; k + 1 < n && root === null; k++){
      if(T(k) === "得" && inP(k - 1, "ADJ", "VERB") && !inPP.has(k - 1)){
        let before = false;
        for(let j = start; j < k - 1; j++) before = before || (V(j) && !inPP.has(j) && !skip.has(j));
        if(!before) root = k - 1;
      }
    }
    for(let k = start; k < n && root === null; k++){
      if(V(k) && !inPP.has(k) && !skip.has(k)) root = k;
    }
    // 很高兴认识你: tính từ có phó từ mức độ đứng ngay trước động từ mới là vị
    // ngữ, động từ phía sau bổ sung cho nó.
    if(root !== null && root - 2 >= start && P(root - 1) === "ADJ" && HS_DEG.has(T(root - 2))
       && !((T(root - 1) === "好" || T(root - 1) === "难") && hs_only_particles(T, root + 1, n))){
      root--;
    }
    if(root === null){
      for(let k = start; k < n && root === null; k++){
        const nextW = k + 1 < n ? T(k + 1) : "";
        const nextP = k + 1 < n ? P(k + 1) : "";
        if(P(k) === "ADJ" && !inPP.has(k) && nextW !== "的" && nextP !== "NOUN" && nextP !== "CLF") root = k;
      }
    }
    let nominal = false;
    if(root === null){
      for(let k = n - 1; k >= start && root === null; k--){
        if(inP(k, "NOUN", "TIME", "NUM", "PRON", "PROPN", "CLF", "ADJ", "VERB", "AUX") && !inPP.has(k)) root = k;
      }
      root ??= start;
      nominal = true;
    }

    for(const m of marks) set(m, "mark", root);

    // Vị ngữ danh từ (那个杯子18块钱, 她今年四岁): số, lượng từ, chỉ thị và định
    // ngữ có 的 đứng liền trước thuộc về chính vị ngữ, không phải chủ ngữ.
    let preEnd = root;
    if(nominal){
      while(preEnd - 1 >= start){
        const pw = T(preEnd - 1);
        const pp = P(preEnd - 1);
        if(pp !== "NUM" && pp !== "CLF" && !HS_DEM.has(pw) && pw !== "的") break;
        preEnd--;
        // 我的杯子: gặp 的 thì lấy luôn cụm danh từ sở hữu đứng trước nó
        if(pw === "的"){
          while(preEnd - 1 >= start && inP(preEnd - 1, "PRON", "PROPN", "NOUN")) preEnd--;
        }
      }
      if(preEnd < root) hs_np(W, ix, preEnd, root + 1, -1, "pred");
    }

    // ---- trước vị ngữ ----
    let hasSubj = false;
    for(let k = start; k < preEnd;){
      const p = P(k);
      const w = T(k);
      if(p === "ADP" && !V(k)){
        set(k, "adv", root);
        let j = k + 1;
        while(j < preEnd && (inPP.get(j) ?? -1) === k) j++;
        if(j > k + 1) hs_np(W, ix, k + 1, j, k, "pobj");
        k = j;
        continue;
      }
      if(p === "AUX" || V(k) && k < root){
        set(k, p === "AUX" ? "aux" : "adv", root);
        k++;
        continue;
      }
      // 这么简单的题: phó từ mức độ + tính từ + 的 mở đầu một cụm danh từ, không
      // phải trạng ngữ của vị ngữ.
      if(HS_HOW.has(w) && k + 1 < n && inP(k + 1, "VERB", "AUX", "ADV")){
        set(k, "adv", root);   // 不知道怎么拒绝她: 怎么 bổ nghĩa cho động từ
        k++;
        continue;
      }
      const degNp = hs_deg_attr(P, T, k, preEnd);
      if(!degNp && (p === "ADV" || p === "TIME" || HS_DEG.has(w))){
        set(k, "adv", root);
        k++;
        continue;
      }
      if(p === "SCONJ" || p === "CCONJ" || p === "INTJ"){
        set(k, "mark", root);
        k++;
        continue;
      }
      if(p === "PART"){
        set(k, HS_ASP.has(w) ? "asp" : "de", k > start ? k - 1 : root);
        k++;
        continue;
      }
      if(hs_np_like(p, w) || p === "ADJ" || degNp){
        // Cụm chủ ngữ dừng trước từ chỉ thời gian (她 | 今年 | 四岁) và không
        // nối hai đại từ (你 | 为什么): chúng là hai thành phần riêng.
        let j = k;
        while(j < preEnd && (hs_np_like(P(j), T(j)) || P(j) === "ADJ" && j + 1 < preEnd && (T(j + 1) === "的" || P(j + 1) === "NOUN")
              || hs_deg_attr(P, T, j, preEnd))){
          if(j > k && hs_np_break(P(j - 1), P(j), j + 1 < n ? T(j + 1) : "", T(j), T(j - 1))) break;
          j++;
        }
        if(j === k){
          set(k, "adv", root);   // tính từ đứng trước động từ: 好好学习
          k++;
          continue;
        }
        // Cụm có trung tâm là 后, 以前… (40分钟后) chỉ thời gian: trạng ngữ, không phải chủ ngữ.
        const hw = W[ix[hs_np_head(W, ix, k, j)]].w;
        // 十二点吃饭, 下个星期见: số / chỉ thị + đơn vị thời gian cũng là trạng ngữ
        const when = HS_WHEN.has(hw) || HS_TUNIT.has(hw) && j - k > 1;
        hs_np(W, ix, k, j, root, hasSubj || when ? "adv" : "subj");
        hasSubj = hasSubj || !when;
        k = j;
        continue;
      }
      set(k, "adv", root);
      k++;
    }

    hs_pre_nps(W, ix, start, preEnd, root);

    // ---- vế chỉ có cụm giới từ: 对我来说, 在北京 (vế sau mới có vị ngữ) ----
    if(P(root) === "ADP"){
      let j = root + 1;
      while(j < n && hs_np_like(P(j), T(j))) j++;
      if(j > root + 1) hs_np(W, ix, root + 1, j, root, "pobj");
      for(; j < n; j++) set(j, P(j) === "PART" ? "de" : "adv", root);
      return ix[root];
    }

    // ---- sau vị ngữ ----
    let cur  = root;         // động từ đang mở (vị ngữ, hay động từ nối tiếp gần nhất)
    let objs = 0;
    let iobj = false;
    for(let k = root + 1; k < n;){
      const p    = P(k);
      const w    = T(k);
      const isLast = k === n - 1;

      if(HS_SFP.has(w) || (isLast && (w === "的" || w === "了" && k - 1 !== cur))){
        set(k, w === "的" ? "de" : "sfp", root);
        k++;
        continue;
      }
      // 他没来因为他病了, 是因为东西便宜: liên từ giữa vế (không có dấu phẩy) mở
      // một vế mới. Vế sau 是 là tân ngữ của 是; liên từ phụ (因为, 如果) làm
      // trạng ngữ; liên từ khác (所以, 但是) nối ngang hàng.
      if((p === "SCONJ" || p === "CCONJ") && !HS_COORD.has(w) && k + 1 < n && hs_any_pred(P, T, k + 1, n)){
        const sub = hs_clause(W, ix.slice(k));
        if(sub !== null){
          W[sub].func = T(cur) === "是" && k === cur + 1 ? "vcomp" : (HS_SUB.has(w) ? "adv" : "conj");
          W[sub].head = ix[cur];
        }
        break;
      }
      // 认识你我也很高兴, 一喝酒就脸红: sau tân ngữ (hay sau 就 / 才) mà gặp một
      // cụm danh từ có vị ngữ riêng theo sau thì đó là một vế mới.
      if((p === "PRON" || p === "PROPN" || p === "NOUN")
         && (objs > 0 || k > cur + 1 && ["就", "才", "也", "都"].includes(T(k - 1)))){
        let j = k + 1;
        while(j < n && hs_np_like(P(j), T(j))) j++;
        let a = j;
        while(a < n && (P(a) === "ADV" || HS_DEG.has(T(a)) || P(a) === "AUX")) a++;
        if(a < n && inP(a, "ADJ", "VERB") && !(HS_DIR.has(T(a)) && hs_only_particles(T, a + 1, n))){
          let s = k;
          while(s - 1 > cur && P(s - 1) === "ADV" && W[ix[s - 1]].head === ix[cur]) s--;
          const sub = hs_clause(W, ix.slice(s));
          if(sub !== null){
            W[sub].func = "conj";
            W[sub].head = ix[cur];
          }
          break;
        }
      }
      if(w === "的" && k === cur + 1){
        set(k, "de", cur);   // 难的, 新的: tính từ + 的 là "cái …"
        k++;
        continue;
      }
      if(HS_ASP.has(w)){
        set(k, "asp", cur);
        k++;
        continue;
      }
      if(w === "得"){
        // 说得很好: 得 nối động từ với bổ ngữ trình độ.
        set(k, "de", cur);
        let j = k + 1;
        const advs = [];
        while(j < n && (P(j) === "ADV" || HS_DEG.has(T(j)))) advs.push(j++);
        // Sau 得 là cả một vế (连睡觉的时间都没有, 他笑得说不出话): phân tích
        // riêng, vị ngữ của nó làm bổ ngữ.
        let long = j < n && P(j) === "VERB" && !hs_only_particles(T, j + 1, n);   // 感动得流下了眼泪
        for(let a = j + 1; a < n; a++) long = long || inP(a, "VERB", "ADJ") && !HS_SFP.has(T(a));
        if(long && !(P(j) === "ADJ" && hs_only_particles(T, j + 1, n))){
          const sub = hs_clause(W, ix.slice(k + 1));
          if(sub !== null){
            W[sub].func = "comp";
            W[sub].head = ix[cur];
          }
          break;
        }
        if(j < n){
          set(j, "comp", cur);
          for(const a of advs) set(a, "adv", j);
          k = j + 1;
        }
        else {
          k = j;
        }
        continue;
      }
      if(HS_QTY.has(w) && !(k + 1 < n && P(k + 1) === "NOUN")){
        set(k, "comp", cur);
        k++;
        continue;
      }
      if(k === cur + 1 && HS_POSTP.has(w) && P(cur) === "VERB" && !HS_CAUS.has(T(cur))
         && k + 1 < n && hs_np_like(P(k + 1), T(k + 1))){
        // 扔给我, 走到门口: 给 / 到 dù từ điển ghi là động từ, đứng ngay sau
        // động từ và trước cụm danh từ thì là giới từ làm bổ ngữ. Còn động từ
        // phía sau (忘记给妈妈打电话) thì cụm đó là trạng ngữ của động từ ấy.
        let j = k + 1;
        while(j < n && hs_np_like(P(j), T(j))) j++;
        const later = w === "给" && j < n && P(j) === "VERB" && !HS_DIR.has(T(j));
        set(k, later ? "adv" : "comp", later ? j : cur);
        hs_np(W, ix, k + 1, j, k, "pobj");
        k = j;
        continue;
      }
      if(k === cur + 2 && T(cur + 1) === "了" && HS_DIR.has(w) && clen(w) > 1 && P(cur) === "VERB"){
        set(k, "comp", cur);   // 跳了起来, 走了进来
        k++;
        continue;
      }
      if(k === cur + 1 && P(cur) === "VERB" && objs === 0 && !HS_CAUS.has(T(cur))
         && (HS_RES.has(w) || HS_DIR.has(w) || HS_DIR1.has(w) && clen(T(cur)) === 1)){
        set(k, "comp", cur);   // 听懂, 看见, 走进来
        k++;
        continue;
      }
      if(p === "ADJ" && objs > 0 && k + 1 < n && P(k + 1) === "VERB"){
        set(k, "adv", k + 1);   // 让他多休息, 建议我多喝水: 多 bổ nghĩa cho động từ sau
        k++;
        continue;
      }
      if(w === "多" && k + 1 < n && P(k + 1) === "ADJ"){
        set(k, "adv", k + 1);   // 有多远, 多大: "bao nhiêu" bổ nghĩa cho tính từ sau
        k++;
        continue;
      }
      if(k === cur + 1 && p === "ADJ" && P(cur) === "VERB" && objs === 0
         && !(k + 1 < n && (T(k + 1) === "的" || inP(k + 1, "NOUN", "PROPN")))){
        set(k, "comp", cur);   // 说慢, 来晚, 做好, 洗干净 (không phải 买新衣服)
        k++;
        continue;
      }
      if((w === "来" || w === "去") && objs > 0 && k === n - 1){
        set(k, "comp", cur);   // 带一本书来
        k++;
        continue;
      }
      if(p === "ADP" && !V(k) && (!HS_POSTP.has(w) || k !== cur + 1 || HS_CAUS.has(T(cur)))){
        // 请把门关上, 用剪刀把纸剪开, 请往这边走: giới từ không bám ngay sau
        // động từ (hay bám sau 请 / 让) mà phía sau còn động từ thì cụm của nó
        // là trạng ngữ cho động từ đó.
        let j = k + 1;
        while(j < n && hs_np_like(P(j), T(j))) j++;
        let v = j;
        while(v < n && (inP(v, "ADV", "AUX") || P(v) === "ADP")){
          if(P(v) === "ADP"){   // cụm giới từ khác chen giữa: 用剪刀[把纸]剪开
            v++;
            while(v < n && hs_np_like(P(v), T(v)) && !V(v)) v++;
            continue;
          }
          v++;
        }
        if(v < n && (P(v) === "VERB" || V(v))){
          set(k, "adv", v);
          if(j > k + 1) hs_np(W, ix, k + 1, j, k, "pobj");
          for(let a = j; a < v;){
            if(P(a) === "ADP"){   // cụm giới từ khác chen giữa: [把纸]
              set(a, "adv", v);
              let e = a + 1;
              while(e < v && hs_np_like(P(e), T(e))) e++;
              if(e > a + 1) hs_np(W, ix, a + 1, e, a, "pobj");
              a = e;
              continue;
            }
            set(a, P(a) === "AUX" ? "aux" : "adv", v);
            a++;
          }
          k = v;
          continue;
        }
      }
      if(p === "ADP" && !V(k)){
        // 住在北京, 送给他: giới từ sau động từ là bổ ngữ, tân ngữ của nó là pobj.
        set(k, "comp", cur);
        let j = k + 1;
        while(j < n && hs_np_like(P(j), T(j))) j++;
        if(j > k + 1) hs_np(W, ix, k + 1, j, k, "pobj");
        k = j;
        continue;
      }
      if(HS_CLV.has(T(cur)) && objs === 0 && p !== "ADJ" && p !== "VERB" && hs_has_pred(P, T, k, n)){
        // 我觉得他很好: phần sau là cả một mệnh đề làm tân ngữ.
        const sub = hs_clause(W, ix.slice(k));
        if(sub !== null){
          W[sub].func = "vcomp";
          W[sub].head = ix[cur];
        }
        break;
      }
      if(p === "AUX"){
        let j = k + 1;
        while(j < n && P(j) === "ADV") j++;
        if(j < n && V(j) || j < n && P(j) === "VERB"){
          for(let a = k; a < j; a++) set(a, a === k ? "aux" : "adv", j);
          set(j, "vcomp", cur);
          cur  = j;
          objs = 0;
          k    = j + 1;
          continue;
        }
      }
      const resV = k === cur + 1 && clen(T(cur)) > 1 && HS_RES_DIR1.has(last(T(cur)));
      if(w === T(cur) && k - 1 > cur && (T(k - 1) === "了" || T(k - 1) === "一")){
        set(k, "comp", cur);   // 指了指, 看了看, 想一想: động từ lặp lại là bổ ngữ động lượng
        k++;
        continue;
      }
      if(p === "VERB" && objs === 0 && P(cur) === "VERB" && hs_only_particles(T, k + 1, n) && !HS_DIR.has(w)
         && (resV || k - 1 > cur && W[ix[k - 1]].func === "comp" && W[ix[k - 1]].head === ix[cur]
             || k - 1 === cur + 1 && HS_ASP.has(T(k - 1)))){
        // 找 到 工作 了 / 找到 工作 了, 学会 开车: sau bổ ngữ kết quả (tách rời hay
        // viết liền trong động từ) mà phía sau chỉ còn trợ từ thì từ này là tân
        // ngữ, dù từ điển ghi là động từ.
        setPos(k, "NOUN");
        set(k, "obj", cur);
        objs++;
        k++;
        continue;
      }
      // 谈一下工作的事: động từ + 的 + danh từ sau vị ngữ là một cụm tân ngữ
      if(p === "VERB" && k + 2 < n && T(k + 1) === "的" && hs_np_like(P(k + 2), T(k + 2))){
        let e = k + 2;
        while(e < n && hs_np_like(P(e), T(e)) && !(T(e) === "的" && e === n - 1)) e++;
        hs_np(W, ix, k + 2, e, cur, objs > 0 ? "comp" : "obj");
        set(k, "attr", hs_np_head(W, ix, k + 2, e));
        set(k + 1, "de", k);
        objs++;
        k = e;
        continue;
      }
      // 读书和研究技术: động từ sau từ nối là vế ngang hàng với động từ trước
      if((p === "VERB" || V(k)) && k - 1 > root && HS_COORD.has(T(k - 1))){
        set(k - 1, "mark", k);
        set(k, "conj", cur);
        cur  = k;
        objs = 0;
        k++;
        continue;
      }
      let jiu = false;
      for(let a = cur + 1; a < k; a++) jiu = jiu || T(a) === "就" || T(a) === "才";
      if((p === "VERB" || V(k)) && jiu && objs > 0){
        set(k, "conj", cur);   // 一到家就[给你]打电话
        for(let a = cur + 1; a < k; a++){
          const t = W[ix[a]];
          if(t.head === ix[cur] && (t.func === "adv" || t.func === "aux")) t.head = ix[k];
        }
        cur  = k;
        objs = 0;
        k++;
        continue;
      }
      if(p === "VERB" || V(k)){
        set(k, "vcomp", cur);   // 去商店买东西, 喜欢听音乐
        cur  = k;
        objs = 0;
        k++;
        continue;
      }
      if(p === "ADV" || HS_DEG.has(w)){
        // phó từ trước một tính từ / động từ phía sau
        let j = k + 1;
        while(j < n && (P(j) === "ADV" || HS_DEG.has(T(j)))) j++;
        const headK = j < n && inP(j, "ADJ", "VERB") ? j : cur;
        for(let a = k; a < j; a++) set(a, "adv", headK);
        k = j;
        continue;
      }
      if(p === "TIME" && k + 1 < n && (P(k + 1) === "VERB" || V(k + 1))){
        set(k, "adv", k + 1);   // 准备明年去北京: 明年 bổ nghĩa cho 去
        k++;
        continue;
      }
      if(HS_HOW.has(w) && k + 1 < n && P(k + 1) === "VERB"){
        set(k, "adv", k + 1);   // 打算如何做
        k++;
        continue;
      }
      if(hs_np_like(p, w) || p === "ADJ" && k + 1 < n && (T(k + 1) === "的" || hs_np_like(P(k + 1), T(k + 1)))){
        // "一点 ở giữa tính từ và 的" (大一点的) vẫn thuộc cụm
        const adjYidian = j => T(j) === "一点" && j > k && P(j - 1) === "ADJ" && j + 1 < n && T(j + 1) === "的";
        let j = k;
        while(j < n && (hs_np_like(P(j), T(j)) || P(j) === "ADJ" && j + 1 < n && (T(j + 1) === "的" || hs_np_like(P(j + 1), T(j + 1)))
              || P(j) === "ADJ" && j + 2 < n && T(j + 1) === "一点" && T(j + 2) === "的"
              || adjYidian(j)
              || j > k && hs_deg_attr(P, T, j, n))
              && !(HS_QTY.has(T(j)) && !adjYidian(j) && !(j + 1 < n && P(j + 1) === "NOUN"))
              && !(T(j) === "的" && j === n - 1 && !(j > k && (P(j - 1) === "ADJ" || T(j - 1) === "一点")))){
          if(j > k && hs_np_break(P(j - 1), P(j), j + 1 < n ? T(j + 1) : "", T(j), T(j - 1))
             && !(T(j) === "一点" && P(j - 1) === "ADJ") && T(j) !== "的"){
            break;
          }
          j++;
        }
        if(j === k) j = k + 1;
        // cụm không kết thúc bằng từ nối: 读书和[研究技术] — 和 nối hai cụm động từ
        while(j - 1 > k && HS_COORD.has(T(j - 1))) j--;
        // 这是我自己选择的路: [cụm danh từ + động từ] 的 [danh từ] là một cụm
        if(j + 2 < n && P(j) === "VERB" && T(j + 1) === "的" && hs_np_like(P(j + 2), T(j + 2))){
          let e = j + 2;
          while(e < n && hs_np_like(P(e), T(e)) && !(T(e) === "的" && e === n - 1)) e++;
          const r1 = hs_clause(W, ix.slice(k, j + 1));
          hs_np(W, ix, j + 2, e, cur, objs > 0 ? "comp" : "obj");
          W[r1].func = "attr";
          W[r1].head = ix[hs_np_head(W, ix, j + 2, e)];
          set(j + 1, "de", j);
          objs++;
          k = e;
          continue;
        }
        const ditrans = objs === 0 && HS_DITR.has(T(cur)) && hs_has_np(P, T, j, n);
        // Cụm thứ hai sau động từ không phải loại hai tân ngữ là bổ ngữ
        // thời lượng / số lần: 等我五分钟, 读一遍.
        // Sau tính từ thường là bổ ngữ (累一点); riêng đại từ chỉ người là tân
        // ngữ: tính từ dùng như động từ (麻烦别人, 随便你).
        const hd = hs_np_head(W, ix, k, j);
        const adjObj = P(cur) === "ADJ" && inP(hd, "PRON", "PROPN") && !HS_HOW.has(T(hd));
        // 排了半个小时, 等了三天: số + đơn vị thời lượng là bổ ngữ thời lượng
        const dur = ["小时", "分钟", "天", "年", "星期", "个月", "秒", "会儿"].includes(T(hd)) && hd > k
                    && (P(k) === "NUM" || T(k) === "半" || T(k) === "几" || numStart(T(k)));
        const func = ditrans ? "iobj" : (adjObj ? "obj" : (dur || P(cur) === "ADJ" || objs > 0 && !iobj ? "comp" : "obj"));
        hs_np(W, ix, k, j, cur, func);
        iobj = ditrans;
        objs++;
        k = j;
        continue;
      }
      if(p === "ADJ"){
        // 又聪明又漂亮: tính từ sau vị ngữ tính từ là vế ngang hàng;
        // 让我很痛苦: sau 让 + tân ngữ, tính từ là vị ngữ của kiêm ngữ.
        set(k, P(cur) === "ADJ" ? "conj" : (HS_CAUS.has(T(cur)) && objs > 0 ? "vcomp" : "comp"), cur);
        k++;
        continue;
      }
      if(p === "SCONJ" || p === "CCONJ" || p === "INTJ"){
        set(k, "mark", cur);
        k++;
        continue;
      }
      set(k, "adv", cur);
      k++;
    }
    return ix[root];
  }

  /**
   * Vế có phải chỉ là một cụm danh từ không, và là loại nào:
   *   'voc'   lời gọi: một hai từ chỉ người (老兄, 李小姐, 医生);
   *   'topic' chủ đề: cụm danh từ có định ngữ / số (这么多菜, 这么简单的题, 82304155);
   *   ''      vế thường, kể cả vị ngữ danh từ đủ thành phần (今天几号, 她今年二十岁)
   *           và câu hỏi tỉnh lược (你呢？).
   */
  function hs_nominal_kind(W, ix, r){
    if(ix.every(i => W[i].pos === "INTJ") || ix.length === 1 && W[ix[0]].pos === "ADJ"){
      return "voc";   // 喂，… / 糟糕，我忘了: thán từ, tính từ cảm thán đứng riêng
    }
    const timeOnly = ix.every(i => ["TIME", "NUM", "CLF"].includes(W[i].pos) || W[i].w === "点");
    if(timeOnly && ix.length > 1) return "topic";   // 下午三点，好吗: cụm thời gian là cái được bàn tới
    if(!["NOUN", "PRON", "PROPN", "NUM", "CLF"].includes(W[r].pos)) return "";
    if(ix.length <= 2 && ix.every(i => ["NOUN", "PROPN", "PRON"].includes(W[i].pos))){
      return "voc";   // 李小姐, 老兄: kiểm tra trước, vì 李 bị gán làm chủ ngữ của 小姐
    }
    for(const i of ix){
      const t = W[i];
      if(HS_SFP.has(t.w) || ["VERB", "AUX", "SCONJ", "CCONJ", "ADP"].includes(t.pos)) return "";
      // một danh từ / thời gian khác làm chủ ngữ hay trạng ngữ: vị ngữ danh từ đủ câu
      if(i !== r && t.head === r && (t.func === "subj" || t.func === "adv")
         && ["NOUN", "PRON", "PROPN", "TIME", "NUM"].includes(t.pos)){
        return "";
      }
    }
    return "topic";
  }

  /**
   * Soát lại các cụm danh từ đứng trước vị ngữ sau lượt gán nhãn tuần tự, khi đã
   * thấy được cả dãy:
   *   和朋友一起开车 / 这和你有关: 和, 跟 trước cụm danh từ mà sau cụm chỉ còn phó
   *     từ là giới từ "cùng, với" — trạng ngữ, không phải nối hai chủ ngữ;
   *   因为你我才成功: 因为 + cụm danh từ + chủ ngữ khác thì 因为 là giới từ "vì";
   *   他一句话也没说: cụm mở đầu bằng số đứng trước 也 / 都 là tân ngữ đảo lên;
   *     các cụm mở đầu bằng số khác (两个人一起, 一个人来) giữ làm trạng ngữ;
   *   这件事我来做, 你的生日我不会忘的: hai cụm liền nhau mà cụm đầu không phải
   *     đại từ thì cụm đầu là chủ đề (主题), cụm sau là chủ ngữ;
   *   我明年大学毕业: đại từ làm chủ ngữ rồi mới tới danh từ thì danh từ đó là
   *     tân ngữ đưa lên trước động từ.
   * F() đọc nhãn chức vụ như lúc vào hàm: bước sau không thấy nhãn bước trước
   * vừa gán (cách bộ luật vẫn chạy từ trước tới nay); đổi thì kết quả đổi theo.
   */
  function hs_pre_nps(W, ix, start, end, root){
    const P   = k => W[ix[k]].pos;
    const T   = k => W[ix[k]].w;
    const F0  = ix.map(i => W[i].func);
    const F   = k => F0[k];
    const set = (k, func, headK) => {
      W[ix[k]].func = func;
      W[ix[k]].head = headK < 0 ? -1 : ix[headK];
    };
    const light = k => ["ADV", "AUX", "TIME"].includes(P(k)) || HS_DEG.has(T(k)) || T(k) === "一起" || T(k) === "是";

    // 和 / 跟 làm giới từ
    for(let m = start + 1; m < end; m++){
      if(!["和", "跟", "同", "与"].includes(T(m))) continue;
      let j = m + 1;
      while(j < end && hs_np_like(P(j), T(j)) && !HS_COORD.has(T(j))) j++;
      if(j === m + 1) continue;
      let ok = true;
      for(let a = j; a < end; a++) ok = ok && light(a);
      if(ok){
        set(m, "adv", root);
        hs_np(W, ix, m + 1, j, m, "pobj");
      }
    }

    // Đầu các cụm danh từ gắn thẳng vào vị ngữ, kèm chỗ bắt đầu của cụm.
    let nps = [];
    for(let k = start; k < end; k++){
      if(W[ix[k]].head !== ix[root] || (F(k) !== "subj" && F(k) !== "adv")
         || !["NOUN", "PRON", "PROPN"].includes(P(k))
         || HS_WHEN.has(T(k)) || HS_HOW.has(T(k))){
        continue;
      }
      let s = k;
      while(s - 1 >= start && (["det", "attr", "de"].includes(F(s - 1)) || W[ix[s - 1]].head === ix[k])) s--;
      nps.push([s, k]);
    }

    // 因为 + cụm danh từ, rồi còn chủ ngữ khác
    if(nps.length >= 2 && nps[0][0] - 1 >= 0 && ["因为", "由于"].includes(T(nps[0][0] - 1))){
      set(nps[0][0] - 1, "adv", root);
      set(nps[0][1], "pobj", nps[0][0] - 1);
      nps.shift();
      set(nps[0][1], "subj", root);
    }

    // Cụm mở đầu bằng số
    const rest = [];
    nps.forEach(([s, h], i) => {
      const num = i > 0 && (P(s) === "NUM" || numStart(T(s)));
      if(!num){
        rest.push([s, h]);
        return;
      }
      const next = h + 1 < end ? T(h + 1) : "";
      set(h, next === "也" || next === "都" ? "obj" : "adv", root);
    });

    // 明天是星期四: câu 是 chưa có chủ ngữ thì từ chỉ thời gian đứng trước là chủ ngữ
    if(T(root) === "是"){
      let hasS = false, time = null;
      for(let k = start; k < end; k++){
        hasS = hasS || (F(k) === "subj" && W[ix[k]].head === ix[root]);
        if(P(k) === "TIME" && F(k) === "adv" && W[ix[k]].head === ix[root]) time = k;
      }
      if(!hasS && time !== null) set(time, "subj", root);
    }

    if(rest.length >= 2){
      const h1 = rest[0][1], h2 = rest[1][1];
      if(P(h1) !== "PRON"){
        set(h1, "topic", root);
        set(h2, "subj", root);
      }
      else if(P(h2) === "NOUN"){
        set(h1, "subj", root);
        set(h2, "obj", root);
      }
    }
  }

  /** Từ vị trí from tới hết vế chỉ còn trợ từ động thái / ngữ khí (了, 吗, 呢…) hay không còn gì. */
  function hs_only_particles(T, from, n){
    for(let j = from; j < n; j++){
      if(!HS_ASP.has(T(j)) && !HS_SFP.has(T(j))) return false;
    }
    return true;
  }

  /** Phó từ mức độ giữa cụm danh từ, trước tính từ + 的: 我<最>好的朋友, 一个<很>重要的问题. */
  function hs_deg_attr(P, T, j, end){
    return (P(j) === "ADV" || HS_DEG.has(T(j))) && j + 2 < end && P(j + 1) === "ADJ" && T(j + 2) === "的";
  }

  /** Hai token liền nhau trước vị ngữ không cùng một cụm danh từ. */
  function hs_np_break(prevPos, pos, nextW, w = "", prevW = ""){
    if(w === "自己") return false;   // 我自己, 你们自己: đồng vị, cùng một cụm
    if(pos === "TIME" && nextW !== "的") return true;
    if(prevPos === "PRON" && (pos === "PRON" || pos === "TIME" || pos === "NUM")) return true;
    if((prevPos === "NOUN" || prevPos === "PROPN") && pos === "NUM" && prevW !== "年" && prevW !== "月"){
      return true;   // 房间里 | 一个人 (nhưng 2014年5月11号 là một cụm ngày tháng)
    }
    if(prevPos === "TIME" && (pos === "PRON" || pos === "PROPN")) return true;   // 直到现在 | 我
    return (prevPos === "NOUN" || prevPos === "PROPN") && pos === "PRON" && !HS_DEM.has(w);
  }

  function hs_np_like(pos, w){
    return HS_NP.has(pos) || w === "的" || HS_DEM.has(w) || (pos === "CCONJ" && HS_COORD.has(w));
  }

  function hs_has_pred(P, T, from, n){
    for(let j = from; j < n; j++){
      if(["VERB", "ADJ", "AUX"].includes(P(j)) || HS_DEG.has(T(j))){
        return j > from || HS_DEG.has(T(j)) || P(j) === "ADJ";
      }
    }
    return false;
  }

  /** Từ from trở đi có động từ / tính từ / trợ động từ nào không (tính cả chính from). */
  function hs_any_pred(P, T, from, n){
    for(let j = from; j < n; j++){
      if(["VERB", "ADJ", "AUX"].includes(P(j)) || HS_DEG.has(T(j))) return true;
    }
    return false;
  }

  function hs_has_np(P, T, from, n){
    for(let j = from; j < n; j++){
      if(["NOUN", "PROPN", "NUM", "CLF", "PRON"].includes(P(j)) || HS_DEM.has(T(j))) return true;
      if(P(j) !== "ADJ" && P(j) !== "PART") return false;
    }
    return false;
  }

  /**
   * Cụm danh từ ix[a .. b): trung tâm là danh từ / đại từ cuối cùng; "和" nối
   * các vế ngang hàng; chỉ thị, số, lượng từ là hạn định; còn lại là định ngữ.
   */
  function hs_np(W, ix, a, b, headK, func){
    const set = (k, f, h) => {
      W[ix[k]].func = f;
      W[ix[k]].head = h < 0 ? -1 : ix[h];
    };
    // vế ngang hàng: 我和你, 爸爸跟妈妈, 爸爸、妈妈 (dấu 、 đánh dấu ở token sau nó)
    const parts = [];
    let s = a;
    for(let k = a; k < b; k++){
      if(W[ix[k]].enum && k > s){
        parts.push([s, k]);
        s = k;
      }
      if(HS_COORD.has(W[ix[k]].w) && k > a && k < b - 1){
        parts.push([s, k]);
        parts.push([k, k + 1]);   // chính từ nối
        s = k + 1;
      }
    }
    parts.push([s, b]);
    const isLink = ([x, y]) => y - x === 1 && HS_COORD.has(W[ix[x]].w) && parts.length > 1;
    const heads = [];
    for(const pt of parts) if(!isLink(pt)) heads.push(hs_np_head(W, ix, pt[0], pt[1]));
    const firstH = heads[0];
    parts.forEach(([x, y], pi) => {
      if(isLink([x, y])){
        // từ nối gắn vào đầu của vế đứng sau nó (一个电脑和一本书: 和 → 书)
        const nx = parts[pi + 1];
        set(x, "mark", nx ? hs_np_head(W, ix, nx[0], nx[1]) : firstH);
        return;
      }
      const h = hs_np_head(W, ix, x, y);
      if(h === firstH) set(h, func, headK);
      else set(h, "conj", firstH);
      for(let k = x; k < y; k++){
        if(k === h) continue;
        const w = W[ix[k]].w;
        const p = W[ix[k]].pos;
        if(w === "的"){
          set(k, "de", k > x ? k - 1 : h);
        }
        else if(HS_DEM.has(w) || p === "NUM" || p === "CLF"
                || (w === "上" || w === "下") && k + 1 < y && W[ix[k + 1]].w === "个"){
          set(k, "det", h);   // 下个星期, 上个月: 上 / 下 là từ hạn định
        }
        else if(p === "ADV" || HS_DEG.has(w)){
          set(k, "adv", k + 1 < y ? k + 1 : h);
        }
        else {
          set(k, "attr", h);
        }
      }
    });
  }

  function hs_np_head(W, ix, a, b){
    if(b - 1 > a && (W[ix[b - 1]].w === "号" || W[ix[b - 1]].w === "日")){
      return b - 1;   // 9月2号, 2014年5月11号: ngày tháng lấy ngày làm đầu
    }
    for(let k = b - 1; k >= a; k--){
      if(["NOUN", "PRON", "PROPN", "TIME"].includes(W[ix[k]].pos) && W[ix[k]].w !== "的") return k;
    }
    for(let k = b - 1; k >= a; k--){
      if(W[ix[k]].pos === "CLF") return k;   // 好几口, 三次: không có danh từ thì lượng từ làm đầu
    }
    for(let k = b - 1; k >= a; k--){
      if(W[ix[k]].pos === "ADJ") return k;   // 大一点的: cụm không có danh từ thì tính từ làm đầu
    }
    for(let k = b - 1; k >= a; k--){
      if(W[ix[k]].w !== "的") return k;
    }
    return a;
  }

  /** Khung câu gọn cho chip: "S 想 喝 O", "S 很 好", "S 是 O". */
  function hs_pattern(W, root = null){
    // root cho sẵn thì dựng khung quanh từ đó (trang động từ: khung của chính
    // động từ đang học, dù nó không phải vị ngữ của cả câu).
    if(root === null){
      const i = W.findIndex(t => t.head === -1);
      if(i >= 0) root = i;
    }
    if(root === null) return "";
    const lab = {topic: "T", subj: "S", obj: "O", iobj: "O₁", comp: "C", vcomp: "V₂"};
    const out = [];
    W.forEach((t, i) => {
      if(i === root || (t.head === root && t.func === "aux")){
        out.push(t.w);
      }
      else if(t.head === root && lab[t.func]){
        if(!out.length || out[out.length - 1] !== lab[t.func]) out.push(lab[t.func]);
      }
    });
    return out.join(" ");
  }

  const HanyuSyntax = {hs_pos_table, hs_parse, hs_pattern};
  root.HanyuSyntax = HanyuSyntax;
  if(typeof module === "object" && module.exports) module.exports = HanyuSyntax;
})(typeof globalThis !== "undefined" ? globalThis : this);
