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
exports.refreshSidebarStatus = refreshSidebarStatus;
exports.registerSidebarView = registerSidebarView;
const vscode = __importStar(require("vscode"));
const modelSelection_1 = require("./modelSelection");
const memory_1 = require("./memory");
const sessionStore_1 = require("./sessionStore");
/** 侧边栏状态刷新事件（ChatPanel 改变选择后调用）。 */
const emitter = new vscode.EventEmitter();
function refreshSidebarStatus() {
    emitter.fire(undefined);
}
class StatusItem extends vscode.TreeItem {
    constructor(label, opts = {}) {
        super(label, vscode.TreeItemCollapsibleState.None);
        if (opts.command) {
            this.command = { command: opts.command, title: label };
        }
        if (opts.icon) {
            this.iconPath = new vscode.ThemeIcon(opts.icon);
        }
        if (opts.description) {
            this.description = opts.description;
        }
        this.contextValue = opts.command ? "action" : "status";
    }
}
class StatusTreeProvider {
    globalStorageDir;
    onDidChangeTreeData = emitter.event;
    constructor(globalStorageDir) {
        this.globalStorageDir = globalStorageDir;
    }
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        const items = [];
        const folder = vscode.workspace.workspaceFolders?.[0];
        const sel = folder ? (0, modelSelection_1.loadSelection)(this.globalStorageDir, (0, sessionStore_1.stableHash)(folder.uri.fsPath)) : undefined;
        const mode = vscode.workspace.getConfiguration("dsh-pro").get("permissionMode", "workspace-write");
        const mem = folder ? new memory_1.ProjectMemory(folder.uri.fsPath) : undefined;
        items.push(new StatusItem(`模型：${sel?.model ?? "DSH 默认"}`, { icon: "symbol-method" }));
        items.push(new StatusItem(`思维强度：${sel?.reasoningEffort ?? (0, modelSelection_1.readDefaultEffort)() ?? "未设置"}`, {
            icon: "symbol-property",
        }));
        items.push(new StatusItem(`沙箱：${mode}`, { icon: "shield" }));
        items.push(new StatusItem(mem?.exists() ? "记忆：已记录" : "记忆：空", { icon: "note" }));
        items.push(new StatusItem("", {}));
        items.push(new StatusItem("打开对话", { command: "dsh-pro.openChat", icon: "comment-discussion" }));
        items.push(new StatusItem("新建会话", { command: "dsh-pro.newSession", icon: "add" }));
        items.push(new StatusItem("检查环境", { command: "dsh-pro.checkEnvironment", icon: "search" }));
        items.push(new StatusItem("兼容性自检", { command: "dsh-pro.selfTest", icon: "beaker" }));
        items.push(new StatusItem("查看记忆", { command: "dsh-pro.showMemory", icon: "note" }));
        items.push(new StatusItem("编辑记忆", { command: "dsh-pro.editMemory", icon: "edit" }));
        return items;
    }
}
/** 注册侧边栏状态视图。 */
function registerSidebarView(context) {
    const provider = new StatusTreeProvider(context.globalStorageUri.fsPath);
    const view = vscode.window.createTreeView("dsh-pro.status", {
        treeDataProvider: provider,
        showCollapseAll: false,
    });
    // 可见时刷新，保证状态是最新的
    view.onDidChangeVisibility((e) => {
        if (e.visible)
            refreshSidebarStatus();
    });
    return view;
}
//# sourceMappingURL=sidebar.js.map