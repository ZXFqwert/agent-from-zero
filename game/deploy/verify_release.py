"""Read-only verification of a fixed-domain static release and its save reader contract."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path, PurePosixPath
import re
import stat
from urllib.parse import urljoin, urlsplit

DOMAIN = "agent.li33.art"
RELEASE_ID = re.compile(r"[0-9]{8}-[0-9A-Za-z-]+")
META_KEYS = {"schema", "domain", "contentVersion", "saveVersion", "kernelVersion", "playerVersion", "saveFeatures", "readableContentVersions", "readableSaveFeatures", "maxSaveBytes", "simulatorDigest"}
HASHED_ASSET = re.compile(r"[^/]+-[A-Za-z0-9_-]{8,}\.[a-zA-Z0-9.]+")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "Duplicate JSON key")
        result[key] = value
    return result


def parse_json(text):
    return json.loads(text, object_pairs_hook=no_duplicates, parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Nonfinite JSON value")))


def read_bytes(path, limit=16_000_000):
    require(path.is_file() and not path.is_symlink(), "Expected a regular release file")
    size = path.stat().st_size
    require(0 < size <= limit, "Release file is empty or oversized")
    body = path.read_bytes()
    require(len(body) == size, "Release changed during verification")
    return body


def sha256(body):
    return hashlib.sha256(body).hexdigest()


def integer(value, minimum=1, maximum=100_000_000):
    return type(value) is int and minimum <= value <= maximum


def string_list(value):
    return isinstance(value, list) and len(value) <= 64 and all(isinstance(item, str) and re.fullmatch(r"[a-zA-Z0-9_.-]{1,100}", item) for item in value) and len(set(value)) == len(value)


def validate_metadata(value):
    require(isinstance(value, dict) and set(value) == META_KEYS, "Missing or unknown save compatibility metadata")
    require(value["schema"] == 1 and type(value["schema"]) is int and value["domain"] == DOMAIN, "Wrong release compatibility scope")
    require(isinstance(value["contentVersion"], str) and re.fullmatch(r"[a-zA-Z0-9_.-]{1,100}", value["contentVersion"]), "Invalid content version")
    for key in ("saveVersion", "kernelVersion", "playerVersion", "maxSaveBytes"):
        require(integer(value[key]), "Invalid save reader version or byte ceiling")
    for key in ("saveFeatures", "readableContentVersions", "readableSaveFeatures"):
        require(string_list(value[key]), "Invalid compatibility feature list")
    require(value["contentVersion"] in value["readableContentVersions"] and set(value["saveFeatures"]) <= set(value["readableSaveFeatures"]), "Release cannot read its own written saves")
    require(isinstance(value["simulatorDigest"], str) and re.fullmatch(r"[0-9a-f]{64}", value["simulatorDigest"]), "Missing simulator source digest")
    return value


def compatible(current, target):
    validate_metadata(current)
    validate_metadata(target)
    require(all(current[key] == target[key] for key in ("saveVersion", "kernelVersion", "playerVersion")), "Target reader has incompatible save envelope versions")
    require(current["contentVersion"] in target["readableContentVersions"], "Target cannot read the current written content version")
    require(set(current["saveFeatures"]) <= set(target["readableSaveFeatures"]), "Target cannot read current save features")
    require(target["maxSaveBytes"] >= current["maxSaveBytes"], "Target reader has a smaller save byte ceiling")
    require(target["simulatorDigest"] == current["simulatorDigest"], "Simulator digest changed; strict replay compatibility is not proven")


def deployment_root(base):
    base = Path(base)
    require(base.is_absolute() and base.is_dir() and not base.is_symlink() and base.resolve(strict=True) == base, "Deployment root is not its exact absolute directory")
    releases = base / "releases"
    require(releases.is_dir() and not releases.is_symlink() and releases.resolve(strict=True) == releases, "Unexpected releases directory")
    return base, releases


def release_directory(base, release_id):
    base, releases = deployment_root(base)
    require(isinstance(release_id, str) and RELEASE_ID.fullmatch(release_id), "Invalid release ID")
    target = releases / release_id
    require(target.is_dir() and not target.is_symlink() and target.resolve(strict=True) == target and target.parent == releases, "Release is not an exact directory inside this root")
    return target


def current_target(base):
    base, releases = deployment_root(base)
    link = base / "current"
    require(link.is_symlink(), "Current must be an absolute release symlink")
    raw = Path(link.readlink())
    require(raw.is_absolute() and raw.parent == releases, "Current link leaves the exact releases directory")
    target = release_directory(base, raw.name)
    require(raw == target and link.resolve(strict=True) == target, "Current link target is not canonical")
    return target


def local_path(release, url):
    require(isinstance(url, str) and re.fullmatch(r"/[a-zA-Z0-9_./-]+", url) and not any(part in (".", "..") for part in url.split("/")) and "//" not in url, "Noncanonical resource URL")
    pure = PurePosixPath(url)
    require(str(pure) == url and not url.endswith("/"), "Resource URL must identify a file")
    path = release.joinpath(*pure.parts[1:])
    require(path.is_file() and not path.is_symlink() and path.resolve(strict=True).is_relative_to(release), "Resource leaves the release or is missing")
    return path


def hashed_asset_url(url):
    return url.startswith("/play/assets/") and HASHED_ASSET.fullmatch(url.rsplit("/", 1)[-1]) is not None


def require_retained_hashed_assets(current, target):
    for url, expected in current["checks"].items():
        if hashed_asset_url(url):
            require(target["checks"].get(url) == expected, f"Target omits or changes an asset still used by current clients: {url}")


class ResourceLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag in ("script", "img", "source") and attrs.get("src"):
            self.urls.append(attrs["src"])
        if tag == "link" and attrs.get("href") and set((attrs.get("rel") or "").split()) & {"stylesheet", "modulepreload", "preload", "manifest", "icon", "apple-touch-icon"}:
            self.urls.append(attrs["href"])


def verify_release(base, release_id):
    release = release_directory(base, release_id)
    # A retained hashed file can be unlisted, but never an escape, link or special file.
    for path in release.rglob("*"):
        mode = path.lstat().st_mode
        require(not path.is_symlink() and (stat.S_ISDIR(mode) or stat.S_ISREG(mode)), "Unexpected link or special file in release")
        require(path.resolve(strict=True).is_relative_to(release), "Release resource escapes its directory")
    manifest_body = read_bytes(release / "play/offline-manifest.json", 2_000_000)
    manifest = parse_json(manifest_body.decode("utf-8"))
    require(isinstance(manifest, dict) and set(manifest) == {"schema", "basePath", "version", "totalBytes", "assets", "chapters"}, "Invalid offline manifest structure")
    require(type(manifest["schema"]) is int and manifest["schema"] == 2 and manifest["basePath"] == "/play/" and isinstance(manifest["version"], str) and re.fullmatch(r"[0-9a-f]{24}", manifest["version"]), "Invalid offline release identity")
    require(isinstance(manifest["assets"], list) and 1 <= len(manifest["assets"]) <= 1000, "Invalid offline asset list")
    checks = {}
    for asset in manifest["assets"]:
        require(isinstance(asset, dict) and set(asset) == {"url", "bytes", "sha256"} and integer(asset["bytes"], maximum=16_000_000) and isinstance(asset["sha256"], str) and re.fullmatch(r"[0-9a-f]{64}", asset["sha256"]), "Invalid asset integrity fields")
        url = asset["url"]
        require(isinstance(url, str) and url.startswith("/play/") and url not in checks, "Duplicate or out-of-scope asset")
        body = read_bytes(local_path(release, url))
        require(len(body) == asset["bytes"] and sha256(body) == asset["sha256"], "Offline asset hash or byte length mismatch")
        checks[url] = {"bytes": len(body), "sha256": sha256(body)}
    require(integer(manifest["totalBytes"], maximum=64_000_000) and manifest["totalBytes"] == sum(item["bytes"] for item in checks.values()), "Offline byte total mismatch")
    require({"/play/index.html", "/play/manifest.webmanifest", "/play/release-compat.json"} <= set(checks), "Missing app, install manifest or compatibility asset")
    require(isinstance(manifest["chapters"], list) and 1 <= len(manifest["chapters"]) <= 32, "Missing chapter packs")
    chapter_ids = set()
    for chapter in manifest["chapters"]:
        require(isinstance(chapter, dict) and integer(chapter.get("number"), maximum=32) and chapter.get("chapterId") == f"chapter-{chapter['number']:02}" and chapter["chapterId"] not in chapter_ids, "Invalid chapter identity")
        chapter_ids.add(chapter["chapterId"])
        urls = chapter.get("assets")
        require(isinstance(urls, list) and all(isinstance(url, str) for url in urls) and len(urls) == len(set(urls)) and all(url in checks for url in urls), "Missing or duplicated chapter asset")
        require({"/play/index.html", "/play/manifest.webmanifest", "/play/release-compat.json"} <= set(urls), "Chapter omits common app resources")
        require(type(chapter.get("totalBytes")) is int and chapter["totalBytes"] == sum(checks[url]["bytes"] for url in urls), "Chapter byte total mismatch")
    sw_body = read_bytes(release / "play/sw.js")
    sw = sw_body.decode("utf-8")
    matches = list(re.finditer(r"\bconst RELEASE\s*=\s*", sw))
    require(len(matches) == 1, "Missing or ambiguous Service Worker release")
    decoder = json.JSONDecoder(object_pairs_hook=no_duplicates)
    embedded, end = decoder.raw_decode(sw[matches[0].end():])
    require(sw[matches[0].end()+end:].lstrip().startswith(";") and json.dumps(embedded, sort_keys=True) == json.dumps(manifest, sort_keys=True), "Service Worker and offline manifest are different releases")
    metadata = validate_metadata(parse_json(read_bytes(release / "play/release-compat.json", 32_000).decode("utf-8")))
    install = parse_json(read_bytes(release / "play/manifest.webmanifest", 32_000).decode("utf-8"))
    require(isinstance(install, dict) and install.get("start_url") == "/play/" and install.get("scope") == "/play/" and isinstance(install.get("icons"), list) and install["icons"], "Install manifest has the wrong game scope")
    for icon in install["icons"]:
        require(isinstance(icon, dict) and icon.get("src") in checks, "Install icon is missing from this release")
    offline_urls = set(checks)
    for page_url, file_url in (("/", "/index.html"), ("/archive/v1/", "/archive/v1/index.html"), ("/play/", "/play/index.html")):
        page = read_bytes(local_path(release, file_url))
        checks[page_url] = {"bytes": len(page), "sha256": sha256(page)}
        parser = ResourceLinks()
        parser.feed(page.decode("utf-8"))
        for reference in parser.urls:
            if reference.startswith("data:"):
                continue
            url = urlsplit(urljoin(f"https://{DOMAIN}{page_url}", reference))
            require(url.scheme == "https" and url.netloc == DOMAIN and not url.query and not url.fragment, "Page resource is external or not canonical")
            body = read_bytes(local_path(release, url.path))
            if page_url == "/play/":
                require(url.path in offline_urls, "App dependency is absent from its offline bundle")
            checks[url.path] = {"bytes": len(body), "sha256": sha256(body)}
    checks["/play/sw.js"] = {"bytes": len(sw_body), "sha256": sha256(sw_body)}
    checks["/play/offline-manifest.json"] = {"bytes": len(manifest_body), "sha256": sha256(manifest_body)}
    # Retained immutable bundles serve already-open clients. They do not become
    # members of the target offline pack merely because they still exist on disk.
    asset_directory = release / "play/assets"
    if asset_directory.is_dir():
        for path in sorted(asset_directory.rglob("*")):
            url = "/" + path.relative_to(release).as_posix()
            if path.is_file() and hashed_asset_url(url) and url not in checks:
                body = read_bytes(local_path(release, url))
                checks[url] = {"bytes": len(body), "sha256": sha256(body)}
    return {"target": str(release), "metadata": metadata, "offlineVersion": manifest["version"], "checks": checks}


def preflight(base, target_id):
    previous = current_target(base)
    require(previous.name != target_id, "Target is already current")
    current = verify_release(base, previous.name)
    target = verify_release(base, target_id)
    compatible(current["metadata"], target["metadata"])
    require_retained_hashed_assets(current, target)
    return current, target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base", help="absolute site root; verification never mutates it")
    parser.add_argument("release_id")
    parser.add_argument("--preflight", action="store_true", help="also verify current and save compatibility")
    args = parser.parse_args()
    result = preflight(Path(args.base), args.release_id) if args.preflight else verify_release(Path(args.base), args.release_id)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
