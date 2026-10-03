#!/usr/bin/env bash
set -euo pipefail
umask 077
# Only this site's current link is mutable. No caller-controlled deployment root.
[[ $# == 1 && "$1" =~ ^[0-9]{8}-[0-9A-Za-z-]+$ ]] || { echo 'One valid release ID required' >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || { echo 'Run rollback with sudo' >&2; exit 1; }
script_dir=$(cd -P -- "$(dirname -- "$0")" && pwd)
for helper in rollback_release.py verify_release.py; do
  [[ -f "$script_dir/$helper" && ! -L "$script_dir/$helper" ]] || { echo 'Missing trusted rollback helper' >&2; exit 1; }
done
exec python3 -I "$script_dir/rollback_release.py" "$1"
