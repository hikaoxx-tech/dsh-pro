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
exports.relPath = relPath;
exports.extractCodeForInsert = extractCodeForInsert;
exports.insertCodeToEditor = insertCodeToEditor;
exports.attachActiveSelection = attachActiveSelection;
exports.attachOpenFile = attachOpenFile;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
function relPath(folderPath, absPath) {
    const rel = path.relative(folderPath, absPath);
    return rel.startsWith("..") ? absPath : rel;
}
/** 从回答内容中提取第一段代码块；没有代码块时返回全文。 */
function extractCodeForInsert(content) {
    const match = content.match(/```[\s\S]*?\n([\s\S]*?)```/);
    return match ? match[1].replace(/\n$/, "") : content;
}
/** 把代码插入当前编辑器光标处。 */
function insertCodeToEditor(code) {
    const editor = resolveActiveEditor();
    if (!editor) {
        void vscode.window.showWarningMessage("没有打开的编辑器可插入代码。");
        return;
    }
    editor.edit((editBuilder) => {
        const pos = editor.selection.active;
        editBuilder.insert(pos, code.endsWith("\n") ? code : code + "\n");
    });
}
/** 把当前编辑器选中内容作为上下文块回调出去。 */
function attachActiveSelection(folderPath, onBlock) {
    const editor = resolveActiveEditor();
    if (!editor) {
        void vscode.window.showWarningMessage("当前没有打开的编辑器。请先在编辑器中打开一个文件，或改用「📄 当前文件」并在弹窗中选择文件。");
        return;
    }
    if (editor.selection.isEmpty) {
        void vscode.window.showWarningMessage("请先在编辑器中选中一段代码。");
        return;
    }
    const doc = editor.document;
    const content = doc.getText(editor.selection);
    const label = relPath(folderPath, doc.uri.fsPath) + "（选中）";
    onBlock({ kind: "selection", label, content });
}
/** 把当前打开文件的内容作为上下文块回调出去（截断保护）。
 * 聊天面板聚焦时 activeTextEditor 可能为空，先退回任意可见编辑器；再不行就弹文件选择器。 */
function attachOpenFile(folderPath, onBlock) {
    const editor = resolveActiveEditor();
    if (!editor) {
        void vscode.window.showWarningMessage("当前没有打开的编辑器，请在下方对话框中选择要加入的文件。");
        void pickAndAttachFile(folderPath, onBlock);
        return;
    }
    const doc = editor.document;
    let content = doc.getText();
    const label = relPath(folderPath, doc.uri.fsPath);
    if (content.length > 40000) {
        content = content.slice(0, 40000) + "\n…(文件过大，已截断)";
    }
    onBlock({ kind: "file", label, content });
}
/** 聊天面板/webview 聚焦时 activeTextEditor 可能为 undefined：退回可见编辑器。 */
function resolveActiveEditor() {
    return vscode.window.activeTextEditor ?? vscode.window.visibleTextEditors[0];
}
async function pickAndAttachFile(folderPath, onBlock) {
    const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        canSelectFolders: false,
        openLabel: "加入为上下文",
        defaultUri: vscode.Uri.file(folderPath),
    });
    if (!uris || uris.length === 0)
        return;
    const uri = uris[0];
    try {
        const buf = await vscode.workspace.fs.readFile(uri);
        let content = Buffer.from(buf).toString("utf8");
        const label = relPath(folderPath, uri.fsPath);
        if (content.length > 40000) {
            content = content.slice(0, 40000) + "\n…(文件过大，已截断)";
        }
        onBlock({ kind: "file", label, content });
    }
    catch {
        void vscode.window.showWarningMessage(`无法读取文件：${uri.fsPath}`);
    }
}
/** 从回答内容中提取第一段代码块；没有代码块时返回全文。 */
//# sourceMappingURL=projectContext.js.map