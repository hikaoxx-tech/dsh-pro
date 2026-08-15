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
exports.SessionStore = void 0;
exports.stableHash = stableHash;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** 轻量但稳定的字符串哈希，用于按工作区目录分桶存储会话。 */
function stableHash(input) {
    let h = 5381;
    for (let i = 0; i < input.length; i++) {
        h = ((h << 5) + h + input.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}
/** 会话持久化：每个工作区目录一个子目录，会话按 JSON 文件存储。 */
class SessionStore {
    root;
    constructor(globalStorageDir, folderPath) {
        this.root = path.join(globalStorageDir, "sessions", stableHash(folderPath));
        fs.mkdirSync(this.root, { recursive: true });
    }
    fileFor(id) {
        // 只允许会话 id 使用安全字符，防止路径穿越。
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
            throw new Error(`非法会话 id: ${id}`);
        }
        return path.join(this.root, `${id}.json`);
    }
    list() {
        if (!fs.existsSync(this.root))
            return [];
        const items = [];
        for (const name of fs.readdirSync(this.root)) {
            if (!name.endsWith(".json"))
                continue;
            try {
                const session = this.load(path.basename(name, ".json"));
                if (session) {
                    items.push({
                        id: session.id,
                        title: session.title,
                        updatedAt: session.updatedAt,
                        messageCount: session.messages.length,
                    });
                }
            }
            catch {
                // 单个损坏文件不阻塞会话列表
            }
        }
        items.sort((a, b) => b.updatedAt - a.updatedAt);
        return items;
    }
    load(id) {
        const file = this.fileFor(id);
        if (!fs.existsSync(file))
            return undefined;
        try {
            const raw = fs.readFileSync(file, "utf8");
            const parsed = JSON.parse(raw);
            if (!parsed.id || !Array.isArray(parsed.messages))
                return undefined;
            return parsed;
        }
        catch {
            return undefined;
        }
    }
    save(session) {
        session.updatedAt = Date.now();
        fs.writeFileSync(this.fileFor(session.id), JSON.stringify(session, null, 2), "utf8");
    }
    remove(id) {
        const file = this.fileFor(id);
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    }
}
exports.SessionStore = SessionStore;
//# sourceMappingURL=sessionStore.js.map