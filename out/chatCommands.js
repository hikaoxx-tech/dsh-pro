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
exports.SLASH_HELP = void 0;
exports.handleSlashCommand = handleSlashCommand;
exports.postMemory = postMemory;
const vscode = __importStar(require("vscode"));
const modelSelection_1 = require("./modelSelection");
const skills_1 = require("./skills");
exports.SLASH_HELP = [
    "/help             显示本帮助",
    "/clear            新建会话（清空当前对话）",
    "/memory           查看项目长期记忆",
    "/edit-memory      在编辑器中打开记忆文件",
    "/remember <内容>  把一条知识记入项目长期记忆",
    "/context          查看当前挂载的上下文",
    "/resume           浏览并载入历史会话",
    "/provider         切换模型提供商（可输入 API Key）",
    "/model            切换模型",
    "/effort           切换思维强度 (off/low/medium/high/max)",
    "/skills           选择要启用的技能",
    "/compact          压缩当前会话为摘要（释放上下文）",
    "/plan             计划模式（只读，不修改文件）",
    "/default          默认权限模式（询问确认）",
    "/bypass           完全放行（不询问，谨慎使用）",
    "/status           查看当前配置与用量",
].join("\n");
/** 斜杠命令菜单数据（Claude Code 式：输入 / 弹出可选项）。 */
exports.SLASH_COMMANDS = [
    { cmd: "/help", label: "帮助", description: "显示所有可用命令", needsArgs: false },
    { cmd: "/clear", label: "新对话", description: "新建会话，清空当前对话", needsArgs: false },
    { cmd: "/resume", label: "历史会话", description: "浏览并载入过去的会话", needsArgs: false },
    { cmd: "/compact", label: "压缩会话", description: "把当前对话压缩为摘要，释放上下文", needsArgs: false },
    { cmd: "/memory", label: "项目记忆", description: "查看项目长期记忆", needsArgs: false },
    { cmd: "/edit-memory", label: "编辑记忆", description: "在编辑器中打开记忆文件", needsArgs: false },
    { cmd: "/remember", label: "记住一条知识", description: "例如 /remember 构建命令是 npm run build", needsArgs: true },
    { cmd: "/context", label: "上下文", description: "查看当前挂载的上下文", needsArgs: false },
    { cmd: "/provider", label: "模型提供商", description: "切换提供商并配置 API Key", needsArgs: false },
    { cmd: "/model", label: "模型", description: "切换模型", needsArgs: false },
    { cmd: "/effort", label: "思维强度", description: "off/low/medium/high/max", needsArgs: false },
    { cmd: "/skills", label: "技能", description: "选择要启用的技能", needsArgs: false },
    { cmd: "/plan", label: "计划模式", description: "只读模式，不修改任何文件", needsArgs: false },
    { cmd: "/default", label: "默认模式", description: "恢复默认权限（询问确认）", needsArgs: false },
    { cmd: "/bypass", label: "完全放行", description: "跳过所有确认（谨慎使用）", needsArgs: false },
    { cmd: "/status", label: "状态", description: "查看当前配置与用量", needsArgs: false },
];
/** 处理聊天输入中的 slash 命令。 */
function handleSlashCommand(host, raw) {
    const parts = raw.trim().split(/\s+/);
    const cmd = parts[0] ?? "";
    const rest = raw.trim().slice(cmd.length).trim();
    switch (cmd) {
        case "/help":
            host.post({ type: "appendMessage", message: host.systemMessage(exports.SLASH_HELP) });
            break;
        case "/clear":
            host.newSession();
            break;
        case "/memory":
            postMemory(host);
            break;
        case "/resume":
            void host.listSessions();
            break;
        case "/plan":
            void host.setPermissionMode("read-only", "计划模式 · 只读", "计划");
            host.post({ type: "appendMessage", message: host.systemMessage("已切换到计划模式（只读）：DSH 只会分析、不会修改文件。输入 /default 恢复。") });
            break;
        case "/default":
            void host.setPermissionMode("workspace-write", "默认 · 询问", "询问");
            host.post({ type: "appendMessage", message: host.systemMessage("已恢复默认权限模式（询问确认）。") });
            break;
        case "/bypass":
            void host.setPermissionMode("danger-full-access", "完全放行 · bypass", "放行");
            host.post({ type: "appendMessage", message: host.systemMessage("已切换到完全放行（bypass）：DSH 将不受限操作且审批自动放行，请确保任务可信。") });
            break;
        case "/edit-memory":
            void host.editMemory();
            break;
        case "/remember": {
            if (!rest) {
                host.post({
                    type: "appendMessage",
                    message: host.systemMessage("用法：/remember <要记住的内容>，例如：/remember 构建命令是 npm run build"),
                });
                break;
            }
            host.memory.append(rest);
            host.post({
                type: "appendMessage",
                message: host.systemMessage(`已记入项目长期记忆：${rest}`),
            });
            break;
        }
        case "/context": {
            const summary = host.contextBlocks.length === 0
                ? "（当前没有挂载的上下文）"
                : host.contextBlocks.map((b) => `- [${b.kind}] ${b.label}`).join("\n");
            host.post({ type: "appendMessage", message: host.systemMessage(`当前上下文：\n${summary}`) });
            break;
        }
        case "/provider":
            void pickProvider(host);
            break;
        case "/model":
            void pickModel(host);
            break;
        case "/effort":
            void pickEffort(host);
            break;
        case "/skills":
            void pickSkills(host);
            break;
        case "/compact":
            void compactConversation(host);
            break;
        case "/status":
            host.post({ type: "appendMessage", message: host.systemMessage(host.statusLine()) });
            break;
        default:
            host.post({
                type: "appendMessage",
                message: host.systemMessage(`未知命令「${cmd}」。支持的命令：\n${exports.SLASH_HELP}`),
            });
    }
}
// ---------------------------------------------------------------- 提供商 / 模型 / 强度
async function pickProvider(host) {
    const providers = [modelSelection_1.DEEPSEEK_PROVIDER, ...(0, modelSelection_1.readCustomProviders)()];
    const pick = await vscode.window.showQuickPick(providers.map((p) => ({
        label: p.displayName,
        description: p.id,
        detail: p.apiKeyEnv ? `API Key 环境变量：${p.apiKeyEnv}` : undefined,
        provider: p,
    })), { placeHolder: "选择模型提供商" });
    if (!pick)
        return;
    const envName = (0, modelSelection_1.apiKeyEnvFor)(pick.provider.id);
    if (envName) {
        const existing = await host.getEnvSecret(envName);
        const act = await vscode.window.showQuickPick([
            { label: "设置 API Key", description: existing ? "当前已配置（保存在系统密钥链）" : "尚未配置" },
            { label: "跳过（使用环境变量 / DSH 凭证）", description: "" },
        ], { placeHolder: `${pick.provider.displayName} 需要 API Key（${envName}）` });
        if (act?.label.startsWith("设置")) {
            const key = await vscode.window.showInputBox({
                prompt: `输入 API Key（${envName}）`,
                password: true,
                ignoreFocusOut: true,
                validateInput: (v) => (v && v.trim().length > 0 ? undefined : "不能为空"),
            });
            if (key) {
                await host.setEnvSecret(envName, key.trim());
            }
        }
    }
    const sel = {
        provider: pick.provider.id,
        model: host.selection?.model ?? "",
        reasoningEffort: host.selection?.reasoningEffort,
    };
    await host.setSelection(sel);
    host.post({
        type: "appendMessage",
        message: host.systemMessage(`提供商已切换：${pick.provider.displayName}（${pick.provider.id}）。下一步用 /model 选模型。`),
    });
}
async function pickModel(host) {
    const providerId = host.selection?.provider ?? modelSelection_1.DEEPSEEK_PROVIDER.id;
    const models = (0, modelSelection_1.listModels)(providerId);
    if (models.length === 0) {
        host.post({
            type: "appendMessage",
            message: host.systemMessage(`提供商 ${providerId} 没有可列举的模型，可手动输入模型名。`),
        });
    }
    const input = await vscode.window.showQuickPick([
        ...models.map((m) => ({ label: m, description: undefined, model: m })),
        { label: "$(add) 手动输入模型名…", description: undefined, model: undefined },
    ], { placeHolder: `选择模型（当前提供商 ${providerId}）` });
    let model = input?.model;
    if (input && input.model === undefined) {
        model = await vscode.window.showInputBox({
            prompt: "输入模型名",
            ignoreFocusOut: true,
            validateInput: (v) => (v && v.trim().length > 0 ? undefined : "不能为空"),
        });
    }
    if (!model)
        return;
    await host.setSelection({ ...host.selection, provider: providerId, model });
    host.post({ type: "appendMessage", message: host.systemMessage(`模型已切换：${model}`) });
}
async function pickEffort(host) {
    const current = host.selection?.reasoningEffort;
    const pick = await vscode.window.showQuickPick(modelSelection_1.REASONING_EFFORTS.map((e) => ({
        label: e,
        description: e === current ? "当前" : undefined,
        effort: e,
    })), { placeHolder: "选择思维强度" });
    if (!pick)
        return;
    await host.setSelection({ ...host.selection, provider: host.selection?.provider ?? modelSelection_1.DEEPSEEK_PROVIDER.id, model: host.selection?.model ?? "", reasoningEffort: pick.effort });
    host.post({ type: "appendMessage", message: host.systemMessage(`思维强度已切换：${pick.effort}`) });
}
// ---------------------------------------------------------------- 技能
async function pickSkills(host) {
    const skills = (0, skills_1.listSkills)(host.folderPath);
    if (skills.length === 0) {
        host.post({
            type: "appendMessage",
            message: host.systemMessage("当前没有可用技能。技能目录：~/.dsh/skills/ 或 <项目>/.dsh/skills/，每个技能一个子目录，内含 SKILL.md（frontmatter: name/description）。"),
        });
        return;
    }
    const picks = await vscode.window.showQuickPick(skills.map((s) => ({
        label: s.name,
        description: s.description,
        detail: s.root,
        picked: host.enabledSkills.includes(s.name),
        skill: s,
    })), { canPickMany: true, placeHolder: "选择要启用的技能（可多选）" });
    if (!picks)
        return;
    host.setEnabledSkills(picks.map((p) => p.skill.name));
    host.post({
        type: "appendMessage",
        message: host.systemMessage(picks.length > 0 ? `已启用技能：${picks.map((p) => p.skill.name).join("、")}` : "已清空技能选择"),
    });
}
// ---------------------------------------------------------------- 压缩
async function compactConversation(host) {
    host.post({ type: "appendMessage", message: host.systemMessage("正在压缩会话…（由 DSH 生成摘要）") });
    const task = "你是会话压缩器。把下面的对话压缩成一份结构化摘要（中文，300-500 字），必须保留：\n" +
        "1) 任务目标与当前进展；2) 已确认的关键决策和结论；3) 用户偏好与约束；4) 待办事项；5) 重要的代码/命令/文件路径。\n" +
        "只输出摘要本身，不要额外说明。\n\n--- 对话记录 ---\n" + host.getTranscript();
    const summary = await host.runHeadlessTask(task);
    if (!summary) {
        host.post({
            type: "appendMessage",
            message: host.systemMessage("压缩失败（dsh 未返回结果）。可重试或继续使用原会话。"),
        });
        return;
    }
    host.replaceSessionWithSummary(summary);
    host.post({
        type: "appendMessage",
        message: host.systemMessage(`会话已压缩，历史替换为摘要：\n${summary}`),
    });
}
/** 在聊天中展示项目长期记忆。 */
function postMemory(host) {
    const content = host.memory.read().trim();
    const body = content
        ? content.slice(0, 4000) + (content.length > 4000 ? "\n…(内容过长，仅显示开头)" : "")
        : "（项目长期记忆为空，可用 /remember 添加）";
    host.post({ type: "appendMessage", message: host.systemMessage(`项目长期记忆：\n${body}`) });
}
//# sourceMappingURL=chatCommands.js.map