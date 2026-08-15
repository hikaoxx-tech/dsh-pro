# 更新日志

## 0.5.0 (2026-08-14)

### 新增

- **`@dsh-agent` 聊天参与者**：在 VS Code 内置 Chat（Copilot Chat）里 `@dsh-agent <任务>` 即可唤起 DSH，引用文件（`#file`）自动作为上下文，流式显示工具调用进度，最终答复以 markdown 吐回聊天流。engines 提升至 ^1.86.0。
- **活动栏侧边栏视图**：活动栏新增 DSH 鲸鱼图标，侧边栏显示当前模型/思维强度/沙箱/记忆状态，并提供打开对话、检查环境、兼容性自检、查看/编辑记忆等快捷入口。

## 0.4.2 (2026-08-14)

### 安全

- **沙箱权限模式可配置**：新增 `dsh-vscode.permissionMode`（read-only / workspace-write / danger-full-access，默认 workspace-write），作为 `DSH_PERMISSION_MODE` 传给 dsh；`/status` 与「DSH: 检查环境」会显示当前沙箱模式，选 danger-full-access 时明确告警。
- **安全说明文档**：README 新增「安全说明」章节，说明 dsh 自带沙箱（workspace-write 默认）+ 无交互 headless 下审批失败关闭，并给出版本控制回退建议。
- 实测确认：默认 workspace-write 下 agent 尝试写工作区外文件会被拒绝。

## 0.4.1 (2026-08-14)

### 修复（自检发现）

- **未处理异常防护**：Webview 消息处理加顶层 try/catch，操作异常不再产生未处理拒绝，而是以系统消息提示。
- **运行态复位**：任务结束后无论成败都复位「运行中」状态，避免会话保存失败时卡死无法再发送。
- **CLI 解析超时**：`where/which/npm` 探测加 15s 超时，避免命令挂起导致永久卡住。
- **并发门闩**：`/compact` 执行期间禁止并发发送消息，避免会话竞态。

## 0.4.0 (2026-08-14)

### 新增

- **「应用到文件」**：助手回答右上角新增按钮，把回答中的代码块直接写入项目文件。自动猜测目标文件路径（块内 `file:`/`path:` 注释 > 紧邻前一行 > 语言标记），写入前弹确认（覆盖 / 创建 / 另存为新文件），并校验不越出工作区。

## 0.3.2 (2026-08-14)

### 新增 / 修复

- **「DSH: 兼容性自检」**：跑一次 tiny 任务，验证流式补丁（明文会话日志）与模型补丁是否真正生效，结果写入输出面板，失败时状态栏标红——防止 DSH 升级后机制静默失效。
- **文件引用路径安全**：回答中 `../` 越界路径点开会被拒绝（仅允许工作区内的文件），并给出提示。

## 0.3.1 (2026-08-14)

### 修复

- **「📄 当前文件」误报"没有打开的编辑器"**：聊天面板聚焦时 `activeTextEditor` 可能为空。现在会退回任意可见编辑器；仍无编辑器时弹出文件选择器直接选文件加入上下文。「📎 选中代码」「插入代码」同样适用该兜底。

## 0.3.0 (2026-08-14)

### 新增

- **`/provider`**：切换模型提供商（内置 deepseek-official + 读取 `~/.dsh/settings.yaml` 中 llm-pi-ai 自配提供商），可当场输入/更新该提供商的 API Key（存系统密钥链，自动注入子进程环境变量）。
- **`/model`**：按当前提供商列出模型并切换；非内置提供商读取 settings 中的 models 清单，内置 deepseek 提供常用清单。
- **`/effort`**：切换思维强度（off/low/medium/high/max），作用于模型选择。
- **`/compact`**：把当前会话压缩成结构化摘要并替换历史，释放上下文。
- **`/skills`**：列出并选择要启用的技能（`~/.dsh/skills`、`<项目>/.dsh/skills`，每个技能一个目录含 SKILL.md），选择会注入任务文本。
- **`/status`**：查看当前提供商/模型/思维强度/技能/用量。
- **用量与模型状态条**：输入区上方实时显示「模型 · 思维强度 · 输入 token · 输出 token · 缓存命中率 · 推理 token」，数据来自会话日志中 assistant/message 的 usage 字段。
- 模型选择通过生成 settings 覆盖文件 + `settings-file.path` 补丁实现（保留自配提供商块），已用真实配置验证实际切换生效。

## 0.2.2 (2026-08-14)

### 修复

- **流式日志与历史 zstd 日志冲突**：明文后端拒绝在已有 `.jsonl.zstd` 产物的会话目录写入，导致流式补丁无法生效。流式日志改为独立的 `~/.dsh/sessions-vscode/` 根目录，与历史日志完全隔离。已用真实配置验证：补丁生效、明文日志正常产出、任务成功。

