"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTaskText = buildTaskText;
/** 把会话历史、上下文块、项目记忆拼装成发给 headless 的任务文本。 */
function buildTaskText(folderPath, session, contextBlocks, memory, historyMessages, maxMessageChars, extraSections = []) {
    const lines = [];
    lines.push("你在 VS Code 中通过 DSH 辅助用户完成项目任务。");
    lines.push(`项目根目录：${folderPath}`);
    lines.push("请只回应最新一条用户消息，不要复述历史对话或客套。");
    if (extraSections.length > 0) {
        lines.push("");
        lines.push("--- 会话配置 ---");
        lines.push(...extraSections);
    }
    // 项目长期记忆：每次任务自动注入
    const memoryText = memory.excerpt();
    if (memoryText) {
        lines.push("");
        lines.push("--- 项目长期记忆（之前会话积累的项目知识，按需参考）---");
        lines.push(memoryText);
    }
    if (contextBlocks.length > 0) {
        lines.push("");
        lines.push("以下是用户提供的上下文内容，回答时按需参考：");
        for (const block of contextBlocks) {
            lines.push(`@${block.label}`);
            let content = block.content;
            if (content.length > maxMessageChars) {
                content = content.slice(0, maxMessageChars) + "\n…(内容已截断)";
            }
            lines.push(content);
            lines.push("");
        }
    }
    // 历史对话只取 user/assistant（"changes" 修改记录卡片不喂给模型）
    const hist = session.messages.filter((m) => m.role === "user" || m.role === "assistant").slice(-historyMessages * 2);
    if (hist.length > 0) {
        lines.push("--- 历史对话 ---");
        for (const m of hist) {
            const label = m.role === "user" ? "用户" : "助手";
            let content = m.content;
            if (content.length > maxMessageChars)
                content = content.slice(0, maxMessageChars) + "\n…(已截断)";
            lines.push(`${label}: ${content}`);
        }
    }
    // 最新用户消息（从后往前找最后一条 user 消息，避免把修改记录卡片当成用户消息）
    const lastUser = [...session.messages].reverse().find((m) => m.role === "user");
    lines.push("--- 最新用户消息 ---");
    lines.push(lastUser ? lastUser.content : "");
    return lines.join("\n");
}
//# sourceMappingURL=taskText.js.map