#!/usr/bin/env bash
set -euo pipefail

DOMAINS=(
  "www.mycologs.club"
  "api.mycologs.club"
  "sandbox.mycologs.club"
  "sandbox-api.mycologs.club"
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Copying nginx configs ==="
for domain in "${DOMAINS[@]}"; do
  sudo cp "$SCRIPT_DIR/$domain" /etc/nginx/sites-available/
  echo "  Copied $domain"
done

echo ""
echo "=== Obtaining SSL certificates ==="
for domain in "${DOMAINS[@]}"; do
  echo "  Certbot: $domain"
  sudo certbot certonly --nginx -d "$domain"
done

echo ""
echo "=== Enabling sites ==="
for domain in "${DOMAINS[@]}"; do
  LINK="/etc/nginx/sites-enabled/$domain"
  if [ -L "$LINK" ]; then
    echo "  Already enabled: $domain"
  else
    sudo ln -s "/etc/nginx/sites-available/$domain" "$LINK"
    echo "  Enabled: $domain"
  fi
done

echo ""
echo "=== Testing and reloading nginx ==="
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "Done. All 4 sites are live."
