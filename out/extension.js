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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const chatPanel_1 = require("./chatPanel");
const cli_1 = require("./cli");
const secrets_1 = require("./secrets");
const modelSelection_1 = require("./modelSelection");
const sessionStore_1 = require("./sessionStore");
const chatParticipant_1 = require("./chatParticipant");
const sidebar_1 = require("./sidebar");
/** 子进程环境变量提供者：进程环境 + 系统密钥链中的 API Key + 用户配置覆盖。 */
function createEnvProvider(secrets) {
    return async () => {
        const cfg = vscode.workspace.getConfiguration("dsh-pro");
        const extraEnv = cfg.get("environment", {});
        const permissionMode = cfg.get("permissionMode", "workspace-write");
        const env = { ...process.env };
        // 注入所有用户通过扩展保存的 API Key（环境里已有的以环境为准）
        const stored = await secrets.envSecrets();
        for (const [name, value] of Object.entries(stored)) {
            if (!env[name])
                env[name] = value;
        }
        // 用户显式配置的 environment 优先级最高
        const final = { ...env, ...extraEnv };
        // 沙箱权限模式：默认 workspace-write；用户若在 environment 里显式给了 DSH_PERMISSION_MODE 则以它为准
        if (!extraEnv.DSH_PERMISSION_MODE) {
            final.DSH_PERMISSION_MODE = permissionMode;
        }
        return final;
    };
}
/** 检测 DEEPSEEK_API_KEY 是否可用（不打印内容）。 */
async function apiKeyStatus(secrets) {
    const secret = await secrets.get("DEEPSEEK_API_KEY");
    if (secret)
        return "已配置（系统密钥链）";
    if (process.env.DEEPSEEK_API_KEY)
        return "已配置（环境变量 DEEPSEEK_API_KEY）";
    const credFile = path.join(os.homedir(), ".dsh", ".credentials.yaml");
    try {
        const raw = fs.readFileSync(credFile, "utf8");
        if (/DEEPSEEK_API_KEY\s*:/.test(raw))
            return "已配置（~/.dsh/.credentials.yaml）";
    }
    catch {
        // 文件不存在或不可读，按未配置处理
    }
    return "未配置 → 请运行「DSH: 配置 API Key」";
}
/** 状态栏控制器：运行中指示 + 就绪状态 + 当前工作目录。 */
class StatusBarController {
    item;
    running = false;
    ready = true;
    message = "DSH Pro: 打开对话面板";
    folder = "";
    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.item.command = "dsh-pro.openChat";
        this.item.show();
        this.setRunning(false);
        this.update();
    }
    setRunning(running) {
        this.running = running;
        // 让「editor/title」里的取消按钮按需出现（dshPro.running 上下文键）
        void vscode.commands.executeCommand("setContext", "dshPro.running", running);
        this.update();
    }
    setReady(ok, message) {
        this.ready = ok;
        this.message = message;
        this.update();
    }
    setFolder(folderPath) {
        this.folder = folderPath || "";
        this.update();
    }
    update() {
        const short = this.folder ? this.folder.split(/[\\/]/).filter(Boolean).pop() : "";
        this.item.text = this.running
            ? "$(sync~spin) DSH Pro 运行中"
            : short
                ? `$(comment-discussion) DSH Pro: ${short}`
                : "$(comment-discussion) DSH Pro";
        this.item.tooltip = this.message + (this.folder ? `\n工作目录: ${this.folder}` : "");
        this.item.color = this.ready ? undefined : new vscode.ThemeColor("errorForeground");
    }
    dispose() {
        this.item.dispose();
    }
}
/** 带缓存的 CLI 解析器；配置变更时失效。 */
function createCliProvider() {
    let cache;
    const provider = async () => {
        if (!cache) {
            const cfg = vscode.workspace.getConfiguration("dsh-pro");
            cache = (0, cli_1.resolveCli)(cfg.get("cliPath", "")).catch((err) => {
                cache = undefined;
                throw err;
            });
        }
        return cache;
    };
    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("dsh-pro.cliPath")) {
            cache = undefined;
        }
    });
    return provider;
}
// DSH Pro：最近使用工作目录的读写钩子（activate 里接入 context.globalState，跨窗口重启保留）。
// 用途：下次打开 VS Code 未打开文件夹时，自动回到上次对话所在目录（Claude Code 式），无需手动重新打开文件夹。
let getLastFolder = () => "";
let rememberLastFolder = (fsPath) => { };
/** DSH Pro：无工作区时的兜底目录 —— 最近使用目录（上次对话的文件夹）→ fallbackFolder 配置 → 主目录。 */
function fallbackFolder() {
    const cfg = vscode.workspace.getConfiguration("dsh-pro");
    const fb = cfg.get("fallbackFolder", "");
    let base = "";
    const last = getLastFolder();
    if (last && fs.existsSync(last)) {
        base = last;
    }
    else if (fb && fb.trim().length > 0) {
        base = path.resolve(fb.trim());
    }
    else {
        base = os.homedir();
    }
    try {
        fs.mkdirSync(base, { recursive: true });
    }
    catch {
        // 兜底目录创建失败时退回主目录
    }
    return { uri: vscode.Uri.file(base), name: path.basename(base) };
}
// DSH Pro：空窗口启动时自动把「上次对话所在目录」作为工作区打开，让左侧资源管理器直接显示文件夹（Claude Code 式）。
// 原理：vscode.openFolder 在同一窗口打开（forceReuseWindow: true）会让工作台重载并重启扩展宿主，
// 重载后的 restorePanel 会带着工作区再次执行并恢复对话面板（本函数的 await 不会返回，进程被重载杀掉）。
// 未触发重载（无记忆目录 / 配置关闭 / 打开失败）时本函数正常返回，调用方继续用兜底目录恢复面板。
// 用 globalState 里的 pending 标记防止「重载失败 → 再次自动打开 → 再重载」的死循环。
const AUTO_OPEN_FOLDER_KEY = "dshPro.autoOpenFolderPending";
async function autoOpenLastFolder(context) {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0)
        return; // 已有工作区，无需自动打开
    if (!vscode.workspace.getConfiguration("dsh-pro").get("autoOpenFolder", true))
        return; // 配置 dsh-pro.autoOpenFolder 关闭
    // 用户显式打开了具体文件（如 code a.js 启动、热退出恢复的文件）时不自动打开文件夹，避免打断
    if (vscode.workspace.textDocuments.some((d) => d.uri.scheme === "file" && !d.isUntitled))
        return;
    // 只自动打开「记忆的目录」或显式配置的 fallbackFolder，避免把整个主目录当工作区打开
    let target = "";
    const last = getLastFolder();
    if (last && fs.existsSync(last)) {
        target = last;
    }
    else {
        const fb = vscode.workspace.getConfiguration("dsh-pro").get("fallbackFolder", "");
        if (typeof fb === "string" && fb.trim().length > 0) {
            const resolved = path.resolve(fb.trim());
            if (fs.existsSync(resolved))
                target = resolved;
        }
    }
    if (!target)
        return;
    // 上次尝试未完成（标记未清，通常是重载未发生/失败）：本会话不再重试，清掉标记留待下次启动
    if (context.globalState.get(AUTO_OPEN_FOLDER_KEY, false)) {
        void context.globalState.update(AUTO_OPEN_FOLDER_KEY, false).then(undefined, () => { });
        return;
    }
    await context.globalState.update(AUTO_OPEN_FOLDER_KEY, true).then(undefined, () => { });
    try {
        await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(target), { forceReuseWindow: true });
        // 走到这里说明未触发窗口重载（极端情况），返回后由调用方按原逻辑恢复面板
    }
    catch {
        // 打开失败：清掉标记，退回原逻辑（面板照常恢复，目录用兜底）
        void context.globalState.update(AUTO_OPEN_FOLDER_KEY, false).then(undefined, () => { });
    }
}
async function pickFolder() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        // DSH Pro：无工作区时优先最近使用目录，其次用户配置的 fallbackFolder，最后用户主目录。
        // 返回与 WorkspaceFolder 同构的对象（uri + name），ChatPanel 等只依赖这两个字段。
        const folder = fallbackFolder();
        rememberLastFolder(folder.uri.fsPath);
        return folder;
    }
    if (folders.length === 1) {
        rememberLastFolder(folders[0].uri.fsPath);
        return folders[0];
    }
    const pick = await vscode.window.showQuickPick(folders.map((f) => ({
        label: f.name,
        description: f.uri.fsPath,
        folder: f,
    })), { placeHolder: "选择 DSH 工作目录" });
    if (pick?.folder) {
        rememberLastFolder(pick.folder.uri.fsPath);
    }
    return pick?.folder;
}
function relPath(folder, absPath) {
    const rel = path.relative(folder.uri.fsPath, absPath);
    return rel.startsWith("..") ? absPath : rel;
}
/** 递归列出目录下所有文件路径（用于自检扫描会话日志）。 */
function walkFiles(dir) {
    const out = [];
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return out;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory())
            out.push(...walkFiles(full));
        else
            out.push(full);
    }
    return out;
}
/** 运行 git diff 获取当前改动摘要（用于审查类快捷命令）。 */
function gitDiffSummary(cwd) {
    return new Promise((resolve) => {
        (0, child_process_1.execFile)("git", ["--no-pager", "diff", "--stat", "-M"], { cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 15000 }, (err, stdout) => {
            resolve(err ? "" : stdout.trim());
        });
    });
}
/** 打开（或复用）聊天面板并预填输入框。 */
async function openChatWithDraft(context, cliProvider, envProvider, secrets, status, log, draft) {
    const folder = await pickFolder();
    if (!folder)
        return undefined;
    const chat = chatPanel_1.ChatPanel.open(context, folder, cliProvider, envProvider, secrets, status, log);
    chat.setDraft(draft);
    return chat;
}
function activate(context) {
    const status = new StatusBarController();
    context.subscriptions.push(status);
    const output = vscode.window.createOutputChannel("DSH");
    context.subscriptions.push(output);
    const log = (line) => output.appendLine(line);
    const secrets = new secrets_1.SecretStore(context.secrets, path.join(context.globalStorageUri.fsPath, "secret-index.json"));
    const cliProvider = createCliProvider();
    const envProvider = createEnvProvider(secrets);
    // DSH Pro：左侧资源管理器点文件默认是「预览标签页」（VS Code 只保留一个，再点下一个会顶掉上一个）。
    // 用户要求多个文件并存 → 默认把 workbench.editor.enablePreview 关掉（全局生效，与聊天里点击文件
    // preview:false 的行为一致）；不想要此行为时设 dsh-pro.disablePreviewTabs=false 即恢复 VS Code 默认。
    if (vscode.workspace.getConfiguration("dsh-pro").get("disablePreviewTabs", true)) {
        const editorCfg = vscode.workspace.getConfiguration("workbench.editor");
        if (editorCfg.get("enablePreview", true) !== false) {
            void editorCfg.update("enablePreview", false, vscode.ConfigurationTarget.Global).then(undefined, () => { });
        }
    }
    // DSH Pro：记录/读取最近使用的工作目录（存入 VS Code globalState，跨窗口重启保留）。
    // 下次打开 VS Code 未打开文件夹时，自动回到上次对话的目录（Claude Code 式），无需手动重新打开文件夹。
    // 可通过 dsh-pro.rememberLastFolder 关闭。
    const shouldRememberFolder = () => vscode.workspace.getConfiguration("dsh-pro").get("rememberLastFolder", true);
    getLastFolder = () => {
        if (!shouldRememberFolder())
            return "";
        try {
            const v = context.globalState.get("lastFolder", "");
            return typeof v === "string" ? v : "";
        }
        catch {
            return "";
        }
    };
    rememberLastFolder = (fsPath) => {
        if (!fsPath || !shouldRememberFolder())
            return;
        void context.globalState.update("lastFolder", fsPath).then(undefined, () => { });
    };
    // DSH Pro：自动打开文件夹触发的窗口重载完成后（窗口已带工作区）清除 pending 标记；
    // 同时监听工作区变化——用户手动打开文件夹时同样清除，保证下次空窗口启动还能自动打开。
    const clearAutoOpenPending = () => void context.globalState.update(AUTO_OPEN_FOLDER_KEY, false).then(undefined, () => { });
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        clearAutoOpenPending();
    }
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            clearAutoOpenPending();
        }
    }));
    // @dsh-agent 聊天参与者（内置 Chat 中 @ 唤起）
    context.subscriptions.push((0, chatParticipant_1.registerChatParticipant)(context, cliProvider, envProvider, log));
    // 活动栏侧边栏状态视图
    context.subscriptions.push((0, sidebar_1.registerSidebarView)(context));
    context.subscriptions.push(vscode.commands.registerCommand("dsh-pro.openChat", async () => {
        const folder = await pickFolder();
        if (!folder)
            return;
        chatPanel_1.ChatPanel.open(context, folder, cliProvider, envProvider, secrets, status, log);
        status.setReady(true, "DSH Pro: 打开对话面板");
    }), 
    // DSH Pro：启动恢复用——静默选择工作目录（多根工作区不弹选择框）打开面板，停留在上次对话界面
    vscode.commands.registerCommand("dsh-pro.restorePanel", async () => {
        const folders = vscode.workspace.workspaceFolders;
        let folder;
        if (folders && folders.length > 0) {
            folder = folders[0];
        }
        else {
            // DSH Pro：空窗口启动时，先把上次对话所在目录作为工作区打开（左侧资源管理器直接显示文件夹，
            // 无需手动打开文件夹）。成功时会触发窗口重载并重启扩展宿主，重载后的 restorePanel
            // 会带着工作区再次执行并恢复对话面板（不会执行到这里）；未触发重载时继续用兜底目录恢复面板。
            await autoOpenLastFolder(context);
            // DSH Pro：无工作区时自动回到最近使用的工作目录（上次对话的文件夹），
            // 再依次兜底 fallbackFolder 配置、主目录。
            folder = fallbackFolder();
        }
        rememberLastFolder(folder.uri.fsPath);
        chatPanel_1.ChatPanel.open(context, folder, cliProvider, envProvider, secrets, status, log);
        status.setReady(true, "DSH Pro: 打开对话面板");
    }), 
    // 右上角标题栏按钮：打开（或复用）对话面板；编辑器有选区时自动加入上下文，并聚焦输入框
    vscode.commands.registerCommand("dsh-pro.openChatFromTitle", async () => {
        const editor = vscode.window.activeTextEditor;
        const hasSelection = !!editor && !editor.selection.isEmpty;
        let current = chatPanel_1.ChatPanel.current();
        if (!current) {
            const folder = await pickFolder();
            if (!folder)
                return;
            current = chatPanel_1.ChatPanel.open(context, folder, cliProvider, envProvider, secrets, status, log);
        }
        if (hasSelection) {
            current.attachSelection();
        }
        current.reveal();
        // 空字符串的 setDraft 只聚焦输入框、不填内容，方便直接打字（Claude Code 式体验）
        current.setDraft("");
        status.setReady(true, "DSH Pro: 打开对话面板");
    }), 
    // 配置 API Key：普通用户第一步，保存在系统密钥链（VS Code SecretStorage）
    vscode.commands.registerCommand("dsh-pro.configureApiKey", async () => {
        const hasSecret = !!(await secrets.get("DEEPSEEK_API_KEY"));
        const pick = await vscode.window.showQuickPick([
            {
                label: "设置 DeepSeek API Key",
                description: "保存在系统密钥链中，不写入任何配置文件",
            },
            {
                label: "清除已保存的 API Key",
                description: hasSecret ? "当前已配置" : "当前未配置",
            },
        ], { placeHolder: "DSH API Key 管理" });
        if (!pick)
            return;
        if (pick.label.startsWith("设置")) {
            const key = await vscode.window.showInputBox({
                prompt: "输入 DeepSeek API Key（sk- 开头，在 platform.deepseek.com 申请）",
                password: true,
                ignoreFocusOut: true,
                placeHolder: "sk-...",
                validateInput: (v) => (v && v.trim().length > 0 ? undefined : "API Key 不能为空"),
            });
            if (key) {
                await secrets.set("DEEPSEEK_API_KEY", key.trim());
                status.setReady(true, "DSH API Key 已配置");
                void vscode.window.showInformationMessage("API Key 已保存到系统密钥链。现在可以「DSH: 打开对话」开始使用了。");
            }
        }
        else {
            await secrets.delete("DEEPSEEK_API_KEY");
            status.setReady(hasSecret, hasSecret ? "DSH: API Key 已清除" : "DSH: 尚未配置 API Key");
            void vscode.window.showInformationMessage("已清除 API Key。");
        }
    }), 
    // 环境自检：普通用户装完第一步就运行它
    vscode.commands.registerCommand("dsh-pro.checkEnvironment", async () => {
        output.clear();
        output.appendLine("DSH 环境检查");
        output.appendLine("==============");
        try {
            const cli = await cliProvider();
            output.appendLine(`dsh 定位: ${cli.source}`);
            output.appendLine(cli.kind === "entry" ? `入口文件: ${cli.entry}` : `可执行文件: ${cli.command}`);
            const version = await (0, cli_1.runCliVersion)(cli);
            output.appendLine(`版本: ${version || "未知"}`);
            const key = await apiKeyStatus(secrets);
            output.appendLine(`API Key: ${key}`);
            const permMode = vscode.workspace.getConfiguration("dsh-pro").get("permissionMode", "workspace-write");
            output.appendLine(`沙箱模式: ${permMode}（无交互 headless 下审批失败关闭，无法自我越权）`);
            if (permMode === "danger-full-access") {
                void vscode.window.showWarningMessage("⚠ 沙箱模式为 danger-full-access：dsh 将不受限操作且审批自动放行，请确保任务可信。");
            }
            output.appendLine("");
            output.appendLine("检查通过。打开项目后执行「DSH: 打开对话」即可开始。");
            output.show(true);
            status.setReady(true, `DSH ${version} 已就绪`);
            void vscode.window.showInformationMessage(`DSH ${version} 已就绪（API Key ${key.startsWith("已配置") ? "✓" : "✗"}）`);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            output.appendLine(`检查失败: ${message}`);
            output.appendLine("");
            output.appendLine("请确认：");
            output.appendLine("  1. 已全局安装 dsh：npm i -g @deepseek-ai/dsh（需先安装 Node.js：https://nodejs.org）");
            output.appendLine("  2. dsh 在 PATH 中（新开一个终端执行 dsh --version 验证；安装后请完全退出并重启 VS Code，PATH 才会生效）");
            output.appendLine("  3. 或在本扩展设置 dsh-pro.cliPath 中指定 dsh 路径");
            output.show(true);
            status.setReady(false, "DSH: 环境异常，运行「DSH: 检查环境」查看详情");
            void vscode.window.showErrorMessage(`DSH 环境检查失败：${message}`);
        }
    }), 
    // 兼容性自检：跑一次 tiny 任务，验证流式补丁（明文会话日志）与模型补丁机制
    vscode.commands.registerCommand("dsh-pro.selfTest", async () => {
        const folder = await pickFolder();
        if (!folder)
            return;
        output.clear();
        output.appendLine("DSH 兼容性自检");
        output.appendLine("================");
        void vscode.window.showInformationMessage("DSH 兼容性自检进行中…（约 10-20 秒）");
        try {
            const cli = await cliProvider();
            const env = await envProvider();
            const streamPatch = path.join(context.extensionPath, "patch", "stream.patch.yml");
            const sessionsDir = path.join(env.DSH_HOME || path.join(os.homedir(), ".dsh"), "sessions-vscode");
            const before = new Set(walkFiles(sessionsDir).filter((f) => f.endsWith("session.jsonl")));
            const extraArgs = ["--patch", streamPatch];
            const sel = chatPanel_1.ChatPanel.current()?.selection;
            const modelPatch = sel ? (0, modelSelection_1.writeModelPatch)(context.globalStorageUri.fsPath, (0, sessionStore_1.stableHash)(folder.uri.fsPath), sel) : undefined;
            if (modelPatch)
                extraArgs.push("--patch", modelPatch);
            const args = (0, cli_1.buildSpawnArgs)(cli, extraArgs, "请只回复两个字：好的");
            const result = await (0, cli_1.runDsh)(cli, args, {
                cwd: folder.uri.fsPath,
                timeoutMs: 90000,
                env,
            });
            const after = walkFiles(sessionsDir);
            const newLog = after.find((f) => f.endsWith("session.jsonl") && !before.has(f));
            output.appendLine(`任务执行: ${result.code === 0 ? "✓ exit 0" : `✗ exit ${result.code}`}`);
            if (result.stderr.trim())
                output.appendLine(`  stderr: ${result.stderr.trim().slice(0, 300)}`);
            output.appendLine(`流式补丁（明文会话日志）: ${newLog ? "✓ 已生成" : "✗ 未生成（流式将不可用）"}`);
            if (newLog)
                output.appendLine(`  日志: ${newLog}`);
            if (sel)
                output.appendLine(`模型补丁: 已随任务传入（${sel.provider}/${sel.model}），若任务成功即生效`);
            output.appendLine("");
            output.appendLine(result.code === 0 && newLog
                ? "自检通过：流式与模型机制正常。"
                : "自检发现问题，请把以上输出反馈给维护者。");
            output.show(true);
            if (result.code === 0 && newLog) {
                status.setReady(true, "DSH 兼容性自检通过");
                void vscode.window.showInformationMessage("DSH 兼容性自检通过。");
            }
            else {
                status.setReady(false, "DSH: 兼容性自检失败，查看输出面板 DSH");
                void vscode.window.showErrorMessage("DSH 兼容性自检失败，请查看输出面板（DSH）。");
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            output.appendLine(`自检异常: ${message}`);
            output.show(true);
            status.setReady(false, "DSH: 自检异常");
            void vscode.window.showErrorMessage(`DSH 兼容性自检异常：${message}`);
        }
    }), vscode.commands.registerCommand("dsh-pro.newSession", async () => {
        let current = chatPanel_1.ChatPanel.current();
        if (!current) {
            const folder = await pickFolder();
            if (!folder)
                return;
            current = chatPanel_1.ChatPanel.open(context, folder, cliProvider, envProvider, secrets, status, log);
        }
        current.newSession();
    }), 
    // Claude Code 式：Ctrl+Escape 聚焦输入框（面板已打开时直接聚焦，未打开则打开）
    vscode.commands.registerCommand("dsh-pro.focusInput", async () => {
        let current = chatPanel_1.ChatPanel.current();
        if (!current) {
            const folder = await pickFolder();
            if (!folder)
                return;
            current = chatPanel_1.ChatPanel.open(context, folder, cliProvider, envProvider, secrets, status, log);
        }
        current.reveal();
        // 空字符串 setDraft 只聚焦输入框、不填内容
        current.setDraft("");
    }), 
    // Claude Code 式：Alt+K 把当前文件作为 @引用 加入对话
    vscode.commands.registerCommand("dsh-pro.insertAtMention", async () => {
        const editor = vscode.window.activeTextEditor;
        const doc = editor?.document;
        if (!doc) {
            void vscode.window.showInformationMessage("没有打开的文件可引用。");
            return;
        }
        let current = chatPanel_1.ChatPanel.current();
        if (!current) {
            const folder = await pickFolder();
            if (!folder)
                return;
            current = chatPanel_1.ChatPanel.open(context, folder, cliProvider, envProvider, secrets, status, log);
        }
        if (!current.folderPath || !doc.uri.fsPath.startsWith(current.folderPath)) {
            // 文件不在当前工作目录内时直接给出相对路径引用，不做上下文附加
            current.reveal();
            current.setDraft(`@${doc.uri.fsPath} `);
            return;
        }
        const rel = path.relative(current.folderPath, doc.uri.fsPath);
        current.attachOpenFile();
        current.reveal();
        current.setDraft(`@${rel} `);
    }), 
    // Claude Code 式：Ctrl+Alt+F 切换专注视图（隐藏思考/工具细节）
    vscode.commands.registerCommand("dsh-pro.toggleFocusView", () => {
        const cfg = vscode.workspace.getConfiguration("dsh-pro");
        const next = !cfg.get("focusView", false);
        void cfg.update("focusView", next, vscode.ConfigurationTarget.Global);
        const current = chatPanel_1.ChatPanel.current();
        current?.post({ type: "focusViewChanged", enabled: next });
        void vscode.window.setStatusBarMessage(next ? "DSH Pro：专注视图已开启（隐藏工具细节）" : "DSH Pro：专注视图已关闭", 3000);
    }), 
    // Claude Code 式：循环切换权限模式（default → plan → bypass）
    vscode.commands.registerCommand("dsh-pro.togglePermissionMode", async () => {
        const current = chatPanel_1.ChatPanel.current();
        if (current) {
            await current.togglePermissionMode();
        }
    }), vscode.commands.registerCommand("dsh-pro.cancelRun", () => {
        const current = chatPanel_1.ChatPanel.current();
        current?.cancel();
    }), vscode.commands.registerCommand("dsh-pro.addSelection", async () => {
        let current = chatPanel_1.ChatPanel.current();
        if (!current) {
            const folder = await pickFolder();
            if (!folder)
                return;
            current = chatPanel_1.ChatPanel.open(context, folder, cliProvider, envProvider, secrets, status, log);
        }
        current.attachSelection();
    }), vscode.commands.registerCommand("dsh-pro.addOpenFile", async () => {
        let current = chatPanel_1.ChatPanel.current();
        if (!current) {
            const folder = await pickFolder();
            if (!folder)
                return;
            current = chatPanel_1.ChatPanel.open(context, folder, cliProvider, envProvider, secrets, status, log);
        }
        current.attachOpenFile();
    }), vscode.commands.registerCommand("dsh-pro.askAboutFile", async (uri) => {
        const folder = await pickFolder();
        if (!folder)
            return;
        const chat = chatPanel_1.ChatPanel.open(context, folder, cliProvider, envProvider, secrets, status, log);
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!target)
            return;
        let content = "";
        try {
            const buf = await vscode.workspace.fs.readFile(target);
            content = Buffer.from(buf).toString("utf8");
        }
        catch {
            content = "（无法读取文件内容）";
        }
        const label = relPath(folder, target.fsPath);
        chat.addContextBlock({
            kind: "file",
            label,
            content: content.length > 40000 ? content.slice(0, 40000) + "\n…(文件过大，已截断)" : content,
        });
        chat.setDraft(`请分析这个文件：@${label}\n`);
    }), 
    // ---- 快捷提示命令 ----
    vscode.commands.registerCommand("dsh-pro.quickExplainFile", async () => {
        const chat = await openChatWithDraft(context, cliProvider, envProvider, secrets, status, log, "请解释当前文件的结构、职责和关键逻辑。\n");
        const editor = vscode.window.activeTextEditor;
        if (chat && editor)
            chat.attachOpenFile();
    }), vscode.commands.registerCommand("dsh-pro.quickReviewChanges", async () => {
        const folder = await pickFolder();
        if (!folder)
            return;
        const chat = chatPanel_1.ChatPanel.open(context, folder, cliProvider, envProvider, secrets, status, log);
        const diff = await gitDiffSummary(folder.uri.fsPath);
        if (diff) {
            chat.addContextBlock({ kind: "file", label: "git diff（当前改动）", content: diff });
        }
        else {
            void vscode.window.showInformationMessage("未检测到 git 改动（可能不是 git 仓库或没有未提交改动）。");
        }
        chat.setDraft("请审查当前改动（git diff 已作为上下文提供）：指出潜在问题、改进建议，并说明每个文件改了什么。\n");
    }), vscode.commands.registerCommand("dsh-pro.quickWriteTests", async () => {
        const chat = await openChatWithDraft(context, cliProvider, envProvider, secrets, status, log, "请为当前文件编写单元测试，遵循项目现有的测试风格与框架。\n");
        const editor = vscode.window.activeTextEditor;
        if (chat && editor)
            chat.attachOpenFile();
    }), 
    // ---- 终端与记忆 ----
    vscode.commands.registerCommand("dsh-pro.openTerminal", async () => {
        const folder = await pickFolder();
        if (!folder)
            return;
        const terminal = vscode.window.createTerminal({
            name: "DSH",
            cwd: folder.uri,
        });
        terminal.show();
        // 用独立端口启动 dsh web，避免与已运行的实例冲突
        terminal.sendText("dsh web --port 3088");
    }), vscode.commands.registerCommand("dsh-pro.editMemory", async () => {
        const current = chatPanel_1.ChatPanel.current();
        if (current) {
            await current.editMemory();
            return;
        }
        const folder = await pickFolder();
        if (!folder)
            return;
        const chat = chatPanel_1.ChatPanel.open(context, folder, cliProvider, envProvider, secrets, status, log);
        await chat.editMemory();
    }), vscode.commands.registerCommand("dsh-pro.showMemory", async () => {
        const current = chatPanel_1.ChatPanel.current();
        if (current) {
            current.showMemory();
            return;
        }
        const folder = await pickFolder();
        if (!folder)
            return;
        const chat = chatPanel_1.ChatPanel.open(context, folder, cliProvider, envProvider, secrets, status, log);
        chat.showMemory();
    }));
    // DSH Pro：VS Code 启动后自动恢复对话面板（Claude Code 式：窗口打开即停留在上次对话界面）。
    // 延迟到窗口就绪后执行，避免抢占启动；可通过 dsh-pro.restorePanelOnStartup 关闭。
    if (vscode.workspace.getConfiguration("dsh-pro").get("restorePanelOnStartup", true)) {
        const timer = setTimeout(() => {
            void vscode.commands.executeCommand("dsh-pro.restorePanel").then(undefined, () => { });
        }, 1000);
        context.subscriptions.push(new vscode.Disposable(() => clearTimeout(timer)));
    }
}
function deactivate() {
    // 订阅项随 extension host 退出统一释放
}
//# sourceMappingURL=extension.js.map