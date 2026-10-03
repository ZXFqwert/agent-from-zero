"""Explicit release allowlist; real environments, databases and caches never ship."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile

RUNTIME_FILES = (
    "README.md", "requirements.txt",
    "agent_lab/__init__.py", "agent_lab/app.py", "agent_lab/config.py",
    "agent_lab/experiments.py", "agent_lab/invites.py", "agent_lab/provider.py",
    "agent_lab/store.py", "agent_lab/world.py",
    "deploy/agent-game-lab.service", "deploy/nginx-api.conf.example",
    "deploy/prepare.sh", "deploy/verify.py", "deploy/activate-disabled.sh",
)
TEST_FILES = (
    "requirements-dev.txt", "tests/test_lab.py", "tests/test_provider.py",
    "tests/test_experiments.py",
)


def build(release_id, out, test_bundle=False):
    if not re.fullmatch(r"[0-9]{8}-[0-9]{6}", release_id):
        raise ValueError("Invalid release ID")
    source = Path(__file__).resolve().parents[1]
    payloads = {}
    for relative in RUNTIME_FILES + (TEST_FILES if test_bundle else ()):
        path = source / relative
        if path.is_symlink() or not path.is_file() or source not in path.resolve().parents:
            raise ValueError("Unexpected release source: " + relative)
        payloads[relative] = path.read_bytes()
    manifest = {"version": 1, "release_id": release_id, "kind": "test" if test_bundle else "runtime", "files": [{"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()} for name, data in payloads.items()]}
    payloads["BUNDLE-MANIFEST.json"] = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
    out = Path(out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    target = out / ("agent-game-lab-" + ("test-" if test_bundle else "") + release_id + ".tar.gz")
    with tarfile.open(target, "x:gz") as archive:
        for name, data in payloads.items():
            item = tarfile.TarInfo(name)
            item.size = len(data)
            item.mode = 0o755 if name.endswith(".sh") else 0o644
            item.mtime = 0
            archive.addfile(item, io.BytesIO(data))
    return target, manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("release_id")
    parser.add_argument("--out", required=True)
    parser.add_argument("--test-bundle", action="store_true")
    args = parser.parse_args()
    path, manifest = build(args.release_id, args.out, args.test_bundle)
    print(json.dumps({"archive": str(path), "kind": manifest["kind"], "files": len(manifest["files"]), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}))
