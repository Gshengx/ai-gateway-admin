#!/usr/bin/env bash
# CentOS 7 x86_64. Run after staging verified official archives in ./https-tools.
# Does not publish frontend assets or alter client computer trust stores.
set -euo pipefail
umask 077
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ "$(id -u)" = 0 ] || { echo 'Run as root' >&2; exit 1; }
test -f "$DIR/nginx.conf"
test -f "$DIR/renew-https.sh"
test ! -e /var/lib/ais-step-ca/config/ca.json || [ "${AIS_HTTPS_RESUME:-0}" = 1 ] || {
    echo 'CA already exists; refusing to overwrite existing CA identity' >&2; exit 1;
}
cd "$DIR/https-tools"
printf '%s\n' \
    '126615795bafe3f2d3f890e2d628fa6e2857315fb48d0671d34b23047cc37d73  step-ca_linux_0.30.2_amd64.tar.gz' \
    'a7e13726efa8782f3d5459174dacf602ab3514b9431f2d42a6a75950b7685e5f  step_linux_0.31.0_amd64.tar.gz' \
    'f02fc11b6f56b97e387fa7caa0268f86f5a336953b22458e6430e4651fea439a  lego_v5.6.0_linux_amd64.tar.gz' | sha256sum -c -
WORK=$(mktemp -d /tmp/ais-https.XXXXXX)
trap 'rm -rf "$WORK"' EXIT
for component in ca cli lego; do
    mkdir "$WORK/$component"
done
tar -xzf "$DIR/https-tools/step-ca_linux_0.30.2_amd64.tar.gz" -C "$WORK/ca"
tar -xzf "$DIR/https-tools/step_linux_0.31.0_amd64.tar.gz" -C "$WORK/cli"
tar -xzf "$DIR/https-tools/lego_v5.6.0_linux_amd64.tar.gz" -C "$WORK/lego"
install -m 0755 "$(find "$WORK/ca" -type f -name step-ca | head -1)" /usr/local/bin/step-ca
install -m 0755 "$(find "$WORK/cli" -type f -name step | head -1)" /usr/local/bin/step
install -m 0755 "$WORK/lego/lego" /usr/local/bin/lego
/usr/local/bin/step-ca version
/usr/local/bin/step version
/usr/local/bin/lego --version
id ais-step-ca >/dev/null 2>&1 || useradd --system --home-dir /var/lib/ais-step-ca --shell /sbin/nologin ais-step-ca
install -d -m 0700 /var/lib/ais-step-ca /var/lib/ais-acme/client /root/ais-ca-backup
install -d -m 0755 /var/lib/ais-acme/webroot /etc/nginx/ssl
chmod 0755 /var/lib/ais-acme
export STEPPATH=/var/lib/ais-step-ca
if [ ! -f /var/lib/ais-step-ca/config/ca.json ]; then
    openssl rand -base64 48 > /var/lib/ais-step-ca/password
    /usr/local/bin/step ca init --deployment-type standalone --name 'AIS Gateway Private CA' \
        --dns localhost --dns 127.0.0.1 --address 127.0.0.1:9000 --provisioner bootstrap \
        --password-file /var/lib/ais-step-ca/password --acme
fi
/usr/bin/python - <<'PY'
import json
p='/var/lib/ais-step-ca/config/ca.json'
with open(p) as f: c=json.load(f)
c['authority']['provisioners']=[entry for entry in c['authority']['provisioners'] if entry['type']=='ACME']
c['authority']['claims']={'minTLSCertDuration':'5m','maxTLSCertDuration':'720h','defaultTLSCertDuration':'720h'}
c['authority']['policy']={'x509':{'allow':{'ip':['10.22.116.88/32','127.0.0.1/32'],'dns':['localhost']}}}
with open(p,'w') as f: json.dump(c,f,indent=2)
PY
# The running CA needs only the intermediate key, never the root signing key.
if [ -f /var/lib/ais-step-ca/secrets/root_ca_key ]; then
    mv /var/lib/ais-step-ca/secrets/root_ca_key /root/ais-ca-backup/root_ca_key
