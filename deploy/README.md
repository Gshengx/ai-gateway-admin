# Linux 部署（Nginx 静态托管 + /api 反代）

目标机：`10.22.116.88`（root），后端：`http://10.22.116.82:18088`。

1. 本机执行 `npm run build` 生成 `dist`。
2. 组织上传目录结构，把整个 `deploy` 目录传到目标机任意路径，例如 `/tmp/ais-deploy`：

   ```
   deploy.sh
   nginx.conf
   payload/dist/index.html
   payload/dist/assets/...
   ```

   上传命令（Windows 本机）：`pscp -pw <密码> -r deploy root@10.22.116.88:/tmp/ais-deploy`

3. 目标机以 root 执行：`cd /tmp/ais-deploy && bash deploy.sh`。脚本会安装 nginx（如缺失）、清空并同步 `/var/www/ais-gateway-admin`、备份并覆盖 `/etc/nginx/nginx.conf`、`nginx -t` 校验、启动或 reload、放行 80 端口。
4. 自检：

   ```
   curl -I http://127.0.0.1/
   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/api/v1/
   ```

   浏览器访问 `http://10.22.116.88/`，登录后确认 `/api/v1/...` 请求返回正常、刷新子路由不 404。

5. 日常更新：在本机执行 `$env:AIS_DEPLOY_PASS='<密码>'; powershell -ExecutionPolicy Bypass -File deploy/update.ps1`，自动打包 `dist`、上传、原子替换、`restorecon`、reload 并自检；失败时旧版本保留在 `/var/www/ais-gateway-admin.bak`。
6. 常见问题：80 被占 → `ss -lntp | grep :80` 处理占用进程；改配置后 → `nginx -t && systemctl reload nginx`；反代 502 → 检查目标机到 `10.22.116.82:18088` 是否通，SELinux 需 `setsebool -P httpd_can_network_connect 1`；静态资源 403 → SELinux 目录上下文需为 `httpd_sys_content_t`（脚本已处理）；CentOS 7 已 EOL，`yum install` 前需把仓库指向 `mirrors.aliyun.com/centos-vault/7.9.2009` + `epel-archive/7`；回滚 → 用 `/etc/nginx/nginx.conf.bak-ais-gateway-admin` 覆盖回来，或用 `ais-gateway-admin.bak` 换回旧产物。
