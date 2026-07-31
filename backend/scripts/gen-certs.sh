#!/usr/bin/env sh
# Generate a self-signed TLS certificate for local HTTPS development.
# Output goes to backend/certs/ (gitignored). Requires openssl.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"
mkdir -p "$DIR"
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$DIR/key.pem" -out "$DIR/cert.pem" -days 365 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
echo "Self-signed cert written to $DIR (key.pem, cert.pem)."
echo "Enable with HTTPS_ENABLED=true in backend/.env, then run: npm run dev"
