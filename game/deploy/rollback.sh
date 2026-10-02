#!/usr/bin/env bash
set -euo pipefail
release_id="${1:?release id required}"
[[ "$release_id" =~ ^[0-9]{8}-[0-9A-Za-z-]+$ ]] || exit 1
base=/var/www/agent.li33.art
release="$base/releases/$release_id"
test -s "$release/index.html"
# Prefer a game release so installed /play/ clients can see the older worker.
# Returning to the pre-game release removes /play/ online; installed caches still exist.
nginx -t
ln -s "$release" "$base/current-rollback"
mv -Tf "$base/current-rollback" "$base/current"
echo "Rolled back to $release"
