# Linux 部署（Nginx HTTPS + Jenkins + K3s）

## Jenkins + 单节点 K3s 自动构建发布

`setup-ci.sh` 在 CentOS 7 x86_64 虚拟机安装 K3s 与 Jenkins LTS，并创建
`ais-gateway-admin` Jenkins Pipeline。流水线不做定时轮询；在 Jenkins 页面点击“立即构建”时，
才通过 GitHub API 读取 `main` 最新提交并从 codeload 下载源码归档，然后启动构建与发布。
该 VM 的 Git Smart HTTP 连接会被网络中断，因此流水线使用 API 读取提交并通过归档 GET 下载源码。
构建在 K3s Node.js Job 内执行
`npm ci`、`npm run type-check`、`npm run build`，通过受限 ServiceAccount 发布到前端 Deployment。

首次安装：将整个 `deploy` 目录上传到 VM，确保同级 `Jenkinsfile` 也上传，然后以 root 执行：

```bash
bash deploy/setup-ci.sh
```

初始化后使用 `https://10.22.116.88/jenkins/` 登录；一次性管理员密码保存在 VM 的
`/root/ais-jenkins-admin.txt`（root-only）。Nginx 仍只对外开放 80/443，Jenkins 监听
`127.0.0.1:8080`；K3s API 不开放公网，NodePort 30080 仅允许本机源地址。

首次安装会将仓库根目录 `Jenkinsfile` 写入 Jenkins Pipeline。每次点击“立即构建”都会构建并发布
当时 `main` 分支的最新提交。也可使用本目录 `update.ps1` 手动发布本地构建产物，它会原子切换 K3s
共享发布目录并等待 Deployment 就绪。K3s 工作负载与权限定义在
[k8s/ais-gateway.yaml](k8s/ais-gateway.yaml)，构建 Job 模板在 [k8s/build-job.yaml](k8s/build-job.yaml)。

> CentOS 7 已停止维护，单节点集群用于当前虚拟机环境；系统资源为 4 vCPU、7.6 GiB RAM、
> 约 16 GiB 可用磁盘。升级到受支持的 Linux 版本后，应重新评估此安装方案。

当前使用私有 ACME HTTPS，入口为 `https://10.22.116.88/`。首次部署须先按
[HTTPS 配置说明](HTTPS.md) 初始化 CA 和证书；客户端须信任根证书。
下方历史 HTTP 自检命令中的站点地址请改用 HTTPS，并加
`--cacert /etc/nginx/ssl/ais-root-ca.crt`；80 端口只保留跳转和 ACME 验证。

后端地址：`http://10.22.116.82:18088`。日常手动更新：在 Windows 执行
`$env:AIS_DEPLOY_PASS='<密码>'; powershell -ExecutionPolicy Bypass -File deploy/update.ps1`，
会上传当前 `dist`、原子切换版本、滚动重启 Deployment，并通过私有根证书验证首页与 API。
发布机需有项目构建使用的 Node.js。自检由 `check-https.mjs` 使用 Node.js HTTPS 完成，
验证证书链、有效期、主机名及首页 200 / 未登录 API 401；不依赖 Windows Schannel 的吊销服务，
也不关闭 TLS 校验或修改系统信任库。

常用 VM 自检：

```bash
systemctl status k3s jenkins nginx --no-pager
kubectl get nodes -o wide
kubectl get pods,services -n ais-gateway
curl --cacert /etc/nginx/ssl/ais-root-ca.crt -I https://10.22.116.88/
curl --cacert /etc/nginx/ssl/ais-root-ca.crt -I https://10.22.116.88/jenkins/login
```

Jenkins 管理员密码仅保存在 `/root/ais-jenkins-admin.txt`。若 Nginx 返回 502，先检查
`kubectl rollout status deployment/frontend -n ais-gateway` 和 `setsebool -P httpd_can_network_connect 1`。
