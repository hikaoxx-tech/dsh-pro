# ============================================================
#  DSH Pro 一键发布脚本（GitHub + VS Code Marketplace）
#
#  迭代完成后，一条命令完成全部发布：
#    1) git add -A + commit（-Message 指定说明，留空自动生成）
#    2) git push 推到 GitHub
#    3) 版本号自动 +1（0.1.0 -> 0.1.1；市场拒绝重复版本号，必须换新）
#    4) 打包 vsix（publisher 临时换为 hikaoxx-tech，打完自动恢复 local）
#    5) （可选）同步安装到本地扩展目录（-Install）
#    6) （可选）打包后直接上传市场（-Publish，需已 vsce login）
#
#  用法（在自己 PowerShell 里，先 cd D:\11\dsh-pro）：
#    .\release.ps1                        # 提交+推送+打包（vsix 拖到网页上传）
#    .\release.ps1 -Message "修了什么"    # 指定提交说明
#    .\release.ps1 -Version 0.2.0         # 指定版本号（默认自动 +1）
#    .\release.ps1 -Install               # 额外同步到本地扩展目录
#    .\release.ps1 -Publish               # 打包后直接 vsce publish 上传（需 PAT 登录）
#    .\release.ps1 -SkipGit               # 只打包，不动 git
# ============================================================
param(
    [string]$Message = "",
    [string]$Version = "",
    [switch]$Install,
    [switch]$Publish,
    [switch]$SkipGit
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$pkg = Join-Path $root "package.json"

function Read-Version {
    $raw = [System.IO.File]::ReadAllText($pkg, (New-Object System.Text.UTF8Encoding($false)))
    if ($raw -match '"version":\s*"([^"]+)"') { return $Matches[1] }
    throw "package.json 中找不到 version 字段"
}

function Bump-Patch([string]$v) {
    $parts = $v.Split('.')
    if ($parts.Count -lt 3) { throw "版本号格式不支持: $v" }
    $patch = [int]$parts[2] + 1
    return "$($parts[0]).$($parts[1]).$patch"
}

Write-Host "======== DSH Pro 一键发布 ========" -ForegroundColor Cyan

# ---------- 1) git 提交 + 推送 ----------
if (-not $SkipGit) {
    Write-Host "`n[步骤 1/2] git 提交并推送到 GitHub..." -ForegroundColor Yellow
    git -C $root add -A
    $staged = git -C $root diff --cached --name-only
    if ($staged) {
        if (-not $Message) { $Message = "update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
        git -C $root commit -m $Message
        Write-Host "  已提交: $Message" -ForegroundColor Green
    } else {
        Write-Host "  没有待提交的改动，跳过 commit" -ForegroundColor DarkGray
    }
    git -C $root push
    Write-Host "  已推送到 GitHub ✅" -ForegroundColor Green
}

# ---------- 2) 版本号 + 打包 ----------
if (-not $Version) { $Version = Bump-Patch (Read-Version) }
Write-Host "`n[步骤 2/2] 打包版本 $Version（publisher=hikaoxx-tech）..." -ForegroundColor Yellow

Push-Location $root
try {
    if ($Publish) {
        & (Join-Path $root "publish.ps1") -Version $Version
    } else {
        & (Join-Path $root "publish.ps1") -Version $Version -PatchOnly
    }
}
finally {
    Pop-Location
}

$vsix = Join-Path $root "dsh-pro-$Version.vsix"
if (-not (Test-Path $vsix)) { throw "打包失败：未找到 $vsix" }

# ---------- 3) （可选）同步本地扩展目录 ----------
if ($Install) {
    Write-Host "`n[附加] 同步到本地扩展目录..." -ForegroundColor Yellow
    & (Join-Path $root "install.ps1")
}

# ---------- 汇总 ----------
Write-Host ""
Write-Host "======== 完成 ========" -ForegroundColor Green
Write-Host "GitHub      : 已推送 → https://github.com/hikaoxx-tech/dsh-pro" -ForegroundColor Green
Write-Host "市场上传文件 : $vsix" -ForegroundColor Cyan
Write-Host "上传页面     : https://marketplace.visualstudio.com/manage/publishers/hikaoxx-tech/extensions/dsh-pro/upload" -ForegroundColor Cyan
if (-not $Publish) {
    Write-Host ""
    Write-Host "▶ 最后一步：打开上面的上传页面，把 .vsix 文件拖进去即可（每个新版本拖一次）" -ForegroundColor Yellow
}
