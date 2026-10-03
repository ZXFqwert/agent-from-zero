#!/usr/bin/env bash
set -euo pipefail
umask 022
unset PYTHONPATH PYTHONHOME
for variable in "${!PIP_@}"; do unset "$variable"; done
# Prepare only. No current/venv link switch, unit install/start or Nginx change.
release_id="${1:?release id required}"
archive="${2:?runtime archive required}"
[[ "$release_id" =~ ^[0-9]{8}-[0-9]{6}$ ]] || { echo 'Invalid release ID' >&2; exit 1; }
[[ "$archive" == "/tmp/agent-game-lab-${release_id}.tar.gz" && -f "$archive" && ! -L "$archive" ]] || { echo 'Unexpected archive' >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || { echo 'Run preparation with sudo' >&2; exit 1; }
base=/opt/agent-game-lab
release="$base/releases/$release_id"
runtime="$base/venvs/$release_id"
for directory in "$base" "$base/releases" "$base/venvs"; do
  [[ ! -L "$directory" ]] || { echo 'Unexpected deployment symlink' >&2; exit 1; }
done
[[ ! -e "$release" && ! -L "$release" && ! -e "$runtime" && ! -L "$runtime" ]] || { echo 'Refusing to overwrite a release/runtime' >&2; exit 1; }
python3 -c 'import sys; assert sys.version_info >= (3,10), "Python 3.10+ required"'
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
[[ -f "$script_dir/verify.py" ]] || { echo 'Missing trusted verifier beside preparation script' >&2; exit 1; }
python3 "$script_dir/verify.py" "$archive" "$release_id"
mkdir -p "$base/releases" "$base/venvs"
python3 "$script_dir/verify.py" "$archive" "$release_id" --destination "$release"
python3 -m venv "$runtime"
PIP_CONFIG_FILE=/dev/null PIP_INDEX_URL=https://pypi.org/simple "$runtime/bin/python" -m pip install --disable-pip-version-check --no-input --no-cache-dir --only-binary=:all: -r "$release/requirements.txt"
"$runtime/bin/python" -m pip check
(
  cd "$release"
  env -u MODEL_BASE_URL -u MODEL_NAME -u MODEL_API_KEY -u LAB_ALTERNATE_MODEL_NAME "$runtime/bin/python" -c 'from agent_lab.app import app; from agent_lab.config import Settings; assert not Settings.from_env().enabled; print("BACKEND_IMPORT_DISABLED_OK")'
)
printf 'PREPARED_RELEASE=%s\nPREPARED_RUNTIME=%s\n' "$release" "$runtime"
echo 'PREPARED_ONLY_NO_SERVICE_OR_NGINX_CHANGE'
