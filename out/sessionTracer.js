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
exports.SessionTracer = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
/** 会修改文件的工具名（用于收集"本次任务改了什么"）。
 *  DSH Pro：包含 str_replace_editor（本机 DSH 实际使用的编辑工具）——
 *  之前漏了它，导致它的改动不进入"修改的文件"汇总、实时卡片也不显示目标文件。 */
const CHANGE_TOOL_NAMES = new Set([
    "write", "edit", "applyCode", "apply_code", "apply_patch", "patch",
    "str_replace", "str_replace_editor", "create", "insert", "multiEdit", "rewrite", "modify",
]);
/** 从工具参数（JSON 字符串）里提取目标文件路径。 */
function extractFilePath(raw) {
    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (obj && typeof obj === "object") {
            for (const key of ["file_path", "path", "filePath", "target", "file"]) {
                const v = obj[key];
                if (typeof v === "string" && v.length > 0)
                    return v;
            }
        }
    }
    catch {
        // 参数可能不是 JSON（流式截断等），忽略
    }
    return undefined;
}
/** 从 tool/result 记录的 data.meta 提取结构化 diff（{path, oldText, newText}）。 */
function extractDiffs(meta) {
    if (!meta || typeof meta !== "object" || !Array.isArray(meta.diffs))
        return undefined;
    const out = [];
    for (const d of meta.diffs) {
        if (!d || typeof d !== "object")
            continue;
        const p = typeof d.path === "string" ? d.path : "";
        const oldText = d.oldText === null || d.oldText === undefined ? "" : String(d.oldText);
        const newText = d.newText === null || d.newText === undefined ? "" : String(d.newText);
        if (!p)
            continue;
        out.push({ path: p, oldText: oldText.slice(0, 4000), newText: newText.slice(0, 4000) });
    }
    return out.length > 0 ? out : undefined;
}
/** 把 DSH 会话事件日志（明文 JSONL）实时 tail 成进度消息。
 * 会话目录结构：$DSH_HOME/sessions-vscode/<bucket>/session-<uuid>/session.jsonl */
