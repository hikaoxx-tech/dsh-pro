"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractCodeBlocks = extractCodeBlocks;
const FILE_RE = /[A-Za-z0-9_][A-Za-z0-9_.\/\\-]*\.(?:tsx?|jsx?|py|rs|go|java|c(?:pp|xx)?|h(?:pp|xx)?|json|md|ya?ml|css|html?|vue|svelte|sh|ps1|sql|toml|ini|txt|rb|php|cs|kt|swift|dart|scss|less|xml|env)\b/;
/** 从 markdown 文本提取围栏代码块，并猜测每个块的目标文件路径。 */
function extractCodeBlocks(markdown) {
    const blocks = [];
    const lines = markdown.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
        const fence = lines[i].match(/^```(\S*)/);
        if (!fence) {
            i++;
            continue;
        }
        const lang = (fence[1] ?? "").trim();
        const prevLine = precedingLine(lines, i - 1);
        const codeLines = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) {
            codeLines.push(lines[i]);
            i++;
        }
        i++; // 跳过结束围栏
        // 路径提示优先级：块内首行注释 → 紧邻前一行 → 语言标记
        let hint;
        for (const cl of codeLines.slice(0, 3)) {
            const m = cl.match(/^\s*(?:\/\/|#|--|<!--|%\s*)?\s*(?:file|path|target)\s*[:：]\s*(\S+)/i);
            if (m) {
                hint = m[1].replace(/[`'"]/g, "");
                break;
            }
        }
        if (!hint)
            hint = detectPath(prevLine);
        if (!hint)
            hint = detectPath(lang);
        blocks.push({ language: lang, code: codeLines.join("\n"), pathHint: hint });
    }
    return blocks;
}
/** 在文本中找第一个像文件路径的片段。 */
function detectPath(text) {
    const m = text.match(FILE_RE);
    return m ? m[0] : undefined;
}
/** 某行之前最近的一个非空、非围栏行。 */
function precedingLine(lines, beforeIndex) {
    for (let j = beforeIndex; j >= 0; j--) {
        const line = lines[j];
        if (line === undefined)
            break;
        if (line.trim() && !/^```/.test(line))
            return line.trim();
    }
    return "";
}
//# sourceMappingURL=codeBlocks.js.map