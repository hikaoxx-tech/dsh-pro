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
exports.ProjectMemory = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** 项目记忆文件位置（工作区根目录下 .dsh/memory.md，与仓库共存、透明可版本化）。 */
const MEMORY_REL = path.join(".dsh", "memory.md");
/** 拼入任务文本的记忆最大字符数。 */
const MAX_MEMORY_CHARS = 20000;
/** 按工作区目录管理的长期记忆：追加式 Markdown 文件，每次任务自动注入。 */
class ProjectMemory {
    workspaceRoot;
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    file() {
        return path.join(this.workspaceRoot, MEMORY_REL);
    }
    exists() {
        return fs.existsSync(this.file());
    }
    read() {
        try {
            return fs.readFileSync(this.file(), "utf8");
        }
        catch {
            return "";
        }
    }
    /** 追加一条带时间戳的记忆。 */
    append(text) {
        const dir = path.dirname(this.file());
        fs.mkdirSync(dir, { recursive: true });
        const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
        const entry = `## ${stamp}\n${text.trim()}\n`;
        const existing = this.read().trim();
        fs.writeFileSync(this.file(), existing ? `${existing}\n${entry}` : entry, "utf8");
    }
    /** 拼入任务文本用的记忆摘要（带截断保护）。 */
    excerpt(maxChars = MAX_MEMORY_CHARS) {
        const content = this.read().trim();
        if (!content)
            return "";
        if (content.length <= maxChars)
            return content;
        return content.slice(0, maxChars) + "\n…(记忆内容过长，已截断)";
    }
}
exports.ProjectMemory = ProjectMemory;
//# sourceMappingURL=memory.js.map