class SessionTracer {
    startedAt;
    sessionsDir;
    snapshot;
    log;
    finished = false;
    eventsParsed = 0;
    found = false;
    usageAcc;
    /** 本次任务修改过的文件：{path, name, diffs:[{path,oldText,newText}]}（供结束后汇总展示）。 */
    changes = [];
    pendingChanges = new Map();
    constructor(env, startedAt, log) {
        this.startedAt = startedAt;
        this.log = log;
        const home = env.DSH_HOME || path.join(os.homedir(), ".dsh");
        // 与 patch/stream.patch.yml 的 root 保持一致：独立根目录，避免与历史 zstd 日志冲突
        this.sessionsDir = path.join(home, "sessions-vscode");
        this.snapshot = new Set(this.listLogFiles());
        this.log?.(`流式：会话目录 ${this.sessionsDir}，已有 ${this.snapshot.size} 个明文日志`);
    }
    /** 本次任务修改过的文件列表（path 为绝对路径）。 */
    changesList() {
        return this.changes;
    }
    /** DSH Pro：工具结果未带 meta.diffs 时，根据 tool/call 时的快照兜底生成 diff。
     *  - 文件当时不存在（新建）→ 读取磁盘当前内容，作为全量新增；
     *  - 文件当时存在且有旧内容快照 → 旧快照 vs 磁盘当前内容；
     *  - 其余情况（无快照等）→ 无 diff（返回 undefined）。 */
    synthesizeDiffs(pending) {
        try {
            if (!pending || typeof pending.path !== "string" || !pending.path)
                return undefined;
            if (!fs.existsSync(pending.path))
                return undefined;
            const newText = fs.readFileSync(pending.path, "utf8").slice(0, 4000);
            const oldText = pending.existed ? (pending.oldSnapshot ?? null) : "";
            if (oldText === null || oldText === newText)
                return undefined;
            return [{ path: pending.path, oldText, newText }];
        }
        catch {
            return undefined;
        }
    }
    /** 追踪结果统计（供诊断）。 */
    stats() {
        return { found: this.found, eventsParsed: this.eventsParsed };
    }
    /** 进程结束后调用：再排空一次剩余记录即结束 tail。 */
    finish() {
        this.finished = true;
    }
    listLogFiles() {
        try {
            return walkFiles(this.sessionsDir).filter((f) => path.basename(f) === "session.jsonl");
        }
        catch {
            return [];
        }
    }
    /** 等待本次任务产生的会话日志文件并持续推送进度。失败时静默结束（不影响主流程）。 */
    async start(onMessage, signal) {
        try {
            const file = await this.waitForLogFile(signal);
            if (!file || signal.aborted)
                return;
            this.found = true;
            this.log?.(`流式：找到会话日志 ${file}`);
            await this.tail(file, onMessage, signal);
            this.log?.(`流式：结束，共解析 ${this.eventsParsed} 条事件`);
        }
        catch {
            // 流式是增强功能：任何失败都静默降级，最终答复仍从 stdout 获取
            this.log?.("流式：异常，已静默降级");
        }
    }
    /** 轮询等待 spawn 之后新建的 session.jsonl（上限 30s）。 */
    async waitForLogFile(signal) {
        const deadline = Date.now() + 30000;
        while (!signal.aborted && Date.now() < deadline) {
            const now = new Set(this.listLogFiles());
            for (const f of now) {
                if (!this.snapshot.has(f)) {
                    try {
                        const st = fs.statSync(f);
                        if (st.mtimeMs >= this.startedAt - 1000)
                            return f;
                    }
                    catch {
                        // 文件可能刚被清理
                    }
                }
            }
            await sleep(200);
        }
        return undefined;
    }
    /** 从偏移继续读取追加行并解析。 */
    async tail(file, onMessage, signal) {
        let offset = 0;
        let buffer = "";
        while (!signal.aborted) {
            let data;
            try {
                data = fs.readFileSync(file);
            }
            catch {
                // 文件暂时不可读（写入中/重命名），稍后重试
                await sleep(150);
                continue;
            }
            if (data.length < offset) {
                // 文件被截断/重建：从头重读
                offset = 0;
                buffer = "";
            }
            const chunk = data.toString("utf8", offset);
            offset = data.length;
            buffer += chunk;
            let nl;
            while ((nl = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, nl).trim();
                buffer = buffer.slice(nl + 1);
                if (!line)
                    continue;
                const msg = this.parseLine(line);
                if (msg) {
                    this.eventsParsed += 1;
                    onMessage(msg);
                }
            }
            if (signal.aborted)
                return;
            if (this.finished) {
                // 排空剩余记录（含未换行的残行）后结束
                await sleep(300);
                try {
                    const data = fs.readFileSync(file);
                    const rest = buffer + data.toString("utf8", offset);
                    buffer = "";
                    for (const line of rest.split("\n")) {
                        const trimmed = line.trim();
                        if (trimmed) {
                            const msg = this.parseLine(trimmed);
                            if (msg) {
                                this.eventsParsed += 1;
                                onMessage(msg);
                            }
                        }
                    }
                }
                catch {
                    // 忽略收尾读取失败
                }
                return;
            }
            await sleep(150);
        }
    }
    parseLine(line) {
        let record;
        try {
            record = JSON.parse(line);
        }
        catch {
            return undefined;
        }
        const data = (record.data ?? {});
        switch (record.type) {
            case "session":
                return undefined; // 头记录
            case "turn/start":
                return { kind: "turn", turn: Number(data.turn) };
            case "turn/end":
                return { kind: "done", turn: Number(data.turn), reason: String(data.reason?.kind ?? "completed") };
            case "tool/call": {
                const name = String(data.name ?? "tool");
                const argsStr = summarizeArgs(data.arguments);
                // DSH Pro：记录会修改文件的工具，供结束后生成"修改的文件"汇总；
                // 同时尽量快照文件旧内容/是否存在，供工具结果缺省 meta.diffs 时兜底生成 diff
                let filePath;
                if (CHANGE_TOOL_NAMES.has(name)) {
                    filePath = extractFilePath(data.arguments);
                    if (filePath) {
                        const existed = fs.existsSync(filePath);
                        let oldSnapshot;
                        try {
                            if (existed && fs.statSync(filePath).size < 200000) {
                                oldSnapshot = fs.readFileSync(filePath, "utf8").slice(0, 4000);
                            }
                        }
                        catch {
                            oldSnapshot = undefined;
                        }
                        this.pendingChanges.set(String(data.callId ?? ""), { path: filePath, name, existed, oldSnapshot });
                    }
                }
                return {
                    kind: "tool",
                    callId: String(data.callId ?? ""),
                    name,
                    args: argsStr,
                    path: filePath,
                };
            }
            case "tool/result": {
                const isError = !!data.message?.isError;
                const summary = summarizeToolResult(data.message);
                // DSH Pro：结构化 diff（write/edit 工具的 meta.diffs），用于展示"改了什么"
                const metaDiffs = extractDiffs(data.meta);
                const callId = String(data.callId ?? "");
                const pending = this.pendingChanges.get(callId);
                let diffs = metaDiffs;
                if (pending && !isError && (!diffs || diffs.length === 0)) {
                    // DSH Pro：meta.diffs 缺失（如 str_replace_editor / create）时，
                    // 用 tool/call 时的旧内容快照兜底计算 diff，保证"改了什么"永远可见
                    diffs = this.synthesizeDiffs(pending);
                }
                if (pending) {
                    if (!isError) {
                        if (diffs && diffs.length > 0) {
                            for (const d of diffs) {
                                this.changes.push({ path: d.path || pending.path, name: pending.name, diffs: [{ oldText: d.oldText, newText: d.newText }] });
                            }
                        }
                        else {
                            this.changes.push({ path: pending.path, name: pending.name, diffs: [] });
                        }
                    }
                    this.pendingChanges.delete(callId);
                }
                return {
                    kind: "tool-result",
                    callId,
                    isError,
                    summary,
                    diffs,
                };
            }
            case "reasoning-chunks": {
                const texts = Array.isArray(data.texts) ? data.texts : [];
                return { kind: "reasoning", index: Number(data.index ?? 0), text: texts.join("") };
            }
            case "text-chunks": {
                const texts = Array.isArray(data.texts) ? data.texts : [];
                return { kind: "text", index: Number(data.index ?? 0), text: texts.join("") };
            }
            case "tool-call-chunks": {
                const args = Array.isArray(data.args) ? data.args : [];
                return {
                    kind: "tool",
                    callId: String(data.id ?? ""),
                    name: String(data.name ?? "tool"),
                    args: args.join("").slice(0, 400),
                };
            }
            case "assistant/message": {
                const blocks = parseAssistantBlocks(data.message);
                if (blocks.length === 0)
                    return undefined;
                // 用量累计：把本次消息的 usage 合并进累计值并随事件下发
                const u = data.usage;
                if (u && (u.inputTokens !== undefined || u.outputTokens !== undefined)) {
                    const acc = this.usageAcc ?? { input: 0, output: 0, cacheRead: 0, reasoning: 0, model: "", provider: "" };
                    acc.input += Number(u.inputTokens ?? 0);
                    acc.output += Number(u.outputTokens ?? 0);
                    acc.cacheRead += Number(u.cacheReadTokens ?? 0);
                    acc.reasoning += Number(u.reasoningTokens ?? 0);
                    acc.model = String(data.message?.source?.model ?? acc.model);
                    acc.provider = String(data.message?.source?.provider ?? acc.provider);
                    this.usageAcc = acc;
                    return { kind: "usage", ...acc };
                }
                return { kind: "assistant", blocks };
            }
            default:
                return undefined;
        }
    }
}
exports.SessionTracer = SessionTracer;
function walkFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory())
            out.push(...walkFiles(full));
        else
            out.push(full);
    }
    return out;
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function summarizeArgs(raw) {
    const s = typeof raw === "string" ? raw : JSON.stringify(raw);
    return (s ?? "").slice(0, 400);
}
function summarizeToolResult(message) {
    try {
        const content = message?.content ?? [];
        for (const block of content) {
            if (block.type !== "tool-result")
                continue;
            const parts = [];
            for (const inner of block.content ?? []) {
                if (inner.type === "text")
                    parts.push(inner.text);
            }
            const text = parts.join(" ").replace(/\s+/g, " ").trim();
            if (text)
                return text.slice(0, 300);
        }
    }
    catch {
        // 忽略解析问题
    }
    return "";
}
function parseAssistantBlocks(message) {
    const blocks = [];
    const content = Array.isArray(message?.content) ? message.content : [];
    for (const block of content) {
        if (block.type === "reasoning" && typeof block.text === "string") {
            blocks.push({ type: "reasoning", text: block.text });
        }
        else if (block.type === "text" && typeof block.text === "string") {
            blocks.push({ type: "text", text: block.text });
        }
        else if (block.type === "tool-call") {
            blocks.push({
                type: "tool-call",
                name: String(block.name ?? "tool"),
                arguments: summarizeArgs(block.arguments),
            });
        }
    }
    return blocks;
}
//# sourceMappingURL=sessionTracer.js.map