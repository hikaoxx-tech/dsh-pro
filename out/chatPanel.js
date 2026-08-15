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
exports.ChatPanel = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const cli_1 = require("./cli");
const sessionStore_1 = require("./sessionStore");
const memory_1 = require("./memory");
const sessionTracer_1 = require("./sessionTracer");
const chatCommands_1 = require("./chatCommands");
const projectContext_1 = require("./projectContext");
const taskText_1 = require("./taskText");
const codeBlocks_1 = require("./codeBlocks");
const applyCode_1 = require("./applyCode");
const webviewHtml_1 = require("./webviewHtml");
const modelSelection_1 = require("./modelSelection");
const sidebar_1 = require("./sidebar");
const UUID = () => crypto.randomUUID();
function fmtNum(n) {
    if (n >= 1000)
        return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}
/** 权限模式元数据（Claude Code 式三档：默认询问 → 计划只读 → 完全放行）。 */
const PERMISSION_MODES = [
    { id: "workspace-write", label: "默认 · 询问", short: "询问" },
    { id: "read-only", label: "计划 · 只读", short: "计划" },
    { id: "danger-full-access", label: "完全放行 · bypass", short: "放行" },
];
function permissionMeta(mode) {
    return PERMISSION_MODES.find((m) => m.id === mode) ?? PERMISSION_MODES[0];
}
class ChatPanel {
    static instance;
    panel;
    store;
    globalStorageDir;
    extensionPath;
    cliProvider;
    envProvider;
    status;
    secrets;
    log;
    memory;
    folder;
    folderHash = "";
    session;
    contextBlocks = [];
    selection;
    enabledSkills = [];
    lastUsage;
    lastChanges = [];
    running = false;
    busy = false;
    abort;
    disposables = [];
    constructor(context, folder, cliProvider, envProvider, secrets, status, log) {
        this.cliProvider = cliProvider;
        this.envProvider = envProvider;
        this.status = status;
        this.secrets = secrets;
        this.log = log;
        this.folder = folder;
        this.globalStorageDir = context.globalStorageUri.fsPath;
        this.extensionPath = context.extensionPath;
        this.store = new sessionStore_1.SessionStore(this.globalStorageDir, folder.uri.fsPath);
        this.memory = new memory_1.ProjectMemory(folder.uri.fsPath);
        this.folderHash = (0, sessionStore_1.stableHash)(folder.uri.fsPath);
        this.selection = (0, modelSelection_1.loadSelection)(this.globalStorageDir, this.folderHash);
        this.session = this.createFreshSession();
        this.panel = vscode.window.createWebviewPanel("dsh-pro-chat", "DeepSeek Harness", { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "media"))],
        });
        this.panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, "media", "icon.svg"));
        // DSH Pro：新建面板自动恢复该目录最近一次会话（Claude Code 式：重开面板停留在上次对话界面）
        this.restoreLastSession();
        this.status.setFolder(folder.uri.fsPath);
        this.panel.webview.html = (0, webviewHtml_1.renderChatHtml)(this.panel.webview, context.extensionPath);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        // 面板重新可见时全量同步状态（隐藏期间 post 被跳过，界面可能滞后）
        this.panel.onDidChangeViewState((e) => {
            if (e.webviewPanel.visible)
                this.postInit();
        }, null, this.disposables);
        this.panel.webview.onDidReceiveMessage((msg) => void this.handleMessage(msg), null, this.disposables);
    }
    /** 当前存在的面板实例（可能已不可见）。 */
    static current() {
        return ChatPanel.instance;
    }
    /** 打开（或复用）对话面板。面板隐藏时不再销毁重建——销毁会 abort 正在运行的任务。 */
    static open(context, folder, cliProvider, envProvider, secrets, status, log) {
        if (ChatPanel.instance) {
            if (ChatPanel.instance.folder.uri.fsPath !== folder.uri.fsPath) {
                // 换了工作区：切换目录（并取消可能正在运行的旧任务）
                ChatPanel.instance.switchFolder(folder);
            }
            ChatPanel.instance.reveal();
            return ChatPanel.instance;
        }
        ChatPanel.instance = new ChatPanel(context, folder, cliProvider, envProvider, secrets, status, log);
        ChatPanel.instance.reveal();
        return ChatPanel.instance;
    }
    panelVisible() {
        return this.panel.visible;
    }
    reveal() {
        this.panel.reveal(vscode.ViewColumn.Beside, true);
    }
    // ---------------------------------------------------------------- 会话管理
    createFreshSession() {
        return {
            id: UUID(),
            title: "新会话",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
        };
    }
    /** DSH Pro：恢复该工作目录最近一次会话（无历史时保持新会话）。 */
    restoreLastSession() {
        try {
            const list = this.store.list();
            if (list.length === 0)
                return;
            const loaded = this.store.load(list[0].id);
            if (loaded && Array.isArray(loaded.messages)) {
                this.session = loaded;
                this.panel.title = `DeepSeek Harness — ${loaded.title || "历史会话"}`;
            }
        }
        catch {
            // 恢复失败保持新会话，不影响面板打开
        }
    }
    switchFolder(folder) {
        if (this.running)
            this.cancel();
        this.folder = folder;
        this.folderHash = (0, sessionStore_1.stableHash)(folder.uri.fsPath);
        this.store = new sessionStore_1.SessionStore(this.globalStorageDir, folder.uri.fsPath);
        this.memory = new memory_1.ProjectMemory(folder.uri.fsPath);
        this.selection = (0, modelSelection_1.loadSelection)(this.globalStorageDir, this.folderHash);
        this.enabledSkills = [];
        this.contextBlocks = [];
        this.session = this.createFreshSession();
        // DSH Pro：切换工作目录时同样恢复该目录最近一次会话
        this.restoreLastSession();
        this.status.setFolder(folder.uri.fsPath);
        this.post({ type: "sessionChanged", sessionId: this.session.id, title: this.session.title });
        this.post({ type: "contextChanged", blocks: [] });
        this.post({ type: "resetMessages" });
        this.post({ type: "appendMessages", messages: this.session.messages });
    }
    newSession() {
        if (this.running)
            this.cancel();
        this.session = this.createFreshSession();
        this.contextBlocks = [];
        this.post({ type: "sessionChanged", sessionId: this.session.id, title: this.session.title });
        this.post({ type: "contextChanged", blocks: [] });
        this.post({ type: "resetMessages" });
    }
    loadSession(id) {
        const loaded = this.store.load(id);
        if (!loaded) {
            void vscode.window.showWarningMessage(`会话不存在或已损坏: ${id}`);
            return;
        }
        if (this.running)
            this.cancel();
        this.session = loaded;
        this.contextBlocks = [];
        this.post({ type: "sessionChanged", sessionId: this.session.id, title: this.session.title });
        this.post({ type: "resetMessages" });
        this.post({ type: "appendMessages", messages: loaded.messages });
        this.panel.title = `DeepSeek Harness — ${loaded.title}`;
    }
    async listSessions() {
        const summaries = this.store.list();
        if (summaries.length === 0) {
            void vscode.window.showInformationMessage("当前目录还没有历史会话。");
            return;
        }
        const pick = await vscode.window.showQuickPick(summaries.map((s) => ({
            label: s.title,
            description: `${s.messageCount} 条消息`,
            detail: new Date(s.updatedAt).toLocaleString(),
            id: s.id,
        })), { placeHolder: "选择要载入的会话" });
        if (pick)
            this.loadSession(pick.id);
    }
    // ---------------------------------------------------------------- 消息收发
    post(message) {
        // DSH Pro：面板隐藏（retainContextWhenHidden 保持 webview 存活）时也照常投递，
        // 保证用户切到别的文件后回来，进度/思维链没有断档。面板已销毁则静默忽略。
        try {
            void this.panel.webview.postMessage(message);
        }
        catch {
            // 面板已销毁：忽略
        }
    }
    async handleMessage(msg) {
        try {
            await this.dispatchMessage(msg);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.post({ type: "appendMessage", message: this.systemMessage(`操作出错：${message}`) });
        }
    }
    async dispatchMessage(msg) {
        switch (msg.type) {
            case "ready":
                this.postInit();
                break;
            case "send": {
                const text = typeof msg.text === "string" ? msg.text : "";
                await this.sendMessage(text);
                break;
            }
            case "cancel":
                this.cancel();
                break;
            case "newSession":
                this.newSession();
                break;
            case "listSessions":
                await this.listSessions();
                break;
            case "loadSession":
                if (typeof msg.id === "string")
                    this.loadSession(msg.id);
                break;
            case "removeContext":
                if (typeof msg.id === "string") {
                    this.contextBlocks = this.contextBlocks.filter((b) => b.id !== msg.id);
                    this.post({ type: "contextChanged", blocks: this.contextBlocks });
                }
                break;
            case "openFile": {
                const p = typeof msg.path === "string" ? msg.path : "";
                if (!p)
                    break;
                // DSH Pro：智能解析目标路径——绝对路径直接可用；相对路径先按工作目录拼接，
                // 找不到再在目录树里按「路径后缀/文件名」搜索兜底（模型回答里的相对路径
                // 常相对子目录书写，如 dsh-pro/media/x.js，按工作目录拼会误报不存在）
                const base = this.folder && this.folder.uri ? this.folder.uri.fsPath : "";
                const abs = this.resolveFilePath(p, base);
                if (!abs) {
                    void vscode.window.showWarningMessage(`文件不存在：${p}`);
                    break;
                }
                const line = typeof msg.line === "number" ? msg.line : undefined;
                // DSH Pro：preview:false —— 点击打开的文件用「固定标签页」，多个文件可同时并存；
                // 之前 preview:true 是预览标签页，点下一个文件会把上一个顶掉。
                const opts = {
                    preview: false,
                    ...(line && line > 0
                        ? { selection: new vscode.Range(line - 1, 0, line - 1, 0) }
                        : {}),
                };
                void vscode.window
                    .showTextDocument(vscode.Uri.file(abs), opts)
                    .then(undefined, () => void vscode.window.showWarningMessage(`无法打开文件：${p}`));
                break;
            }
            case "insertCode": {
                if (typeof msg.id === "string")
                    this.insertCodeFromMessage(msg.id);
                break;
            }
            case "applyToFiles": {
                if (typeof msg.id === "string")
                    await this.applyToFiles(msg.id);
                break;
            }
            case "attachSelection":
                this.attachSelection();
                break;
            case "attachOpenFile":
                this.attachOpenFile();
                break;
            case "command":
                if (typeof msg.text === "string")
                    this.handleSlashCommand(msg.text);
                break;
            case "listFiles": {
                // @-引用菜单：列出工作目录内的文件（相对路径）
                const files = await this.listFiles(msg.query);
                this.post({ type: "filesListed", files });
                break;
            }
            case "mentionFile": {
                // @-引用：把选中的文件内容加入上下文
                if (typeof msg.path === "string")
                    await this.attachFileRef(msg.path);
                break;
            }
            case "togglePermissionMode":
                await this.togglePermissionMode();
                break;
            case "setFocusView": {
                // 面板内眼睛按钮切换专注视图（同时写入配置）
                const cfg = vscode.workspace.getConfiguration("dsh-pro");
                const next = typeof msg.enabled === "boolean" ? msg.enabled : !cfg.get("focusView", false);
                void cfg.update("focusView", next, vscode.ConfigurationTarget.Global);
                break;
            }
            case "openExternal": {
                if (typeof msg.url === "string") {
                    try {
                        void vscode.env.openExternal(vscode.Uri.parse(msg.url));
                    }
                    catch {
                        // 非法 URL 直接忽略
                    }
                }
                break;
            }
        }
    }
    postInit() {
        const permMode = vscode.workspace.getConfiguration("dsh-pro").get("permissionMode", "workspace-write");
        const focusView = vscode.workspace.getConfiguration("dsh-pro").get("focusView", false);
        this.post({
            type: "init",
            sessionId: this.session.id,
            title: this.session.title,
            messages: this.session.messages,
            blocks: this.contextBlocks,
            running: this.running,
            folder: this.folder.uri.fsPath,
            folderName: this.folder.name,
            selection: this.selection,
            effort: this.effectiveEffort(),
            usage: this.lastUsage,
            skills: this.enabledSkills,
            permissionMode: permMode,
            permissionLabel: permissionMeta(permMode).label,
            permissionShort: permissionMeta(permMode).short,
            focusView,
            slashCommands: chatCommands_1.SLASH_COMMANDS,
            useCtrlEnterToSend: vscode.workspace.getConfiguration("dsh-pro").get("useCtrlEnterToSend", false),
        });
    }
    updateTitleFromSession() {
        const firstUser = this.session.messages.find((m) => m.role === "user");
        if (firstUser) {
            const title = firstUser.content.replace(/\s+/g, " ").trim().slice(0, 40);
            this.session.title = title || "新会话";
        }
        this.panel.title = `DeepSeek Harness — ${this.session.title}`;
    }
    async sendMessage(text) {
        const trimmed = text.trim();
        if (!trimmed || this.running || this.busy)
            return;
        const userMsg = { id: UUID(), role: "user", content: trimmed, ts: Date.now() };
        this.session.messages.push(userMsg);
        this.updateTitleFromSession();
        this.store.save(this.session);
        this.post({ type: "appendMessage", message: userMsg });
        this.running = true;
        this.abort = new AbortController();
        this.post({ type: "running", running: true });
        this.post({ type: "sessionChanged", sessionId: this.session.id, title: this.session.title });
        this.status.setRunning(true);
        try {
            const outcome = await this.executeTask(this.abort);
            this.session.messages.push(outcome);
            this.store.save(this.session);
            this.post({ type: "appendMessage", message: outcome });
            // DSH Pro：任务结束后追加"修改的文件"卡片（含可点击路径与 diff）
            if (this.lastChanges && this.lastChanges.length > 0) {
                const changeMsg = this.buildChangesMessage(this.lastChanges);
                this.session.messages.push(changeMsg);
                this.store.save(this.session);
                this.post({ type: "appendMessage", message: changeMsg });
            }
        }
        finally {
            // 无论成功失败都复位运行态，避免卡在「运行中」无法再发送
            this.running = false;
            this.abort = undefined;
            this.post({ type: "running", running: false });
            this.status.setRunning(false);
        }
    }
    /** 执行一次 headless 任务，返回要追加到会话的消息。 */
    async executeTask(abort) {
        this.lastChanges = [];
        let cli;
        try {
            cli = await this.cliProvider();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.status.setReady(false, `DSH: ${message}`);
            return this.systemMessage(`无法解析 dsh 命令：${message}`);
        }
        try {
            const cfg = vscode.workspace.getConfiguration("dsh-pro");
            const extraArgs = cfg.get("extraArgs", []);
            // DSH Pro：仅当用户在设置里显式配置过 timeoutSeconds 才用设置值，
            // 否则一律 21600（6 小时），避免窗口未重载时旧 manifest 缓存的 600s 默认值生效
            const _t = cfg.inspect("timeoutSeconds");
            const timeoutSec = _t && (_t.globalValue !== undefined || _t.workspaceValue !== undefined || _t.workspaceFolderValue !== undefined)
                ? cfg.get("timeoutSeconds")
                : 21600;
            const streamProgress = cfg.get("streamProgress", true);
            const taskText = this.buildTaskText();
            const modelPatch = this.currentModelPatch();
            if (streamProgress) {
                // 附加流式补丁：明文 JSONL 会话日志 + 更低的落盘批次延迟
                extraArgs.push("--patch", path.join(this.extensionPath, "patch", "stream.patch.yml"));
            }
            if (modelPatch) {
                // 附加模型选择补丁（/provider /model /effort）
                extraArgs.push("--patch", modelPatch);
            }
            const args = (0, cli_1.buildSpawnArgs)(cli, extraArgs, taskText);
            const env = await this.envProvider();
            // 实时追踪会话事件日志 → 思维链 / 工具调用进度 / 用量
            let tracer;
            let tracerDone = Promise.resolve();
            if (streamProgress) {
                tracer = new sessionTracer_1.SessionTracer(env, Date.now(), (line) => this.log?.(line));
                tracerDone = tracer.start((msg) => {
                    if (msg.kind === "usage") {
                        this.lastUsage = msg;
                        this.post({ type: "usage", ...msg, effort: this.effectiveEffort() });
                    }
                    else {
                        this.post({ type: "progress", msg });
                    }
                }, abort.signal);
            }
            const result = await (0, cli_1.runDsh)(cli, args, {
                cwd: this.folder.uri.fsPath,
                timeoutMs: timeoutSec * 1000,
                env,
                signal: abort.signal,
            });
            tracer?.finish();
            await tracerDone;
            // DSH Pro：收集本次任务修改过的文件（即使任务被取消/超时，已产生的改动也有意义）
            this.lastChanges = tracer ? tracer.changesList() : [];
            if (abort.signal.aborted) {
                return this.systemMessage("已取消任务。");
            }
            if (result.timedOut) {
                return this.systemMessage(`任务超时（超过 ${timeoutSec} 秒）已被取消。可在设置 dsh-pro.timeoutSeconds 中调整。`);
            }
            if (result.code !== 0) {
                const detail = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n");
                if (/MISSING_CREDENTIAL|no API key/i.test(result.stderr)) {
                    return this.systemMessage(`检测到未配置 API Key。请执行「DSH: 配置 API Key」输入 DeepSeek API Key（sk-...），` +
                        `或在系统环境变量中设置 DEEPSEEK_API_KEY。\n\n原始错误：\n${detail}`);
                }
                return this.systemMessage(`dsh 任务失败（exit code ${result.code ?? "?"}）${detail ? `:\n${detail}` : ""}`);
            }
            const answer = result.stdout.trim();
            let content = answer.length > 0 ? answer : "（dsh 未返回文本输出）";
            if (tracer && cfg.get("debugStreaming", false)) {
                const s = tracer.stats();
                content +=
                    "\n\n— 流式诊断：" +
                        (s.found
                            ? `已 tail 会话日志，解析 ${s.eventsParsed} 条事件`
                            : "未找到明文会话日志（--patch 未生效：请确认 dsh 版本支持 compression: none，或查看输出面板 DSH 日志）");
            }
            return {
                id: UUID(),
                role: "assistant",
                content,
                ts: Date.now(),
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return this.systemMessage(`运行 dsh 失败：${message}`);
        }
    }
    systemMessage(content) {
        return { id: UUID(), role: "system", content, ts: Date.now() };
    }
    /** DSH Pro：把本次任务修改过的文件整理成会话卡片消息（相对路径 + diff 摘要）。 */
    buildChangesMessage(changes) {
        const root = path.resolve(this.folder.uri.fsPath);
        // Windows 盘符大小写不敏感：工具参数里可能是小写 d:\，需折叠后再判断是否在工作区内
        const fold = (s) => (process.platform === "win32" ? s.toLowerCase() : s);
        const rootKey = fold(root);
        const items = [];
        for (const c of changes) {
            if (!c || typeof c.path !== "string" || c.path.length === 0)
                continue;
            let rel = c.path;
            try {
                const abs = path.resolve(c.path);
                const absKey = fold(abs);
                if (absKey === rootKey || absKey.startsWith(rootKey + path.sep))
                    rel = path.relative(root, abs).split(path.sep).join("/");
            }
            catch {
                // 保持原样
            }
            items.push({ path: rel, name: c.name || "write", diffs: Array.isArray(c.diffs) ? c.diffs : [] });
            if (items.length >= 30)
                break;
        }
        return { id: UUID(), role: "changes", changes: items, ts: Date.now() };
    }
    // ---------------------------------------------------------------- 上下文与任务文本
    /** 把当前编辑器选中内容加入上下文。 */
    attachSelection() {
        (0, projectContext_1.attachActiveSelection)(this.folder.uri.fsPath, (b) => this.addContextBlock(b));
    }
    /** 把当前打开文件的内容加入上下文（截断保护）。 */
    attachOpenFile() {
        (0, projectContext_1.attachOpenFile)(this.folder.uri.fsPath, (b) => this.addContextBlock(b));
    }
    /** Claude Code 式 @引用：列出工作目录内的文件（相对路径，供前端菜单展示）。 */
    async listFiles(query) {
        const q = (query || "").trim().toLowerCase();
        const exclude = "**/{node_modules,.git,dist,out,build,target,__pycache__,.vscode,coverage,.dsh,.cache,AppData,.npm,.config,Downloads,Documents}/**";
        let uris;
        try {
            uris = await vscode.workspace.findFiles(new vscode.RelativePattern(this.folder.uri, "*"), exclude, 400);
            if (uris.length === 0) {
                // 第一层为空时再深入一层，避免在巨型目录（如主目录兜底）里海量遍历
                uris = await vscode.workspace.findFiles(new vscode.RelativePattern(this.folder.uri, "*/**"), exclude, 400);
            }
        }
        catch {
            uris = [];
        }
        const root = path.resolve(this.folder.uri.fsPath);
        const files = uris
            .map((u) => path.relative(root, u.fsPath).split(path.sep).join("/"))
            .filter((rel) => !rel.startsWith("..") && !rel.startsWith("."))
            .filter((rel) => !q || rel.toLowerCase().includes(q))
            .slice(0, 200);
        return files;
    }
    /** Claude Code 式 @引用：把 @ 选中的文件内容读入上下文。 */
    async attachFileRef(relPath) {
        const raw = path.isAbsolute(relPath) ? relPath : path.join(this.folder.uri.fsPath, relPath);
        const abs = path.resolve(raw);
        const root = path.resolve(this.folder.uri.fsPath);
        if (abs !== root && !abs.startsWith(root + path.sep)) {
            void vscode.window.showWarningMessage(`出于安全，拒绝引用工作区外的文件：${relPath}`);
            return;
        }
        let content = "";
        try {
            const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(abs));
            content = Buffer.from(buf).toString("utf8");
        }
        catch {
            content = "（无法读取文件内容）";
        }
        const label = relPath.split(/[\\/]/).pop() || relPath;
        this.addContextBlock({
            kind: "file",
            label,
            content: content.length > 40000 ? content.slice(0, 40000) + "\n…(文件过大，已截断)" : content,
        });
    }
    /** Claude Code 式：循环切换权限模式（默认询问 → 计划只读 → 完全放行）。 */
    async togglePermissionMode() {
        const cfg = vscode.workspace.getConfiguration("dsh-pro");
        const current = cfg.get("permissionMode", "workspace-write");
        const idx = PERMISSION_MODES.findIndex((m) => m.id === current);
        const next = PERMISSION_MODES[(idx + 1) % PERMISSION_MODES.length];
        await this.setPermissionMode(next.id, next.label, next.short);
    }
    /** 设置权限模式并通知前端（Claude Code 式 /plan /bypass /default 命令共用）。 */
    async setPermissionMode(mode, label, short) {
        const meta = permissionMeta(mode);
        const cfg = vscode.workspace.getConfiguration("dsh-pro");
        await cfg.update("permissionMode", mode, vscode.ConfigurationTarget.Global);
        this.post({
            type: "permissionChanged",
            permissionMode: mode,
            permissionLabel: label ?? meta.label,
            permissionShort: short ?? meta.short,
        });
        if (mode === "danger-full-access") {
            void vscode.window.showWarningMessage("⚠ 已切换到「完全放行」（bypass）：dsh 将不受限操作且审批自动放行，请确保任务可信。");
        }
        (0, sidebar_1.refreshSidebarStatus)();
    }
    /** 预填输入框（配合 @file 引用等场景）。 */
    setDraft(text) {
        this.post({ type: "setDraft", text });
    }
    // ---------------------------------------------------------------- 命令与记忆
    handleSlashCommand(raw) {
        (0, chatCommands_1.handleSlashCommand)(this, raw);
    }
    // ---- ChatCommandHost 实现 ----
    get folderPath() {
        return this.folder.uri.fsPath;
    }
    async setSelection(sel) {
        this.selection = sel;
        (0, modelSelection_1.saveSelection)(this.globalStorageDir, this.folderHash, sel);
        // 立即通知前端更新状态栏/用量显示，并刷新侧边栏
        this.post({ type: "selectionChanged", selection: this.selection, effort: this.effectiveEffort() });
        (0, sidebar_1.refreshSidebarStatus)();
    }
    setEnabledSkills(names) {
        this.enabledSkills = names;
    }
    getEnvSecret(name) {
        return this.secrets.get(name);
    }
    setEnvSecret(name, value) {
        return this.secrets.set(name, value);
    }
    /** 跑一次不落聊天记录的一次性任务（用于 /compact）。 */
    async runHeadlessTask(task) {
        this.busy = true;
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 120000);
        try {
            const cli = await this.cliProvider();
            const cfg = vscode.workspace.getConfiguration("dsh-pro");
            const extraArgs = cfg.get("extraArgs", []);
            extraArgs.push("--patch", path.join(this.extensionPath, "patch", "stream.patch.yml"));
            const modelPatch = this.currentModelPatch();
            if (modelPatch)
                extraArgs.push("--patch", modelPatch);
            const args = (0, cli_1.buildSpawnArgs)(cli, extraArgs, task);
            const env = await this.envProvider();
            const result = await (0, cli_1.runDsh)(cli, args, {
                cwd: this.folder.uri.fsPath,
                timeoutMs: 120000,
                env,
                signal: abort.signal,
            });
            return result.code === 0 ? result.stdout.trim() || null : null;
        }
        catch {
            return null;
        }
        finally {
            clearTimeout(timer);
            this.busy = false;
        }
    }
    getTranscript() {
        return this.session.messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
            .join("\n\n")
            .slice(-60000);
    }
    replaceSessionWithSummary(summary) {
        const compacted = this.systemMessage(`（会话已压缩，原 ${this.session.messages.length} 条消息被替换为以下摘要）\n${summary}`);
        this.session = {
            id: this.session.id,
            title: this.session.title,
            createdAt: this.session.createdAt,
            updatedAt: Date.now(),
            messages: [compacted],
        };
        this.store.save(this.session);
        this.post({ type: "resetMessages" });
        this.post({ type: "appendMessage", message: compacted });
    }
    /** 生效的思维强度：优先用户选择，其次 settings 默认。 */
    effectiveEffort() {
        return this.selection?.reasoningEffort ?? (0, modelSelection_1.readDefaultEffort)();
    }
    statusLine() {
        const sel = this.selection;
        const provider = sel?.provider ?? "（DSH 默认）";
        const model = sel?.model ?? "（DSH 默认）";
        const effort = this.effectiveEffort() ?? "未设置";
        const skills = this.enabledSkills.length ? this.enabledSkills.join("、") : "无";
        const mode = vscode.workspace.getConfiguration("dsh-pro").get("permissionMode", "workspace-write");
        const usage = this.lastUsage
            ? `\n用量：输入 ${fmtNum(this.lastUsage.input)} · 输出 ${fmtNum(this.lastUsage.output)} · 缓存读 ${fmtNum(this.lastUsage.cacheRead)} · 推理 ${fmtNum(this.lastUsage.reasoning)} token` +
                (this.lastUsage.cacheRead + this.lastUsage.input > 0
                    ? ` · 缓存命中 ${Math.round((this.lastUsage.cacheRead / (this.lastUsage.cacheRead + this.lastUsage.input)) * 100)}%`
                    : "")
            : "";
        return `提供商：${provider}\n模型：${model}（思维强度 ${effort}）\n沙箱模式：${mode}\n已启用技能：${skills}${usage}`;
    }
    /** 当前模型选择对应的 --patch 文件（无选择时 undefined）。 */
    currentModelPatch() {
        if (!this.selection)
            return undefined;
        return (0, modelSelection_1.writeModelPatch)(this.globalStorageDir, this.folderHash, this.selection);
    }
    /** 在聊天中展示项目长期记忆。 */
    showMemory() {
        (0, chatCommands_1.postMemory)(this);
    }
    /** 在编辑器中打开项目记忆文件（不存在则创建）。 */
    async editMemory() {
        const file = path.join(this.folder.uri.fsPath, ".dsh", "memory.md");
        if (!this.memory.exists()) {
            const fs = await Promise.resolve().then(() => __importStar(require("fs")));
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, "# 项目长期记忆\n\n在这里记录项目的关键约定、架构决策、常用命令等，DSH 每次任务会自动参考。\n", "utf8");
        }
        void (await vscode.window.showTextDocument(vscode.Uri.file(file)));
        this.reveal();
    }
    addContextBlock(block) {
        const full = { ...block, id: UUID() };
        this.contextBlocks = [...this.contextBlocks, full];
        this.post({ type: "contextChanged", blocks: this.contextBlocks });
        this.reveal();
    }
    buildTaskText() {
        const cfg = vscode.workspace.getConfiguration("dsh-pro");
        const historyN = cfg.get("historyMessages", 20);
        const maxChars = cfg.get("maxMessageChars", 8000);
        const extraSections = [];
        const sel = this.selection;
        if (sel?.provider && sel.model) {
            extraSections.push(`本会话模型配置：提供商 ${sel.provider}，模型 ${sel.model}` +
                (this.effectiveEffort() ? `，思维强度 ${this.effectiveEffort()}` : ""));
        }
        if (this.enabledSkills.length > 0) {
            extraSections.push(`本会话已启用技能：${this.enabledSkills.join("、")}（按需通过技能工具加载）`);
        }
        return (0, taskText_1.buildTaskText)(this.folder.uri.fsPath, this.session, this.contextBlocks, this.memory, historyN, maxChars, extraSections);
    }
    // ---------------------------------------------------------------- 其它
    cancel() {
        if (this.running) {
            this.abort?.abort();
        }
    }
    insertCodeFromMessage(messageId) {
        const msg = this.session.messages.find((m) => m.id === messageId);
        if (!msg)
            return;
        (0, projectContext_1.insertCodeToEditor)((0, projectContext_1.extractCodeForInsert)(msg.content));
    }
    /** 把回答中的代码块写入项目文件（带路径猜测与确认）。 */
    async applyToFiles(messageId) {
        const msg = this.session.messages.find((m) => m.id === messageId);
        if (!msg)
            return;
        const blocks = (0, codeBlocks_1.extractCodeBlocks)(msg.content);
        if (blocks.length === 0) {
            void vscode.window.showWarningMessage("这段回答里没有可应用的代码块。");
            return;
        }
        if (blocks.length === 1) {
            await (0, applyCode_1.applyCodeBlock)(this.folder.uri.fsPath, blocks[0]);
            return;
        }
        const pick = await vscode.window.showQuickPick(blocks.map((b, i) => ({
            label: b.pathHint ?? `代码块 ${i + 1}（${b.language || "text"}）`,
            description: b.code.slice(0, 80).replace(/\n/g, " "),
            block: b,
        })), { placeHolder: "选择要应用哪个代码块" });
        if (pick)
            await (0, applyCode_1.applyCodeBlock)(this.folder.uri.fsPath, pick.block);
    }
    /** DSH Pro：解析点击的文件路径，返回真实存在的绝对路径；找不到返回 undefined。
     *  规则：
     *   1) 绝对路径 → 原样使用（不存在则按文件名搜索兜底）；
     *   2) 相对路径 → 先按工作目录拼接；
     *   3) 仍不存在 → 在工作目录树内搜索「以该相对路径结尾」的文件（跳过 node_modules/.git
     *      .vscode 等噪声目录），唯一命中即用，多个命中取层级最浅者。
     *  背景：模型回答里的相对路径常相对某个子目录书写（如 dsh-pro/media/x.js），
     *  只按工作目录根拼接会误报「文件不存在」。 */
    resolveFilePath(p, base) {
        if (!p || typeof p !== "string")
            return undefined;
        const norm = (s) => s.split(/[\\/]+/).filter(Boolean).join("/").toLowerCase();
        const candidates = [];
        if (path.isAbsolute(p)) {
            const abs = path.resolve(p);
            if (fs.existsSync(abs))
                return abs;
            candidates.push(norm(p));
        }
        else {
            const abs = base ? path.resolve(base, p) : path.resolve(p);
            if (fs.existsSync(abs))
                return abs;
            candidates.push(norm(p));
        }
        if (!base || !fs.existsSync(base))
            return undefined;
        const heavy = /^(node_modules|\.git|\.vscode|__pycache__|\.dsh|\.cache|\.npm|\.config|AppData|Downloads|Documents)$/i;
        const found = [];
        const seen = new Set();
        const walk = (dir, depth) => {
            if (depth > 8 || found.length >= 20)
                return;
            let entries;
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const e of entries) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) {
                    if (heavy.test(e.name))
                        continue;
                    walk(full, depth + 1);
                }
                else if (e.isFile()) {
                    const n = norm(full);
                    for (const c of candidates) {
                        if (n === c || n.endsWith("/" + c)) {
                            if (!seen.has(n)) {
                                seen.add(n);
                                found.push(full);
                            }
                            break;
                        }
                    }
                }
            }
        };
        walk(base, 0);
        if (found.length > 0) {
            found.sort((a, b) => a.split(/[\\/]/).length - b.split(/[\\/]/).length || a.localeCompare(b));
            return found[0];
        }
        return undefined;
    }
    dispose() {
        this.abort?.abort();
        for (const d of this.disposables) {
            d.dispose();
        }
        if (ChatPanel.instance === this) {
            ChatPanel.instance = undefined;
        }
    }
}
exports.ChatPanel = ChatPanel;
//# sourceMappingURL=chatPanel.js.map