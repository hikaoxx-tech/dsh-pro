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
exports.REASONING_EFFORTS = exports.DEEPSEEK_MODELS = exports.DEEPSEEK_PROVIDER = void 0;
exports.defaultSettingsPath = defaultSettingsPath;
exports.readCustomProviders = readCustomProviders;
exports.listModels = listModels;
exports.readDefaultEffort = readDefaultEffort;
exports.readDefaultSelection = readDefaultSelection;
exports.apiKeyEnvFor = apiKeyEnvFor;
exports.loadSelection = loadSelection;
exports.saveSelection = saveSelection;
exports.writeModelPatch = writeModelPatch;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
/** DSH Pro：去掉 YAML 行内注释（整行注释返回空串），便于在 settings.yaml 里写 # 说明也能正常解析。 */
function stripC(raw) {
    const t = raw.trim();
    if (!t || t.startsWith("#"))
        return "";
    return raw.replace(/\s+#.*$/, "").trim();
}
/** 内置 deepseek-official 提供商（DSH 出厂自带，无需配置）。 */
exports.DEEPSEEK_PROVIDER = {
    id: "deepseek-official",
    displayName: "DeepSeek 官方（内置）",
    apiKeyEnv: "DEEPSEEK_API_KEY",
};
// DSH Pro：2026-07-24 起 deepseek-chat / deepseek-reasoner 已被 DeepSeek 官方退役（调用直接报错），
// 当前官方 API 仅 deepseek-v4-flash（轻量快速）与 deepseek-v4-pro（满血最强）两个模型。
exports.DEEPSEEK_MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"];
exports.REASONING_EFFORTS = ["off", "low", "medium", "high", "max"];
function defaultSettingsPath() {
    return path.join(os.homedir(), ".dsh", "settings.yaml");
}
/** 从 settings.yaml 读取 llm-pi-ai.providers（用户自配提供商）。解析失败返回空数组。 */
function readCustomProviders(settingsPath = defaultSettingsPath()) {
    let raw;
    try {
        raw = fs.readFileSync(settingsPath, "utf8");
    }
    catch {
        return [];
    }
    const providers = [];
    const lines = raw.split(/\r?\n/);
    let inPi = false;
    let current;
    for (const line of lines) {
        const indent = (line.match(/^ */)?.[0].length ?? 0);
        const content = stripC(line);
        if (!inPi) {
            if (content === "llm-pi-ai:")
                inPi = true;
            continue;
        }
        if (indent === 0 && content)
            break; // 离开 llm-pi-ai 块
        if (content === "providers:" || content.startsWith("#") || content === "")
            continue;
        if (indent === 4 && /^[A-Za-z0-9_-]+:$/.test(content)) {
            if (current)
                providers.push(current);
            current = { id: content.slice(0, -1), displayName: content.slice(0, -1) };
            continue;
        }
        if (current && indent === 6) {
            const dm = content.match(/^displayName:\s*(.+)$/);
            if (dm)
                current.displayName = dm[1].trim().replace(/^["']|["']$/g, "");
            const km = content.match(/^apiKeyEnv:\s*(\S+)\s*$/);
            if (km)
                current.apiKeyEnv = km[1];
        }
    }
    if (current)
        providers.push(current);
    return providers;
}
/** 某提供商的模型列表。 */
function listModels(providerId, settingsPath = defaultSettingsPath()) {
    if (providerId === exports.DEEPSEEK_PROVIDER.id)
        return [...exports.DEEPSEEK_MODELS];
    let raw;
    try {
        raw = fs.readFileSync(settingsPath, "utf8");
    }
    catch {
        return [];
    }
    const lines = raw.split(/\r?\n/);
    let inProvider = false;
    const models = [];
    for (const line of lines) {
        const indent = (line.match(/^ */)?.[0].length ?? 0);
        const content = stripC(line);
        if (!inProvider) {
            if (indent === 4 && content === `${providerId}:`)
                inProvider = true;
            continue;
        }
        if (indent === 4 && content && content !== "models:")
            break; // 下一个提供商或离开
        const nm = content.match(/^- name:\s*(\S+)\s*$/);
        if (nm)
            models.push(nm[1]);
    }
    return models;
}
/** 当前默认思维强度（settings.yaml agent-default-model.reasoningEffort）。 */
function readDefaultEffort(settingsPath = defaultSettingsPath()) {
    return readDefaultSelection(settingsPath)?.reasoningEffort;
}
/** 当前默认模型（settings.yaml agent-default-model）。 */
function readDefaultSelection(settingsPath = defaultSettingsPath()) {
    let raw;
    try {
        raw = fs.readFileSync(settingsPath, "utf8");
    }
    catch {
        return undefined;
    }
    const lines = raw.split(/\r?\n/);
    let inBlock = false;
    const sel = {};
    for (const line of lines) {
        const indent = (line.match(/^ */)?.[0].length ?? 0);
        const content = stripC(line);
        if (!inBlock) {
            if (content === "agent-default-model:")
                inBlock = true;
            continue;
        }
        if (indent === 0 && content)
            break;
        const pm = content.match(/^provider:\s*(\S+)\s*$/);
        if (pm)
            sel.provider = pm[1];
        const mm = content.match(/^model:\s*(\S+)\s*$/);
        if (mm)
            sel.model = mm[1];
        const em = content.match(/^reasoningEffort:\s*(\S+)\s*$/);
        if (em)
            sel.reasoningEffort = em[1];
    }
    return sel.provider && sel.model ? sel : undefined;
}
/** 读取某提供商应注入的环境变量名（用于 /provider 输入 API Key）。 */
function apiKeyEnvFor(providerId, settingsPath = defaultSettingsPath()) {
    if (providerId === exports.DEEPSEEK_PROVIDER.id)
        return exports.DEEPSEEK_PROVIDER.apiKeyEnv;
    const provider = readCustomProviders(settingsPath).find((p) => p.id === providerId);
    return provider?.apiKeyEnv;
}
// ---------------------------------------------------------------- 持久化
function stateFile(globalStorageDir, folderHash) {
    return path.join(globalStorageDir, "model-selection", `${folderHash}.json`);
}
function loadSelection(globalStorageDir, folderHash) {
    try {
        const raw = fs.readFileSync(stateFile(globalStorageDir, folderHash), "utf8");
        const parsed = JSON.parse(raw);
        return parsed.provider && parsed.model ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
function saveSelection(globalStorageDir, folderHash, selection) {
    const file = stateFile(globalStorageDir, folderHash);
    if (!selection) {
        try {
            fs.unlinkSync(file);
        }
        catch {
            // 不存在则忽略
        }
        return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(selection, null, 2), "utf8");
}
/** 生成模型选择补丁：把 settings-file.path 指向扩展生成的 settings 覆盖文件。
 * 覆盖文件包含 agent-default-model（用户选择）与原样复制的 llm-pi-ai 提供商块。 */
function writeModelPatch(globalStorageDir, folderHash, selection, sourceSettingsPath = defaultSettingsPath()) {
    if (!selection.provider || !selection.model)
        return undefined;
    const dir = path.join(globalStorageDir, "model-patch");
    fs.mkdirSync(dir, { recursive: true });
    // 1. settings 覆盖文件（settings-file.path 指向它）
    const settingsFile = path.join(dir, `${folderHash}.settings.yaml`);
    const lines = ["# dsh-pro 生成的设置覆盖（模型选择）", "agent-default-model:", `  provider: ${selection.provider}`, `  model: ${selection.model}`];
    if (selection.reasoningEffort) {
        lines.push(`  reasoningEffort: ${selection.reasoningEffort}`);
    }
    const piBlock = extractBlock(sourceSettingsPath, "llm-pi-ai");
    if (piBlock) {
        lines.push("", piBlock);
    }
    fs.writeFileSync(settingsFile, lines.join("\n") + "\n", "utf8");
    // 2. 补丁：让 settings-file 读扩展的覆盖文件
    const patchFile = path.join(dir, `${folderHash}.patch.yml`);
    fs.writeFileSync(patchFile, [
        "# dsh-pro 生成的模型选择补丁（由 /provider /model /effort 管理）",
        "- id: settings",
        "  config:",
        `    path: ${settingsFile.replace(/\\/g, "/")}`,
    ].join("\n") + "\n", "utf8");
    return patchFile;
}
/** 原样提取 settings.yaml 中某个顶层键的整块（用于保留 llm-pi-ai 自配提供商）。 */
function extractBlock(settingsPath, key) {
    let lines;
    try {
        lines = fs.readFileSync(settingsPath, "utf8").split(/\r?\n/);
    }
    catch {
        return undefined;
    }
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        if (stripC(lines[i]).trim() === `${key}:`) {
            start = i;
            break;
        }
    }
    if (start < 0)
        return undefined;
    const block = [lines[start]];
    for (let i = start + 1; i < lines.length; i++) {
        if (/^\S/.test(lines[i]) && lines[i].trim())
            break;
        block.push(lines[i]);
    }
    return block.join("\n");
}
//# sourceMappingURL=modelSelection.js.map