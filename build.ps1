# 把 DSH Pro 打包成 VSIX（可选；常规安装直接跑 install.ps1 即可）
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "正在用 @vscode/vsce 打包（首次会自动下载 vsce，稍等）..."
npx -y @vscode/vsce package -o "dsh-pro-0.1.0.vsix"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "打包完成: $(Join-Path $PSScriptRoot 'dsh-pro-0.1.0.vsix')"
Write-Host "安装：code --install-extension dsh-pro-0.1.0.vsix"
