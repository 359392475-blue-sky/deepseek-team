#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
app_dir="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$app_dir/../.." && pwd)"
bundle="$repo_root/dist/macos/DeepSeek Harness 团战版.app"
contents="$bundle/Contents"
runtime="$contents/Resources/runtime"
node="$runtime/bin/node"
entry="$runtime/lib/bin.js"
manifest_script="$script_dir/source-manifest.sh"

if [[ "${CI:-}" == "true" && "${DSH_MACOS_BUNDLE_ALREADY_BUILT:-}" == "1" ]]; then
  echo "test:macos: using the bundle built by the preceding CI step"
else
  bash "$script_dir/build.sh"
fi
[[ -d "$bundle" ]] || { echo "test:macos build did not produce the application bundle" >&2; exit 1; }
bash "$manifest_script" verify "$repo_root" "$contents/Resources/SOURCE_MANIFEST.sha256"
bash "$script_dir/test-source-manifest.sh"
bash "$script_dir/test-runtime-file-isolation.sh"
swift test --package-path "$app_dir"
plutil -lint "$contents/Info.plist" >/dev/null
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$contents/Info.plist")" == "com.bluesky.deepseek-harness-team-battle" ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$contents/Info.plist")" == "DeepSeek Harness 团战版" ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :DSHFullVersion' "$contents/Info.plist")" == "0.1.7-alpha.2" ]]
[[ -x "$node" && -f "$entry" ]]
for required in \
  "$runtime/node_modules/@deepseek-ai/dsh-experimental-team-battle-profile/cordis.patch.yml" \
  "$runtime/node_modules/@deepseek-ai/dsh-experimental-team-battle-web-profile/cordis.patch.yml" \
  "$runtime/node_modules/@deepseek-ai/dsh-experimental-team-battle/lib/index.js" \
  "$runtime/node_modules/@deepseek-ai/dsh-experimental-team-battle-connector-http/lib/index.js" \
  "$runtime/node_modules/@deepseek-ai/dsh-experimental-client-ui-team-battle/lib/index.js" \
  "$runtime/node_modules/@deepseek-ai/dsh-experimental-client-ui-team-battle/lib/client.js"; do
  [[ -s "$required" ]] || { echo "test:macos missing Team Battle runtime artifact: $required" >&2; exit 1; }
done
codesign --verify --deep --strict --verbose=2 "$bundle"

shared_runtime_file="$(find "$runtime" -type f -links +1 -print -quit)"
[[ -z "$shared_runtime_file" ]] || {
  echo "test:macos found a runtime file that shares its inode: $shared_runtime_file" >&2
  exit 1
}

[[ "$("$node" --version)" == "v22.22.3" ]] || {
  echo "test:macos embedded Node is not v22.22.3" >&2
  exit 1
}

foreign="$(find "$runtime/node_modules/node-pty/prebuilds" \
  -mindepth 1 -maxdepth 1 ! -name darwin-arm64 -print -quit)"
if [[ -z "$foreign" && -e "$runtime/node_modules/node-pty/third_party/conpty" ]]; then
  foreign="$runtime/node_modules/node-pty/third_party/conpty"
fi
[[ -z "$foreign" ]] || { echo "test:macos found foreign node-pty payload: $foreign" >&2; exit 1; }
while IFS= read -r -d '' node_pty_file; do
  node_pty_description="$(file -b "$node_pty_file")"
  case "$node_pty_description" in
    *PE32* | *ELF*)
      echo "test:macos found foreign executable content in node-pty: $node_pty_file ($node_pty_description)" >&2
      exit 1
      ;;
  esac
done < <(find "$runtime/node_modules/node-pty" -type f -print0)


macho_candidates=()
while IFS= read -r -d '' candidate; do
  description="$(file -b "$candidate")"
  if [[ "$description" == *Mach-O* ]]; then
    [[ "$description" == *arm64* ]] || {
      echo "test:macos found a Mach-O file without arm64: $candidate ($description)" >&2
      exit 1
    }
    macho_candidates+=("$candidate")
  fi
done < <(find "$contents" -type f \( \
  -name '*.node' -o -name '*.dylib' -o -name '*.so' -o -perm -u+x \
\) -print0)
[[ "${#macho_candidates[@]}" -gt 0 ]] || { echo "test:macos found no Mach-O payloads" >&2; exit 1; }
python3 "$script_dir/check-deployment-target.py" "${macho_candidates[@]}"

while IFS= read -r -d '' link; do
  target="$(realpath "$link")"
  [[ "$target" == "$runtime/"* ]] || {
    echo "test:macos found a runtime symlink outside the bundle: $link -> $target" >&2
    exit 1
  }
