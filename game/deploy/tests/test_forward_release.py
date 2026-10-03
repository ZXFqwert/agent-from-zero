"""Exercise release.sh's embedded implementation only in temporary site trees."""
import ast
import io
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from urllib.parse import urlsplit

import test_rollback as fixture

DEPLOY = Path(__file__).resolve().parents[1]
SOURCE = (DEPLOY / "release.sh").read_text(encoding="utf-8")
PYTHON = SOURCE.split("# BEGIN FORWARD PYTHON\n", 1)[1].split("# END FORWARD PYTHON", 1)[0]
NAMESPACE = {"__name__": "isolated_forward_test", "__file__": str(DEPLOY / "release.sh")}
exec(compile(PYTHON, str(DEPLOY / "release.sh"), "exec"), NAMESPACE)
TOOLS = NAMESPACE["load_tools"](DEPLOY)


def file_member(name, size=1, kind=tarfile.REGTYPE):
    member = tarfile.TarInfo(name)
    member.size = size
    member.type = kind
    return member


class Members:
    def __init__(self, extra=None):
        self.members = [file_member(name) for name in NAMESPACE["MANDATORY"]] + (extra or [])
    def getmembers(self):
        return self.members
    def __iter__(self):
        return iter(self.members)


class ForwardArchiveTests(unittest.TestCase):
    def test_real_embedded_python_is_310_syntax_and_uses_same_fixed_site_lock(self):
        ast.parse(PYTHON, feature_version=(3, 10))
        self.assertEqual(NAMESPACE["BASE"], Path("/var/www/agent.li33.art"))
        self.assertIn('BASE / ".release.lock"', PYTHON)
        self.assertIn('fcntl.LOCK_EX | fcntl.LOCK_NB', PYTHON)
        self.assertIn('os.O_NOFOLLOW', PYTHON)
        self.assertIn('".release.lock"', (DEPLOY / "rollback_release.py").read_text(encoding="utf-8"))
        self.assertNotIn("\r", SOURCE)

    def test_normal_dot_root_archive_is_accepted(self):
        root = file_member(".", kind=tarfile.DIRTYPE)
        members = Members([root, file_member("./assets", kind=tarfile.DIRTYPE), file_member("./assets/game-ABCDEFGH.js")])
        self.assertEqual(len(NAMESPACE["safe_members"](members, TOOLS.verify)), 7)

    def test_traversal_absolute_backslash_symlink_hardlink_and_devices_are_rejected(self):
        values = [file_member("../escape"), file_member("/outside"), file_member("assets\\escape"), file_member("link", kind=tarfile.SYMTYPE), file_member("link", kind=tarfile.LNKTYPE), file_member("pipe", kind=tarfile.FIFOTYPE)]
        for value in values:
            with self.subTest(name=value.name, kind=value.type):
                with self.assertRaises(ValueError):
                    NAMESPACE["safe_members"](Members([value]), TOOLS.verify)

    def test_duplicate_normalized_name_empty_and_oversized_files_rejected(self):
        for value in (file_member("./index.html"), file_member("empty.js", 0), file_member("huge.js", 16_000_001)):
            with self.assertRaises(ValueError):
                NAMESPACE["safe_members"](Members([value]), TOOLS.verify)

    def test_missing_mandatory_and_overall_budget_rejected(self):
        missing = Members(); missing.members.pop()
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            NAMESPACE["safe_members"](missing, TOOLS.verify)
        oversized = Members([file_member(f"large{i}.js", 16_000_000) for i in range(5)])
        with self.assertRaisesRegex(ValueError, "oversized"):
            NAMESPACE["safe_members"](oversized, TOOLS.verify)


