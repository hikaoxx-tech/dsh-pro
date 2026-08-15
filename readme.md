# DSH Pro（我的专属 DSH）

基于 [mingxi2077/dsh-harness-vscode](https://github.com/Mingxi2077/dsh-vscode) v0.5.0 源码定制的**个人版**插件，专治"用不惯官方版"的两个痛点：

| 痛点 | DSH Pro 的解法 |
| --- | --- |
| 没有右上角入口，找不到在哪打开 | 编辑器右上角（Run Code 旁边）新增 **🐋 对话按钮**，一键打开；也可用快捷键 `Ctrl+Alt+D` |
| 必须打开文件夹才能用 | 打开 VS Code 即自动回到**上次对话所在目录**（左侧资源管理器直接显示文件夹，无需手动打开，Claude Code 式），并恢复上次对话；再兜底到主目录（或你配置的 `dsh-pro.fallbackFolder`），状态栏显示当前工作目录 |
| 运行中想取消要去找命令 | 任务运行期间，编辑器标题栏自动出现**停止按钮**，点一下即取消 |
| 打开对话后还要手动点输入框 | 点按钮后自动聚焦输入框，选中代码再点按钮会自动把选区加入上下文 |
| 思考时页面被不断拽回底部，没法回看历史 | **贴底滚动**：只有你停在底部时才自动跟随最新内容；滚上去回看历史不会被拽走，需要时点「⬇ 最新」按钮回来 |
| 看不到 DSH 改了什么 | 运行中修改类工具（write/edit 等）直接显示**目标文件 + 可折叠 diff**；任务结束后自动追加「📝 修改的文件」卡片，路径可点击打开 |
| 点左侧文件/切去别的标签后任务像"暂停"了 | 面板隐藏时进度照常投递，回来后立即恢复显示；隐藏的面板**不再被销毁重建**（以前重建会 abort 运行中的任务） |

其余能力与官方版完全一致：实时思考链与工具调用、项目长期记忆（`.dsh/memory.md`）、`/model` `/provider` `/effort` 切换、`/compact` 压缩、代码应用到文件、token/缓存用量显示、内置 Chat 中 `@dsh-agent` 唤起等。

## Claude Code 式交互（对齐 Anthropic 官方插件）

| 交互 | DSH Pro 的做法 |
| --- | --- |
| 顶部品牌栏 | 头部最上方一行显示 **DeepSeek 官方鲸鱼标志 + DeepSeek Harness** 名字（Claude Code 式），鲸鱼为矢量 SVG，小尺寸下依旧清晰 |
| `/` 斜杠命令菜单 | 输入框输入 `/` 弹出命令列表，↑↓ 选择、Enter/Tab 执行、Esc 关闭；带参数的命令（如 `/remember`）自动插入命令文本 |
| `@` 文件引用 | 输入框输入 `@` 弹出工作目录文件列表，选中即把文件内容加入上下文并插入 `@路径` 文本 |
| 权限模式快速切换 | 输入框内按 `Shift+Tab` 或点输入区「询问/计划/放行」chip，循环切换：默认询问 → 计划只读 → 完全放行（对应 `/plan` `/default` `/bypass`） |
| 聚焦输入 | `Ctrl+Escape`（面板聚焦时）一键聚焦输入框 |
| 专注视图 | `Ctrl+Alt+F` 或头部 👁 按钮：隐藏思考过程与工具调用细节，只显示提问与回答；运行指示仍会显示当前工具名 |
| 新会话快捷键 | 面板聚焦时 `Ctrl+N` 新建会话（需开启 `dsh-pro.enableNewConversationShortcut`） |
| 编辑器插入 @引用 | 编辑器内 `Alt+K`：把当前文件作为 @引用 加入对话 |
| Ctrl+Enter 发送 | 开启 `dsh-pro.useCtrlEnterToSend` 后 Enter 换行、Ctrl+Enter 发送（与 Claude Code 一致） |
| 欢迎页 | 空会话时显示欢迎页：**DeepSeek 官方鲸鱼标志**（64px，小尺寸矢量图，清晰不糊）、「＋ 新对话」「🕘 历史会话」入口与快捷键提示 |
| 输入区布局 | Claude Code 式：圆角输入卡片 + 底部按钮行（📎 选中代码 / 📄 当前文件 / `/` 命令菜单 / 权限模式 / 停止 / 发送），发送按钮颜色随权限模式变化 |
| 修改实时可见 | 思考过程中每完成一次文件修改（write / edit / str_replace_editor 等），工具卡片**自动展开绿/红高亮 diff**（新增行绿、删除行红，带 +N/−M 统计），不再黑箱；点击标题可收起。结束后「📝 修改的文件」卡片同样高亮渲染 |

## 安装

本目录即插件源码，直接作为扩展加载或打包安装均可。

**方式一：命令行安装（推荐）**

```powershell
# 在插件源码目录下执行：
.\install.ps1
```

脚本会把插件复制到扩展目录 `~/.vscode/extensions/local.dsh-pro-0.1.0`，
然后在 VS Code 里按 `Ctrl+Shift+P` → **Reload Window** 重载窗口即可。

**方式二：打包成 VSIX**

```powershell
.\build.ps1     # 生成 dsh-pro-0.1.0.vsix
code --install-extension dsh-pro-0.1.0.vsix
```

## 使用

1. **打开对话**：点编辑器右上角 🐋 按钮，或 `Ctrl+Alt+D`，或命令面板「DSH Pro: 打开对话」。
2. **选中代码再提问**：在编辑器里选中一段代码 → 点右上角 🐋 → 选区自动作为上下文，直接打字提问。
3. **无文件夹场景**：不打开任何文件夹直接打开 VS Code，启动后会自动打开**上次对话所在的工作目录**（左侧资源管理器直接显示文件夹，无需手动打开，Claude Code 式），并恢复上次对话面板；没有记录时才以主目录（或设置的兜底目录）为工作根。
4. **取消任务**：任务运行中，编辑器右上角出现停止按钮；或命令面板「DSH Pro: 取消当前任务」。

## 设置

在 VS Code 设置中搜索 `dsh-pro`：

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| `dsh-pro.showTitleButton` | `true` | 是否显示右上角对话按钮 |
| `dsh-pro.restorePanelOnStartup` | `true` | VS Code 启动后自动打开对话面板，并停留在上次的对话界面（Claude Code 式）；设 `false` 关闭 |
| `dsh-pro.rememberLastFolder` | `true` | 记住最近使用的工作目录（存入 VS Code 全局状态）：供启动时自动回到上次对话目录、自动打开上次文件夹使用；设 `false` 则不记录，退回 `fallbackFolder`/主目录 |
| `dsh-pro.autoOpenFolder` | `true` | VS Code 启动且未打开任何文件夹时，自动把上次对话所在目录作为工作区打开（左侧资源管理器直接显示文件夹，与 Claude Code 一致）；设 `false` 则只恢复对话面板、不自动打开文件夹 |
| `dsh-pro.fallbackFolder` | `""` | 无文件夹且无最近目录记录时的兜底工作目录；留空用主目录。⚠ 它是 dsh 文件读写沙箱的边界，建议指向你的常用代码目录 |
| `dsh-pro.environment` | `{}` | 传给 dsh 的额外环境变量（如 `ANTHROPIC_MODEL`、`DEEPSEEK_API_KEY`） |
| `dsh-pro.permissionMode` | `workspace-write` | 沙箱模式：`read-only` / `workspace-write` / `danger-full-access`（输入框 `Shift+Tab` 循环切换） |
| `dsh-pro.timeoutSeconds` | `21600` | 单次任务超时秒数（默认 6 小时，上限 6 小时） |
| `dsh-pro.focusView` | `false` | 专注视图：隐藏思考/工具调用细节（`Ctrl+Alt+F` 切换） |
| `dsh-pro.useCtrlEnterToSend` | `false` | `Ctrl+Enter` 发送、`Enter` 换行（Claude Code 风格） |
| `dsh-pro.enableNewConversationShortcut` | `false` | 面板聚焦时 `Ctrl+N` 新建会话 |
| `dsh-pro.disablePreviewTabs` | `true` | 关闭 VS Code 预览标签行为（自动把 `workbench.editor.enablePreview` 设为 `false`，全局生效）：资源管理器里连点多个文件各占一个标签并存，不互相顶掉；设 `false` 恢复 VS Code 默认 |
| 其余 `dsh-pro.*` | 与官方版一致 | 见官方 readme |

## 模型与提供商配置（改环境配置即可切换模型）

模型调用由 dsh 的环境配置 `~/.dsh/settings.yaml`（即 `$DSH_HOME` 下的 settings.yaml）决定，改它就能随意切换，**无需改插件代码**：

| 方式 | 作用范围 | 怎么改 |
| --- | --- | --- |
| `agent-default-model`（settings.yaml） | 全局默认 | 编辑 `~/.dsh/settings.yaml`：`provider: deepseek-official`（内置），`model: deepseek-v4-flash`（可换 `deepseek-chat` / `deepseek-reasoner` 等），可选 `reasoningEffort: off/low/medium/high/max`；支持 `#` 注释 |
| `/model` `/provider` `/effort`（对话面板） | 当前文件夹（最优先） | 在对话面板直接输入斜杠命令选择，按文件夹记忆；会覆盖全局默认 |
| `llm-pi-ai.providers`（settings.yaml） | 自定义提供商 | 在 settings.yaml 登记 OpenAI 兼容提供商（`displayName` / `apiKeyEnv` / `models`），再把 `agent-default-model` 指向它 |
| API Key | — | 命令面板「DSH Pro: 配置 API Key」，或系统环境变量 `DEEPSEEK_API_KEY`；第三方提供商用各自的 `apiKeyEnv` 变量名 |

> 保存 settings.yaml 后**新建会话**即生效；`/model` 切换立即生效并记住。当前默认模型 = `deepseek-v4-flash`（DeepSeek 官方内置，与 dsh 出厂默认一致）。

## 快捷键

| 快捷键 | 功能 | 生效条件 |
| --- | --- | --- |
| `Ctrl+Alt+D` | 打开/聚焦对话面板 | 编辑器内 |
| `Ctrl+Escape` | 聚焦输入框 | 聊天面板聚焦时 |
| `Ctrl+Alt+F` | 切换专注视图 | 聊天面板聚焦时 |
| `Ctrl+N` | 新建会话 | 聊天面板聚焦 + 开启 `enableNewConversationShortcut` |
| `Alt+K` | 把当前文件作为 @引用 加入对话 | 编辑器内 |
| `Shift+Tab`（输入框内） | 循环切换权限模式 | 聊天面板聚焦时 |

## 常见问题

- **点了按钮没反应**：先执行「DSH Pro: 检查环境」确认 dsh 已安装、API Key 已配置。
- **想换模型**：改 `~/.dsh/settings.yaml` 的 `agent-default-model`（全局默认，见「模型与提供商配置」）；或对话面板里输入 `/model` / `/provider` / `/effort`（按文件夹记忆，最优先）。
- **官方版升级后想同步**：把官方插件新版本的 `out/`、`media/`、`patch/` 覆盖到本目录，再重打一遍本文件里描述的补丁即可（改动点集中在 `out/extension.js` 与 `out/chatPanel.js`，都有 `DSH Pro` 注释标记）。

## 源码说明

- `out/extension.js` —— 入口；**改动点**：`pickFolder()` 无文件夹兜底（最近使用目录 → `fallbackFolder` → 主目录，`rememberLastFolder` 钩子存 globalState）、`StatusBarController`（DSH Pro 文字 + 工作目录 + `dshPro.running` 上下文键）、`dsh-pro.openChatFromTitle` 命令；Claude Code 式命令 `focusInput` / `insertAtMention` / `toggleFocusView` / `togglePermissionMode`；`dsh-pro.restorePanel` 启动恢复命令（静默选目录，空窗口时先 `autoOpenLastFolder` 把上次目录作为工作区打开 → 窗口重载后带工作区恢复面板）+ 启动后自动打开面板（`restorePanelOnStartup`）；**关闭预览标签**（`disablePreviewTabs` 默认把 `workbench.editor.enablePreview` 设为 `false`，资源管理器连点文件可并存）。
- `out/chatPanel.js` —— 对话面板；**改动点**：面板标题 DSH Pro、`status.setFolder()` 联动、`listFiles()`（@ 引用文件列表）、`togglePermissionMode()` / `setPermissionMode()`（权限模式）、init 载荷扩展；**隐藏面板不再销毁重建**（防止误中止运行中的任务）、面板隐藏时进度照常投递、任务结束后追加「📝 修改的文件」卡片（`buildChangesMessage`）；`restoreLastSession()` 新建面板/切换目录时自动恢复最近一次会话。
- `out/sessionTracer.js` —— 流式事件解析；**改动点**：收集修改类工具（write/edit 等）的目标文件路径与 `meta.diffs` 结构化 diff，任务结束后汇总展示（`changesList()`）。
- `out/chatCommands.js` —— 斜杠命令；**改动点**：`SLASH_COMMANDS` 菜单数据、新增 `/resume` `/plan` `/default` `/bypass`。
- `out/webviewHtml.js` —— 页面标题 DSH Pro；头部品牌栏（鲸鱼图标 + DeepSeek Harness 名字）；头部 👁 专注视图按钮、Claude Code 式输入卡片（`input-card` + 底部按钮行）。
- `media/whale.js` —— DeepSeek 官方鲸鱼标志（内联 SVG，供顶部品牌栏与欢迎页动态渲染使用）。
- `media/chat.js` —— 前端交互：`/` 命令菜单、`@` 文件引用菜单、`Shift+Tab` 权限切换、专注视图、欢迎页、Ctrl+Enter；**贴底滚动**（滚上去回看历史不被拽走 + 「⬇ 最新」按钮）、实时工具卡片的文件链接与内联 diff、修改卡片渲染、`/` 命令菜单按钮、顶部品牌栏鲸鱼注入。
- `media/chat.css` / `media/live.css` —— 「⬇ 最新」按钮、修改卡片、工具卡片 diff 样式、输入卡片与底部按钮行样式。
- `package.json` —— 新增 `editor/title/run` 按钮菜单、`editor/title` 停止按钮、快捷键（Ctrl+Alt+D / Ctrl+Escape / Ctrl+Alt+F / Ctrl+N / Alt+K）、`fallbackFolder` / `showTitleButton` / `restorePanelOnStartup` / `rememberLastFolder` / `autoOpenFolder` / `focusView` / `useCtrlEnterToSend` / `enableNewConversationShortcut` / `disablePreviewTabs` 配置。

## 开源发布

- 本仓库即插件完整源码（`out/` 为编译产物，无 TypeScript 源码），克隆后可直接 `.\install.ps1` 安装，或 `.\build.ps1` 打包 VSIX。
- 使用前提：本机已全局安装 dsh CLI（`npm i -g @deepseek-ai/dsh`）并配置好 DeepSeek API Key（`DEEPSEEK_API_KEY`）。
- 版权：基于 [mingxi2077/dsh-harness-vscode](https://github.com/Mingxi2077/dsh-vscode) v0.5.0 定制，遵循 MIT 许可（见 LICENSE.txt）。
- 发布到 VS Code Marketplace 时需把 `package.json` 的 `publisher` 从 `local` 改为你自己的 publisher 名；仅放 GitHub 则无需改动。

## 更新

官方插件升级后，把官方新版 `out/`、`media/`、`patch/` 覆盖到本目录，然后按上面的「改动点」重新打补丁，再运行 `install.ps1`。
