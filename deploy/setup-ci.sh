#!/usr/bin/env bash
set -euo pipefail

K3S_VERSION=v1.34.12-k3s1
K3S_IMAGE="ghcr.io/k3s-io/k3s:${K3S_VERSION}"
K3S_IMAGE_DIR=/tmp/ais-k3s-image
K3S_ROOT=/tmp/ais-k3s-root
APP_ROOT=/var/lib/ais-gateway-admin
JENKINS_HOME=/var/lib/jenkins
JENKINS_URL=http://127.0.0.1:8080/jenkins
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '\n[setup-ci] %s\n' "$1"; }
die() { printf '\n[setup-ci][ERROR] %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die '请使用 root 执行'
[ "$(uname -m)" = x86_64 ] || die '当前安装脚本仅支持 x86_64'
[ -s /etc/nginx/ssl/ais-fullchain.pem ] || die '请先完成 HTTPS 配置'

log '安装 K3s 镜像提取工具和 SELinux 策略'
yum install -y skopeo container-selinux selinux-policy-base policycoreutils-python \
  git curl tar gzip fontconfig dejavu-sans-fonts
if ! rpm -q k3s-selinux >/dev/null 2>&1; then
  curl -4 -fL --retry 3 --connect-timeout 15 \
    https://rpm.rancher.io/k3s/stable/common/centos/7/noarch/k3s-selinux-1.6-1.el7.noarch.rpm \
    -o /var/tmp/k3s-selinux-1.6-1.el7.noarch.rpm
  yum install -y /var/tmp/k3s-selinux-1.6-1.el7.noarch.rpm
  rm -f /var/tmp/k3s-selinux-1.6-1.el7.noarch.rpm
fi

log "从 K3s 官方 GHCR 镜像获取 ${K3S_VERSION}"
if [ ! -x "$K3S_ROOT/bin/k3s" ]; then
  rm -rf "$K3S_IMAGE_DIR" "$K3S_ROOT"
  mkdir -p "$K3S_IMAGE_DIR" "$K3S_ROOT"
  skopeo copy "docker://${K3S_IMAGE}" "dir:${K3S_IMAGE_DIR}"
  python - "$K3S_IMAGE_DIR/manifest.json" > /var/tmp/ais-k3s-layers.txt <<'PY'
import json
import sys

for layer in json.load(open(sys.argv[1], 'r'))['layers']:
    print(layer['digest'].split(':', 1)[1])
PY
  while IFS= read -r digest; do
    tar -xzf "$K3S_IMAGE_DIR/$digest" -C "$K3S_ROOT"
  done </var/tmp/ais-k3s-layers.txt
fi
[ -x "$K3S_ROOT/bin/k3s" ] || die 'K3s 官方镜像中未找到二进制文件'
"$K3S_ROOT/bin/k3s" --version | grep -F 'v1.34.12+k3s1' >/dev/null \
  || die 'K3s 二进制版本与固定版本不符'
install -o root -g root -m 0755 "$K3S_ROOT/bin/k3s" /usr/local/bin/k3s
chcon -u system_u -r object_r -t container_runtime_exec_t /usr/local/bin/k3s
ln -sfn /usr/local/bin/k3s /usr/local/bin/kubectl
ln -sfn /usr/local/bin/k3s /usr/bin/kubectl
K3S_CNI_DIR=/var/lib/rancher/k3s/data/current/bin
mkdir -p "$K3S_CNI_DIR"
if [ ! -x "$K3S_CNI_DIR/containerd" ]; then
  cp -a "$K3S_ROOT/bin/." "$K3S_CNI_DIR/"
  chown -R root:root "$K3S_CNI_DIR"
fi
chcon -R -u system_u -r object_r -t container_runtime_exec_t "$K3S_CNI_DIR"

log '配置内核转发、K3s 和 firewalld'
cat >/etc/modules-load.d/ais-k3s.conf <<'EOF'
br_netfilter
overlay
EOF
modprobe br_netfilter
modprobe overlay
cat >/etc/sysctl.d/90-ais-k3s.conf <<'EOF'
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward = 1
EOF
sysctl --system >/dev/null

mkdir -p /etc/rancher/k3s
cat >/etc/rancher/k3s/config.yaml <<'EOF'
write-kubeconfig-mode: "0600"
pause-image: public.ecr.aws/eks-distro/kubernetes/pause:v1.34.12-eks-1-34-25
selinux: true
disable:
  - coredns
  - local-storage
  - metrics-server
  - servicelb
  - traefik
EOF
chmod 0600 /etc/rancher/k3s/config.yaml

if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --zone=trusted --add-source=10.42.0.0/16 >/dev/null
  firewall-cmd --permanent --zone=trusted --add-source=10.43.0.0/16 >/dev/null
  firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.22.116.88/32" port port="30080" protocol="tcp" accept' >/dev/null
  firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="127.0.0.1/32" port port="30080" protocol="tcp" accept' >/dev/null
  firewall-cmd --reload >/dev/null
fi

cat >/etc/systemd/system/k3s.service <<'EOF'
[Unit]
Description=Lightweight Kubernetes
Documentation=https://docs.k3s.io
Wants=network-online.target
After=network-online.target

[Service]
Type=notify
Environment="PATH=/var/lib/rancher/k3s/data/current/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
KillMode=process
Delegate=yes
LimitNOFILE=1048576
LimitNPROC=infinity
LimitCORE=infinity
TasksMax=infinity
TimeoutStartSec=0
Restart=always
RestartSec=5s
ExecStartPre=/sbin/modprobe br_netfilter
ExecStartPre=/sbin/modprobe overlay
ExecStart=/usr/local/bin/k3s server

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now k3s
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
for attempt in $(seq 1 60); do
  if /usr/local/bin/kubectl get nodes >/dev/null 2>&1; then break; fi
  sleep 5
done
/usr/local/bin/kubectl wait --for=condition=Ready node --all --timeout=180s

log '初始化前端共享发布目录'
mkdir -p "$APP_ROOT/releases"
if [ -f /var/www/ais-gateway-admin/index.html ] && [ ! -e "$APP_ROOT/current" ]; then
  mkdir -p "$APP_ROOT/releases/initial/site"
  cp -a /var/www/ais-gateway-admin/. "$APP_ROOT/releases/initial/site/"
  ln -s releases/initial/site "$APP_ROOT/current"
fi
semanage fcontext -a -t container_file_t "$APP_ROOT(/.*)?" 2>/dev/null \
  || semanage fcontext -m -t container_file_t "$APP_ROOT(/.*)?"
restorecon -R "$APP_ROOT" >/dev/null

log '部署命名空间和前端 Nginx'
/usr/local/bin/kubectl apply -f "$(dirname "$0")/k8s/ais-gateway.yaml"
/usr/local/bin/kubectl rollout status deployment/frontend -n ais-gateway --timeout=180s

log '创建 Jenkins 专用、仅限 ais-gateway 命名空间的 Kubernetes 凭据'
cat <<'EOF' | /usr/local/bin/kubectl apply -f - >/dev/null
apiVersion: v1
kind: Secret
metadata:
  name: jenkins-deployer-token
  namespace: ais-gateway
  annotations:
    kubernetes.io/service-account.name: jenkins-deployer
type: kubernetes.io/service-account-token
EOF
token=
for attempt in $(seq 1 60); do
  token=$(/usr/local/bin/kubectl get secret jenkins-deployer-token -n ais-gateway \
    -o jsonpath='{.data.token}' 2>/dev/null | base64 -d 2>/dev/null || true)
  [ -n "$token" ] && break
  sleep 2
done
[ -n "$token" ] || die '未能生成 Jenkins Kubernetes 服务账号令牌'
cluster_ca=$(base64 -w0 /var/lib/rancher/k3s/server/tls/server-ca.crt)

log '安装 Java 21 和 Jenkins LTS'
if [ ! -x /opt/temurin-21/bin/java ]; then
  java_archive=/var/tmp/temurin-21-jre.tar.gz
  java_url=https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jre/hotspot/normal/eclipse
  asset_url=$(curl -4 -fsS -o /dev/null -w '%{redirect_url}' "$java_url")
  [ -n "$asset_url" ] || die '未能解析 Temurin JRE 官方归档地址'
  checksum_url="${asset_url}.sha256.txt"
  curl -4 -fL --retry 3 --connect-timeout 15 "$checksum_url" -o "${java_archive}.sha256"
  curl -4 -fL --retry 3 --connect-timeout 15 "$java_url" -o "$java_archive"
  expected_sha=$(awk 'NR == 1 { print $1 }' "${java_archive}.sha256")
  printf '%s  %s\n' "$expected_sha" "$java_archive" | sha256sum -c -
  tar -xzf "$java_archive" -C /opt
  java_home=$(find /opt -maxdepth 1 -type d -name 'jdk-21*' -print -quit)
  [ -x "$java_home/bin/java" ] || die 'Java 21 解压失败'
  ln -sfn "$java_home" /opt/temurin-21
  alternatives --install /usr/bin/java java /opt/temurin-21/bin/java 21000
  rm -f "$java_archive" "${java_archive}.sha256"
fi
rpm --import https://pkg.jenkins.io/redhat-stable/jenkins.io-2026.key
curl -4 -fL --retry 3 https://pkg.jenkins.io/redhat-stable/jenkins.repo \
  -o /etc/yum.repos.d/jenkins.repo
yum install -y jenkins
mkdir -p "$JENKINS_HOME/workspace"
chown -R jenkins:jenkins "$APP_ROOT" "$JENKINS_HOME/workspace"
semanage fcontext -a -t container_file_t "$JENKINS_HOME/workspace(/.*)?" 2>/dev/null \
  || semanage fcontext -m -t container_file_t "$JENKINS_HOME/workspace(/.*)?"
restorecon -R "$JENKINS_HOME/workspace" >/dev/null
install -d -o jenkins -g jenkins -m 0700 "$JENKINS_HOME/.kube"
cat >"$JENKINS_HOME/.kube/config" <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: ais-k3s
    cluster:
      server: https://127.0.0.1:6443
      certificate-authority-data: ${cluster_ca}
users:
  - name: jenkins-deployer
    user:
      token: ${token}
contexts:
  - name: ais-k3s
    context:
      cluster: ais-k3s
      user: jenkins-deployer
      namespace: ais-gateway
current-context: ais-k3s
EOF
chown jenkins:jenkins "$JENKINS_HOME/.kube/config"
chmod 0600 "$JENKINS_HOME/.kube/config"
unset token cluster_ca

log '下载 Jenkins Git/Pipeline 插件及官方声明的必要依赖'
PLUGIN_DIR="$JENKINS_HOME/plugins"
mkdir -p "$PLUGIN_DIR" /var/tmp/ais-jenkins-plugins
jenkins_version=$(rpm -q --qf '%{VERSION}' jenkins)
curl -4 -fL --retry 3 --connect-timeout 15 \
  "https://updates.jenkins.io/current/update-center.actual.json?version=${jenkins_version}" \
  -o /var/tmp/ais-jenkins-update-center.json
python - /var/tmp/ais-jenkins-update-center.json > /var/tmp/ais-jenkins-plugins.tsv <<'PY'
import json
import sys

plugins = json.load(open(sys.argv[1], 'r'))['plugins']
queue = ['git', 'workflow-aggregator']
resolved = set()
while queue:
    name = queue.pop(0)
    if name in resolved:
        continue
    plugin = plugins.get(name)
    if not plugin:
        raise SystemExit('update center did not advertise plugin: ' + name)
    resolved.add(name)
    for dependency in plugin.get('dependencies', []):
        if not dependency.get('optional', False):
            queue.append(dependency['name'])
    version = plugin['version']
    url = plugin.get('url') or 'https://updates.jenkins.io/download/plugins/{0}/{1}/{0}.hpi'.format(name, version)
    print('{}\t{}\t{}'.format(name, version, url))
PY

while IFS="$(printf '\t')" read -r plugin_name plugin_version plugin_url; do
  [ -n "$plugin_name" ] || continue
  [ -s "$PLUGIN_DIR/${plugin_name}.jpi" ] && continue
  curl -4 -fL --retry 10 --retry-delay 2 --retry-max-time 300 \
    --connect-timeout 15 --max-time 300 "$plugin_url" \
    -o "/var/tmp/ais-jenkins-plugins/${plugin_name}.jpi"
  install -o jenkins -g jenkins -m 0644 "/var/tmp/ais-jenkins-plugins/${plugin_name}.jpi" \
    "$PLUGIN_DIR/${plugin_name}.jpi"
done </var/tmp/ais-jenkins-plugins.tsv
chown -R jenkins:jenkins "$PLUGIN_DIR"

log '配置 Jenkins 登录和项目 SCM 轮询任务'
admin_password=$(openssl rand -hex 24)
install -d -o jenkins -g jenkins -m 0750 "$JENKINS_HOME/init.groovy.d"
cat >"$JENKINS_HOME/init.groovy.d/00-bootstrap-security.groovy" <<EOF
import jenkins.model.Jenkins
import hudson.security.HudsonPrivateSecurityRealm
import hudson.security.FullControlOnceLoggedInAuthorizationStrategy

def instance = Jenkins.get()
def realm = new HudsonPrivateSecurityRealm(false)
realm.createAccount('admin', '${admin_password}')
instance.setSecurityRealm(realm)
instance.setAuthorizationStrategy(new FullControlOnceLoggedInAuthorizationStrategy())
instance.save()
EOF
chown jenkins:jenkins "$JENKINS_HOME/init.groovy.d/00-bootstrap-security.groovy"
chmod 0600 "$JENKINS_HOME/init.groovy.d/00-bootstrap-security.groovy"
cat >/etc/sysconfig/jenkins <<'EOF'
JENKINS_PORT="8080"
JENKINS_ARGS="--httpListenAddress=127.0.0.1 --prefix=/jenkins"
JENKINS_JAVA_OPTIONS="-Djenkins.install.runSetupWizard=false"
EOF
mkdir -p /etc/systemd/system/jenkins.service.d
cat >/etc/systemd/system/jenkins.service.d/ais-ci.conf <<'EOF'
[Service]
Environment="JAVA_OPTS=-Djava.awt.headless=true -Djenkins.install.runSetupWizard=false"
Environment="JENKINS_LISTEN_ADDRESS=127.0.0.1"
Environment="JENKINS_PREFIX=/jenkins"
EOF
systemctl daemon-reload
systemctl enable jenkins
systemctl reset-failed jenkins || true
systemctl restart jenkins
for attempt in $(seq 1 120); do
  if curl -fsS "$JENKINS_URL/login" >/dev/null 2>&1; then break; fi
  sleep 5
done
curl -fsS "$JENKINS_URL/login" >/dev/null || die 'Jenkins 未启动，请查看 journalctl -u jenkins'

bash "$SCRIPT_DIR/configure-jenkins-job.sh"
rm -f "$JENKINS_HOME/init.groovy.d/00-bootstrap-security.groovy"
rm -rf /var/tmp/ais-jenkins-plugins /var/tmp/ais-jenkins-plugins.tsv \
  /var/tmp/ais-jenkins-update-center.json

log '安装本项目 Nginx 配置并校验服务'
if [ ! -f /etc/nginx/nginx.conf.before-ci ]; then
  cp -a /etc/nginx/nginx.conf /etc/nginx/nginx.conf.before-ci
fi
install -o root -g root -m 0644 "$SCRIPT_DIR/nginx.conf" /etc/nginx/nginx.conf
setsebool -P httpd_can_network_connect 1
nginx -t
systemctl reload nginx

log '保存 Jenkins 初始登录信息'
install -o root -g root -m 0600 /dev/null /root/ais-jenkins-admin.txt
printf 'Jenkins URL: https://10.22.116.88/jenkins/\nAdmin user: admin\nInitial password: %s\n' \
  "$admin_password" >/root/ais-jenkins-admin.txt
unset admin_password

echo 'K3s:'
/usr/local/bin/kubectl get nodes -o wide
echo 'Frontend:'
/usr/local/bin/kubectl get pods,services -n ais-gateway
echo 'Jenkins:'
systemctl is-active jenkins
echo 'HTTPS:'
curl --cacert /etc/nginx/ssl/ais-root-ca.crt -fsS -o /dev/null \
  -w 'homepage HTTP %{http_code}\n' https://10.22.116.88/
curl --cacert /etc/nginx/ssl/ais-root-ca.crt -fsS -o /dev/null \
  -w 'jenkins HTTP %{http_code}\n' https://10.22.116.88/jenkins/login
