#!/usr/bin/env bash
set -euo pipefail
# Invoked with sudo on the authorized VPS. The archive contains only the built /play/ app.
release_id="${1:?release id required}"
archive="${2:?archive required}"
[[ "$release_id" =~ ^[0-9]{8}-[0-9]{6}$ ]] || { echo 'Invalid release id' >&2; exit 1; }
[[ "$archive" == "/tmp/echo-game-${release_id}.tar.gz" ]] || { echo 'Unexpected archive path' >&2; exit 1; }
base=/var/www/agent.li33.art
previous=$(readlink -f "$base/current")
[[ "$previous" == "$base/releases/"* ]] || { echo 'Current release is outside expected root' >&2; exit 1; }
release="$base/releases/$release_id"
[[ ! -e "$release" ]] || { echo 'Release already exists; refusing overwrite' >&2; exit 1; }
mkdir -p "$release"
cp -a "$previous/." "$release/"
mkdir -p "$release/archive/v1" "$release/play"
if [[ ! -f "$release/archive/v1/index.html" ]]; then
  for file in index.html styles.css app.js content.js agent_lab.py; do
    [[ -f "$previous/$file" ]] || { echo "Missing archive source $file" >&2; exit 1; }
    cp "$previous/$file" "$release/archive/v1/$file"
  done
fi
# Prior hashed assets remain available for already-open clients and rollback.
tar -xzf "$archive" -C "$release/play" --no-same-owner
test -s "$release/play/index.html"
test -s "$release/play/offline-manifest.json"
test -s "$release/archive/v1/index.html"
chown -R root:root "$release"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
nginx -t
ln -s "$release" "$base/current-next-$release_id"
mv -Tf "$base/current-next-$release_id" "$base/current"
echo "PREVIOUS=$previous"
echo "CURRENT=$release"
curl --fail --silent --resolve agent.li33.art:443:127.0.0.1 https://agent.li33.art/play/ -o /dev/null
curl --fail --silent --resolve agent.li33.art:443:127.0.0.1 https://agent.li33.art/archive/v1/ -o /dev/null
echo 'RELEASE_VERIFIED'
