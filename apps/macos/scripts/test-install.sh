#!/bin/bash
set -euo pipefail

first_writable_bundle_path() {
  local bundle="$1"
  find "$bundle" \( -type f -o -type d \) \
    \( -perm -u+w -o -perm -g+w -o -perm -o+w \) \
    -print -quit
}

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
install_script="$script_dir/install.sh"
expected_id="com.bluesky.deepseek-harness-team-battle"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/dsh-team-battle-macos-install-test.XXXXXX")"
running_fixture_pid=""
cleanup() {
  if [[ -n "$running_fixture_pid" ]]; then
    kill "$running_fixture_pid" 2>/dev/null || true
    wait "$running_fixture_pid" 2>/dev/null || true
  fi
  find "$fixture_root" \( -type f -o -type d \) -exec chmod u+w {} + 2>/dev/null || true
  rm -rf "$fixture_root"
}
trap cleanup EXIT INT TERM
fresh_manifest="$fixture_root/SOURCE_MANIFEST.sha256"
bash "$script_dir/source-manifest.sh" write "$repo_root" "$fresh_manifest"

make_app() {
  local app="$1"
  local identifier="$2"
  local marker="$3"
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
  cp /usr/bin/true "$app/Contents/MacOS/DeepSeekHarness"
  plutil -create xml1 "$app/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $identifier" "$app/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c 'Add :CFBundleExecutable string DeepSeekHarness' "$app/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c 'Add :CFBundlePackageType string APPL' "$app/Contents/Info.plist"
  printf '%s\n' "$marker" > "$app/Contents/Resources/fixture-marker"
  cp "$fresh_manifest" "$app/Contents/Resources/SOURCE_MANIFEST.sha256"
  codesign --force --sign - --timestamp=none "$app" >/dev/null
}

assert_marker() {
  local app="$1"
  local expected="$2"
  local actual
  actual="$(tr -d '\n' < "$app/Contents/Resources/fixture-marker")"
  [[ "$actual" == "$expected" ]] || {
    echo "test:macos installer marker $actual != $expected at $app" >&2
    exit 1
  }
}

seal_fixture_bundle() {
  local app="$1"
  find "$app" \( -type f -o -type d \) -exec chmod a-w {} +
}

assert_bundle_read_only() {
  local app="$1"
  [[ -z "$(first_writable_bundle_path "$app")" ]] || {
    echo "test:macos installer left writable bundle content at $app" >&2
    exit 1
  }
}

run_installer() {
  local root="$1"
  local source="$2"
  DSH_MACOS_INSTALL_TEST_ROOT="$root" DSH_MACOS_SOURCE_APP="$source" bash "$install_script"
}

unsafe_root_log="$fixture_root/unsafe-root.log"
if DSH_MACOS_INSTALL_TEST_ROOT="/" DSH_MACOS_SOURCE_APP="$fixture_root/missing.app" \
  bash "$install_script" >"$unsafe_root_log" 2>&1; then
  echo "test:macos installer accepted / as its test root" >&2
  exit 1
fi
grep -q 'strictly inside the macOS user temporary directory' "$unsafe_root_log"

symlinked_test_root="$fixture_root/symlinked-test-root-target"
mkdir -p "$symlinked_test_root"
ln -s "$symlinked_test_root" "$fixture_root/symlinked-test-root"
symlinked_root_log="$fixture_root/symlinked-root.log"
if DSH_MACOS_INSTALL_TEST_ROOT="$fixture_root/symlinked-test-root/" DSH_MACOS_SOURCE_APP="$fixture_root/missing.app" \
  bash "$install_script" >"$symlinked_root_log" 2>&1; then
  echo "test:macos installer accepted a symbolic-link test root" >&2
  exit 1
fi
grep -q 'absolute non-symlink directory' "$symlinked_root_log"

prepare_case() {
  local root="$1"
  mkdir -p "$root/Applications" "$root/Backups"
  make_app "$root/source.app" "$expected_id" new
  make_app "$root/Applications/DeepSeek Harness 团战版.app" "$expected_id" old
}

invalid_root="$fixture_root/invalid-directory"
prepare_case "$invalid_root"
mkdir "$invalid_root/Backups/DeepSeek Harness Team Battle-00000000-000000-0.app"
printf '%s\n' unrelated > "$invalid_root/Backups/DeepSeek Harness Team Battle-00000000-000000-0.app/user-data"
if run_installer "$invalid_root" "$invalid_root/source.app" >/dev/null 2>&1; then
  echo "test:macos installer accepted an unrelated backup directory" >&2
  exit 1
