# 一键更新线上前端：打包当前 dist -> 上传 -> 原子替换 -> 恢复 SELinux 上下文 -> reload nginx -> 自检
# 用法：$env:AIS_DEPLOY_PASS='<密码>'; powershell -ExecutionPolicy Bypass -File deploy/update.ps1
# 不设 AIS_DEPLOY_PASS 时会交互输入密码。

param(
    [string]$Server = '10.22.116.88',
    [string]$User = 'root',
    [string]$DistPath = (Join-Path $PSScriptRoot '..\dist'),
    [string]$RemoteDir = '/var/www/ais-gateway-admin',
    [string]$Password = $env:AIS_DEPLOY_PASS
)

$ErrorActionPreference = 'Stop'

$pscp = 'C:\Program Files (x86)\PuTTY\pscp.exe'
$plink = 'C:\Program Files (x86)\PuTTY\plink.exe'
foreach ($exe in @($pscp, $plink)) {
    if (-not (Test-Path $exe)) { throw "缺少 PuTTY 工具：$exe" }
}

$DistPath = (Resolve-Path $DistPath).Path
if (-not (Test-Path (Join-Path $DistPath 'index.html'))) {
    throw "$DistPath 不是有效的 dist 目录（缺少 index.html），请先执行 npm.cmd run build"
}

if (-not $Password) {
    $secure = Read-Host "请输入 $Server 的 SSH 密码" -AsSecureString
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tgz = Join-Path $env:TEMP "ais-dist-$stamp.tgz"
$remoteTgz = "/tmp/ais-dist-$stamp.tgz"

try {
    Write-Host "[1/4] 打包 $DistPath"
    & tar -czf $tgz -C $DistPath .
    if ($LASTEXITCODE -ne 0) { throw '打包失败' }
    $sizeMb = [math]::Round((Get-Item $tgz).Length / 1MB, 2)
    Write-Host "      产物 $sizeMb MB"

    Write-Host "[2/4] 上传到 ${Server}:$remoteTgz"
    & $pscp -batch -pw $Password $tgz "${User}@${Server}:$remoteTgz"
    if ($LASTEXITCODE -ne 0) { throw '上传失败' }

    Write-Host "[3/4] 远端替换并 reload nginx"
    $remoteCmd = @"
set -e
NEW='$RemoteDir.new'
OLD='$RemoteDir.bak'
rm -rf "`$NEW"
mkdir -p "`$NEW"
tar -xzf '$remoteTgz' -C "`$NEW"
test -f "`$NEW/index.html"
rm -rf "`$OLD"
mv '$RemoteDir' "`$OLD"
mv "`$NEW" '$RemoteDir'
restorecon -R '$RemoteDir' >/dev/null 2>&1 || true
nginx -t
systemctl reload nginx || systemctl restart nginx
rm -f '$remoteTgz'
echo "files=`$(find '$RemoteDir' -type f | wc -l)"
"@
    $cmdFile = Join-Path $env:TEMP "ais-update-$stamp.sh"
    [IO.File]::WriteAllText($cmdFile, ($remoteCmd -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding($false)))
    & $plink -ssh -batch -P 22 -l $User -pw $Password -m $cmdFile $Server
    if ($LASTEXITCODE -ne 0) { throw '远端替换失败，旧版本保留在 ' + $RemoteDir + '.bak' }

    Write-Host "[4/4] 自检"
    $root = & curl.exe -s -o NUL -w '%{http_code}' --max-time 15 "http://$Server/"
    $api = & curl.exe -s -o NUL -w '%{http_code}' --max-time 15 "http://$Server/api/v1/api-keys"
    Write-Host "      首页 $root / 接口 $api (401 表示反代正常)"
    if ($root -ne '200') { throw "首页返回 $root，部署异常" }

    Write-Host "`n更新完成：http://$Server/"
}
finally {
    Remove-Item $tgz -Force -ErrorAction SilentlyContinue
}