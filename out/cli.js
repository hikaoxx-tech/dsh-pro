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
exports.resolveCli = resolveCli;
exports.buildSpawnArgs = buildSpawnArgs;
exports.runCliVersion = runCliVersion;
exports.runDsh = runDsh;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** 默认的 dsh 包内入口相对路径（npm 全局安装布局下固定） */
const ENTRY_REL = path.join("node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
function execFileAsync(file, args, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        (0, child_process_1.execFile)(file, args, { windowsHide: true, timeout: timeoutMs }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error(`${file} 执行失败: ${(stderr || err.message).trim()}`));
            }
            else {
                resolve(stdout);
            }
        });
    });
}
async function firstLine(cmd, args) {
    try {
        const out = await execFileAsync(cmd, args);
        const line = out
            .split(/\r?\n/)
            .map((l) => l.trim())
            .find((l) => l.length > 0);
        return line;
    }
    catch {
        return undefined;
    }
}
/** 解析用于启动 dsh 的 node：优先 PATH 上的 node（与 dsh shim 一致），兜底用扩展宿主自己的 node。 */
async function resolveNodeBinary() {
    const isWin = process.platform === "win32";
    const found = await firstLine(isWin ? "where.exe" : "which", ["node"]);
    if (found)
        return found;
    return process.execPath;
}
/** 从 PATH 定位 dsh，并尽量解析出真实的 node 入口以规避 Windows cmd.exe 引号问题。 */
async function resolveCli(cliPath) {
    if (cliPath && cliPath.trim().length > 0) {
        const p = path.resolve(cliPath.trim());
        if (!fs.existsSync(p)) {
            throw new Error(`配置的 dsh-pro.cliPath 不存在: ${p}`);
        }
        if (p.toLowerCase().endsWith(".js")) {
            return { kind: "entry", node: await resolveNodeBinary(), entry: p, source: "配置(dsh-pro.cliPath)" };
        }
        return { kind: "command", command: p, source: "配置(dsh-pro.cliPath)" };
    }
    const isWin = process.platform === "win32";
    if (isWin) {
        // Windows: where dsh 找到 .cmd/.ps1 shim，其所在目录是全局 node prefix，
        // 包入口固定为 <prefix>/node_modules/@deepseek-ai/dsh/lib/bin.js。
        const shim = await firstLine("where.exe", ["dsh"]);
        if (shim) {
            const prefix = path.dirname(shim);
            const entry = path.join(prefix, ENTRY_REL);
            if (fs.existsSync(entry)) {
                return { kind: "entry", node: await resolveNodeBinary(), entry, source: `PATH 解析(${shim})` };
            }
            return { kind: "command", command: shim, source: `PATH 解析(${shim})` };
        }
        // 兜底：pnpm 全局等非标准布局下 where 拿不到，尝试常见全局位置。
        const npmRoot = await firstLine("npm.cmd", ["root", "-g"]);
        if (npmRoot) {
            const entry = path.join(npmRoot.trim(), ENTRY_REL);
            if (fs.existsSync(entry)) {
                return { kind: "entry", node: await resolveNodeBinary(), entry, source: "npm root -g 解析" };
            }
        }
    }
    else {
        const found = await firstLine("which", ["dsh"]);
        if (found) {
            return { kind: "command", command: found, source: `PATH 解析(${found})` };
        }
    }
    throw new Error("未找到 dsh 命令。请确认已全局安装 @deepseek-ai/dsh（npm i -g @deepseek-ai/dsh），或在设置中配置 dsh-pro.cliPath。");
}
/** 构造 spawn 参数（不含 node 本身，可执行文件由调用方单独传入）。
 * entry 模式附加 --expose-internals：DSH 的 HMR 服务在 node < 24 时必须带该 flag
 * 才能访问内部模块加载器（node >= 24 可走原生插件兜底，带上 flag 无副作用）。 */
function buildSpawnArgs(cli, extraArgs, task) {
    const base = ["--profile", "headless", ...extraArgs, task];
    if (cli.kind === "entry") {
        return ["--expose-internals", cli.entry, ...base];
    }
    return base;
}
/** 查询 dsh 版本（launcher 的 --version），用于环境自检。 */
function runCliVersion(cli) {
    return new Promise((resolve, reject) => {
        const args = cli.kind === "entry" ? [cli.entry, "--version"] : ["--version"];
        const child = (0, child_process_1.spawn)(cli.kind === "entry" ? cli.node : cli.command, args, {
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error("查询 dsh 版本超时"));
        }, 15000);
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString("utf8");
        });
        child.on("error", (err) => {
            clearTimeout(timer);
            reject(new Error(`无法启动 dsh：${err.message}`));
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve(stdout.trim());
            }
            else {
                reject(new Error(`dsh --version 失败(exit ${code}): ${stderr.trim() || stdout.trim()}`));
            }
        });
    });
}
/** 运行一次 dsh headless 任务，收集 stdout/stderr，直到进程退出、超时或被取消。 */
function runDsh(cli, args, options) {
    return new Promise((resolve) => {
        // 防御：参数里绝不能包含可执行文件自身（否则 node 会把 exe 当脚本解析）
        if (cli.kind === "entry" && (args[0] === cli.node || args[0] === cli.entry)) {
            resolve({
                stdout: "",
                stderr: `内部错误：spawn 参数包含了可执行文件自身（${args[0]}）`,
                code: 1,
                signal: null,
                timedOut: false,
            });
            return;
        }
        const child = (0, child_process_1.spawn)(cli.kind === "entry" ? cli.node : cli.command, args, {
            cwd: options.cwd,
            env: options.env,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let settled = false;
        const finish = (code, signal) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            options.signal?.removeEventListener("abort", onAbort);
            resolve({ stdout, stderr, code, signal, timedOut });
        };
        const onAbort = () => {
            child.kill();
        };
        options.signal?.addEventListener("abort", onAbort);
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, options.timeoutMs);
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString("utf8");
        });
        child.on("error", (err) => {
            stderr += `spawn 失败: ${err.message}\n`;
            finish(null, null);
        });
        child.on("close", (code, signal) => {
            finish(code, signal);
        });
    });
}
//# sourceMappingURL=cli.js.map