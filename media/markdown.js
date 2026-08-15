// DSH 极简 Markdown 渲染器 + 文件引用链接化（Webview 使用，挂在全局 DSHMarkdown）
(function (global) {
  "use strict";

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderInline(text) {
    let t = escapeHtml(text);
    t = t.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    t = t.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
    );
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    t = t.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    return t;
  }

  const SEP_CELL_RE = /^:?-{3,}:?$/;

  /** 是否为表格分隔行：如 "|:---:|------|------|" */
  function isSepLine(line) {
    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    return cells.length > 0 && cells.every((s) => SEP_CELL_RE.test(s));
  }

  function splitRow(line) {
    return line
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((s) => s.trim());
  }

  function tableAlign(s) {
    if (s.startsWith(":") && s.endsWith(":")) return "center";
    if (s.endsWith(":")) return "right";
    return "left";
  }

  function renderTableHtml(header, rows, aligns) {
    const cell = (s, j, tag) => {
      const st = aligns[j] && aligns[j] !== "left" ? ' style="text-align:' + aligns[j] + '"' : "";
      return "<" + tag + st + ">" + renderInline(s) + "</" + tag + ">";
    };
    let html = '<div class="table-wrap"><table>';
    if (header && header.length) {
      html += "<thead><tr>" + header.map((h, j) => cell(h, j, "th")).join("") + "</tr></thead>";
    }
    html += "<tbody>";
    for (const r of rows) {
      html += "<tr>" + r.map((c, j) => cell(c, j, "td")).join("") + "</tr>";
    }
    html += "</tbody></table></div>";
    return html;
  }

  /** 多行表格：传入若干以 | 开头的行，整块渲染成 <table>；不是表格返回 null。 */
  function renderTable(lines) {
    let sepIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (isSepLine(lines[i])) { sepIdx = i; break; }
    }
    if (sepIdx === -1) return null;
    const header = sepIdx === 0 ? null : splitRow(lines[0]);
    const aligns = splitRow(lines[sepIdx]).map(tableAlign);
    const rows = [];
    for (let i = sepIdx + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t || isSepLine(t)) continue;
      rows.push(splitRow(lines[i]));
    }
    return renderTableHtml(header, rows, aligns);
  }

  /** 单行摊平的表格（模型偶尔把整张表写成一行）兜底解析。 */
  function parseInlineTable(line) {
    if (line.indexOf("|") === -1) return null;
    let parts = line.split("|").map((s) => s.trim());
    if (parts[0] === "") parts.shift();
    if (parts.length && parts[parts.length - 1] === "") parts.pop();
    if (parts.length < 3) return null;
    // 摊平成一行时行与行之间会产生空段，全部丢弃（单行表格兜底，允许少许失真）
    parts = parts.filter((s) => s !== "");
    if (parts.length < 3) return null;
    let sep = -1;
    for (let i = 1; i < parts.length; i++) {
      if (SEP_CELL_RE.test(parts[i])) { sep = i; break; }
    }
    if (sep < 1) return null;
    const n = sep;
    if (sep + n > parts.length) return null;
    const sepCells = parts.slice(sep, sep + n);
    if (!sepCells.every((s) => SEP_CELL_RE.test(s))) return null;
    const rest = parts.slice(sep + n);
    if (rest.length === 0 || rest.length % n !== 0) return null;
    const rows = [];
    for (let i = 0; i < rest.length; i += n) rows.push(rest.slice(i, i + n));
    return renderTableHtml(parts.slice(0, n), rows, sepCells.map(tableAlign));
  }

  function renderMarkdown(src) {
    const lines = String(src).replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let para = [];
    let inCode = false;
    let codeLang = "";
    let codeLines = [];
    let list = null;
    let quote = [];

    const flushPara = () => {
      if (!para.length) return;
      if (para.length === 1) {
        const tbl = parseInlineTable(para[0]);
        if (tbl) { out.push(tbl); para = []; return; }
      } else {
        const tbl = renderTable(para);
        if (tbl) { out.push(tbl); para = []; return; }
      }
      out.push("<p>" + renderInline(para.join(" ")) + "</p>");
      para = [];
    };
    const flushList = () => {
      if (list) {
        out.push(
          "<" + list.tag + ">" +
            list.items.map((i) => "<li>" + i + "</li>").join("") +
            "</" + list.tag + ">"
        );
        list = null;
      }
    };
    const flushQuote = () => {
      if (quote.length) {
        out.push("<blockquote>" + quote.map((q) => "<p>" + q + "</p>").join("") + "</blockquote>");
        quote = [];
      }
    };
    const flushAll = () => {
      flushPara();
      flushList();
      flushQuote();
    };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.replace(/\s+$/, "");
      if (inCode) {
        if (/^```/.test(line)) {
          out.push(
            "<pre><code" +
              (codeLang ? ' class="lang-' + escapeHtml(codeLang) + '"' : "") +
              ">" +
              escapeHtml(codeLines.join("\n")) +
              "</code></pre>"
          );
          inCode = false;
          codeLang = "";
          codeLines = [];
        } else {
          codeLines.push(line);
        }
        continue;
      }
      const fence = line.match(/^```(\w*)/);
      if (fence) {
        flushAll();
        inCode = true;
        codeLang = fence[1];
        continue;
      }
      const trimmed = line.trim();
      if (trimmed === "") {
        flushAll();
        continue;
      }
      // 表格：连续以 | 开头的行，含分隔行则整块渲染成 <table>
      if (trimmed.charAt(0) === "|") {
        const tblLines = [trimmed];
        while (i + 1 < lines.length) {
          const nxt = lines[i + 1].trim();
          if (nxt.charAt(0) === "|") { tblLines.push(nxt); i++; } else break;
        }
        const tbl = renderTable(tblLines);
        if (tbl) {
          flushAll();
          out.push(tbl);
        } else {
          para.push(trimmed);
        }
        continue;
      }
      if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
        flushAll();
        out.push("<hr>");
        continue;
      }
      const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        flushAll();
        out.push("<h" + h[1].length + ">" + renderInline(h[2]) + "</h" + h[1].length + ">");
        continue;
      }
      const q = trimmed.match(/^>\s?(.*)$/);
      if (q) {
        flushPara();
        flushList();
        quote.push(renderInline(q[1]));
        continue;
      }
      const ul = trimmed.match(/^([-*+])\s+(.*)$/);
      if (ul) {
        flushPara();
        flushQuote();
        if (list && list.tag !== "ul") flushList();
        if (!list) list = { tag: "ul", items: [] };
        list.items.push(renderInline(ul[2]));
        continue;
      }
      const ol = trimmed.match(/^\d+[.)]\s+(.*)$/);
      if (ol) {
        flushPara();
        flushQuote();
        if (list && list.tag !== "ol") flushList();
        if (!list) list = { tag: "ol", items: [] };
        list.items.push(renderInline(ol[1]));
        continue;
      }
      flushList();
      flushQuote();
      para.push(trimmed);
    }
    if (inCode) {
      out.push("<pre><code>" + escapeHtml(codeLines.join("\n")) + "</code></pre>");
    }
    flushAll();
    return out.join("\n");
  }

  // DSH Pro：路径正则支持 Windows 盘符（D:\ 或 C:/）、中文/括号文件名与普通相对路径，行号可选
  const FILE_REF_RE =
    /((?:[A-Za-z]:[\\/])?[\w\u4e00-\u9fff][\w\u4e00-\u9fff.\/\\\-（）()]*\.(?:tsx?|jsx?|py|rs|go|java|c(?:pp|xx)?|h(?:pp|xx)?|json|md|ya?ml|css|html?|vue|svelte|sh|ps1|sql|toml|ini|txt|rb|php|cs|kt|swift|dart|scss|less|xml|env))\b(?::(\d+))?/g;

  /** 把回答中的文件路径（含可选 :行号）转为可点击链接。 */
  function linkifyFileRefs(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const el = node.parentElement;
        if (el && el.closest("pre, a, .file-ref, .live-feed")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = node.nodeValue;
      let m;
      let last = 0;
      let html = "";
      let changed = false;
      FILE_REF_RE.lastIndex = 0;
      while ((m = FILE_REF_RE.exec(text))) {
        changed = true;
        html += escapeHtml(text.slice(last, m.index));
        const line = m[2] || "";
        html +=
          '<a class="file-ref" data-path="' +
          escapeHtml(m[1]) +
          '" data-line="' +
          escapeHtml(line) +
          '">' +
          escapeHtml(m[1]) +
          (line ? ":" + line : "") +
          "</a>";
        last = m.index + m[0].length;
      }
      if (changed) {
        html += escapeHtml(text.slice(last));
        const span = document.createElement("span");
        span.innerHTML = html;
        node.parentNode.replaceChild(span, node);
      }
    }
  }

  global.DSHMarkdown = {
    escapeHtml: escapeHtml,
    renderMarkdown: renderMarkdown,
    linkifyFileRefs: linkifyFileRefs,
  };
})(globalThis);
