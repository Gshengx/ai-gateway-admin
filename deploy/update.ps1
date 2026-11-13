# 一键更新线上前端：打包当前 dist -> 上传 -> 原子替换 -> 恢复 SELinux 上下文 -> reload nginx -> 自检
# 用法：$env:AIS_DEPLOY_PASS='<密码>'; powershell -ExecutionPolicy Bypass -File deploy/update.ps1
# 不设 AIS_DEPLOY_PASS 时会交互输入密码。

param(
    [string]$Server = '10.22.116.88',
    [string]$User = 'root',
    [string]$DistPath = (Join-Path $PSScriptRoot '..\dist'),
    [string]$RemoteDir = '/var/lib/ais-gateway-admin/releases',
    [string]$Password = $env:AIS_DEPLOY_PASS
)

$ErrorActionPreference = 'Stop'

# 构建已要求 Node.js；发布前确认自检运行时存在，避免更新后才发现缺失。
$node = (Get-Command node -ErrorAction Stop).Source
$httpsCheck = Join-Path $PSScriptRoot 'check-https.mjs'
if (-not (Test-Path $httpsCheck)) { throw "缺少 HTTPS 自检脚本：$httpsCheck" }

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
$localRootCa = Join-Path $env:TEMP "ais-root-ca-$stamp.crt"

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
    $remoteRelease = "manual-$stamp"
    $remoteCmd = @"
set -e
RELEASE_ROOT='$RemoteDir'
RELEASE="`$RELEASE_ROOT/$remoteRelease/site"
mkdir -p "`$RELEASE"
tar -xzf '$remoteTgz' -C "`$RELEASE"
test -f "`$RELEASE/index.html"
rm -f /var/lib/ais-gateway-admin/current.next
ln -s "releases/$remoteRelease/site" /var/lib/ais-gateway-admin/current.next
mv -Tf /var/lib/ais-gateway-admin/current.next /var/lib/ais-gateway-admin/current
restorecon -R /var/lib/ais-gateway-admin >/dev/null 2>&1 || true
kubectl rollout restart deployment/frontend --namespace ais-gateway
kubectl rollout status deployment/frontend --namespace ais-gateway --timeout=120s
nginx -t
systemctl reload nginx || systemctl restart nginx
rm -f '$remoteTgz'
echo "files=`$(find "`$RELEASE" -type f | wc -l)"
"@
    $cmdFile = Join-Path $env:TEMP "ais-update-$stamp.sh"
    [IO.File]::WriteAllText($cmdFile, ($remoteCmd -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding($false)))
    & $plink -ssh -batch -P 22 -l $User -pw $Password -m $cmdFile $Server
    if ($LASTEXITCODE -ne 0) { throw '远端发布失败；旧版本目录仍保留在 ' + $RemoteDir }

    Write-Host "[4/4] 自检"
    # 从已验证的 SSH 通道获取根证书，不关闭 TLS 验证、不写入客户端信任库。
    & $pscp -batch -pw $Password "${User}@${Server}:/etc/nginx/ssl/ais-root-ca.crt" $localRootCa
    if ($LASTEXITCODE -ne 0) { throw '获取 HTTPS 根证书失败' }
    # Node.js 验证证书链、有效期和主机名，不依赖 Windows Schannel 的吊销服务。
    & $node $httpsCheck "https://$Server/" $localRootCa
    if ($LASTEXITCODE -ne 0) { throw 'HTTPS 自检失败（证书或 HTTP 状态异常）' }

    Write-Host "`n更新完成：https://$Server/"
}
finally {
    Remove-Item $tgz -Force -ErrorAction SilentlyContinue
    Remove-Item $localRootCa -Force -ErrorAction SilentlyContinue
    if ($cmdFile) { Remove-Item $cmdFile -Force -ErrorAction SilentlyContinue }
}
