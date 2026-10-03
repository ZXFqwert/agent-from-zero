#!/usr/bin/env bash
set -euo pipefail
umask 022
# Reviewed initial activation only. Refuses a real model configuration.
release_id="${1:?prepared release id required}"
[[ "$release_id" =~ ^[0-9]{8}-[0-9]{6}$ && "$(id -u)" == 0 ]] || { echo 'Invalid release ID or user' >&2; exit 1; }
base=/opt/agent-game-lab
release="$base/releases/$release_id"
runtime="$base/venvs/$release_id"
[[ ! -L "$base" && ! -L "$base/releases" && ! -L "$base/venvs" && ! -L "$release" && ! -L "$runtime" && -f "$release/BUNDLE-MANIFEST.json" && -x "$runtime/bin/python" ]] || { echo 'Prepared release/runtime missing' >&2; exit 1; }
[[ ! -L /var/lib/agent-game-lab && ! -L /etc/systemd/system/agent-game-lab.service ]] || { echo 'Refusing state/unit symlink' >&2; exit 1; }
[[ ! -e "$base/current-next-$release_id" && ! -L "$base/current-next-$release_id" && ! -e "$base/venv-next-$release_id" && ! -L "$base/venv-next-$release_id" ]] || { echo 'Unexpected temporary deployment link' >&2; exit 1; }
python3 - <<'PY'
from pathlib import Path
p=Path('/etc/agent-game-lab.env')
if p.is_symlink():
    raise SystemExit('Refusing configuration symlink')
if p.exists():
    for line in p.read_text().splitlines():
        key, sep, value=line.strip().partition('=')
        if sep and key.strip() in {'MODEL_BASE_URL','MODEL_NAME','MODEL_API_KEY','LAB_ALTERNATE_MODEL_NAME'} and value.strip().strip('"').strip("'"):
            raise SystemExit('Initial activation requires disabled model configuration')
PY
if ! id agent-game-lab >/dev/null 2>&1; then
  useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin agent-game-lab
fi
[[ "$(id -u agent-game-lab)" != 0 ]] || { echo 'Refusing privileged service account' >&2; exit 1; }
install -d -o agent-game-lab -g agent-game-lab -m 700 /var/lib/agent-game-lab
if [[ ! -e /etc/agent-game-lab.env ]]; then
  install -o root -g root -m 600 /dev/null /etc/agent-game-lab.env
fi
for link in current venv; do
  [[ ! -e "$base/$link" || -L "$base/$link" ]] || { echo 'Refusing to replace a non-symlink deployment path' >&2; exit 1; }
  if [[ -L "$base/$link" ]]; then
    previous=$(readlink -f "$base/$link")
    expected="$base/releases/"
    [[ "$link" == current ]] || expected="$base/venvs/"
    [[ "$previous" == "$expected"* ]] || { echo 'Previous target outside deployment root' >&2; exit 1; }
  fi
done
systemctl stop agent-game-lab.service 2>/dev/null || true
ln -s "$release" "$base/current-next-$release_id"
mv -Tf "$base/current-next-$release_id" "$base/current"
ln -s "$runtime" "$base/venv-next-$release_id"
mv -Tf "$base/venv-next-$release_id" "$base/venv"
install -o root -g root -m 644 "$release/deploy/agent-game-lab.service" /etc/systemd/system/agent-game-lab.service
systemd-analyze verify /etc/systemd/system/agent-game-lab.service
systemctl daemon-reload
systemctl start agent-game-lab.service
sleep 1
curl --fail --silent http://127.0.0.1:8788/api/lab/status | "$runtime/bin/python" -c 'import json,sys; value=json.load(sys.stdin); assert value["enabled"] is False; print("SERVICE_HEALTHY_MODEL_DISABLED")'
echo 'NO_NGINX_CHANGE'
