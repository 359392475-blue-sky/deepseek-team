#!/bin/bash
set -euo pipefail

usage() {
  echo "usage: source-manifest.sh <write|verify> <repository-root> <manifest>" >&2
  exit 2
}

[[ "$#" -eq 3 ]] || usage
mode="$1"
repo_root="$(cd "$2" && pwd -P)"
manifest="$3"
[[ "$manifest" == /* ]] || manifest="$PWD/$manifest"

case "$mode" in
  write | verify) ;;
  *) usage ;;
esac

work_root="$(mktemp -d "${TMPDIR:-/tmp}/dsh-team-battle-macos-source-manifest.XXXXXX")"
cleanup() { rm -rf "$work_root"; }
trap cleanup EXIT INT TERM
generated="$work_root/generated.sha256"

python3 - "$repo_root" "$generated" <<'PY'
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
import sys


root = Path(sys.argv[1]).resolve(strict=True)
destination = Path(sys.argv[2])

required_files = [
    ".gitignore",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.base.client.json",
    "tsconfig.base.json",
    "tsconfig.client.json",
    "tsconfig.host.json",
    "tsconfig.json",
    "tsdown.config.ts",
    "apps/macos/Package.swift",
    "apps/macos/package.json",
    "apps/macos/runtime-entry.mjs",
    "apps/macos/README.i18n.yaml",
    "apps/macos/README.md",
    "apps/macos/README.zh.md",
    "apps/macos/scripts/source-manifest.sh",
    "scripts/build-python-release.py",
    "scripts/check-macos-deployment-target.py",
    "scripts/publication-payload.ts",
    "scripts/release/families.ts",
    "scripts/release/pack.ts",
    "scripts/release/process.ts",
    "scripts/release/tarball.ts",
]
input_roots = [
    "apps/cli",
    "apps/web",
    "apps/macos/Resources",
    "apps/macos/Sources",
    "apps/macos/scripts",
    "native",
    "snapshots",
    "packages",
    "patches",
    "python",
    "scripts",
    "snapshots",
    "vendor",
    "website",
]
generic_excluded_directories = {
    ".build",
    ".cache",
    ".git",
    ".mypy_cache",
    ".next",
    ".pytest_cache",
    ".ruff_cache",
    ".swiftpm",
    ".turbo",
    ".venv",
    ".vite",
    "DerivedData",
    "__pycache__",
    "coverage",
    "node_modules",
}
excluded_file_names = {".DS_Store"}
excluded_file_suffixes = (".pyc", ".pyo", ".tsbuildinfo")
python_runtime_root = "python/sdk-runtime/src/deepseek_harness_runtime/runtime"


def is_generated_directory(relative: str) -> bool:
    parts = relative.split("/")
    name = parts[-1]
    if name in generic_excluded_directories or name.endswith(".egg-info"):
        return True
    if len(parts) >= 3 and parts[:2] == ["apps", "cli"] and parts[2] == "lib":
        return True
    if len(parts) >= 3 and parts[:2] == ["apps", "web"] and parts[2] in {"dist", "lib"}:
        return True
    if len(parts) >= 4 and parts[0] == "packages" and parts[3] in {"lib", "types"}:
        return True
    if len(parts) >= 3 and parts[0] == "vendor" and parts[2] in {"lib", "types"}:
        return True
    if len(parts) >= 3 and parts[0] == "native" and parts[1] in {"landlock-run", "system"} and parts[2] in {
        ".claude",
        ".release",
        "dist",
        "target",
    }:
        return True
    if (
        len(parts) >= 5
        and parts[0] == "native"
        and parts[1] in {"landlock-run", "system"}
        and parts[2] == "packages"
        and parts[4] in {"bin", "lib"}
    ):
        return True
    if len(parts) >= 3 and parts[:2] == ["python", "sdk-runtime"] and parts[2] in {"build", "dist"}:
        return True
    if relative == f"{python_runtime_root}/node" or relative.startswith(f"{python_runtime_root}/node/"):
        return True
    if relative in {"website/.dist", "website/.generated"} or relative.startswith(
        ("website/.dist/", "website/.generated/")
    ):
        return True
    if name in {".sessions", ".storages"}:
        return True
    return False


def is_generated_file(relative: str) -> bool:
    path = Path(relative)
    if path.name in excluded_file_names or path.name.endswith(excluded_file_suffixes):
        return True
    runtime_prefix = f"{python_runtime_root}/"
    if relative.startswith(runtime_prefix):
        first_runtime_component = relative[len(runtime_prefix):].split("/", 1)[0]
        if first_runtime_component.startswith("deepseek-harness-sdk-runtime-"):
            return True
    return False


def require_regular_or_symlink(relative: str) -> Path:
    path = root / relative
    if not os.path.lexists(path):
        raise FileNotFoundError(f"source-manifest: required input is missing: {relative}")
    metadata = path.lstat()
    if not (stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode)):
        raise TypeError(f"source-manifest: required input is not a file or symlink: {relative}")
    return path


def include(path: Path, inputs: dict[str, Path]) -> None:
    relative = path.relative_to(root).as_posix()
    if "\n" in relative or "\t" in relative:
        raise ValueError(f"source-manifest: tabs and newlines are unsupported in input paths: {relative!r}")
    inputs[relative] = path


inputs: dict[str, Path] = {}
for relative in required_files:
    include(require_regular_or_symlink(relative), inputs)

optional_root_files = [
    *(root / relative for relative in (".npmignore", ".npmrc", ".pnpmfile.cjs", "pnpmfile.cjs")),
    *root.glob("tsconfig*.json"),
]
for path in optional_root_files:
    if os.path.lexists(path):
        include(path, inputs)

for relative_root in input_roots:
    directory = root / relative_root
    if not directory.is_dir() or directory.is_symlink():
        raise NotADirectoryError(f"source-manifest: input root is not a regular directory: {relative_root}")
    for current, directory_names, file_names in os.walk(directory, followlinks=False):
        current_path = Path(current)
        retained_directories: list[str] = []
        for name in sorted(directory_names):
            path = current_path / name
            relative = path.relative_to(root).as_posix()
            if is_generated_directory(relative) or is_generated_file(relative):
                continue
            if path.is_symlink():
                include(path, inputs)
            else:
                retained_directories.append(name)
        directory_names[:] = retained_directories
        for name in sorted(file_names):
            path = current_path / name
            relative = path.relative_to(root).as_posix()
            if is_generated_file(relative):
                continue
            metadata = path.lstat()
            if not (stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode)):
                raise TypeError(
                    f"source-manifest: unsupported input type: {path.relative_to(root).as_posix()}"
                )
            include(path, inputs)

for relative, path in inputs.items():
    if not path.is_symlink():
        continue
    try:
        resolved = path.resolve(strict=True)
    except (FileNotFoundError, RuntimeError) as error:
        raise ValueError(f"source-manifest: symbolic link does not resolve to a regular input: {relative}") from error
    try:
        resolved_relative = resolved.relative_to(root).as_posix()
    except ValueError as error:
        raise ValueError(f"source-manifest: symbolic link target is outside repository: {relative}") from error
    if resolved_relative not in inputs or not resolved.is_file() or resolved.is_symlink():
        raise ValueError(
            "source-manifest: symbolic link target must be a regular file recorded by the manifest: "
            f"{relative} -> {resolved_relative}"
        )


def digest_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


with destination.open("w", encoding="utf-8", newline="\n") as output:
    output.write("# dsh-team-battle-macos-source-manifest-v2\n")
    for relative in sorted(inputs):
        path = inputs[relative]
        metadata = path.lstat()
        mode = f"{stat.S_IMODE(metadata.st_mode):04o}"
        if stat.S_ISLNK(metadata.st_mode):
            target = os.readlink(path)
            target_json = json.dumps(target, ensure_ascii=True, separators=(",", ":"))
            digest = hashlib.sha256(target.encode("utf-8", "surrogateescape")).hexdigest()
            output.write(f"{digest}\tsymlink\t{mode}\t{relative}\t{target_json}\n")
        else:
            output.write(f"{digest_file(path)}\tfile\t{mode}\t{relative}\n")
PY

case "$mode" in
  write)
    [[ -d "$(dirname "$manifest")" && ! -L "$(dirname "$manifest")" ]] || {
      echo "source-manifest: destination parent is not a regular directory: $(dirname "$manifest")" >&2
      exit 1
    }
    [[ ! -L "$manifest" ]] || {
      echo "source-manifest: refusing symbolic-link destination: $manifest" >&2
      exit 1
    }
    cp "$generated" "$manifest"
    ;;
  verify)
    [[ -f "$manifest" && ! -L "$manifest" ]] || {
      echo "source-manifest: expected manifest is not a regular file: $manifest" >&2
      exit 1
    }
    cmp -s "$generated" "$manifest" || {
      echo "source-manifest: bundle source manifest is stale; run pnpm run build:macos" >&2
      exit 1
    }
    ;;
esac