@unittest.skipUnless(fixture.SYMLINKS, "Native symlink privilege unavailable; run on Linux")
class ForwardTransactionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.base = Path(self.directory.name).resolve()
        self.previous = fixture.make_release(self.base, "20261003-200001")
        self.incoming = fixture.make_release(self.base / "builder", "20261003-200002")
        self.target_id = "20261003-200003"
        self.archive_path = self.base / "game.tar.gz"
        os.symlink(str(self.previous), self.base / "current", target_is_directory=True)
        self.requests, self.nginx_checks, self.failure = [], 0, None

    def pack(self):
        with tarfile.open(self.archive_path, "w:gz") as archive:
            archive.add(self.incoming / "play", arcname=".")

    def runner(self, arguments):
        if arguments == ["nginx", "-t"]:
            self.nginx_checks += 1
            return b"valid configuration"
        self.assertEqual(arguments[0], "curl")
        if self.failure:
            self.failure(arguments)
        url = urlsplit(arguments[-1]).path
        self.requests.append(url)
        current = TOOLS.verify.current_target(self.base)
        relative = url.lstrip("/") + ("index.html" if url.endswith("/") else "")
        return (current / relative).read_bytes() + b"\n200"

    def publish(self):
        return NAMESPACE["forward"](self.base, self.target_id, self.archive_path, TOOLS, self.runner)

    def assert_previous(self):
        self.assertEqual(TOOLS.verify.current_target(self.base), self.previous)
        self.assertEqual(list(self.base.glob(".current-rollback-*")), [])

    def make_legacy(self, release_id=None):
        release_id = release_id or NAMESPACE["LEGACY_INITIAL_RELEASE"]
        (self.base / "current").unlink()
        self.previous = fixture.make_release(self.base, release_id)
        (self.previous / "play/release-compat.json").unlink()
        fixture.write_manifest(self.previous, fixture.manifest_for(self.previous))
        os.symlink(str(self.previous), self.base / "current", target_is_directory=True)

    def test_success_preserves_root_archive_and_existing_hashes_and_checks_all_target_bytes(self):
        old = self.previous / "play/assets/old-ABCDEFGH.js"
        old.write_text("oldOpenClient();", encoding="utf-8")
        fixture.write_manifest(self.previous, fixture.manifest_for(self.previous))
        (self.incoming / "play/assets/new-QWERTYUI.js").write_text("newClient();", encoding="utf-8")
        fixture.write_manifest(self.incoming, fixture.manifest_for(self.incoming))
        root_before = (self.previous / "index.html").read_bytes()
        archive_before = (self.previous / "archive/v1/index.html").read_bytes()
        self.pack(); result = self.publish()
        target = self.base / "releases" / self.target_id
        self.assertEqual(TOOLS.verify.current_target(self.base), target)
        self.assertEqual((target / "index.html").read_bytes(), root_before)
        self.assertEqual((target / "archive/v1/index.html").read_bytes(), archive_before)
        self.assertEqual((target / "play/assets/old-ABCDEFGH.js").read_bytes(), old.read_bytes())
        self.assertEqual(set(self.requests), set(TOOLS.verify.verify_release(self.base, self.target_id)["checks"]))
        self.assertEqual(result["verifiedResources"], len(set(self.requests)))
        self.assertEqual(self.nginx_checks, 2)

    def test_known_legacy_initial_upgrade_has_no_metadata_requirement_on_previous(self):
        self.make_legacy(); self.pack(); self.publish()
        self.assertEqual(TOOLS.verify.current_target(self.base).name, self.target_id)
        self.assertFalse((self.previous / "play/release-compat.json").exists(), "Never fabricate legacy metadata")

    def test_unknown_legacy_or_wrong_new_reader_is_refused_before_switch(self):
        self.make_legacy("20261003-200004"); self.pack()
        with self.assertRaisesRegex(ValueError, "Unknown legacy"):
            self.publish()
        self.assert_previous(); self.assertEqual(self.nginx_checks, 0)

    def test_legacy_upgrade_refuses_wrong_new_reader_even_if_its_files_are_self_consistent(self):
        self.make_legacy()
        value = fixture.metadata(); value["contentVersion"] = "season-0.10.0"; value["saveFeatures"] = []
        fixture.write_json(self.incoming / "play/release-compat.json", value)
        fixture.write_manifest(self.incoming, fixture.manifest_for(self.incoming)); self.pack()
        with self.assertRaisesRegex(ValueError, "audited 0.11 reader"):
            self.publish()
        self.assert_previous(); self.assertEqual(self.nginx_checks, 0)

    def test_forward_archive_cannot_overwrite_bytes_at_an_existing_hashed_url(self):
        for release, payload in ((self.previous, "oldClient();"), (self.incoming, "changedAtSameURL();")):
            (release / "play/assets/old-ABCDEFGH.js").write_text(payload, encoding="utf-8")
            fixture.write_manifest(release, fixture.manifest_for(release))
        self.pack()
        with self.assertRaisesRegex(ValueError, "still used"):
            self.publish()
        self.assert_previous(); self.assertEqual(self.nginx_checks, 0)

    def test_changed_simulator_or_missing_target_metadata_never_switches(self):
        value = fixture.metadata(); value["simulatorDigest"] = "b" * 64
        fixture.write_json(self.incoming / "play/release-compat.json", value)
        fixture.write_manifest(self.incoming, fixture.manifest_for(self.incoming)); self.pack()
        with self.assertRaisesRegex(ValueError, "digest changed"):
            self.publish()
        self.assert_previous(); self.assertEqual(self.nginx_checks, 0)

    def test_incomplete_archive_refuses_before_creating_a_target(self):
        (self.incoming / "play/release-compat.json").unlink(); self.pack()
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            self.publish()
        self.assert_previous()
        self.assertFalse((self.base / "releases" / self.target_id).exists())

    def test_malicious_archive_never_writes_outside_or_switches(self):
        with tarfile.open(self.archive_path, "w:gz") as archive:
            member = file_member("../escape", 1)
            archive.addfile(member, io.BytesIO(b"x"))
        with self.assertRaises(ValueError):
            self.publish()
        self.assert_previous()
        self.assertFalse((self.base / "escape").exists())
        self.assertFalse((self.base / "releases" / self.target_id).exists())

    def test_bad_actual_asset_hash_refuses_before_nginx_and_current_swap(self):
        (self.incoming / "play/assets/game.js").write_text("changed without manifest", encoding="utf-8"); self.pack()
        with self.assertRaisesRegex(ValueError, "hash or byte length"):
            self.publish()
        self.assert_previous(); self.assertEqual(self.nginx_checks, 0)

    def test_failed_https_after_switch_restores_exact_previous_compatible_release(self):
        self.pack()
        def fail(arguments):
            if TOOLS.verify.current_target(self.base).name == self.target_id:
                self.failure = None
                raise subprocess.CalledProcessError(22, arguments)
        self.failure = fail
        with self.assertRaisesRegex(RuntimeError, "exact previous release restored and reverified"):
            self.publish()
        self.assert_previous()

    def test_failed_first_upgrade_also_restores_exact_legacy_link_without_editing_it(self):
        self.make_legacy(); self.pack()
        def fail(arguments):
            if TOOLS.verify.current_target(self.base).name == self.target_id:
                self.failure = None
                raise subprocess.CalledProcessError(22, arguments)
        self.failure = fail
        with self.assertRaisesRegex(RuntimeError, "exact previous release restored and reverified"):
            self.publish()
        self.assert_previous()
        self.assertFalse((self.previous / "play/release-compat.json").exists())

    def test_existing_release_is_not_overwritten(self):
        target = self.base / "releases" / self.target_id
        target.mkdir(); (target / "belongs-to-another-run").write_text("preserve", encoding="utf-8")
        self.pack()
        with self.assertRaisesRegex(ValueError, "refusing overwrite"):
            self.publish()
        self.assert_previous()
        self.assertEqual((target / "belongs-to-another-run").read_text(encoding="utf-8"), "preserve")


if __name__ == "__main__":
    unittest.main()