## 0.2.1 (2026-08-14)

### 修复 / 诊断

- 流式过程输出到「DSH」输出面板：会话目录、找到的日志文件、解析事件数，定位"未出现进度"问题一目了然。
- 新增 `dsh-vscode.debugStreaming` 设置：开启后每次答复末尾追加流式诊断（是否找到明文会话日志、解析多少事件）。

## 0.2.0 (2026-08-14)

### 新增

- **显性流式思维链**：实时展示 DSH 的思考过程、工具调用（名称/参数/结果/错误）与回答草稿。实现方式：通过 `--patch` 把会话事件日志改为明文 JSONL（`compression: none` + 低批次延迟），扩展实时 tail 解析 `turn/*`、`assistant/message`、`tool/*`、chunk 事件并渲染为活动面板；可设置 `dsh-vscode.streamProgress` 关闭。
- **长期记忆**：工作区 `.dsh/memory.md`，每次任务自动注入。命令：`DSH: 查看项目记忆`、`DSH: 编辑项目记忆`；聊天内 `/remember <内容>` 追加、`/memory` 查看。
- **命令化（CLI 式基本功能）**：
  - 聊天内 slash 命令：`/help`、`/clear`、`/memory`、`/edit-memory`、`/remember <内容>`、`/context`；
  - 命令面板：`DSH: 解释当前文件`、`DSH: 审查当前改动 (git diff)`、`DSH: 为当前文件写测试`、`DSH: 打开 dsh 终端`（集成终端运行 `dsh web`）。
- **VS Code 原生适配**：回答中的文件路径（含 `:行号`）自动变成可点击链接，点击即在编辑器打开并定位；git diff 自动作为审查命令的上下文。

### 修复

- 流式补丁覆盖了 `session-persistence-jsonl` 的 `root` 配置（补丁为整体替换语义）。

## 0.1.2 (2026-08-14)

### 修复

- **spawn 参数回归**：0.1.1 在构造 entry 模式参数时误把 node 可执行文件自身也放进了参数数组，导致 `node.exe 被当作脚本解析`（`SyntaxError: Invalid or unexpected token` / "This program cannot be run in DOS mode"）。已修正参数形状，并新增防御校验与对应单元测试，防止此类回归。

## 0.1.1 (2026-08-14)

### 修复

- **node < 24 兼容**：DSH 的 HMR 服务在 node 22 下要求进程以 `--expose-internals` 启动，否则 headless 启动即报错（`failed to apply loader entry ... --expose-internals is required`）。现在 entry 模式启动 dsh 时自动附加该 flag，并优先使用 PATH 上的 node（与 `dsh` 命令本身一致），兼容 node 22+；node >= 24 不受影响。

## 0.1.0 (2026-08-14)

初始版本。

### 功能

- 聊天面板：在 VS Code 中像 Claude Code 一样与 DSH 对话，agent 以当前工作区为工作目录自主工作。
- 驱动方式：子进程调用 `dsh --profile headless`，无常驻服务、不依赖 dsh web 内部 API。
- Windows 引号安全：自动解析 PATH 中的 dsh shim，直接定位 `lib/bin.js` 用 node 启动，规避 cmd.exe 转义问题。
- **「DSH: 配置 API Key」**：普通用户零配置上手——输入 DeepSeek API Key 即存到系统密钥链（VS Code SecretStorage），运行时自动注入子进程，无需手动改任何 DSH 配置文件；DSH 内置默认提供商 `deepseek-official`，有 Key 即可用。
- 上下文挂载：把选中代码 / 当前文件 / 资源管理器文件挂到输入区作为上下文（可移除）。
- 会话持久化：按工作区目录分桶保存在 VS Code globalStorage，可新建 / 切换历史会话。
- 「DSH: 检查环境」：一键检测 dsh 是否安装、解析来源、版本与 API Key 状态，失败时给出修复指引。
- 回答操作：复制全文、把第一段代码块插入当前编辑器光标处。
- 取消 / 超时：任务运行中可取消，超时（默认 600s，可配置）自动终止。
- 极简 Markdown 渲染：代码块、标题、列表、引用、链接等。

### 配置

`dsh-vscode.cliPath` / `extraArgs` / `timeoutSeconds` / `environment` / `historyMessages` / `maxMessageChars`，详见 README。

### 开发者

- `build.ps1` / `build.sh`：一键安装依赖、编译、测试、打包。
- `npm test`：node:test 单元测试（CLI 参数构造、会话存储）。
