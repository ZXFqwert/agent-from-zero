"""Isolated deployment tests. Never invokes the fixed-site production CLI or network."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock
from urllib.parse import urlsplit

DEPLOY = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


verify = load("test_release_verify", DEPLOY / "verify_release.py")
transaction = load("test_release_transaction", DEPLOY / "rollback_release.py")


def metadata():
    return {"schema": 1, "domain": "agent.li33.art", "contentVersion": "season-0.11.0", "saveVersion": 1, "kernelVersion": 1, "playerVersion": 1, "saveFeatures": ["post-season-v1"], "readableContentVersions": ["season-0.10.0", "season-0.11.0"], "readableSaveFeatures": ["post-season-v1"], "maxSaveBytes": 16_000_000, "simulatorDigest": "a" * 64}


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def manifest_for(release):
    assets = []
    for path in sorted((release / "play").rglob("*")):
        if path.is_file() and path.name not in ("sw.js", "offline-manifest.json"):
            body = path.read_bytes()
            assets.append({"url": "/" + path.relative_to(release).as_posix(), "bytes": len(body), "sha256": verify.sha256(body)})
    total = sum(asset["bytes"] for asset in assets)
    return {"schema": 2, "basePath": "/play/", "version": verify.sha256(release.name.encode())[:24], "totalBytes": total, "assets": assets, "chapters": [{"number": 1, "chapterId": "chapter-01", "title": "Isolated fixture", "art": [], "assets": [asset["url"] for asset in assets], "totalBytes": total}]}


def write_manifest(release, manifest, embed=True):
    write_json(release / "play/offline-manifest.json", manifest)
    if embed:
        (release / "play/sw.js").write_text("const RELEASE = " + json.dumps(manifest) + ";\n// No production worker executed in this fixture.\n", encoding="utf-8")


def make_release(base, release_id, meta=None):
    release = base / "releases" / release_id
    (release / "play/assets").mkdir(parents=True)
    (release / "archive/v1").mkdir(parents=True)
    for parent in (release, release / "archive/v1"):
        (parent / "index.html").write_text('<html><head><link rel="stylesheet" href="./styles.css"></head><body><script src="./app.js"></script></body></html>', encoding="utf-8")
        (parent / "styles.css").write_text("body{color:teal}", encoding="utf-8")
        (parent / "app.js").write_text("console.log('archive');", encoding="utf-8")
    (release / "play/index.html").write_text('<html><head><link rel="manifest" href="/play/manifest.webmanifest"><link rel="stylesheet" href="/play/assets/game.css"></head><body><script src="/play/assets/game.js"></script></body></html>', encoding="utf-8")
    (release / "play/assets/game.js").write_text("console.log('game');", encoding="utf-8")
    (release / "play/assets/game.css").write_text("body{color:green}", encoding="utf-8")
    (release / "play/icon.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"></svg>', encoding="utf-8")
    write_json(release / "play/manifest.webmanifest", {"start_url": "/play/", "scope": "/play/", "icons": [{"src": "/play/icon.svg"}]})
    write_json(release / "play/release-compat.json", meta or metadata())
    write_manifest(release, manifest_for(release))
    return release


def supports_symlinks():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        (root / "directory").mkdir()
        try:
            os.symlink(str(root / "directory"), root / "link", target_is_directory=True)
            return (root / "link").is_symlink()
        except OSError:
            return False


SYMLINKS = supports_symlinks()


class ReleaseValidationTests(unittest.TestCase):
    def test_shared_access_cannot_downgrade_back_to_invitation_entry(self):
        shared = metadata() | {"accessMode": "shared-passphrase-v1"}
        verify.compatible(metadata(), shared)
        verify.compatible(shared, shared)
        with self.assertRaisesRegex(ValueError, "shared-passphrase"):
            verify.compatible(shared, metadata())
        with self.assertRaisesRegex(ValueError, "access mode"):
            verify.validate_metadata(metadata() | {"accessMode": "unreviewed"})

    def test_shared_entry_must_match_actual_app_not_just_claim_a_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory).resolve()
            release = make_release(base, "20261010-100001", metadata() | {"accessMode": "shared-passphrase-v1"})
            with self.assertRaisesRegex(ValueError, "Root game entry"):
                verify.verify_release(base, release.name)
            (release / "index.html").write_bytes((release / "play/index.html").read_bytes())
            report = verify.verify_release(base, release.name)
            self.assertEqual(report["checks"]["/"], report["checks"]["/play/"])

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.base = Path(self.directory.name).resolve()
        self.release = make_release(self.base, "20261003-200001")

    def check(self):
        return verify.verify_release(self.base, self.release.name)

    def test_complete_release_verifies_every_manifest_asset_and_three_entries(self):
        report = self.check()
        self.assertEqual(report["metadata"], metadata())
        self.assertTrue({"/", "/archive/v1/", "/play/", "/play/sw.js", "/play/offline-manifest.json", "/archive/v1/app.js"} <= set(report["checks"]))
        self.assertTrue({asset["url"] for asset in manifest_for(self.release)["assets"]} <= set(report["checks"]))

    def test_asset_byte_change_and_missing_asset_are_rejected(self):
        path = self.release / "play/assets/game.js"
        path.write_text("same length is not enough", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "hash or byte length"):
            self.check()
        path.unlink()
        with self.assertRaises(ValueError):
            self.check()

    def test_missing_metadata_refuses_old_release_instead_of_stripping_new_saves(self):
        (self.release / "play/release-compat.json").unlink()
        with self.assertRaises(ValueError):
            self.check()

    def test_manifest_duplicates_traversal_missing_common_and_bad_totals_rejected(self):
        baseline = manifest_for(self.release)
        alterations = [
            lambda m: m["assets"].append(copy.deepcopy(m["assets"][0])),
            lambda m: m["assets"][0].update(url="/play/../index.html"),
            lambda m: m["chapters"][0]["assets"].remove("/play/release-compat.json"),
            lambda m: m.update(totalBytes=m["totalBytes"] + 1),
            lambda m: m["chapters"][0].update(totalBytes=m["totalBytes"] + 1),
        ]
        for alteration in alterations:
            with self.subTest(alteration=alteration):
                changed = copy.deepcopy(baseline)
                alteration(changed)
                write_manifest(self.release, changed)
                with self.assertRaises(ValueError):
                    self.check()

    def test_worker_manifest_mismatch_or_ambiguous_embedding_rejected(self):
        changed = manifest_for(self.release)
        changed["version"] = "b" * 24
        write_manifest(self.release, changed, embed=False)
        with self.assertRaisesRegex(ValueError, "different releases"):
            self.check()
        write_manifest(self.release, changed)
        with (self.release / "play/sw.js").open("a", encoding="utf-8") as stream:
            stream.write("const RELEASE = {};\n")
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            self.check()

    def test_install_scope_icon_and_page_resource_errors_rejected(self):
        for install in ({"start_url": "/", "scope": "/play/", "icons": [{"src": "/play/icon.svg"}]}, {"start_url": "/play/", "scope": "/play/", "icons": [{"src": "/play/missing.png"}]}):
            write_json(self.release / "play/manifest.webmanifest", install)
            write_manifest(self.release, manifest_for(self.release))
            with self.assertRaises(ValueError):
                self.check()
        write_json(self.release / "play/manifest.webmanifest", {"start_url": "/play/", "scope": "/play/", "icons": [{"src": "/play/icon.svg"}]})
        (self.release / "index.html").write_text('<script src="https://elsewhere.example/app.js"></script>', encoding="utf-8")
        write_manifest(self.release, manifest_for(self.release))
        with self.assertRaisesRegex(ValueError, "external"):
            self.check()

    def test_page_ref_must_be_present_in_offline_bundle_even_if_file_exists(self):
        (self.release / "play/not-listed.js").write_text("console.log(1);", encoding="utf-8")
        (self.release / "play/index.html").write_text('<script src="/play/not-listed.js"></script>', encoding="utf-8")
        manifest = manifest_for(self.release)
        manifest["assets"] = [item for item in manifest["assets"] if item["url"] != "/play/not-listed.js"]
        manifest["totalBytes"] = sum(item["bytes"] for item in manifest["assets"])
        manifest["chapters"][0]["assets"] = [item["url"] for item in manifest["assets"]]
        manifest["chapters"][0]["totalBytes"] = manifest["totalBytes"]
        write_manifest(self.release, manifest)
        with self.assertRaisesRegex(ValueError, "offline bundle"):
            self.check()

    def test_game_cannot_borrow_root_resource_as_fake_offline_dependency(self):
        (self.release / "play/index.html").write_text('<script src="/app.js"></script>', encoding="utf-8")
        write_manifest(self.release, manifest_for(self.release))
        with self.assertRaisesRegex(ValueError, "offline bundle"):
            self.check()

    def test_retained_hashed_bundle_is_verified_but_does_not_join_offline_pack(self):
        path = self.release / "play/assets/old-ABCDEFGH.js"
        path.write_text("retained();", encoding="utf-8")
        report = self.check()
        self.assertEqual(report["checks"]["/play/assets/old-ABCDEFGH.js"]["sha256"], verify.sha256(path.read_bytes()))
        manifest = verify.parse_json((self.release / "play/offline-manifest.json").read_text(encoding="utf-8"))
        self.assertFalse(any(asset["url"] == "/play/assets/old-ABCDEFGH.js" for asset in manifest["assets"]))
        (self.release / "play/index.html").write_text('<script src="/play/assets/old-ABCDEFGH.js"></script>', encoding="utf-8")
        manifest["assets"] = [{**asset, "bytes": len((self.release / "play/index.html").read_bytes()), "sha256": verify.sha256((self.release / "play/index.html").read_bytes())} if asset["url"] == "/play/index.html" else asset for asset in manifest["assets"]]
        manifest["totalBytes"] = sum(asset["bytes"] for asset in manifest["assets"])
        manifest["chapters"][0]["totalBytes"] = manifest["totalBytes"]
        write_manifest(self.release, manifest)
        with self.assertRaisesRegex(ValueError, "offline bundle"):
            self.check()

    def test_retained_guard_only_applies_to_hashed_bundles_not_fixed_art(self):
        current = {"checks": {"/play/assets/Scene-2mwYr-Mn.js": {"bytes": 2, "sha256": "a"}, "/play/art/tower.webp": {"bytes": 7, "sha256": "b"}}}
        target = {"checks": {"/play/assets/Scene-2mwYr-Mn.js": {"bytes": 2, "sha256": "a"}, "/play/art/tower.webp": {"bytes": 8, "sha256": "c"}}}
        verify.require_retained_hashed_assets(current, target)
        del target["checks"]["/play/assets/Scene-2mwYr-Mn.js"]
        with self.assertRaisesRegex(ValueError, "still used"):
            verify.require_retained_hashed_assets(current, target)

    def test_strict_metadata_shape_duplicate_keys_and_boolean_versions_rejected(self):
        alterations = [lambda m: m.update(saveVersion=True), lambda m: m.update(unreviewed=True), lambda m: m.update(simulatorDigest=""), lambda m: m.update(readableSaveFeatures=[])]
        for alteration in alterations:
            value = metadata()
            alteration(value)
            with self.assertRaises(ValueError):
                verify.validate_metadata(value)
        with self.assertRaisesRegex(ValueError, "Duplicate JSON"):
            verify.parse_json('{"schema":1,"schema":1}')
        with self.assertRaisesRegex(ValueError, "Nonfinite"):
            verify.parse_json('{"value":NaN}')

    def test_save_reader_downgrade_changed_digest_or_lower_ceiling_rejected(self):
        alterations = [lambda m: m.update(readableContentVersions=["season-0.10.0"], contentVersion="season-0.10.0"), lambda m: m.update(saveFeatures=[], readableSaveFeatures=[]), lambda m: m.update(saveVersion=2), lambda m: m.update(maxSaveBytes=8_000_000), lambda m: m.update(simulatorDigest="b" * 64)]
        for alteration in alterations:
            target = metadata()
            alteration(target)
            with self.assertRaises(ValueError):
                verify.compatible(metadata(), target)
        verify.compatible(metadata(), metadata())

    def test_release_id_and_relative_root_are_rejected(self):
        for release_id in ("../outside", "/tmp/20261003-200001", "20261003-../escape"):
            with self.assertRaises(ValueError):
                verify.release_directory(self.base, release_id)
        with self.assertRaises(ValueError):
            verify.deployment_root(Path("relative"))

    @unittest.skipUnless(SYMLINKS, "Native symlink privilege unavailable")
    def test_any_release_symlink_is_rejected_even_when_it_stays_inside(self):
        os.symlink(str(self.release / "play/assets/game.js"), self.release / "play/shortcut.js")
        with self.assertRaisesRegex(ValueError, "link or special"):
            self.check()


@unittest.skipUnless(SYMLINKS, "Native symlink privilege unavailable; run isolated tests on Linux")
class AtomicRollbackTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.base = Path(self.directory.name).resolve()
        self.previous = make_release(self.base, "20261003-200001")
        self.target = make_release(self.base, "20261003-200002")
        os.symlink(str(self.previous), self.base / "current", target_is_directory=True)
        self.requests = []
        self.nginx_checks = 0
        self.failure = None

    def runner(self, arguments):
        if arguments == ["nginx", "-t"]:
            self.nginx_checks += 1
            if self.failure:
                self.failure(arguments)
            return b"syntax is ok"
        self.assertEqual(arguments[0], "curl")
        self.assertIn("--resolve", arguments)
        self.assertIn("agent.li33.art:443:127.0.0.1", arguments)
        self.assertNotIn("--insecure", arguments)
        self.assertNotIn("--location", arguments)
        if self.failure:
            self.failure(arguments)
        url = urlsplit(arguments[-1])
        self.assertEqual(url.hostname, "agent.li33.art")
        self.requests.append(url.path)
        current = verify.current_target(self.base)
        relative = url.path.lstrip("/") + ("index.html" if url.path.endswith("/") else "")
        return (current / relative).read_bytes() + b"\n200"

    def assert_previous(self):
        self.assertEqual((self.base / "current").readlink(), self.previous)
        self.assertEqual(verify.current_target(self.base), self.previous)
        self.assertEqual(list(self.base.glob(".current-rollback-*")), [])

    def test_success_atomically_changes_only_current_and_verifies_all_bytes(self):
        report = verify.verify_release(self.base, self.target.name)
        result = transaction.rollback(self.base, self.target.name, self.runner)
        self.assertEqual(verify.current_target(self.base), self.target)
        self.assertEqual(result["verifiedResources"], len(report["checks"]))
        self.assertEqual(set(self.requests), set(report["checks"]))
        self.assertEqual(self.nginx_checks, 2)
        self.assertEqual(list(self.base.glob(".current-rollback-*")), [])

    def test_failed_target_https_restores_exact_previous_then_checks_its_resources(self):
        def fail(arguments):
            if arguments[0] == "curl" and verify.current_target(self.base) == self.target:
                self.failure = None
                raise subprocess.CalledProcessError(22, arguments)
        self.failure = fail
        with self.assertRaisesRegex(RuntimeError, "exact previous release restored and reverified"):
            transaction.rollback(self.base, self.target.name, self.runner)
        self.assert_previous()
        self.assertEqual(set(self.requests), set(verify.verify_release(self.base, self.previous.name)["checks"]))

    def test_nginx_precheck_failure_never_switches(self):
        self.failure = lambda arguments: (_ for _ in ()).throw(subprocess.CalledProcessError(1, arguments))
        with self.assertRaises(subprocess.CalledProcessError):
            transaction.rollback(self.base, self.target.name, self.runner)
        self.assert_previous()
        self.assertEqual(self.requests, [])

    def test_post_swap_nginx_failure_restores_and_reverifies(self):
        def fail(arguments):
            if arguments == ["nginx", "-t"] and self.nginx_checks == 2:
                self.failure = None
                raise subprocess.CalledProcessError(1, arguments)
        self.failure = fail
        with self.assertRaisesRegex(RuntimeError, "restored and reverified"):
            transaction.rollback(self.base, self.target.name, self.runner)
        self.assert_previous()
        self.assertEqual(self.nginx_checks, 3)

    def test_http_200_with_wrong_bytes_also_recovers(self):
        original = self.runner
        def wrong_bytes(arguments):
            body = original(arguments)
            if arguments[0] == "curl" and verify.current_target(self.base) == self.target:
                return b"unrelated response\n200"
            return body
        with self.assertRaisesRegex(RuntimeError, "restored and reverified"):
            transaction.rollback(self.base, self.target.name, wrong_bytes)
        self.assert_previous()

    def test_recovery_health_failure_reports_link_restored_without_claiming_health(self):
        def never_healthy(arguments):
            if arguments[0] == "curl":
                raise subprocess.CalledProcessError(22, arguments)
            return self.runner(arguments)
        with self.assertRaisesRegex(RuntimeError, "Previous link restored exactly, but its recovery checks failed"):
            transaction.rollback(self.base, self.target.name, never_healthy)
        self.assert_previous()

    def test_preexisting_temp_name_is_not_overwritten_or_removed(self):
        collision = self.base / ".current-rollback-fixed"
        collision.write_text("belongs to someone else", encoding="utf-8")
        identifier = type("Identifier", (), {"hex": "fixed"})()
        with mock.patch.object(transaction.uuid, "uuid4", return_value=identifier):
            with self.assertRaises(FileExistsError):
                transaction.rollback(self.base, self.target.name, self.runner)
        self.assertEqual(verify.current_target(self.base), self.previous)
        self.assertEqual(collision.read_text(encoding="utf-8"), "belongs to someone else")

    @unittest.skipUnless(os.name == "posix", "Directory fsync is POSIX-only")
    def test_fsync_failure_after_replace_still_restores_previous(self):
        real_fsync = os.fsync
        calls = 0
        def fsync(descriptor):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise OSError("Injected post-replace fsync failure")
            return real_fsync(descriptor)
        with mock.patch.object(transaction.os, "fsync", fsync):
            with self.assertRaisesRegex(RuntimeError, "restored and reverified"):
                transaction.rollback(self.base, self.target.name, self.runner)
        self.assert_previous()
        self.assertEqual(calls, 2)

    def test_tampered_target_after_swap_is_detected_and_recovers(self):
        original = transaction.atomic_link
        def swapping(base, target, expected, on_swapped=None):
            original(base, target, expected, on_swapped)
            if target == self.target:
                (target / "play/assets/game.js").write_text("tampered", encoding="utf-8")
        with mock.patch.object(transaction, "atomic_link", swapping):
            with self.assertRaisesRegex(RuntimeError, "restored and reverified"):
                transaction.rollback(self.base, self.target.name, self.runner)
        self.assert_previous()

    def test_concurrent_new_current_is_never_overwritten_by_recovery(self):
        third = make_release(self.base, "20261003-200003")
        def fail(arguments):
            if arguments[0] == "curl":
                self.failure = None
                temp = self.base / "other-owner-swap"
                os.symlink(str(third), temp, target_is_directory=True)
                os.replace(temp, self.base / "current")
                raise RuntimeError("Another deployment owns current now")
        self.failure = fail
        with self.assertRaisesRegex(RuntimeError, "no unknown release was overwritten"):
            transaction.rollback(self.base, self.target.name, self.runner)
        self.assertEqual(verify.current_target(self.base), third)

    def test_incompatible_or_missing_meta_never_switches_or_calls_nginx(self):
        value = metadata()
        value["simulatorDigest"] = "b" * 64
        write_json(self.target / "play/release-compat.json", value)
        write_manifest(self.target, manifest_for(self.target))
        with self.assertRaisesRegex(ValueError, "digest changed"):
            transaction.rollback(self.base, self.target.name, self.runner)
        self.assert_previous()
        self.assertEqual(self.nginx_checks, 0)
        (self.target / "play/release-compat.json").unlink()
        with self.assertRaises(ValueError):
            transaction.rollback(self.base, self.target.name, self.runner)
        self.assert_previous()

    def test_missing_or_changed_current_hashed_bundle_refuses_then_retained_copy_succeeds(self):
        current_asset = self.previous / "play/assets/current-ABCDEFGH.js"
        current_asset.write_text("currentClient();", encoding="utf-8")
        write_manifest(self.previous, manifest_for(self.previous))
        with self.assertRaisesRegex(ValueError, "still used"):
            transaction.rollback(self.base, self.target.name, self.runner)
        self.assert_previous()
        target_asset = self.target / "play/assets/current-ABCDEFGH.js"
        target_asset.write_text("wrongBytes();", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "still used"):
            transaction.rollback(self.base, self.target.name, self.runner)
        self.assert_previous()
        target_asset.write_bytes(current_asset.read_bytes())
        transaction.rollback(self.base, self.target.name, self.runner)
        self.assertEqual(verify.current_target(self.base), self.target)
        self.assertIn("/play/assets/current-ABCDEFGH.js", self.requests)

    def test_noncanonical_relative_and_escape_current_are_rejected(self):
        (self.base / "current").unlink()
        for target in (Path("releases") / self.previous.name, self.base.parent):
            os.symlink(str(target), self.base / "current", target_is_directory=True)
            with self.assertRaises(ValueError):
                verify.current_target(self.base)
            (self.base / "current").unlink()

    def test_linked_release_directory_is_rejected(self):
        alias = self.base / "releases/20261003-alias"
        os.symlink(str(self.target), alias, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "exact directory"):
            verify.release_directory(self.base, alias.name)


if __name__ == "__main__":
    unittest.main()