fi
cp /var/lib/ais-step-ca/password /root/ais-ca-backup/root-key-password
chmod 0600 /root/ais-ca-backup/*
chown -R ais-step-ca:ais-step-ca /var/lib/ais-step-ca
install -m 0644 /var/lib/ais-step-ca/certs/root_ca.crt /etc/nginx/ssl/ais-root-ca.crt
cat > /etc/systemd/system/ais-step-ca.service <<'UNIT'
[Unit]
Description=AIS Gateway private ACME certificate authority (loopback only)
After=network.target

[Service]
User=ais-step-ca
Group=ais-step-ca
Environment=STEPPATH=/var/lib/ais-step-ca
WorkingDirectory=/var/lib/ais-step-ca
ExecStart=/usr/local/bin/step-ca /var/lib/ais-step-ca/config/ca.json --password-file /var/lib/ais-step-ca/password
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now ais-step-ca
for attempt in $(seq 1 30); do
    if curl -fsS --cacert /etc/nginx/ssl/ais-root-ca.crt https://localhost:9000/health; then break; fi
    sleep 1
done
curl -fsS --cacert /etc/nginx/ssl/ais-root-ca.crt https://localhost:9000/acme/acme/directory >/dev/null
test -f /etc/nginx/nginx.conf.before-https || cp -p /etc/nginx/nginx.conf /etc/nginx/nginx.conf.before-https
# Bootstrap http-01 without interrupting the current HTTP application.
/usr/bin/python - <<'PY'
p='/etc/nginx/nginx.conf'
with open(p) as f: c=f.read()
needle='server_name _;'
assert needle in c, 'Expected current HTTP server configuration'
if 'location ^~ /.well-known/acme-challenge/' not in c:
    c=c.replace(needle, needle+'\n        location ^~ /.well-known/acme-challenge/ { root /var/lib/ais-acme/webroot; default_type text/plain; try_files $uri =404; }',1)
with open(p,'w') as f: f.write(c)
PY
if command -v semanage >/dev/null; then
    semanage fcontext -a -t httpd_sys_content_t '/var/lib/ais-acme/webroot(/.*)?' 2>/dev/null || \
        semanage fcontext -m -t httpd_sys_content_t '/var/lib/ais-acme/webroot(/.*)?'
fi
restorecon -R /var/lib/ais-acme/webroot /etc/nginx/ssl
nginx -t
systemctl reload nginx
install -m 0700 "$DIR/renew-https.sh" /usr/local/sbin/ais-renew-https
/usr/local/sbin/ais-renew-https
# Switch to HTTPS only after the first certificate exists.
install -m 0644 "$DIR/nginx.conf" /etc/nginx/nginx.conf
restorecon /etc/nginx/nginx.conf
if ! nginx -t; then
    cp -p /etc/nginx/nginx.conf.before-https /etc/nginx/nginx.conf
    exit 1
fi
systemctl reload nginx
if systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-service=https
    firewall-cmd --add-service=https
fi
cat > /etc/systemd/system/ais-acme-renew.service <<'UNIT'
[Unit]
Description=Renew AIS Gateway HTTPS certificate through local ACME CA
Requires=ais-step-ca.service
After=ais-step-ca.service nginx.service

[Service]
Type=oneshot
UMask=0077
TimeoutStartSec=300
ExecStart=/usr/local/sbin/ais-renew-https
UNIT
cat > /etc/systemd/system/ais-acme-renew.timer <<'UNIT'
[Unit]
Description=Check AIS Gateway HTTPS certificate every six hours

[Timer]
OnBootSec=5min
OnUnitActiveSec=6h
RandomizedDelaySec=5min

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now ais-acme-renew.timer
curl -fsS --cacert /etc/nginx/ssl/ais-root-ca.crt https://10.22.116.88/ >/dev/null
openssl x509 -in /etc/nginx/ssl/ais-root-ca.crt -noout -fingerprint -sha256
systemctl list-timers ais-acme-renew.timer --no-pager
echo 'HTTPS configured. Distribute only /etc/nginx/ssl/ais-root-ca.crt to clients.'
