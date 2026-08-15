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
exports.listSkills = listSkills;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
/** 扫描技能根目录（用户级 ~/.dsh/skills 与项目级 <project>/.dsh/skills）。 */
function listSkills(projectRoot) {
    const roots = [
        path.join(os.homedir(), ".dsh", "skills"),
        path.join(projectRoot, ".dsh", "skills"),
    ];
    const out = [];
    const seen = new Set();
    for (const root of roots) {
        let entries;
        try {
            entries = fs.readdirSync(root, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            if (seen.has(entry.name))
                continue;
            const dir = path.join(root, entry.name);
            const info = readSkillInfo(dir, entry.name);
            if (info) {
                seen.add(entry.name);
                out.push(info);
            }
        }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
}
function readSkillInfo(dir, fallbackName) {
    for (const candidate of ["SKILL.md", "skill.md"]) {
        const file = path.join(dir, candidate);
        try {
            const raw = fs.readFileSync(file, "utf8");
            const name = raw.match(/^name:\s*(.+)$/m)?.[1]?.trim() || fallbackName;
            const description = raw.match(/^description:\s*(.+)$/m)?.[1]?.trim() || "";
            return { name, description, root: dir };
        }
        catch {
            // 尝试下一个文件名
        }
    }
    return undefined;
}
//# sourceMappingURL=skills.js.map