fi
assert_marker "$invalid_root/Applications/DeepSeek Harness 团战版.app" old
[[ -f "$invalid_root/Backups/DeepSeek Harness Team Battle-00000000-000000-0.app/user-data" ]]
[[ -w "$invalid_root/Backups/DeepSeek Harness Team Battle-00000000-000000-0.app/user-data" ]] || {
  echo "test:macos installer changed an unvalidated backup directory" >&2
  exit 1
}

identity_root="$fixture_root/wrong-identity"
prepare_case "$identity_root"
make_app "$identity_root/Backups/DeepSeek Harness Team Battle-00000000-000000-0.app" "com.example.unrelated" unrelated
if run_installer "$identity_root" "$identity_root/source.app" >/dev/null 2>&1; then
  echo "test:macos installer accepted a backup with another bundle id" >&2
  exit 1
fi
assert_marker "$identity_root/Applications/DeepSeek Harness 团战版.app" old
assert_marker "$identity_root/Backups/DeepSeek Harness Team Battle-00000000-000000-0.app" unrelated
[[ -n "$(first_writable_bundle_path "$identity_root/Backups/DeepSeek Harness Team Battle-00000000-000000-0.app")" ]] || {
  echo "test:macos installer sealed a backup with another bundle id" >&2
  exit 1
}

signature_root="$fixture_root/invalid-signature"
prepare_case "$signature_root"
make_app "$signature_root/Backups/DeepSeek Harness Team Battle-00000000-000000-0.app" "$expected_id" signed
printf '%s\n' modified > "$signature_root/Backups/DeepSeek Harness Team Battle-00000000-000000-0.app/Contents/Resources/fixture-marker"
if run_installer "$signature_root" "$signature_root/source.app" >/dev/null 2>&1; then
  echo "test:macos installer accepted an invalidly signed backup" >&2
  exit 1
fi
assert_marker "$signature_root/Applications/DeepSeek Harness 团战版.app" old
assert_marker "$signature_root/Backups/DeepSeek Harness Team Battle-00000000-000000-0.app" modified
[[ -n "$(first_writable_bundle_path "$signature_root/Backups/DeepSeek Harness Team Battle-00000000-000000-0.app")" ]] || {
  echo "test:macos installer sealed an invalidly signed backup" >&2
  exit 1
}

stale_root="$fixture_root/stale-source"
prepare_case "$stale_root"
python3 - "$stale_root/source.app/Contents/Resources/SOURCE_MANIFEST.sha256" <<'PY'
from pathlib import Path
import sys

manifest = Path(sys.argv[1])
lines = manifest.read_text(encoding="utf-8").splitlines()
fields = lines[1].split("\t", 1)
lines[1] = f"{'0' * 64}\t{fields[1]}"
manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
codesign --force --sign - --timestamp=none "$stale_root/source.app" >/dev/null
stale_log="$stale_root/install.log"
if run_installer "$stale_root" "$stale_root/source.app" >"$stale_log" 2>&1; then
  echo "test:macos installer accepted a stale source manifest" >&2
  exit 1
fi
grep -q 'bundle source manifest is stale' "$stale_log"
assert_marker "$stale_root/Applications/DeepSeek Harness 团战版.app" old

running_root="$fixture_root/running-target"
prepare_case "$running_root"
running_executable="$running_root/Applications/DeepSeek Harness 团战版.app/Contents/MacOS/DeepSeekHarness"
cp /bin/sleep "$running_executable"
codesign --force --sign - --timestamp=none "$running_root/Applications/DeepSeek Harness 团战版.app" >/dev/null
"$running_executable" 30 &
running_fixture_pid=$!
for _ in $(seq 1 20); do
  [[ "$(ps -p "$running_fixture_pid" -o comm= 2>/dev/null || true)" == "$running_executable" ]] && break
  sleep 0.05
done
[[ "$(ps -p "$running_fixture_pid" -o comm= 2>/dev/null || true)" == "$running_executable" ]] || {
  echo "test:macos could not start the running-application fixture" >&2
  exit 1
}
running_log="$running_root/install.log"
if run_installer "$running_root" "$running_root/source.app" >"$running_log" 2>&1; then
  echo "test:macos installer replaced a running application" >&2
  exit 1
fi
grep -q 'refuses to replace a running application' "$running_log"
assert_marker "$running_root/Applications/DeepSeek Harness 团战版.app" old
[[ -z "$(find "$running_root/Backups" -mindepth 1 -maxdepth 1 -print -quit)" ]]
kill "$running_fixture_pid"
wait "$running_fixture_pid" 2>/dev/null || true
running_fixture_pid=""

