"""Verify before extracting. No tar traversal, link targets or unknown files."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import tarfile

ALLOWED = {
    "README.md", "requirements.txt",
    "agent_lab/__init__.py", "agent_lab/app.py", "agent_lab/config.py",
    "agent_lab/experiments.py", "agent_lab/invites.py", "agent_lab/provider.py",
    "agent_lab/store.py", "agent_lab/world.py",
    "deploy/agent-game-lab.service", "deploy/nginx-api.conf.example",
    "deploy/prepare.sh", "deploy/verify.py", "deploy/activate-disabled.sh",
}
TEST_ALLOWED = {"requirements-dev.txt", "tests/test_lab.py", "tests/test_provider.py", "tests/test_experiments.py", "tests/test_access.py"}


def verify(archive_path, release_id, destination=None, test_bundle=False):
    if not re.fullmatch(r"[0-9]{8}-[0-9]{6}", release_id):
        raise ValueError("Invalid release ID")
    payloads = {}
    if Path(archive_path).stat().st_size > 2 * 1024 * 1024:
        raise ValueError("Compressed archive too large")
    with gzip.open(archive_path, "rb") as stream:
        expanded = stream.read(10 * 1024 * 1024 + 1)
    if len(expanded) > 10 * 1024 * 1024:
        raise ValueError("Expanded archive too large")
    with tarfile.open(fileobj=io.BytesIO(expanded), mode="r:") as archive:
        for member in archive:
            if len(payloads) >= 24:
                raise ValueError("Too many members")
            path = PurePosixPath(member.name)
            if not member.isfile() or path.is_absolute() or str(path) != member.name or ".." in path.parts or member.name in payloads or member.size < 0 or member.size > 1024 * 1024:
                raise ValueError("Invalid archive member")
            payloads[member.name] = archive.extractfile(member).read()
    if sum(map(len, payloads.values())) > 8 * 1024 * 1024:
        raise ValueError("Archive too large")
    manifest = json.loads(payloads.pop("BUNDLE-MANIFEST.json"))
    expected = ALLOWED | (TEST_ALLOWED if test_bundle else set())
    if manifest["version"] != 1 or manifest["release_id"] != release_id or manifest["kind"] != ("test" if test_bundle else "runtime") or set(payloads) != expected:
        raise ValueError("Release manifest/allowlist mismatch")
    if len(manifest["files"]) != len(payloads) or {item["path"] for item in manifest["files"]} != expected:
        raise ValueError("Release manifest file mismatch")
    for item in manifest["files"]:
        data = payloads[item["path"]]
        if len(data) != item["bytes"] or hashlib.sha256(data).hexdigest() != item["sha256"]:
            raise ValueError("Release hash mismatch")
    if destination is not None:
        target = Path(destination)
        if target.exists() or target.is_symlink():
            raise ValueError("Refusing to overwrite destination")
        # All bytes and archive paths are checked before creating a destination.
        target.mkdir(parents=False, mode=0o755)
        for name, data in payloads.items():
            output = target / name
            output.parent.mkdir(parents=True, exist_ok=True)
            with output.open("xb") as stream:
                stream.write(data)
            output.chmod(0o755 if name.endswith(".sh") else 0o644)
        (target / "BUNDLE-MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("archive")
    parser.add_argument("release_id")
    parser.add_argument("--destination")
    parser.add_argument("--test-bundle", action="store_true")
    args = parser.parse_args()
    manifest = verify(args.archive, args.release_id, args.destination, args.test_bundle)
    print(json.dumps({"verified": True, "kind": manifest["kind"], "files": len(manifest["files"])}))
