// DSH chat webview 前端（纯 JS，无依赖）
// Claude Code 式交互：/ 斜杠命令菜单、@ 文件引用菜单、Shift+Tab 权限模式、专注视图
(function () {
  "use strict";

  const vscode = acquireVsCodeApi();

  const state = {
    sessionId: "",
    title: "",
    messages: [],
    blocks: [],
    running: false,
    runStartedAt: 0,
    folder: "",
    folderName: "",
    usage: null, // {input, output, cacheRead, reasoning, model, provider, effort}
    selection: null,
    effort: "",
    skills: [],
    permissionMode: "workspace-write",
    permissionShort: "询问",
    permissionLabel: "默认 · 询问",
    focusView: false,
    useCtrlEnterToSend: false,
    slashCommands: [],
    lastToolName: "",
  };

  const live = {
    turn: 0,
    reasoning: new Map(), // 块索引 → 思考文本
    texts: new Map(), // 块索引 → 文本草稿
    tools: new Map(), // callId → {name,args,status,result,isError}
    order: [], // 展示顺序：["reasoning","text","tool:<callId>"]
  };

  const els = {
    messages: document.getElementById("messages"),
    input: document.getElementById("input"),
    send: document.getElementById("btn-send"),
    cancel: document.getElementById("btn-cancel"),
    status: document.getElementById("status"),
    sessionTitle: document.getElementById("session-title"),
    sessionId: document.getElementById("session-id"),
    brandLogo: document.getElementById("brand-logo"),
    contextBar: document.getElementById("context-bar"),
    usageBar: document.getElementById("usage-bar"),
    btnNew: document.getElementById("btn-new"),
    btnSessions: document.getElementById("btn-sessions"),
    btnAttach: document.getElementById("btn-attach"),
    btnFile: document.getElementById("btn-file"),
    btnSlash: document.getElementById("btn-slash"),
    btnFocus: document.getElementById("btn-focus"),
    permChip: document.getElementById("perm-chip"),
  };

  let elapsedTimer = null;
  let typingEl = null;
  let menu = null; // {type:'slash'|'mention', items:[], index, onPick}
  let fileQueryTimer = null;

  function post(message) {
    vscode.postMessage(message);
  }

  // Markdown 渲染与文件引用链接化见 markdown.js（DSHMarkdown）

  // ---------------- 渲染 ----------------

  // 贴底滚动：用户滚上去看历史时不再被新进度拽回底部（Claude Code 式体验）
  let stickToBottom = true;
  let jumpBtn = null;

  function isNearBottom() {
    const el = els.messages;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function scrollToBottom(force) {
    if (!force && !stickToBottom) return;
    els.messages.scrollTop = els.messages.scrollHeight;
    stickToBottom = true;
    updateJumpButton();
  }

  function updateJumpButton() {
    const show = !stickToBottom;
    if (show && !jumpBtn) {
      jumpBtn = document.createElement("button");
      jumpBtn.className = "jump-btn";
      jumpBtn.textContent = "⬇ 最新";
      jumpBtn.title = "回到底部（有新内容时点击）";
      jumpBtn.addEventListener("click", () => {
        stickToBottom = true;
        scrollToBottom(true);
      });
      document.body.appendChild(jumpBtn);
    } else if (!show && jumpBtn) {
      jumpBtn.remove();
      jumpBtn = null;
    }
  }

  function render() {
    els.messages.innerHTML = "";
    if (state.messages.length === 0) {
      els.messages.appendChild(renderWelcome());
    } else {
      for (const m of state.messages) {
        els.messages.appendChild(renderMessage(m));
      }
    }
    // 运行中尊重用户滚动位置；结束/加载历史时直接看最新
    scrollToBottom(!state.running);
  }

  /** Claude Code 式欢迎页：新对话 / 历史会话入口 + 快捷键提示（DSH Pro：背景图标用 DeepSeek 官方鲸鱼标志）。 */
  function renderWelcome() {
    const wrap = document.createElement("div");
    wrap.className = "welcome";
    const logo = document.createElement("div");
    logo.className = "welcome-logo";
    if (window.DSH_WHALE_SVG) {
      logo.innerHTML = window.DSH_WHALE_SVG;
    } else {
      logo.textContent = "🐋";
    }
    const title = document.createElement("div");
    title.className = "welcome-title";
    title.textContent = "DeepSeek Harness";
    // DSH Pro：标题下加一行小字欢迎语（Claude Code 式欢迎页）
    const tagline = document.createElement("div");
    tagline.className = "welcome-tagline";
    tagline.textContent = "欢迎使用，随时准备帮你完成项目工作";
    const sub = document.createElement("div");
    sub.className = "welcome-sub";
    sub.textContent = state.folderName
      ? "工作目录：" + state.folderName
      : "让 DeepSeek Harness 在当前项目中工作";
    const row = document.createElement("div");
    row.className = "welcome-actions";
    const btnNew = document.createElement("button");
    btnNew.className = "primary-btn";
    btnNew.textContent = "＋ 新对话";
    btnNew.addEventListener("click", () => post({ type: "newSession" }));
    const btnHist = document.createElement("button");
    btnHist.className = "ghost-btn";
    btnHist.textContent = "🕘 历史会话";
    btnHist.addEventListener("click", () => post({ type: "listSessions" }));
    row.appendChild(btnNew);
    row.appendChild(btnHist);
    const hint = document.createElement("div");
    hint.className = "welcome-hints";
    hint.innerHTML =
      "· 输入 <kbd>/</kbd> 打开命令菜单（/model、/plan、/compact…）" +
      "<br>· 输入 <kbd>@</kbd> 引用项目文件作为上下文" +
      "<br>· <kbd>Shift+Tab</kbd> 切换权限模式（询问 / 计划只读 / 放行）" +
      "<br>· <kbd>Ctrl+Escape</kbd> 聚焦输入，<kbd>Ctrl+Alt+F</kbd> 专注视图" +
      (state.useCtrlEnterToSend
        ? "<br>· <kbd>Ctrl+Enter</kbd> 发送，<kbd>Enter</kbd> 换行"
        : "<br>· <kbd>Enter</kbd> 发送，<kbd>Shift+Enter</kbd> 换行");
    wrap.appendChild(logo);
    wrap.appendChild(title);
    wrap.appendChild(tagline);
    wrap.appendChild(sub);
    wrap.appendChild(row);
    wrap.appendChild(hint);
    return wrap;
  }

  function renderMessage(m) {
    const el = document.createElement("div");
    el.className = "msg " + m.role;
    el.dataset.id = m.id;

    if (m.role === "changes") {
      return renderChangesMessage(m);
    }
    if (m.role === "user") {
      el.textContent = m.content;
      return el;
    }
    if (m.role === "system") {
      el.textContent = m.content;
      return el;
    }

    const header = document.createElement("div");
    header.className = "msg-header";
    const role = document.createElement("span");
    role.className = "msg-role";
    role.textContent = "DSH";
    const actions = document.createElement("span");
    actions.className = "msg-actions";
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "复制";
    copyBtn.dataset.act = "copy";
    const insertBtn = document.createElement("button");
    insertBtn.textContent = "插入代码";
    insertBtn.dataset.act = "insert";
    const applyBtn = document.createElement("button");
    applyBtn.textContent = "应用到文件";
    applyBtn.dataset.act = "apply";
    actions.appendChild(copyBtn);
    actions.appendChild(insertBtn);
    actions.appendChild(applyBtn);
    header.appendChild(role);
    header.appendChild(actions);

    const content = document.createElement("div");
    content.className = "msg-content";
    content.innerHTML = DSHMarkdown.renderMarkdown(m.content);
    DSHMarkdown.linkifyFileRefs(content);

    el.appendChild(header);
    el.appendChild(content);
    return el;
  }

  function fmtNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }

  // ---------------- 修改内容展示（DSH Pro） ----------------

  const CHANGE_TOOLS = new Set([
    "write", "edit", "applyCode", "apply_code", "apply_patch", "patch",
    "str_replace", "str_replace_editor", "create", "insert", "multiEdit", "rewrite", "modify",
  ]);

  function isChangeToolName(name) {
    return CHANGE_TOOLS.has(String(name || ""));
  }

  function shortPath(p) {
    const parts = String(p || "").split(/[\\/]/).filter(Boolean);
    if (parts.length > 2) return parts.slice(-2).join("/");
    return parts.join("/") || String(p || "");
  }

  /** 行级 diff（LCS），返回 [{t:'ctx'|'add'|'del'|'gap', x:文本}]。
   *  连续的未改动上下文折叠成间隔行，长 diff 截断——保证对话里可读、不刷屏。 */
  function diffLines(oldText, newText) {
    const A = oldText ? String(oldText).split("\n") : [];
    const B = newText ? String(newText).split("\n") : [];
    const MAX = 220;
    if (A.length > MAX) A.length = MAX;
    if (B.length > MAX) B.length = MAX;
    const n = A.length;
    const m = B.length;
    const dp = [];
    for (let i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const raw = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) {
        raw.push({ t: "ctx", x: A[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        raw.push({ t: "del", x: A[i] });
        i++;
      } else {
        raw.push({ t: "add", x: B[j] });
        j++;
      }
    }
    while (i < n) raw.push({ t: "del", x: A[i++] });
    while (j < m) raw.push({ t: "add", x: B[j++] });
    // 连续未改动上下文折叠为间隔行
    const out = [];
    let run = [];
    const flush = () => {
      if (run.length === 0) return;
      if (run.length <= 4) {
        out.push(...run);
      } else {
        out.push(run[0], { t: "gap", x: "⋯ 中间 " + (run.length - 2) + " 行未改动 ⋯" }, run[run.length - 1]);
      }
      run = [];
    };
    for (const l of raw) {
      if (l.t === "ctx") run.push(l);
      else {
        flush();
        out.push(l);
      }
    }
    flush();
    if (out.length > 240) {
      out.length = 240;
      out.push({ t: "gap", x: "… diff 过长已截断" });
    }
    return out;
  }

  /** 渲染一个带绿/红高亮的 diff 块（Claude Code 式）：新增行绿、删除行红、改动统计徽标。
   *  返回 {el, added, removed}。 */
  function buildDiffView(d) {
    const wrap = document.createElement("div");
    wrap.className = "diff-view";
    const lines = diffLines(d.oldText || "", d.newText || "");
    let added = 0;
    let removed = 0;
    const meta = document.createElement("div");
    meta.className = "diff-meta";
    const addChip = document.createElement("span");
    addChip.className = "diff-chip add";
    const delChip = document.createElement("span");
    delChip.className = "diff-chip del";
    const body = document.createElement("div");
    body.className = "diff-body";
    for (const l of lines) {
      if (l.t === "gap") {
        const g = document.createElement("div");
        g.className = "diff-gap";
        g.textContent = l.x;
        body.appendChild(g);
        continue;
      }
      if (l.t === "add") added++;
      else if (l.t === "del") removed++;
      const row = document.createElement("div");
      row.className = "diff-line " + (l.t === "ctx" ? "ctx" : l.t);
      const sign = document.createElement("span");
      sign.className = "diff-sign";
      sign.textContent = l.t === "add" ? "+" : l.t === "del" ? "-" : " ";
      const txt = document.createElement("span");
      txt.className = "diff-text";
      let line = l.x;
      if (line.length > 400) line = line.slice(0, 400) + " …";
      txt.textContent = line;
      row.appendChild(sign);
      row.appendChild(txt);
      body.appendChild(row);
    }
    addChip.textContent = "+" + added;
    delChip.textContent = "-" + removed;
    meta.appendChild(addChip);
    meta.appendChild(delChip);
    wrap.appendChild(meta);
    wrap.appendChild(body);
    return { el: wrap, added, removed };
  }

  /** 任务结束后的"修改的文件"卡片：可点击文件路径 + 可折叠 diff。 */
  function renderChangesMessage(m) {
    const el = document.createElement("div");
    el.className = "msg changes";
    el.dataset.id = m.id;

    const header = document.createElement("div");
    header.className = "msg-header";
    const role = document.createElement("span");
    role.className = "msg-role";
    role.textContent = "📝 修改的文件";
    header.appendChild(role);
    el.appendChild(header);

    // 按文件路径分组，合并多次改动
    const grouped = new Map();
    for (const c of m.changes || []) {
      if (!c || !c.path) continue;
      if (!grouped.has(c.path)) grouped.set(c.path, { name: c.name || "write", diffs: [] });
      grouped.get(c.path).diffs.push(...(Array.isArray(c.diffs) ? c.diffs : []));
    }
    const list = document.createElement("div");
    list.className = "changes-list";
    for (const [p, g] of grouped) {
      const row = document.createElement("div");
      row.className = "change-row";
      const link = document.createElement("a");
      link.className = "file-ref";
      link.dataset.path = p;
      link.dataset.line = "";
      link.textContent = "📄 " + p;
      link.title = "点击打开文件";
      row.appendChild(link);
      if (g.diffs.length > 0) {
        const details = document.createElement("details");
        details.className = "change-diff";
        const summary = document.createElement("summary");
        summary.textContent = "查看改动" + (g.diffs.length > 1 ? "（" + g.diffs.length + " 处）" : "");
        details.appendChild(summary);
        for (const d of g.diffs.slice(0, 6)) {
          const v = buildDiffView(d);
          details.appendChild(v.el);
        }
        if (g.diffs.length > 6) {
          const more = document.createElement("div");
          more.className = "change-note";
          more.textContent = "…共 " + g.diffs.length + " 处改动，此处仅显示前 6 处";
          details.appendChild(more);
        }
        row.appendChild(details);
      } else {
        const note = document.createElement("span");
        note.className = "change-note";
        note.textContent = "（" + (g.name || "write") + "）";
        row.appendChild(note);
      }
      list.appendChild(row);
    }
    el.appendChild(list);
    return el;
  }

  /** 渲染输入区上方的用量/模型状态条。 */
  function renderUsageBar() {
    const bar = els.usageBar;
    if (!bar) return;
    const u = state.usage;
    if (!u) {
      bar.hidden = true;
      return;
    }
    const parts = [];
    if (u.model) parts.push("模型 " + u.model + (u.effort ? " · " + u.effort : ""));
    else if (state.selection && state.selection.model) {
      parts.push("模型 " + state.selection.model + (state.effort ? " · " + state.effort : ""));
    }
    parts.push("输入 " + fmtNum(u.input));
    parts.push("输出 " + fmtNum(u.output));
    if (u.cacheRead > 0) {
      const total = u.cacheRead + u.input;
      parts.push("缓存 " + Math.round((u.cacheRead / total) * 100) + "%");
    }
    if (u.reasoning > 0) parts.push("推理 " + fmtNum(u.reasoning));
    bar.textContent = parts.join(" · ");
    bar.hidden = false;
  }

  function renderContextBar() {
    els.contextBar.innerHTML = "";
    for (const b of state.blocks) {
      const chip = document.createElement("span");
      chip.className = "chip";
      const label = document.createElement("span");
      label.textContent = b.label;
      const rm = document.createElement("button");
      rm.textContent = "×";
      rm.dataset.blockId = b.id;
      chip.appendChild(label);
      chip.appendChild(rm);
      els.contextBar.appendChild(chip);
    }
  }

  function renderPermChip() {
    if (!els.permChip) return;
    els.permChip.textContent = state.permissionShort;
    els.permChip.title = "权限模式：" + state.permissionLabel + "（点击或 Shift+Tab 切换）";
    els.permChip.className = "perm-chip perm-" + state.permissionMode;
    // Claude Code 式：发送按钮颜色随权限模式变化
    if (els.send) els.send.dataset.permissionMode = state.permissionMode;
  }

  function renderFocusButton() {
    if (!els.btnFocus) return;
    els.btnFocus.classList.toggle("active", state.focusView);
    els.btnFocus.title = state.focusView ? "专注视图：开（点击关闭）" : "专注视图：关（点击开启）";
  }

  // ---------------- 实时进度（思维链 / 工具调用） ----------------

  let liveEl = null;

  function resetLive() {
    live.turn = 0;
    live.reasoning.clear();
    live.texts.clear();
    live.tools.clear();
    live.order = [];
  }

  function ensureLiveEl() {
    if (liveEl && liveEl.isConnected) return liveEl;
    liveEl = document.createElement("div");
    liveEl.className = "msg assistant live-feed";
    els.messages.appendChild(liveEl);
    scrollToBottom();
    return liveEl;
  }

  function applyProgress(msg) {
    if (!state.running) return;
    switch (msg.kind) {
      case "turn":
        live.turn = msg.turn;
        break;
      case "tool": {
        if (!live.tools.has(msg.callId)) {
          live.order.push("tool:" + msg.callId);
          live.tools.set(msg.callId, { name: msg.name, args: msg.args, status: "运行中…", result: "", isError: false });
        } else {
          const t = live.tools.get(msg.callId);
          if (msg.args) t.args = msg.args;
        }
        const t = live.tools.get(msg.callId);
        if (t && msg.path) t.path = msg.path;
        state.lastToolName = msg.name;
        break;
      }
      case "tool-result": {
        const t = live.tools.get(msg.callId);
        if (t) {
          t.status = "完成";
          t.isError = !!msg.isError;
          t.result = msg.summary;
          if (msg.diffs && msg.diffs.length) {
            t.diffs = msg.diffs;
            // DSH Pro：diff 里通常带 path，可补上工具卡片缺省的目标文件链接
            if (!t.path && msg.diffs[0] && msg.diffs[0].path) t.path = msg.diffs[0].path;
          }
        }
        break;
      }
      case "reasoning":
        if (!live.reasoning.has(msg.index)) live.order.push("reasoning:" + msg.index);
        live.reasoning.set(msg.index, msg.text);
        break;
      case "text":
        if (!live.texts.has(msg.index)) live.order.push("text:" + msg.index);
        live.texts.set(msg.index, msg.text);
        break;
      case "assistant": {
        // 完整快照：权威替换各块
        const blocks = msg.blocks || [];
        blocks.forEach((b, i) => {
          if (b.type === "reasoning") {
            if (!live.reasoning.has(i)) live.order.push("reasoning:" + i);
            live.reasoning.set(i, b.text || "");
          } else if (b.type === "text") {
            if (!live.texts.has(i)) live.order.push("text:" + i);
            live.texts.set(i, b.text || "");
          } else if (b.type === "tool-call") {
            const id = "snap-" + i;
            if (!live.tools.has(id)) live.order.push("tool:" + id);
            live.tools.set(id, { name: b.name || "tool", args: b.arguments || "", status: "运行中…", result: "", isError: false });
            if (b.name) state.lastToolName = b.name;
          }
        });
        break;
      }
      case "done":
        break;
    }
    renderLive();
  }

  function renderLive() {
    const el = ensureLiveEl();
    el.innerHTML = "";
    const header = document.createElement("div");
    header.className = "live-header";
    let label = "DSH 正在工作";
    if (live.turn) label += " · 第 " + live.turn + " 轮";
    if (state.lastToolName) label += " · " + state.lastToolName;
    header.textContent = label + "…";
    el.appendChild(header);

    if (state.focusView) {
      // 专注视图：隐藏思考与工具调用细节（Claude Code 式）
      const hint = document.createElement("div");
      hint.className = "live-focus-hint";
      hint.textContent = "工具调用与思考过程已隐藏（Ctrl+Alt+F 或点眼睛按钮显示）";
      el.appendChild(hint);
      scrollToBottom();
      return;
    }

    for (const key of live.order) {
      if (key.startsWith("reasoning:")) {
        const idx = Number(key.slice(10));
        const text = live.reasoning.get(idx) || "";
        const details = document.createElement("details");
        details.className = "live-reasoning";
        details.open = true;
        const summary = document.createElement("summary");
        summary.textContent = "思考过程";
        const pre = document.createElement("pre");
        pre.textContent = text || "…";
        details.appendChild(summary);
        details.appendChild(pre);
        el.appendChild(details);
      } else if (key.startsWith("text:")) {
        const idx = Number(key.slice(5));
        const text = live.texts.get(idx) || "";
        const div = document.createElement("div");
        div.className = "live-text";
        div.textContent = text || "…";
        el.appendChild(div);
      } else if (key.startsWith("tool:")) {
        const t = live.tools.get(key.slice(5));
        if (!t) continue;
        const card = document.createElement("div");
        card.className = "live-tool" + (t.isError ? " is-error" : "");
        const row = document.createElement("div");
        row.className = "live-tool-row";
        const name = document.createElement("span");
        name.className = "live-tool-name";
        name.textContent = (isChangeToolName(t.name) ? "✏ " : "⚙ ") + t.name;
        const status = document.createElement("span");
        status.className = "live-tool-status";
        status.textContent = t.status;
        row.appendChild(name);
        row.appendChild(status);
        card.appendChild(row);
        // DSH Pro：修改类工具直接显示目标文件（可点击打开）
        if (t.path) {
          const link = document.createElement("a");
          link.className = "live-tool-file";
          link.textContent = "📄 " + shortPath(t.path);
          link.title = t.path + "（点击打开）";
          link.dataset.path = t.path;
          link.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            post({ type: "openFile", path: t.path });
          });
          card.appendChild(link);
        } else if (t.args && !isChangeToolName(t.name)) {
          const args = document.createElement("code");
          args.textContent = t.args.slice(0, 200);
          card.appendChild(args);
        }
        // DSH Pro：有结构化 diff 时直接展示改了什么——默认展开 + 绿/红高亮
        // （Claude Code 式：思考过程中边改边看，不再是黑箱）；可点击 summary 收起
        if (t.diffs && t.diffs.length) {
          const details = document.createElement("details");
          details.className = "live-tool-diff";
          details.open = true;
          const summary = document.createElement("summary");
          summary.textContent = "改动";
          details.appendChild(summary);
          let totalAdd = 0;
          let totalDel = 0;
          for (const d of t.diffs.slice(0, 3)) {
            const v = buildDiffView(d);
            totalAdd += v.added;
            totalDel += v.removed;
            details.appendChild(v.el);
          }
          if (t.diffs.length > 3) {
            const more = document.createElement("div");
            more.className = "change-note";
            more.textContent = "…共 " + t.diffs.length + " 处改动，仅显示前 3 处";
            details.appendChild(more);
          }
          summary.textContent = "改动 +" + totalAdd + " -" + totalDel;
          card.appendChild(details);
        }
        if (t.result) {
          const res = document.createElement("div");
          res.className = "live-tool-result";
          res.textContent = t.result.slice(0, 200);
          card.appendChild(res);
        }
        el.appendChild(card);
      }
    }
    scrollToBottom();
  }

  function clearLive() {
    if (liveEl) {
      liveEl.remove();
      liveEl = null;
    }
    resetLive();
  }

  function showTyping() {
    hideTyping();
    typingEl = document.createElement("div");
    typingEl.className = "msg system typing";
    typingEl.textContent = "DSH 正在工作…";
    els.messages.appendChild(typingEl);
    scrollToBottom();
  }

  function hideTyping() {
    if (typingEl) {
      typingEl.remove();
      typingEl = null;
    }
  }

  function setRunning(running) {
    state.running = running;
    els.send.disabled = running;
    els.cancel.hidden = !running;
    if (running) {
      // 面板重新可见（postInit）可能重复收到 running:true，避免重复计时器/重置计时
      if (!elapsedTimer) {
        state.runStartedAt = Date.now();
        updateElapsed();
        elapsedTimer = setInterval(updateElapsed, 1000);
      }
      showTyping();
    } else {
      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
      hideTyping();
      els.status.textContent = "";
      state.lastToolName = "";
      clearLive();
      // 任务结束：回到最新位置展示最终答复/修改卡片
      stickToBottom = true;
      scrollToBottom(true);
    }
  }

  function updateElapsed() {
    const sec = Math.floor((Date.now() - state.runStartedAt) / 1000);
    els.status.textContent = "运行中 " + sec + "s" + (state.lastToolName ? " · " + state.lastToolName : "");
  }

  // ---------------- 弹出菜单（/ 斜杠命令、@ 文件引用） ----------------

  function closeMenu() {
    if (menu) {
      menu = null;
      const m = document.getElementById("autocomplete-menu");
      if (m) m.remove();
    }
  }

  function renderMenu() {
    const old = document.getElementById("autocomplete-menu");
    if (old) old.remove();
    if (!menu) return;
    const m = document.createElement("div");
    m.id = "autocomplete-menu";
    m.className = "autocomplete-menu";
    menu.items.forEach((it, i) => {
      const row = document.createElement("div");
      row.className = "menu-item" + (i === menu.index ? " selected" : "");
      const label = document.createElement("span");
      label.className = "menu-item-label";
      label.textContent = it.label;
      const desc = document.createElement("span");
      desc.className = "menu-item-desc";
      desc.textContent = it.description;
      row.appendChild(label);
      row.appendChild(desc);
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pickMenuItem(i);
      });
      m.appendChild(row);
    });
    document.body.appendChild(m);
  }

  function pickMenuItem(index) {
    const it = menu.items[index];
    if (!it) return;
    const type = menu.type;
    closeMenu();
    if (type === "slash") {
      if (it.needsArgs) {
        // 需要参数的命令：插入命令文本，继续输入（Claude Code 式）
        els.input.value = it.cmd + " ";
        els.input.focus();
        setCursorToEnd();
        saveDraft();
      } else {
        els.input.value = "";
        saveDraft();
        post({ type: "command", text: it.cmd });
      }
    } else if (type === "mention") {
      els.input.value = it.path + " ";
      els.input.focus();
      setCursorToEnd();
      saveDraft();
      post({ type: "mentionFile", path: it.path });
    }
  }

  function openSlashMenu(filter) {
    const cmds = state.slashCommands || [];
    const items = cmds
      .filter((c) => !filter || c.cmd.slice(1).toLowerCase().includes(filter.toLowerCase()))
      .map((c) => ({ label: c.cmd, description: c.description, needsArgs: c.needsArgs, cmd: c.cmd }));
    if (items.length === 0) {
      closeMenu();
      return;
    }
    menu = { type: "slash", items, index: 0 };
    renderMenu();
  }

  function openMentionMenu(query) {
    menu = { type: "mention", items: [], index: 0, query: query || "" };
    renderMenu();
    requestFiles(query || "");
  }

  function requestFiles(query) {
    if (fileQueryTimer) clearTimeout(fileQueryTimer);
    fileQueryTimer = setTimeout(() => {
      post({ type: "listFiles", query: query || "" });
    }, 180);
  }

  // ---------------- 输入 ----------------

  function saveDraft() {
    vscode.setState({ draft: els.input.value });
  }

  function setCursorToEnd() {
    const len = els.input.value.length;
    els.input.setSelectionRange(len, len);
  }

  /** 根据光标前的输入判断是否要弹出菜单（/ 或 @）。 */
  function updateAutocomplete() {
    const value = els.input.value;
    const caret = els.input.selectionStart ?? value.length;
    const before = value.slice(0, caret);

    // 斜杠命令：行首以 / 开头且尚未输入空格
    const slashMatch = before.match(/^\/([^\s]*)$/);
    if (slashMatch) {
      openSlashMenu(slashMatch[1]);
      return;
    }
    // @ 引用：光标前最后一个词以 @ 开头
    const atMatch = before.match(/(?:^|\s)@([^\s@]*)$/);
    if (atMatch) {
      openMentionMenu(atMatch[1]);
      return;
    }
    closeMenu();
  }

  function sendInput() {
    const text = els.input.value;
    if (!text.trim() || state.running) return;
    const cmdMatch = text.trim().match(/^\/(help|clear|memory|edit-memory|remember|context|resume|provider|model|effort|skills|compact|plan|default|bypass|status)(\s|$)/);
    if (cmdMatch) {
      els.input.value = "";
      saveDraft();
      post({ type: "command", text: text.trim() });
      return;
    }
    els.input.value = "";
    saveDraft();
    post({ type: "send", text });
  }

  els.input.addEventListener("keydown", (e) => {
    if (menu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        menu.index = (menu.index + 1) % menu.items.length;
        renderMenu();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        menu.index = (menu.index - 1 + menu.items.length) % menu.items.length;
        renderMenu();
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMenuItem(menu.index);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        return;
      }
    }
    // Shift+Tab：切换权限模式（Claude Code 式）
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      post({ type: "togglePermissionMode" });
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !state.useCtrlEnterToSend) {
      e.preventDefault();
      sendInput();
    } else if (e.key === "Enter" && e.ctrlKey && state.useCtrlEnterToSend) {
      e.preventDefault();
      sendInput();
    }
  });

  els.input.addEventListener("input", () => {
    saveDraft();
    updateAutocomplete();
  });

  els.input.addEventListener("blur", () => {
    // 延迟关闭，让 mousedown 选择先执行
    setTimeout(() => {
      if (menu) closeMenu();
    }, 150);
  });

  els.send.addEventListener("click", sendInput);
  els.cancel.addEventListener("click", () => post({ type: "cancel" }));
  els.btnNew.addEventListener("click", () => post({ type: "newSession" }));
  els.btnSessions.addEventListener("click", () => post({ type: "listSessions" }));
  els.btnAttach.addEventListener("click", () => post({ type: "attachSelection" }));
  els.btnFile.addEventListener("click", () => post({ type: "attachOpenFile" }));
  // DSH Pro：/ 命令菜单按钮（Claude Code 式），打开后聚焦输入框继续输入
  if (els.btnSlash) {
    els.btnSlash.addEventListener("click", () => {
      openSlashMenu("");
      els.input.focus();
    });
  }
  if (els.permChip) {
    els.permChip.addEventListener("click", () => post({ type: "togglePermissionMode" }));
  }
  if (els.btnFocus) {
    els.btnFocus.addEventListener("click", () => {
      state.focusView = !state.focusView;
      renderFocusButton();
      if (state.running) renderLive();
      post({ type: "setFocusView", enabled: state.focusView });
    });
  }

  els.contextBar.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-block-id]");
    if (btn) {
      post({ type: "removeContext", id: btn.dataset.blockId });
    }
  });

  els.messages.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (btn) {
      const msgEl = btn.closest(".msg");
      const id = msgEl ? msgEl.dataset.id : "";
      const msg = state.messages.find((m) => m.id === id);
      if (!msg) return;
      if (btn.dataset.act === "copy") {
        navigator.clipboard.writeText(msg.content).then(() => {
          btn.textContent = "已复制";
          setTimeout(() => (btn.textContent = "复制"), 1200);
        });
      } else if (btn.dataset.act === "insert") {
        post({ type: "insertCode", id });
      } else if (btn.dataset.act === "apply") {
        post({ type: "applyToFiles", id });
      }
    }
    const link = e.target.closest("a[href^='http']");
    if (link) {
      e.preventDefault();
      post({ type: "openExternal", url: link.getAttribute("href") });
      return;
    }
    const fileRef = e.target.closest("a.file-ref");
    if (fileRef) {
      e.preventDefault();
      const line = fileRef.dataset.line ? Number(fileRef.dataset.line) : undefined;
      post({ type: "openFile", path: fileRef.dataset.path, line });
    }
  });

  // DSH Pro：用户手动滚动时停止自动贴底（可自由回看历史），滚回底部自动恢复
  els.messages.addEventListener("scroll", () => {
    stickToBottom = isNearBottom();
    updateJumpButton();
  }, { passive: true });

  // ---------------- 主线程消息 ----------------

  window.addEventListener("message", (e) => {
    const msg = e.data;
    switch (msg.type) {
      case "init":
        state.sessionId = msg.sessionId;
        state.title = msg.title;
        state.messages = msg.messages || [];
        state.blocks = msg.blocks || [];
        state.folder = msg.folder || "";
        state.folderName = msg.folderName || "";
        state.selection = msg.selection || null;
        state.effort = msg.effort || "";
        state.usage = msg.usage || null;
        state.skills = msg.skills || [];
        state.slashCommands = msg.slashCommands || [];
        if (typeof msg.useCtrlEnterToSend === "boolean") state.useCtrlEnterToSend = msg.useCtrlEnterToSend;
        if (typeof msg.focusView === "boolean") state.focusView = msg.focusView;
        if (msg.permissionMode) {
          state.permissionMode = msg.permissionMode;
          state.permissionLabel = msg.permissionLabel || "";
          state.permissionShort = msg.permissionShort || "";
        }
        setRunning(!!msg.running);
        renderContextBar();
        renderUsageBar();
        renderPermChip();
        renderFocusButton();
        render();
        // DSH Pro：面板重新可见（postInit）时若任务仍在运行，立即重建实时进度区，
        // 避免等到下一条进度事件才恢复显示
        if (state.running && live.order.length > 0) {
          ensureLiveEl();
          renderLive();
        }
        break;
      case "progress":
        applyProgress(msg.msg);
        break;
      case "usage":
        state.usage = msg;
        renderUsageBar();
        break;
      case "selectionChanged":
        state.selection = msg.selection || null;
        state.effort = msg.effort || "";
        renderUsageBar();
        break;
      case "permissionChanged":
        state.permissionMode = msg.permissionMode || state.permissionMode;
        state.permissionLabel = msg.permissionLabel || state.permissionLabel;
        state.permissionShort = msg.permissionShort || state.permissionShort;
        renderPermChip();
        break;
      case "focusViewChanged":
        state.focusView = !!msg.enabled;
        renderFocusButton();
        if (state.running) renderLive();
        break;
      case "filesListed": {
        if (!menu || menu.type !== "mention") break;
        const files = msg.files || [];
        menu.items = files.map((p) => ({ label: "@" + p, description: "", path: p }));
        if (menu.items.length === 0) {
          menu.items = [{ label: "@（未找到匹配文件）", description: "输入更多字符过滤", path: "" }];
        }
        menu.index = 0;
        renderMenu();
        break;
      }
      case "appendMessage":
        state.messages.push(msg.message);
        render();
        break;
      case "appendMessages":
        state.messages = state.messages.concat(msg.messages || []);
        render();
        break;
      case "resetMessages":
        state.messages = [];
        render();
        break;
      case "running":
        setRunning(!!msg.running);
        break;
      case "sessionChanged":
        state.sessionId = msg.sessionId;
        state.title = msg.title;
        els.sessionTitle.textContent = msg.title;
        els.sessionId.textContent = msg.sessionId.slice(0, 8);
        break;
      case "contextChanged":
        state.blocks = msg.blocks || [];
        renderContextBar();
        break;
      case "setDraft":
        els.input.value = typeof msg.text === "string" ? msg.text : "";
        closeMenu();
        els.input.focus();
        setCursorToEnd();
        break;
    }
  });

  // ---------------- 启动 ----------------

  const prev = vscode.getState();
  if (prev && typeof prev.draft === "string") {
    els.input.value = prev.draft;
  }
  // DSH Pro：顶部品牌栏的鲸鱼图标 = DeepSeek 官方标志（whale.js 先于本文件加载，可直接取 window.DSH_WHALE_SVG）
  if (els.brandLogo && window.DSH_WHALE_SVG) {
    els.brandLogo.innerHTML = window.DSH_WHALE_SVG;
  }
  els.input.focus();
  post({ type: "ready" });
})();
