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
exports.applyCodeBlock = applyCodeBlock;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
/** 确认并把代码块写入文件。 */
async function applyCodeBlock(folderPath, block) {
    const root = path.resolve(folderPath);
    if (block.pathHint) {
        const target = path.resolve(root, block.pathHint);
        const rel = path.relative(root, target);
        const within = target === root || target.startsWith(root + path.sep);
        const exists = within && fs.existsSync(target);
        const action = await vscode.window.showQuickPick([
            { label: exists ? `覆盖 ${rel}` : `创建 ${rel}` },
            { label: "另存为新文件…", description: "" },
        ], { placeHolder: `应用到文件：${block.pathHint}` });
        if (!action)
            return;
        if (action.label === "另存为新文件…") {
            await saveAs(folderPath, block);
            return;
        }
        if (!within) {
            void vscode.window.showWarningMessage(`出于安全，拒绝写入工作区外的文件：${block.pathHint}`);
            return;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, block.code.endsWith("\n") ? block.code : block.code + "\n", "utf8");
        const doc = await vscode.window.showTextDocument(vscode.Uri.file(target));
        void doc;
        void vscode.window.showInformationMessage(`已写入 ${rel}`);
    }
    else {
        await saveAs(folderPath, block);
    }
}
async function saveAs(folderPath, block) {
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(folderPath),
        saveLabel: "写入",
    });
    if (!uri)
        return;
    fs.writeFileSync(uri.fsPath, block.code.endsWith("\n") ? block.code : block.code + "\n", "utf8");
    await vscode.window.showTextDocument(uri);
}
//# sourceMappingURL=applyCode.js.map