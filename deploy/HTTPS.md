# 私有 ACME HTTPS

业务入口：`https://10.22.116.88/`。私有 CA 使用 Smallstep step-ca，客户端使用 Lego。
私有 IP 无法获取公共 CA 证书，访问端必须先信任本系统的根证书。

## 初始化

仅首次执行，已有 CA 时 `setup-https.sh` 会拒绝覆盖，避免客户端信任失效。
在与本目录脚本同级的 `https-tools/` 中放置官方发布的以下安装包，并按官方
checksums.txt 核对 SHA256 后再执行 `bash setup-https.sh`（CentOS 7 x86_64，root）。

| 工具包                            | SHA256                                                           |
| --------------------------------- | ---------------------------------------------------------------- |
| step-ca_linux_0.30.2_amd64.tar.gz | 126615795bafe3f2d3f890e2d628fa6e2857315fb48d0671d34b23047cc37d73 |
| step_linux_0.31.0_amd64.tar.gz    | a7e13726efa8782f3d5459174dacf602ab3514b9431f2d42a6a75950b7685e5f |
| lego_v5.6.0_linux_amd64.tar.gz    | f02fc11b6f56b97e387fa7caa0268f86f5a336953b22458e6430e4651fea439a |

来源：Smallstep certificates v0.30.2、Smallstep cli v0.31.0、go-acme/lego v5.6.0 的官方 GitHub Releases。
脚本先为当前 HTTP 配置增加独立的 http-01 验证目录，签发成功后再切换 HTTPS。
不会部署或覆盖前端业务产物。原配置保存在 `/etc/nginx/nginx.conf.before-https`。

## 服务和文件

- `ais-step-ca.service`：开机启动，ACME 服务仅监听 `127.0.0.1:9000`，不对外开放。
- CA 策略允许业务 IP，以及 CA 自身的 localhost/127.0.0.1；只保留 ACME provisioner。
- `/var/lib/ais-step-ca`：CA 配置、中间证书、加密中间私钥、数据库和服务密码。
- `/root/ais-ca-backup`：加密根私钥及其密码，仅 root 可读，应另外进行安全备份。
- `/var/lib/ais-acme/client`：ACME 账号和签发数据，仅 root 可读。
- `/var/lib/ais-acme/webroot`：HTTP 验证目录，独立于前端发布目录。
- `/etc/nginx/ssl/ais-fullchain.pem` 和 `ais-privkey.pem`：Nginx 使用的证书链和私钥。
- `/etc/nginx/ssl/ais-root-ca.crt`：可分发给客户端的公共根证书，严禁分发私钥或服务密码。

HTTP 80 保留 ACME 验证入口，其余请求跳转 HTTPS。仅需对外开放 80/443。
默认签发 30 天证书；`ais-acme-renew.timer` 开机后约 5 分钟执行，随后每 6 小时检查。
证书进入续期窗口时通过 ACME 重新签发；校验证书链、IP SAN 和密钥匹配后安装，
执行 `nginx -t` 并 reload。失败会使 service 报错，可通过 journalctl 检查。
CA 根证书和中间证书寿命独立于业务证书，需要另外监控其有效期并规划轮换。

## 客户端信任

通过管理员提供的根证书文件或 SSH 获取 `/etc/nginx/ssl/ais-root-ca.crt`，
先通过独立可信渠道核对 SHA256 指纹，再安装到客户端的“受信任的根证书颁发机构”。
Windows 可双击证书，选择安装到当前用户或由管理员统一分发。无需安装服务器私钥。
本次部署根证书的 SHA256 指纹：

```text
29:AC:94:CD:14:75:01:11:59:DE:AD:70:6C:21:85:77:97:90:2E:60:1E:8B:D1:37:AE:02:6D:DB:44:CE:92:00
```

根证书也可从 `/certs/ais-root-ca.crt` 下载，但首次信任不能只依赖未经验证的网络下载。

## 运维验证

```bash
systemctl status ais-step-ca ais-acme-renew.timer --no-pager
systemctl list-timers ais-acme-renew.timer --no-pager
systemctl start ais-acme-renew.service
journalctl -u ais-acme-renew.service -n 50 --no-pager
openssl x509 -in /etc/nginx/ssl/ais-fullchain.pem -noout -serial -dates
openssl x509 -in /etc/nginx/ssl/ais-root-ca.crt -noout -fingerprint -sha256
curl --cacert /etc/nginx/ssl/ais-root-ca.crt -I https://10.22.116.88/
```

日常前端更新仍执行 `update.ps1`；自检会通过 SSH 获取根证书并验证 HTTPS，
不会使用 `-k` 或修改客户端信任库。完整部署 `deploy.sh` 要求证书已初始化。
