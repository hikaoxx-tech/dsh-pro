#!/usr/bin/env bash
# 安装 DSH Pro 到 VS Code 扩展目录（macOS / Linux 版，无需打包，直接复制源码）
set -euo pipefail

# 脚本所在目录（即插件源码目录）
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# VS Code 扩展目录：macOS 与 Linux 均为 ~/.vscode/extensions
EXT_ROOT="${HOME}/.vscode/extensions"
TARGET="${EXT_ROOT}/local.dsh-pro-0.1.0"

if [ ! -d "${EXT_ROOT}" ]; then
    echo "未找到 VS Code 扩展目录: ${EXT_ROOT}" >&2
    echo "请先安装并启动一次 VS Code（首次启动会自动创建该目录）" >&2
    exit 1
fi

# 清理旧版本，避免文件残留
if [ -e "${TARGET}" ]; then
    rm -rf "${TARGET}"
fi

mkdir -p "${TARGET}"

# 复制源码（排除打包产物、依赖、git 与临时文件）
# 优先用 rsync（macOS / 多数 Linux 自带）；没有则用 tar 管道（GNU/BSD tar 均支持 --exclude）
if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude '*.vsix' --exclude 'node_modules' --exclude '.git' --exclude '*.log' \
        "${SRC}/" "${TARGET}/"
else
    tar --exclude='*.vsix' --exclude='node_modules' --exclude='.git' --exclude='*.log' \
        -C "${SRC}" -cf - . | tar -C "${TARGET}" -xf -
fi

echo "已安装到: ${TARGET}"
echo ""
echo "接下来：在 VS Code 里按 Cmd+Shift+P（macOS）/ Ctrl+Shift+P（Linux）→ 输入 Reload Window → 回车，重载后即可使用。"
echo "验证：重载后编辑器右上角（Run Code 旁边）应出现 💬 按钮；状态栏左侧显示 DSH Pro。"