orphan_root="$fixture_root/running-runtime"
prepare_case "$orphan_root"
orphan_node="$orphan_root/Applications/DeepSeek Harness 团战版.app/Contents/Resources/runtime/bin/node"
mkdir -p "$(dirname "$orphan_node")"
cp /bin/sleep "$orphan_node"
codesign --force --sign - --timestamp=none "$orphan_node" >/dev/null
codesign --force --sign - --timestamp=none "$orphan_root/Applications/DeepSeek Harness 团战版.app" >/dev/null
"$orphan_node" 30 &
running_fixture_pid=$!
for _ in $(seq 1 20); do
  [[ "$(ps -p "$running_fixture_pid" -o comm= 2>/dev/null || true)" == "$orphan_node" ]] && break
  sleep 0.05
done
[[ "$(ps -p "$running_fixture_pid" -o comm= 2>/dev/null || true)" == "$orphan_node" ]] || {
  echo "test:macos could not start the running-runtime fixture" >&2
  exit 1
}
orphan_log="$orphan_root/install.log"
if run_installer "$orphan_root" "$orphan_root/source.app" >"$orphan_log" 2>&1; then
  echo "test:macos installer replaced an application with a running bundled runtime" >&2
  exit 1
fi
grep -q 'refuses to replace a running application' "$orphan_log"
assert_marker "$orphan_root/Applications/DeepSeek Harness 团战版.app" old
[[ -z "$(find "$orphan_root/Backups" -mindepth 1 -maxdepth 1 -print -quit)" ]]
kill "$running_fixture_pid"
wait "$running_fixture_pid" 2>/dev/null || true
running_fixture_pid=""

symlink_root="$fixture_root/symlink"
prepare_case "$symlink_root"
mkdir "$symlink_root/unrelated"
ln -s "$symlink_root/unrelated" "$symlink_root/Backups/DeepSeek Harness Team Battle-00000000-000000-0.app"
if run_installer "$symlink_root" "$symlink_root/source.app" >/dev/null 2>&1; then
  echo "test:macos installer accepted a symbolic-link backup candidate" >&2
  exit 1
fi
assert_marker "$symlink_root/Applications/DeepSeek Harness 团战版.app" old
[[ -L "$symlink_root/Backups/DeepSeek Harness Team Battle-00000000-000000-0.app" ]]

legacy_writable_root="$fixture_root/legacy-writable-backup"
prepare_case "$legacy_writable_root"
legacy_writable_backup="$legacy_writable_root/Backups/DeepSeek Harness Team Battle-20220101-000000-1.app"
make_app "$legacy_writable_backup" "$expected_id" historical
[[ -n "$(first_writable_bundle_path "$legacy_writable_backup")" ]] || {
  echo "test:macos historical backup fixture was already read-only" >&2
  exit 1
}
seal_fixture_bundle "$legacy_writable_root/Applications/DeepSeek Harness 团战版.app"
run_installer "$legacy_writable_root" "$legacy_writable_root/source.app" >/dev/null
assert_marker "$legacy_writable_root/Applications/DeepSeek Harness 团战版.app" new
assert_marker "$legacy_writable_backup" historical
assert_bundle_read_only "$legacy_writable_backup"

prune_root="$fixture_root/prune"
prepare_case "$prune_root"
make_app "$prune_root/Backups/DeepSeek Harness Team Battle-20200101-000000-1.app" "$expected_id" first
make_app "$prune_root/Backups/DeepSeek Harness Team Battle-20210101-000000-2.app" "$expected_id" second
seal_fixture_bundle "$prune_root/Applications/DeepSeek Harness 团战版.app"
seal_fixture_bundle "$prune_root/Backups/DeepSeek Harness Team Battle-20200101-000000-1.app"
seal_fixture_bundle "$prune_root/Backups/DeepSeek Harness Team Battle-20210101-000000-2.app"
run_installer "$prune_root" "$prune_root/source.app" >/dev/null
assert_marker "$prune_root/Applications/DeepSeek Harness 团战版.app" new
assert_bundle_read_only "$prune_root/Applications/DeepSeek Harness 团战版.app"
if /bin/sh -c 'printf "%s\n" mutated > "$1"' _ \
  "$prune_root/Applications/DeepSeek Harness 团战版.app/Contents/Resources/fixture-marker" 2>/dev/null; then
  echo "test:macos installed application accepted an in-place resource write" >&2
  exit 1
