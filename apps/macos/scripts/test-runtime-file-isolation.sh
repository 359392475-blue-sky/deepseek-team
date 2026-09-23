#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/dsh-team-battle-macos-runtime-isolation.XXXXXX")"
cleanup() { rm -rf "$fixture_root"; }
trap cleanup EXIT INT TERM

runtime="$fixture_root/runtime"
scratch="$fixture_root/scratch"
mkdir -p "$runtime/node_modules/package with spaces"
chmod 750 "$runtime/node_modules/package with spaces"

external_file="$fixture_root/external-file"
printf 'shared runtime payload\n' > "$external_file"
chmod 751 "$external_file"
linked_file="$runtime/node_modules/package with spaces/linked file"
second_link="$runtime/node_modules/package with spaces/second link"
ln "$external_file" "$linked_file"
ln "$external_file" "$second_link"
printf 'ordinary runtime payload\n' > "$runtime/ordinary-file"
ln -s 'package with spaces/linked file' "$runtime/node_modules/runtime-link"

expected_link_target="$(readlink "$runtime/node_modules/runtime-link")"
expected_linked_hash="$(shasum -a 256 "$linked_file" | awk '{print $1}')"
expected_ordinary_hash="$(shasum -a 256 "$runtime/ordinary-file" | awk '{print $1}')"
expected_file_mode="$(stat -f '%Lp' "$linked_file")"
expected_directory_mode="$(stat -f '%Lp' "$runtime/node_modules/package with spaces")"
external_inode="$(stat -f '%i' "$external_file")"

bash "$script_dir/isolate-runtime-files.sh" "$runtime" "$scratch"

[[ -z "$(find "$runtime" -type f -links +1 -print -quit)" ]] || {
  echo "test:macos runtime isolation retained a shared inode" >&2
  exit 1
}
[[ "$(stat -f '%i' "$external_file")" == "$external_inode" ]] || {
  echo "test:macos runtime isolation replaced the external file" >&2
  exit 1
}
[[ "$(stat -f '%i' "$linked_file")" != "$external_inode" ]] || {
  echo "test:macos runtime isolation retained the external hard link" >&2
  exit 1
}
[[ "$(stat -f '%i' "$linked_file")" != "$(stat -f '%i' "$second_link")" ]] || {
  echo "test:macos runtime isolation retained an internal hard link" >&2
  exit 1
}
[[ -L "$runtime/node_modules/runtime-link" ]] || {
  echo "test:macos runtime isolation dereferenced a symbolic link" >&2
  exit 1
}
[[ "$(readlink "$runtime/node_modules/runtime-link")" == "$expected_link_target" ]] || {
  echo "test:macos runtime isolation changed a symbolic-link target" >&2
  exit 1
}
[[ "$(shasum -a 256 "$linked_file" | awk '{print $1}')" == "$expected_linked_hash" ]] || {
  echo "test:macos runtime isolation changed file content" >&2
  exit 1
}
[[ "$(shasum -a 256 "$runtime/ordinary-file" | awk '{print $1}')" == "$expected_ordinary_hash" ]] || {
  echo "test:macos runtime isolation changed an ordinary file" >&2
  exit 1
}
[[ "$(stat -f '%Lp' "$linked_file")" == "$expected_file_mode" ]] || {
  echo "test:macos runtime isolation changed file mode" >&2
  exit 1
}
[[ "$(stat -f '%Lp' "$runtime/node_modules/package with spaces")" == "$expected_directory_mode" ]] || {
  echo "test:macos runtime isolation changed directory mode" >&2
  exit 1
}

echo "test:macos: runtime hard-link isolation checks passed"
