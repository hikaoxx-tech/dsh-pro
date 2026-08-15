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
exports.registerChatParticipant = registerChatParticipant;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const cli_1 = require("./cli");
const sessionTracer_1 = require("./sessionTracer");
const modelSelection_1 = require("./modelSelection");
const sessionStore_1 = require("./sessionStore");
const memory_1 = require("./memory");
/**
 * 注册 @dsh-agent 聊天参与者：在 VS Code 内置 Chat 里 @dsh-agent <任务> 即可唤起，
 * 复用 headless 驱动 + 流式进度，回答以 markdown 吐回聊天流。
 */
function registerChatParticipant(context, cliProvider, envProvider, log) {
    const participant = vscode.chat.createChatParticipant("dsh-agent", async (request, _chatCtx, stream, token) => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            stream.markdown("请先打开一个项目文件夹，再使用 DSH。");
            return { metadata: {} };
        }
        const prompt = request.prompt.trim();
        if (!prompt) {
            stream.markdown("请输入要交给 DSH 的任务，例如：`@dsh-agent 总结一下这个项目的结构`。");
            return { metadata: {} };
        }
        stream.progress("正在运行 DSH…");
        const refText = await collectReferences(request.references);
        const memory = new memory_1.ProjectMemory(folder.uri.fsPath);
        const taskText = buildChatTaskText(folder.uri.fsPath, prompt, refText, memory.excerpt());
        let cli;
        try {
            cli = await cliProvider();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            stream.markdown(`无法解析 dsh 命令：${message}`);
            return { metadata: {} };
        }
        const cfg = vscode.workspace.getConfiguration("dsh-pro");
        const extraArgs = cfg.get("extraArgs", []);
        // DSH Pro：仅当用户在设置里显式配置过 timeoutSeconds 才用设置值，
        // 否则一律 21600（6 小时），避免窗口未重载时旧 manifest 缓存的 600s 默认值生效
        const _t = cfg.inspect("timeoutSeconds");
        const timeoutSec = _t && (_t.globalValue !== undefined || _t.workspaceValue !== undefined || _t.workspaceFolderValue !== undefined)
            ? cfg.get("timeoutSeconds")
            : 21600;
        const streamProgress = cfg.get("streamProgress", true);
        if (streamProgress) {
            extraArgs.push("--patch", path.join(context.extensionPath, "patch", "stream.patch.yml"));
        }
        const folderHash = (0, sessionStore_1.stableHash)(folder.uri.fsPath);
        const selection = (0, modelSelection_1.loadSelection)(context.globalStorageUri.fsPath, folderHash);
        const modelPatch = selection ? (0, modelSelection_1.writeModelPatch)(context.globalStorageUri.fsPath, folderHash, selection) : undefined;
        if (modelPatch)
            extraArgs.push("--patch", modelPatch);
        const args = (0, cli_1.buildSpawnArgs)(cli, extraArgs, taskText);
        const env = await envProvider();
        const abort = new AbortController();
        const sub = token.onCancellationRequested(() => abort.abort());
        let tracer;
        if (streamProgress) {
            tracer = new sessionTracer_1.SessionTracer(env, Date.now(), log);
            void tracer.start((msg) => {
                if (msg.kind === "tool")
                    stream.progress(`执行工具：${msg.name}`);
                else if (msg.kind === "turn" && msg.turn > 0)
                    stream.progress(`第 ${msg.turn} 轮`);
            }, abort.signal);
        }
        try {
            const result = await (0, cli_1.runDsh)(cli, args, {
                cwd: folder.uri.fsPath,
                timeoutMs: timeoutSec * 1000,
                env,
                signal: abort.signal,
            });
            tracer?.finish();
            if (token.isCancellationRequested) {
                stream.markdown("已取消。");
                return { metadata: {} };
            }
            if (result.timedOut) {
                stream.markdown(`任务超时（超过 ${timeoutSec} 秒）已被取消。可在设置 dsh-pro.timeoutSeconds 中调整。`);
                return { metadata: {} };
            }
            if (result.code !== 0) {
                const detail = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n");
                stream.markdown(`DSH 任务失败（exit ${result.code ?? "?"}）：\n\n\`\`\`\n${detail}\n\`\`\``);
                return { metadata: {} };
            }
            let answer = result.stdout.trim() || "（DSH 未返回文本输出）";
            // DSH Pro：任务结束后附上修改过的文件清单
            const changes = tracer ? tracer.changesList() : [];
            if (changes.length > 0) {
                const paths = [...new Set(changes.map((c) => c.path).filter(Boolean))].slice(0, 10);
                answer += "\n\n📝 修改的文件：\n" + paths.map((p) => `- \`${p}\``).join("\n");
            }
            stream.markdown(answer);
            return { metadata: {} };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            stream.markdown(`运行 DSH 失败：${message}`);
            return { metadata: {} };
        }
        finally {
            sub.dispose();
        }
    });
    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
    return participant;
}
async function collectReferences(refs) {
    const parts = [];
    for (const ref of refs) {
        const value = ref.value;
        if (value instanceof vscode.Uri) {
            try {
                const buf = await vscode.workspace.fs.readFile(value);
                const content = Buffer.from(buf).toString("utf8");
                const clipped = content.length > 40000 ? content.slice(0, 40000) + "\n…(文件过大，已截断)" : content;
                parts.push(`@${value.fsPath}\n${clipped}`);
            }
            catch {
                parts.push(`@${value.fsPath}\n（无法读取）`);
            }
        }
        else if (typeof value === "string" && value.trim()) {
            parts.push(value.slice(0, 2000));
        }
    }
    return parts.join("\n\n");
}
function buildChatTaskText(folderPath, prompt, refText, memoryText) {
    const lines = [
        "你在 VS Code 的 Copilot Chat 中通过 @dsh-agent 辅助用户完成项目任务。",
        `项目根目录：${folderPath}`,
        "请直接回应这个任务，不要复述或客套。",
    ];
    if (memoryText) {
        lines.push("", "--- 项目长期记忆（按需参考）---", memoryText);
    }
    if (refText) {
        lines.push("", "用户引用了以下文件/内容，按需参考：", refText);
    }
    lines.push("", "--- 任务 ---", prompt);
    return lines.join("\n");
}
//# sourceMappingURL=chatParticipant.js.map