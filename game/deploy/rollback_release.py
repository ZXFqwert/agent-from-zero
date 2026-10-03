"""Fixed-site rollback with atomic symlinks, complete HTTPS integrity checks and recovery."""
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys
import uuid

_spec = importlib.util.spec_from_file_location("echo_release_verifier", Path(__file__).with_name("verify_release.py"))
verify = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(verify)
BASE = Path("/var/www/agent.li33.art")


def run_command(arguments):
    return subprocess.run(arguments, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30).stdout


def health(report, runner=run_command):
    for url, expected in sorted(report["checks"].items()):
        body = runner(["curl", "--fail", "--silent", "--show-error", "--connect-timeout", "5", "--max-time", "20", "--proto", "=https", "--tlsv1.2", "--resolve", f"{verify.DOMAIN}:443:127.0.0.1", "--header", "Cache-Control: no-cache", "--write-out", "\n%{http_code}", f"https://{verify.DOMAIN}{url}"])
        payload, status = body.rsplit(b"\n", 1)
        verify.require(status == b"200" and len(payload) == expected["bytes"] and verify.sha256(payload) == expected["sha256"], f"HTTPS integrity mismatch: {url}")


def atomic_link(base, target, expected, on_swapped=None):
    verify.require(verify.current_target(base) == expected, "Current changed concurrently; refusing to overwrite it")
    temporary = base / f".current-rollback-{uuid.uuid4().hex}"
    created = False
    try:
        os.symlink(str(target), temporary, target_is_directory=True)
        created = True
        verify.require(temporary.is_symlink() and temporary.readlink() == target, "Unexpected temporary link")
        verify.require(verify.current_target(base) == expected, "Current changed before the atomic swap")
        os.replace(temporary, base / "current")
        created = False
        if on_swapped:
            on_swapped()
        if os.name == "posix":
            descriptor = os.open(base, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
    finally:
        if created and temporary.is_symlink() and temporary.readlink() == target:
            temporary.unlink()


def rollback(base, release_id, runner=run_command):
    current, target = verify.preflight(base, release_id)
    previous_path, target_path = Path(current["target"]), Path(target["target"])
    runner(["nginx", "-t"])
    switched = False
    def did_swap():
        nonlocal switched
        switched = True
    try:
        atomic_link(base, target_path, previous_path, did_swap)
        target_after = verify.verify_release(base, release_id)
        verify.require(target_after == target, "Target changed while switching")
        runner(["nginx", "-t"])
        health(target, runner)
        return {"previous": str(previous_path), "current": str(target_path), "offlineVersion": target["offlineVersion"], "verifiedResources": len(target["checks"])}
    except BaseException as error:
        if switched:
            if verify.current_target(base) != target_path:
                raise RuntimeError("Rollback failed and current changed concurrently; no unknown release was overwritten") from error
            try:
                atomic_link(base, previous_path, target_path)
                verify.require(verify.verify_release(base, previous_path.name) == current, "Previous release changed during recovery")
                runner(["nginx", "-t"])
                health(current, runner)
            except BaseException as recovery_error:
                restored = verify.current_target(base) == previous_path
                message = "Previous link restored exactly, but its recovery checks failed" if restored else "Recovery failed before the previous link could be restored"
                raise RuntimeError(f"{message}: {recovery_error}") from error
            raise RuntimeError("Rollback checks failed; exact previous release restored and reverified") from error
        raise


def require_trusted_release(path):
    for entry in [path, *path.rglob("*")]:
        info = entry.lstat()
        verify.require(info.st_uid == 0 and not info.st_mode & (stat.S_IWGRP | stat.S_IWOTH), "Release resources must be root-owned and not group/world writable")


def main():
    verify.require(len(sys.argv) == 2 and verify.RELEASE_ID.fullmatch(sys.argv[1]), "One valid release ID required")
    verify.require(os.name == "posix" and os.geteuid() == 0, "Rollback requires Linux root")
    verify.deployment_root(BASE)
    for directory in (BASE, BASE / "releases"):
        info = directory.stat()
        verify.require(info.st_uid == 0 and not info.st_mode & (stat.S_IWGRP | stat.S_IWOTH), "Deployment directories must be root-owned and not group/world writable")
    import fcntl
    lock = BASE / ".release.lock"
    descriptor = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        info = os.fstat(descriptor)
        verify.require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and not info.st_mode & (stat.S_IWGRP | stat.S_IWOTH), "Release lock must be a private root-owned regular file")
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        require_trusted_release(verify.current_target(BASE))
        require_trusted_release(verify.release_directory(BASE, sys.argv[1]))
        result = rollback(BASE, sys.argv[1])
        print(f"PREVIOUS={result['previous']}\nCURRENT={result['current']}\nOFFLINE_VERSION={result['offlineVersion']}\nVERIFIED_RESOURCES={result['verifiedResources']}\nROLLBACK_VERIFIED")
    finally:
        os.close(descriptor)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ROLLBACK_REFUSED_OR_RECOVERED: {error}", file=sys.stderr)
        sys.exit(1)
