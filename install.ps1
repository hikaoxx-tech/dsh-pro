# 安装 DSH Pro 到 VS Code 扩展目录（无需打包，直接复制源码）
$ErrorActionPreference = "Stop"
$src = $PSScriptRoot
$extRoot = Join-Path $env:USERPROFILE ".vscode\extensions"
$target = Join-Path $extRoot "local.dsh-pro-0.1.0"

if (-not (Test-Path $extRoot)) {
    Write-Host "未找到 VS Code 扩展目录: $extRoot" -ForegroundColor Red
    exit 1
}

# 清理旧版本，避免文件残留
if (Test-Path $target) {
    Remove-Item $target -Recurse -Force
}

# 复制（排除打包产物、依赖、临时文件）
Copy-Item $src $target -Recurse -Force -Exclude @("*.vsix", "node_modules", ".git", "*.log")

Write-Host "已安装到: $target" -ForegroundColor Green
Write-Host ""
Write-Host "接下来：在 VS Code 里按 Ctrl+Shift+P → 输入 Reload Window → 回车，重载后即可使用。"
Write-Host "验证：重载后编辑器右上角（Run Code 旁边）应出现 💬 按钮；状态栏左侧显示 DSH Pro。"
