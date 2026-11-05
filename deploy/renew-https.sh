#!/usr/bin/env bash
# Root-only ACME renewal. The systemd timer runs this every six hours.
set -euo pipefail
umask 077
exec 9>/run/ais-acme-renew.lock
flock -n 9 || exit 0
export LEGO_CA_CERTIFICATES=/etc/nginx/ssl/ais-root-ca.crt
ARGS=(--server https://localhost:9000/acme/acme/directory
    --path /var/lib/ais-acme/client --domains 10.22.116.88
    --account-id ais-gateway --http --http.webroot /var/lib/ais-acme/webroot
    --accept-tos --renew-days 10 --no-random-sleep --ari-disable)
CERT=/var/lib/ais-acme/client/certificates/10.22.116.88.crt
KEY=/var/lib/ais-acme/client/certificates/10.22.116.88.key
# Challenge tokens must be readable by nginx; account/keys stay behind client/0700.
install -d -m 0755 /var/lib/ais-acme/webroot/.well-known/acme-challenge
(umask 022; /usr/local/bin/lego run "${ARGS[@]}" "$@")
openssl verify -CAfile "$LEGO_CA_CERTIFICATES" \
    -untrusted /var/lib/ais-step-ca/certs/intermediate_ca.crt "$CERT"
# Confirm that the requested IP SAN and corresponding private key are present.
openssl x509 -in "$CERT" -noout -text | grep -Eq 'IP Address:10\.22\.116\.88(,|[[:space:]]|$)'
test "$(openssl x509 -in "$CERT" -pubkey -noout | openssl sha256)" = \
    "$(openssl pkey -in "$KEY" -pubout | openssl sha256)"
if ! cmp -s "$CERT" /etc/nginx/ssl/ais-fullchain.pem || \
    ! cmp -s "$KEY" /etc/nginx/ssl/ais-privkey.pem; then
    # Keep the previous installed pair for recovery if nginx validation fails.
    if [ -s /etc/nginx/ssl/ais-fullchain.pem ]; then
        cp -p /etc/nginx/ssl/ais-fullchain.pem /etc/nginx/ssl/ais-fullchain.pem.previous
        cp -p /etc/nginx/ssl/ais-privkey.pem /etc/nginx/ssl/ais-privkey.pem.previous
    fi
    install -m 0644 "$CERT" /etc/nginx/ssl/ais-fullchain.pem.new
    install -m 0600 "$KEY" /etc/nginx/ssl/ais-privkey.pem.new
    mv -f /etc/nginx/ssl/ais-fullchain.pem.new /etc/nginx/ssl/ais-fullchain.pem
    mv -f /etc/nginx/ssl/ais-privkey.pem.new /etc/nginx/ssl/ais-privkey.pem
    restorecon -R /etc/nginx/ssl
    if ! nginx -t; then
        if [ -s /etc/nginx/ssl/ais-fullchain.pem.previous ]; then
            cp -p /etc/nginx/ssl/ais-fullchain.pem.previous /etc/nginx/ssl/ais-fullchain.pem
            cp -p /etc/nginx/ssl/ais-privkey.pem.previous /etc/nginx/ssl/ais-privkey.pem
        fi
        exit 1
    fi
    if ! systemctl reload nginx; then
        if [ -s /etc/nginx/ssl/ais-fullchain.pem.previous ]; then
            cp -p /etc/nginx/ssl/ais-fullchain.pem.previous /etc/nginx/ssl/ais-fullchain.pem
            cp -p /etc/nginx/ssl/ais-privkey.pem.previous /etc/nginx/ssl/ais-privkey.pem
        fi
        exit 1
    fi
fi
openssl x509 -in /etc/nginx/ssl/ais-fullchain.pem -noout -serial -dates
