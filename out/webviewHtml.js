"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderChatHtml = renderChatHtml;
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
/**
 * 生成聊天面板的 Webview HTML。
 * CSP 使用 nonce 限制脚本来源，资源仅允许来自本扩展的 media 目录。
 */
function renderChatHtml(webview, extensionPath) {
    const nonce = randomNonce();
    const media = webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, "media")));
    const csp = [
        "default-src 'none'",
        `style-src ${webview.cspSource}`,
        `script-src 'nonce-${nonce}'`,
        `img-src ${webview.cspSource} data:`,
        "font-src 'none'",
    ].join("; ");
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DeepSeek Harness</title>
<link rel="stylesheet" href="${media}/chat.css">
<link rel="stylesheet" href="${media}/live.css">
</head>
<body>
  <header id="header">
    <!-- DSH Pro：顶部品牌栏（Claude Code 式）——最上面一行 = 鲸鱼图标 + DeepSeek Harness 名字，鲸鱼 SVG 由 chat.js 注入 -->
    <div class="brand" title="DeepSeek Harness">
      <span id="brand-logo" class="brand-logo"></span>
      <span class="brand-name">DeepSeek Harness</span>
    </div>
    <div class="session-info">
      <span id="session-title">DeepSeek Harness</span>
      <span id="session-id" class="muted"></span>
    </div>
    <div class="actions">
      <button id="btn-focus" class="icon-btn" title="专注视图：关（点击开启，隐藏工具细节）">👁</button>
      <button id="btn-sessions" class="icon-btn" title="历史会话">🕘</button>
      <button id="btn-new" class="icon-btn" title="新建会话">＋</button>
    </div>
  </header>
  <main id="messages"></main>
  <footer id="composer">
    <div id="usage-bar" class="usage-bar" hidden></div>
    <div id="context-bar"></div>
    <div id="input-card">
      <textarea id="input" rows="3" placeholder="输入消息，Enter 发送，Shift+Enter 换行；/ 命令菜单，@ 引用文件"></textarea>
      <div id="composer-row">
        <button id="btn-attach" class="footer-btn" title="把当前选中代码加入上下文">📎</button>
        <button id="btn-file" class="footer-btn" title="把当前打开文件加入上下文">📄</button>
        <button id="btn-slash" class="footer-btn" title="命令菜单 (/)">/</button>
        <span id="status" class="muted"></span>
        <span class="spacer"></span>
        <button id="perm-chip" class="perm-chip perm-workspace-write" title="权限模式：点击或 Shift+Tab 切换">询问</button>
        <button id="btn-cancel" class="stop-btn" hidden title="停止">■</button>
        <button id="btn-send" class="send-btn" title="发送" data-permission-mode="workspace-write">➤</button>
      </div>
    </div>
  </footer>
<script nonce="${nonce}" src="${media}/whale.js"></script>
<script nonce="${nonce}" src="${media}/markdown.js"></script>
<script nonce="${nonce}" src="${media}/chat.js"></script>
</body>
</html>`;
}
function randomNonce() {
    return crypto.randomUUID();
}
//# sourceMappingURL=webviewHtml.js.map