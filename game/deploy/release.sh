#!/usr/bin/env bash
set -euo pipefail
umask 077
# Fixed site and archive path. The Python body is also exercised in isolated tests.
[[ $# == 2 && "$1" =~ ^[0-9]{8}-[0-9]{6}$ ]] || { echo 'One timestamp release ID and archive required' >&2; exit 1; }
[[ "$2" == "/tmp/echo-game-${1}.tar.gz" ]] || { echo 'Unexpected archive path' >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || { echo 'Run release with sudo' >&2; exit 1; }
script_dir=$(cd -P -- "$(dirname -- "$0")" && pwd)
for helper in rollback_release.py verify_release.py; do
  [[ -f "$script_dir/$helper" && ! -L "$script_dir/$helper" ]] || { echo 'Missing trusted release helper' >&2; exit 1; }
done
python3 -I - "$script_dir" "$1" "$2" <<'FORWARD_PYTHON'
# BEGIN FORWARD PYTHON
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tarfile
from urllib.parse import urljoin, urlsplit

BASE = Path("/var/www/agent.li33.art")
LEGACY_INITIAL_RELEASE = "20261003-192945"
MANDATORY = {"index.html", "sw.js", "offline-manifest.json", "manifest.webmanifest", "release-compat.json"}


def load_tools(directory):
    path = directory / "rollback_release.py"
    spec = importlib.util.spec_from_file_location("echo_forward_tools", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def legacy_report(release, verify):
    # Only the previously audited 0.10 release may lack reader metadata.
    verify.require(release.name == LEGACY_INITIAL_RELEASE, "Unknown legacy release has no compatibility metadata")
    body = verify.read_bytes(release / "play/offline-manifest.json", 2_000_000)
    manifest = verify.parse_json(body.decode("utf-8"))
    verify.require(isinstance(manifest, dict) and type(manifest.get("schema")) is int and manifest.get("schema") == 2 and manifest.get("basePath") == "/play/" and isinstance(manifest.get("assets"), list) and 1 <= len(manifest["assets"]) <= 1000 and isinstance(manifest.get("version"), str) and re.fullmatch(r"[0-9a-f]{24}", manifest["version"]), "Invalid legacy offline manifest")
    checks = {}
    for asset in manifest["assets"]:
        verify.require(isinstance(asset, dict) and set(asset) == {"url", "bytes", "sha256"} and isinstance(asset["url"], str) and asset["url"].startswith("/play/") and asset["url"] not in checks, "Invalid legacy resource")
        resource = verify.read_bytes(verify.local_path(release, asset["url"]))
        verify.require(type(asset["bytes"]) is int and len(resource) == asset["bytes"] and verify.sha256(resource) == asset["sha256"], "Legacy resource integrity mismatch")
        checks[asset["url"]] = {"bytes": len(resource), "sha256": verify.sha256(resource)}
    verify.require(type(manifest.get("totalBytes")) is int and manifest["totalBytes"] <= 64_000_000 and manifest["totalBytes"] == sum(item["bytes"] for item in checks.values()), "Legacy byte total mismatch")
    offline_urls = set(checks)
    for url, file_url in (("/", "/index.html"), ("/archive/v1/", "/archive/v1/index.html"), ("/play/", "/play/index.html"), ("/play/sw.js", "/play/sw.js"), ("/play/offline-manifest.json", "/play/offline-manifest.json")):
        resource = verify.read_bytes(verify.local_path(release, file_url))
        checks[url] = {"bytes": len(resource), "sha256": verify.sha256(resource)}
        if file_url.endswith("index.html"):
            parser = verify.ResourceLinks()
            parser.feed(resource.decode("utf-8"))
            for reference in parser.urls:
                if reference.startswith("data:"):
                    continue
                ref = urlsplit(urljoin(f"https://{verify.DOMAIN}{url}", reference))
                verify.require(ref.scheme == "https" and ref.netloc == verify.DOMAIN and not ref.query and not ref.fragment, "Legacy page resource is outside this site")
                content = verify.read_bytes(verify.local_path(release, ref.path))
                verify.require(url != "/play/" or ref.path in offline_urls, "Legacy app dependency is absent from its offline bundle")
                checks[ref.path] = {"bytes": len(content), "sha256": verify.sha256(content)}
    worker = verify.read_bytes(release / "play/sw.js").decode("utf-8")
    markers = list(re.finditer(r"\bconst RELEASE\s*=\s*", worker))
    verify.require(len(markers) == 1, "Legacy worker release is missing or ambiguous")
    embedded, end = json.JSONDecoder(object_pairs_hook=verify.no_duplicates).raw_decode(worker[markers[0].end():])
    verify.require(worker[markers[0].end()+end:].lstrip().startswith(";") and json.dumps(embedded, sort_keys=True) == json.dumps(manifest, sort_keys=True), "Legacy worker and manifest do not match")
    for path in (release / "play/assets").rglob("*"):
        url = "/" + path.relative_to(release).as_posix()
        if path.is_file() and verify.hashed_asset_url(url):
            resource = verify.read_bytes(verify.local_path(release, url))
            checks[url] = {"bytes": len(resource), "sha256": verify.sha256(resource)}
    return {"target": str(release), "checks": checks}


def safe_members(archive, verify):
    members, seen, total, files = [], set(), 0, set()
    for count, member in enumerate(archive, 1):
        verify.require(count <= 2000, "Too many archive entries")
        name = member.name
        verify.require(isinstance(name, str) and re.fullmatch(r"[a-zA-Z0-9_./-]+", name) and not name.startswith("/") and ".." not in name.split("/"), "Archive path escapes or is not canonical")
        parts = PurePosixPath(name).parts
        if not parts:
            verify.require(member.isdir(), "Invalid archive root")
            continue
        relative = PurePosixPath(*parts).as_posix()
        verify.require(relative not in seen and (member.isdir() or member.isfile()) and not member.issym() and not member.islnk(), "Duplicate, link or special archive entry")
        seen.add(relative)
        if member.isfile():
            verify.require(0 < member.size <= 16_000_000, "Empty or oversized archive file")
            total += member.size
            verify.require(total <= 64_000_000, "Incomplete or oversized game archive")
            files.add(relative)
        members.append((member, parts))
    verify.require(total <= 64_000_000 and MANDATORY <= files, "Incomplete or oversized game archive")
    return members


def forward(base, release_id, archive_path, tools, runner=None):
    verify = tools.verify
    runner = runner or tools.run_command
    base, releases = verify.deployment_root(base)
    verify.require(re.fullmatch(r"[0-9]{8}-[0-9]{6}", release_id), "Invalid release ID")
    previous = verify.current_target(base)
    for path in [previous, *previous.rglob("*")]:
        mode = path.lstat().st_mode
        verify.require(not path.is_symlink() and (stat.S_ISDIR(mode) or stat.S_ISREG(mode)) and path.resolve(strict=True).is_relative_to(previous), "Previous release contains an unexpected link or special file")
    current = verify.verify_release(base, previous.name) if (previous / "play/release-compat.json").exists() else legacy_report(previous, verify)
    target_path = releases / release_id
    verify.require(not target_path.exists() and not target_path.is_symlink(), "Release already exists; refusing overwrite")
    archive_path = Path(archive_path)
    verify.require(archive_path.is_absolute() and not archive_path.is_symlink() and archive_path.resolve(strict=True) == archive_path and archive_path.is_file(), "Archive is not its exact regular file")
    digest = verify.sha256(verify.read_bytes(archive_path, 80_000_000))
    with tarfile.open(archive_path, "r:gz") as archive:
        members = safe_members(archive, verify)
        shutil.copytree(previous, target_path, copy_function=shutil.copy2)
        archive_directory = target_path / "archive/v1"
        if not (archive_directory / "index.html").is_file():
            archive_directory.mkdir(parents=True, exist_ok=True)
            for name in ("index.html", "styles.css", "app.js", "content.js", "agent_lab.py"):
                verify.require((previous / name).is_file(), "Missing original archive source")
                shutil.copy2(previous / name, archive_directory / name)
        play = target_path / "play"
        play.mkdir(exist_ok=True)
        for member, parts in members:
            path = play.joinpath(*parts)
            verify.require(path.resolve().is_relative_to(play), "Archive destination leaves game directory")
            if member.isdir():
                path.mkdir(parents=True, exist_ok=True)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, path.open("wb") as output:
                    shutil.copyfileobj(source, output)
                verify.require(path.stat().st_size == member.size, "Truncated archive extraction")
    verify.require(digest == verify.sha256(verify.read_bytes(archive_path, 80_000_000)), "Archive changed during preparation")
    for path in [target_path, *target_path.rglob("*")]:
        path.chmod(0o755 if path.is_dir() else 0o644)
    target = verify.verify_release(base, release_id)
    if "metadata" in current:
        verify.compatible(current["metadata"], target["metadata"])
    else:
        meta = target["metadata"]
        verify.require(meta["contentVersion"] == "season-0.11.0" and "season-0.10.0" in meta["readableContentVersions"] and "post-season-v1" in meta["saveFeatures"], "Legacy first upgrade must be the audited 0.11 reader")
    verify.require_retained_hashed_assets(current, target)
    runner(["nginx", "-t"])
    switched = False
    def did_swap():
        nonlocal switched
        switched = True
    try:
        tools.atomic_link(base, target_path, previous, did_swap)
        verify.require(verify.verify_release(base, release_id) == target, "Target changed during the forward switch")
        runner(["nginx", "-t"])
        tools.health(target, runner)
        return {"previous": str(previous), "current": str(target_path), "archiveSha256": digest, "offlineVersion": target["offlineVersion"], "verifiedResources": len(target["checks"])}
    except BaseException as error:
        if not switched:
            raise
        if verify.current_target(base) != target_path:
            raise RuntimeError("Forward checks failed but another deployment owns current; no unknown release was overwritten") from error
        try:
            tools.atomic_link(base, previous, target_path)
            recovered = verify.verify_release(base, previous.name) if "metadata" in current else legacy_report(previous, verify)
            verify.require(recovered == current, "Previous release changed during recovery")
            runner(["nginx", "-t"])
            tools.health(current, runner)
        except BaseException as recovery_error:
            restored = verify.current_target(base) == previous
            message = "Previous link restored exactly but its recovery checks failed" if restored else "Forward recovery failed before previous link restoration"
            raise RuntimeError(f"{message}: {recovery_error}") from error
        raise RuntimeError("Forward checks failed; exact previous release restored and reverified") from error


def main():
    verify_args = len(sys.argv) == 4 and re.fullmatch(r"[0-9]{8}-[0-9]{6}", sys.argv[2]) and sys.argv[3] == f"/tmp/echo-game-{sys.argv[2]}.tar.gz"
    if not verify_args or os.name != "posix" or os.geteuid() != 0:
        raise ValueError("Fixed-site Linux root invocation required")
    tools = load_tools(Path(sys.argv[1]))
    verify = tools.verify
    verify.deployment_root(BASE)
    for path in (BASE, BASE / "releases"):
        info = path.stat()
        verify.require(info.st_uid == 0 and not info.st_mode & (stat.S_IWGRP | stat.S_IWOTH), "Untrusted deployment directory")
    import fcntl
    descriptor = os.open(BASE / ".release.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        info = os.fstat(descriptor)
        verify.require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and not info.st_mode & (stat.S_IWGRP | stat.S_IWOTH), "Untrusted release lock")
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        tools.require_trusted_release(verify.current_target(BASE))
        result = forward(BASE, sys.argv[2], Path(sys.argv[3]), tools)
        print(f"PREVIOUS={result['previous']}\nCURRENT={result['current']}\nARCHIVE_SHA256={result['archiveSha256']}\nOFFLINE_VERSION={result['offlineVersion']}\nVERIFIED_RESOURCES={result['verifiedResources']}\nRELEASE_VERIFIED")
    finally:
        os.close(descriptor)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"RELEASE_REFUSED_OR_RECOVERED: {error}", file=sys.stderr)
        sys.exit(1)
# END FORWARD PYTHON
FORWARD_PYTHON
