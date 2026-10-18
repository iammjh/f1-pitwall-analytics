#!/usr/bin/env bash
set -Eeuo pipefail

# Store the replica-set secret in a Docker volume, never in the image or repo.
# Reuse it on restarts and when an existing standalone data volume is upgraded.
keyfile=/data/configdb/replica-set.key
umask 077
if [ ! -s "$keyfile" ]; then
  head -c 756 /dev/urandom | base64 > "${keyfile}.tmp"
  mv "${keyfile}.tmp" "$keyfile"
fi
chown mongodb:mongodb "$keyfile"
chmod 400 "$keyfile"

exec /usr/local/bin/docker-entrypoint.sh "$@"
