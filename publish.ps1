# 发布 DSH Pro 到 VS Code Marketplace
#
# 前置（只做一次）：
#   1) npm i -g @vscode/vsce
#   2) vsce login <Publisher>      # 按提示输入 PAT（个人访问令牌，需 Marketplace:Manage 权限）
#
# 用法：
#   .\publish.ps1                      # 打包并发布（默认 publisher=hikaoxx-tech, version=0.1.0）
#   .\publish.ps1 -Publisher foo -Version 0.2.0
#   .\publish.ps1 -PatchOnly           # 只改 publisher 并打包成 vsix，不上传（先预览产物）
#
# 脚本会把 package.json 的 publisher 临时替换为 Marketplace 发布者名，
# 发布完成后自动恢复为 local（本地开发安装不受影响）。
param(
    [string]$Publisher = "hikaoxx-tech",
    [string]$Version = "0.1.0",
    [switch]$PatchOnly
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$pkg = Join-Path $root "package.json"
$backup = "$pkg.bak"

if (-not (Get-Command vsce -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] 未找到 vsce。请先运行: npm i -g @vscode/vsce" -ForegroundColor Red
    exit 1
}

Copy-Item $pkg $backup -Force
try {
    $json = Get-Content $pkg -Raw -Encoding UTF8
    $json = $json -replace '"publisher":\s*"[^"]*"', ('"publisher": "' + $Publisher + '"')
    $json = $json -replace '"version":\s*"[^"]*"', ('"version": "' + $Version + '"')
    [System.IO.File]::WriteAllText($pkg, $json, (New-Object System.Text.UTF8Encoding($true)))
    Write-Host "临时发布身份: $Publisher @ $Version" -ForegroundColor Cyan

    if ($PatchOnly) {
        vsce package
    }
    else {
        vsce publish
    }
}
finally {
    if (Test-Path $backup) {
        Move-Item $backup $pkg -Force
        Write-Host "package.json 已恢复为 local（本地开发不受影响）" -ForegroundColor Green
    }
}
