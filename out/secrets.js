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
exports.SecretStore = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * 按环境变量名管理的密钥存储：值放在 VS Code SecretStorage（系统密钥链），
 * 名字索引放在 globalStorage（SecretStorage 不支持枚举）。
 */
class SecretStore {
    secrets;
    indexFile;
    static PREFIX = "dsh.env.";
    constructor(secrets, indexFile) {
        this.secrets = secrets;
        this.indexFile = indexFile;
    }
    index() {
        try {
            const parsed = JSON.parse(fs.readFileSync(this.indexFile, "utf8"));
            return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
        }
        catch {
            return [];
        }
    }
    saveIndex(names) {
        fs.mkdirSync(path.dirname(this.indexFile), { recursive: true });
        fs.writeFileSync(this.indexFile, JSON.stringify([...new Set(names)]), "utf8");
    }
    async get(name) {
        return this.secrets.get(SecretStore.PREFIX + name);
    }
    async set(name, value) {
        await this.secrets.store(SecretStore.PREFIX + name, value);
        const idx = this.index();
        if (!idx.includes(name)) {
            idx.push(name);
            this.saveIndex(idx);
        }
    }
    async delete(name) {
        await this.secrets.delete(SecretStore.PREFIX + name);
        this.saveIndex(this.index().filter((n) => n !== name));
    }
    /** 全部已存密钥 → 环境变量映射（供子进程注入）。 */
    async envSecrets() {
        const out = {};
        for (const name of this.index()) {
            const value = await this.secrets.get(SecretStore.PREFIX + name);
            if (value)
                out[name] = value;
        }
        return out;
    }
}
exports.SecretStore = SecretStore;
//# sourceMappingURL=secrets.js.map