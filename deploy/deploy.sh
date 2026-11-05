#!/usr/bin/env bash
# 在目标 Linux 机器上以 root 执行：bash deploy.sh
# 目录约定：
#   deploy.sh
#   nginx.conf
#   payload/dist/...
set -euo pipefail

NGINX_ROOT=/var/lib/ais-gateway-admin
NGINX_CONF=/etc/nginx/nginx.conf
BACKEND=http://10.22.116.82:18088

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIST="$SCRIPT_DIR/payload/dist"
SRC_CONF="$SCRIPT_DIR/nginx.conf"

log() { printf '\n[deploy] %s\n' "$1"; }
die() { printf '\n[deploy][ERROR] %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请使用 root 执行本脚本"
[ -d "$SRC_DIST" ] || die "未找到前端产物目录：$SRC_DIST"
[ -f "$SRC_DIST/index.html" ] || die "产物目录缺少 index.html：$SRC_DIST"
[ -f "$SRC_CONF" ] || die "未找到 nginx 配置：$SRC_CONF"
[ -f "$SCRIPT_DIR/k8s/ais-gateway.yaml" ] || die "未找到 K3s 清单：$SCRIPT_DIR/k8s/ais-gateway.yaml"
[ -x /usr/local/bin/k3s ] || die "请先执行 setup-ci.sh 安装 K3s"
[ -s /etc/nginx/ssl/ais-fullchain.pem ] || die "请先按 HTTPS.md 初始化私有 ACME CA 与证书"
[ -s /etc/nginx/ssl/ais-privkey.pem ] || die "缺少 HTTPS 私钥"

# 1. 安装 nginx
if ! command -v nginx >/dev/null 2>&1; then
    log "未检测到 nginx，开始安装"
    if command -v dnf >/dev/null 2>&1; then
        dnf install -y nginx
    elif command -v yum >/dev/null 2>&1; then
        yum install -y nginx
    elif command -v apt-get >/dev/null 2>&1; then
        apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
    else
        die "无法识别包管理器，请手动安装 nginx 后重试"
    fi
    command -v nginx >/dev/null 2>&1 || die "nginx 安装失败"
fi
log "nginx 版本：$(nginx -v 2>&1)"

# 2. 发布静态文件并原子切换当前版本
RELEASE_ID="manual-$(date -u +%Y%m%d%H%M%S)"
RELEASE_DIR="$NGINX_ROOT/releases/$RELEASE_ID/site"
log "同步前端产物到 $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
cp -R "$SRC_DIST"/. "$RELEASE_DIR"/
chown -R jenkins:jenkins "$NGINX_ROOT"
chmod -R a+rX "$NGINX_ROOT"
[ -f "$RELEASE_DIR/index.html" ] || die "产物目录缺少 index.html"
rm -f "$NGINX_ROOT/current.next"
ln -s "releases/$RELEASE_ID/site" "$NGINX_ROOT/current.next"
mv -Tf "$NGINX_ROOT/current.next" "$NGINX_ROOT/current"

# 3. 覆盖 nginx 主配置（保留原始配置备份）
log "写入 nginx 配置"
if [ ! -f "$NGINX_CONF.bak-ais-gateway-admin" ]; then
    cp -f "$NGINX_CONF" "$NGINX_CONF.bak-ais-gateway-admin"
fi
cp -f "$SRC_CONF" "$NGINX_CONF"

# 4. 语法检查
nginx -t || die "nginx 配置校验失败"

# 6. SELinux：修正共享产物上下文 + 允许反向代理外连（存在才执行）
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
    log "SELinux 为 Enforcing，修正站点目录上下文"
    if ! command -v semanage >/dev/null 2>&1; then
        yum install -y policycoreutils-python >/dev/null 2>&1 || true
    fi
    if command -v semanage >/dev/null 2>&1; then
        semanage fcontext -a -t container_file_t "$NGINX_ROOT(/.*)?" 2>/dev/null \
            || semanage fcontext -m -t container_file_t "$NGINX_ROOT(/.*)?" 2>/dev/null || true
    fi
    restorecon -R "$NGINX_ROOT" >/dev/null 2>&1 || true
    log "放行 nginx 反向代理外连"
    setsebool -P httpd_can_network_connect 1 || echo "[deploy][WARN] setsebool 失败，如反代 502 请手动处理"
fi

# 6. 发布 K3s 前端资源
log "应用 K3s 前端资源"
/usr/local/bin/k3s kubectl apply -f "$SCRIPT_DIR/k8s/ais-gateway.yaml"
/usr/local/bin/k3s kubectl rollout restart deployment/frontend --namespace ais-gateway
/usr/local/bin/k3s kubectl rollout status deployment/frontend --namespace ais-gateway --timeout=180s

# 7. 启动或重载
if command -v systemctl >/dev/null 2>&1; then
    systemctl enable nginx >/dev/null 2>&1 || true
    if systemctl is-active --quiet nginx; then
        log "nginx 运行中，执行 reload"
        systemctl reload nginx || systemctl restart nginx
    else
        log "启动 nginx"
        systemctl start nginx
    fi
    systemctl is-active --quiet nginx || die "nginx 启动失败，请查看 journalctl -u nginx -n 50"
else
    nginx -s reload 2>/dev/null || nginx
fi

# 7. 80 用于跳转与 ACME 验证，443 用于业务访问
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    log "firewalld 放行 http"
    firewall-cmd --permanent --add-service=http >/dev/null
    firewall-cmd --permanent --add-service=https >/dev/null
    firewall-cmd --reload >/dev/null
elif command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    log "ufw 放行 80/tcp"
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
fi

log "部署完成"
echo "访问地址: https://10.22.116.88/"
echo "自检命令:"
echo "  curl --cacert /etc/nginx/ssl/ais-root-ca.crt -I https://10.22.116.88/"
echo "  curl --cacert /etc/nginx/ssl/ais-root-ca.crt -s -o /dev/null -w '%{http_code}\\n' https://10.22.116.88/api/v1/"
echo "  后端直连对照: curl -s -o /dev/null -w '%{http_code}\\n' ${BACKEND}/docs"