fi
assert_marker "$prune_root/Applications/DeepSeek Harness 团战版.app" new
installed_marker="$prune_root/Applications/DeepSeek Harness 团战版.app/Contents/Resources/fixture-marker"
installed_resources="$prune_root/Applications/DeepSeek Harness 团战版.app/Contents/Resources"
chmod u+w "$installed_marker"
[[ "$(first_writable_bundle_path "$prune_root/Applications/DeepSeek Harness 团战版.app")" == "$installed_marker" ]] || {
  echo "test:macos read-only check missed an owner-writable file" >&2
  exit 1
}
chmod u-w "$installed_marker"
chmod u+w "$installed_resources"
[[ "$(first_writable_bundle_path "$prune_root/Applications/DeepSeek Harness 团战版.app")" == "$installed_resources" ]] || {
  echo "test:macos read-only check missed an owner-writable directory" >&2
  exit 1
}
chmod u-w "$installed_resources"
[[ -z "$(first_writable_bundle_path "$prune_root/Applications/DeepSeek Harness 团战版.app")" ]] || {
  echo "test:macos read-only check did not clear after restoring modes" >&2
  exit 1
}
[[ -w "$prune_root/source.app/Contents/Resources/fixture-marker" ]] || {
  echo "test:macos installer changed the source bundle permissions" >&2
  exit 1
}
[[ ! -e "$prune_root/Backups/DeepSeek Harness Team Battle-20200101-000000-1.app" ]]
assert_marker "$prune_root/Trash/DeepSeek Harness Team Battle-20200101-000000-1.app" first
assert_marker "$prune_root/Backups/DeepSeek Harness Team Battle-20210101-000000-2.app" second
assert_bundle_read_only "$prune_root/Trash/DeepSeek Harness Team Battle-20200101-000000-1.app"
assert_bundle_read_only "$prune_root/Backups/DeepSeek Harness Team Battle-20210101-000000-2.app"
current_backup="$(find "$prune_root/Backups" -mindepth 1 -maxdepth 1 -type d -name 'DeepSeek Harness Team Battle-*.app' ! -name 'DeepSeek Harness Team Battle-20210101-000000-2.app' -print -quit)"
[[ -n "$current_backup" ]] || {
  echo "test:macos installer did not retain the previous read-only application" >&2
  exit 1
}
assert_marker "$current_backup" old
assert_bundle_read_only "$current_backup"
backup_count="$(find "$prune_root/Backups" -mindepth 1 -maxdepth 1 -type d -name 'DeepSeek Harness Team Battle-*.app' | wc -l | tr -d ' ')"
[[ "$backup_count" == "2" ]] || {
  echo "test:macos installer retained $backup_count backups, expected 2" >&2
  exit 1
}
if find "$prune_root/Applications" -mindepth 1 -maxdepth 1 -name '.DeepSeek-Harness-Team-Battle-install-*.app' -print -quit | grep -q .; then
  echo "test:macos installer left a temporary application bundle" >&2
  exit 1
fi

rollback_root="$fixture_root/rollback-read-only"
prepare_case "$rollback_root"
seal_fixture_bundle "$rollback_root/Applications/DeepSeek Harness 团战版.app"
rollback_log="$rollback_root/install.log"
if DSH_MACOS_INSTALL_TEST_FAIL_AFTER_BACKUP=1 \
  DSH_MACOS_INSTALL_TEST_ROOT="$rollback_root" \
  DSH_MACOS_SOURCE_APP="$rollback_root/source.app" \
  bash "$install_script" >"$rollback_log" 2>&1; then
  echo "test:macos installer ignored the injected post-backup failure" >&2
  exit 1
fi
grep -q 'injected failure after backup' "$rollback_log" || {
  echo "test:macos installer failed before the post-backup injection" >&2
  sed -n '1,120p' "$rollback_log" >&2
  exit 1
}
assert_marker "$rollback_root/Applications/DeepSeek Harness 团战版.app" old
assert_bundle_read_only "$rollback_root/Applications/DeepSeek Harness 团战版.app"
codesign --verify --deep --strict "$rollback_root/Applications/DeepSeek Harness 团战版.app"
rollback_backup_count="$(find "$rollback_root/Backups" -mindepth 1 -maxdepth 1 -type d -name 'DeepSeek Harness Team Battle-*.app' | wc -l | tr -d ' ')"
[[ "$rollback_backup_count" == "0" ]] || {
  echo "test:macos installer left a backup after rollback" >&2
  exit 1
}
if find "$rollback_root/Applications" -mindepth 1 -maxdepth 1 -name '.DeepSeek-Harness-Team-Battle-install-*.app' -print -quit | grep -q .; then
  echo "test:macos installer left a temporary application after rollback" >&2
  exit 1
fi

echo "test:macos: installer preflight and recoverable backup pruning checks passed"