done < <(find "$runtime" -type l -print0)

expected_version="$(node -p "require('$repo_root/package.json').version")"
actual_version="$("$node" --expose-internals "$entry" --version)"
[[ "$actual_version" == "$expected_version" ]] || {
  echo "test:macos CLI version $actual_version != $expected_version" >&2
  exit 1
}
(
  cd "$runtime"
  "$node" --input-type=module -e "await import('koffi')"
)

probe_root="$(mktemp -d "${TMPDIR:-/tmp}/dsh-team-battle-macos-smoke.XXXXXX")"
child_pid=""
cleanup() {
  if [[ -n "$child_pid" ]] && kill -0 "$child_pid" 2>/dev/null; then
    kill -TERM "$child_pid" 2>/dev/null || true
    sleep 1
    kill -KILL "$child_pid" 2>/dev/null || true
  fi
  rm -rf "$probe_root"
}
trap cleanup EXIT INT TERM
mkdir -p "$probe_root/home" "$probe_root/agents" "$probe_root/workspace with spaces"
mkdir -p "$probe_root/home/storages"
printf '%s\n' '{"unit":{"name":"workspace","version":2},"global":{"initialized":false,"workspaceIds":[],"archivedSessionIds":[]},"tables":{"workspaces":{}}}' \
  > "$probe_root/home/storages/workspace.json"
probe_log="$probe_root/web.log"
previous_directory="$PWD"
cd "$probe_root/workspace with spaces"
DSH_HOME="$probe_root/home" DSH_AGENTS_HOME="$probe_root/agents" \
  TEAM_BATTLE_CODEX_TOKEN=macos-smoke-connector \
  "$node" --expose-internals "$entry" --profile team-battle \
    --host 127.0.0.1 --port 0 --no-open >"$probe_log" 2>&1 &
child_pid=$!
cd "$previous_directory"

ready_url=""
for _ in $(seq 1 240); do
  if ! kill -0 "$child_pid" 2>/dev/null; then
    echo "test:macos bundled Web process exited before readiness" >&2
    sed -n '1,120p' "$probe_log" \
      | sed -E 's/([?&]token=)[A-Za-z0-9_-]+/\1<redacted>/g' >&2
    exit 1
  fi
  ready_url="$(sed -nE 's/.*dsh web: (http:\/\/127\.0\.0\.1:[0-9]+\/\?token=[A-Za-z0-9_-]+).*/\1/p' "$probe_log" | tail -1)"
  [[ -n "$ready_url" ]] && break
  sleep 0.25
done
[[ -n "$ready_url" ]] || { echo "test:macos timed out waiting for readiness" >&2; exit 1; }
expected_layers='["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","@deepseek-ai/dsh-experimental-team-battle-profile","@deepseek-ai/dsh-experimental-team-battle-web-profile"]'
actual_layers="$(/usr/bin/jq -c '.dsh.profile.bundles' "$probe_root/home/profiles/team-battle/package.json")"
[[ "$actual_layers" == "$expected_layers" ]] || {
  echo "test:macos Team Battle profile does not contain the four required layers" >&2
  exit 1
}
probe_page="$probe_root/index.html"
cookie_jar="$probe_root/cookies.txt"
curl --fail --location --silent --show-error --max-time 5 \
  --cookie-jar "$cookie_jar" --cookie "$cookie_jar" "$ready_url" > "$probe_page"
grep -Fq '@deepseek-ai/dsh-experimental-client-ui-team-battle' "$probe_page" || {
  echo "test:macos authenticated page omitted the Team Battle client entry" >&2
  exit 1
}
kill -TERM "$child_pid"
set +e
wait "$child_pid"
status=$?
set -e
child_pid=""
[[ "$status" -eq 0 ]] || { echo "test:macos Web process exited $status after SIGTERM" >&2; exit 1; }
if curl --fail --silent --max-time 1 "$ready_url" >/dev/null 2>&1; then
  echo "test:macos loopback listener survived process exit" >&2
  exit 1
fi
[[ "$(/usr/bin/jq -r '.unit.version' "$probe_root/home/storages/workspace.json")" == "2" ]] || {
  echo "test:macos changed the additive Workspace medium version" >&2
  exit 1
}

trap - EXIT INT TERM
rm -rf "$probe_root"
bash "$script_dir/test-install.sh"
echo "test:macos: source-fresh isolated Team Battle bundle, Swift, locked runtime, authenticated profile boot, architecture, macOS 14, lifecycle, pruning, and signature checks passed"
