#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
app_dir="$(cd "$script_dir/.." && pwd)"
repo_root="$(cd "$app_dir/../.." && pwd)"
output_parent="$repo_root/dist/macos"
output_app="$output_parent/DeepSeek Harness 团战版.app"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "build:macos requires Apple Silicon macOS" >&2
  exit 1
fi
for tool in node pnpm swift sips iconutil codesign file curl python3 shasum; do
  command -v "$tool" >/dev/null || { echo "build:macos requires $tool" >&2; exit 1; }
done

expected_node_version="v22.22.3"
actual_node_version="$(node --version)"
[[ "$actual_node_version" == "$expected_node_version" ]] || {
  echo "build:macos requires Node $expected_node_version, found $actual_node_version" >&2
  exit 1
}
node_binary="$(node -p 'process.execPath')"
node_arch="$(node -p 'process.arch')"
node_platform="$(node -p 'process.platform')"
node_root="$(cd "$(dirname "$node_binary")/.." && pwd)"
[[ "$node_arch" == "arm64" && "$node_platform" == "darwin" ]] || {
  echo "build:macos requires an arm64 macOS Node runtime" >&2
  exit 1
}
[[ -f "$node_root/LICENSE" ]] || { echo "Node LICENSE not found under $node_root" >&2; exit 1; }
root_tsx="$repo_root/node_modules/.bin/tsx"
root_vitest="$repo_root/node_modules/.bin/vitest"
[[ -x "$root_tsx" && -x "$root_vitest" ]] || {
  echo "build:macos requires the root development dependencies; run pnpm install" >&2
  exit 1
}

build_root="$(mktemp -d "${TMPDIR:-/tmp}/dsh-team-battle-macos-build.XXXXXX")"
cleanup() { rm -rf "$build_root"; }
trap cleanup EXIT INT TERM
staged_app="$build_root/DeepSeek Harness 团战版.app"
contents="$staged_app/Contents"
resources="$contents/Resources"
runtime="$resources/runtime"
source_manifest="$resources/SOURCE_MANIFEST.sha256"
manifest_script="$script_dir/source-manifest.sh"

initial_source_manifest="$build_root/SOURCE_MANIFEST.initial.sha256"
bash "$manifest_script" write "$repo_root" "$initial_source_manifest"

cd "$repo_root"
echo "build:macos: cleaning generated Harness artifacts"
pnpm run clean
echo "build:macos: building official Harness artifacts"
pnpm run build:official

echo "build:macos: deploying the root-lock runtime closure with optional dependencies"
CI=true PNPM_CONFIG_REGISTRY=https://registry.npmjs.org PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false \
  pnpm --filter @deepseek-ai/dsh-macos-team-battle-app deploy \
    --prod \
    --frozen-lockfile \
    --config.inject-workspace-packages=true \
    --config.node-linker=hoisted \
    --config.package-import-method=copy \
    --ignore-scripts \
    "$runtime"
[[ -x "$root_tsx" && -x "$root_vitest" ]] || {
  echo "build:macos deploy changed the checkout's development install mode" >&2
  exit 1
}
[[ -f "$runtime/node_modules/@deepseek-ai/dsh/lib/bin.js" ]] || {
  echo "build:macos deployed runtime has no dsh CLI" >&2
  exit 1
}

spawn_helper="$runtime/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper"
[[ -f "$spawn_helper" ]] || { echo "build:macos deployed runtime has no node-pty spawn helper" >&2; exit 1; }
chmod 755 "$spawn_helper"

mkdir -p "$runtime/bin" "$runtime/lib" "$contents/MacOS" "$resources"
cp "$app_dir/runtime-entry.mjs" "$runtime/lib/bin.js"
cp "$node_binary" "$runtime/bin/node"
chmod 755 "$runtime/bin/node"
cp "$node_root/LICENSE" "$resources/NODE_LICENSE"
cp "$repo_root/LICENSE" "$resources/LICENSE"
cp "$repo_root/THIRD_PARTY_NOTICES.md" "$resources/THIRD_PARTY_NOTICES.md"

cp "$initial_source_manifest" "$source_manifest"

node_pty_prebuilds="$runtime/node_modules/node-pty/prebuilds"
[[ -d "$node_pty_prebuilds/darwin-arm64" && ! -L "$node_pty_prebuilds" ]] || {
  echo "build:macos expected the node-pty darwin-arm64 prebuild directory" >&2
  exit 1
}
while IFS= read -r -d '' foreign_directory; do
  rm -rf "$foreign_directory"
done < <(find "$node_pty_prebuilds" -mindepth 1 -maxdepth 1 -type d ! -name darwin-arm64 -print0)
rm -rf "$runtime/node_modules/node-pty/third_party/conpty"
find "$runtime/node_modules" -type d -empty -delete

bash "$script_dir/isolate-runtime-files.sh" "$runtime" "$build_root/runtime-file-copies"

shared_runtime_file="$(find "$runtime" -type f -links +1 -print -quit)"
[[ -z "$shared_runtime_file" ]] || {
  echo "build:macos found a runtime file that shares its inode: $shared_runtime_file" >&2
  exit 1
}



(
  cd "$runtime"
  "$runtime/bin/node" --input-type=module -e "await import('koffi')"
)

echo "build:macos: compiling native shell"
swift build --package-path "$app_dir" --configuration release --arch arm64
swift_bin_dir="$(swift build --package-path "$app_dir" --configuration release --arch arm64 --show-bin-path)"
swift_binary="$swift_bin_dir/DeepSeekHarnessApp"
[[ -x "$swift_binary" ]] || { echo "Swift executable not found at $swift_binary" >&2; exit 1; }
cp "$swift_binary" "$contents/MacOS/DeepSeekHarness"
chmod 755 "$contents/MacOS/DeepSeekHarness"

echo "build:macos: generating icon"
icon_source="$app_dir/Resources/AppIcon.svg"
master_png="$build_root/AppIcon-1024.png"
sips -s format png "$icon_source" --out "$master_png" >/dev/null
iconset="$build_root/AppIcon.iconset"
mkdir -p "$iconset"
make_icon() { sips -z "$1" "$1" "$master_png" --out "$iconset/$2" >/dev/null; }
make_icon 16 icon_16x16.png
make_icon 32 icon_16x16@2x.png
make_icon 32 icon_32x32.png
make_icon 64 icon_32x32@2x.png
make_icon 128 icon_128x128.png
make_icon 256 icon_128x128@2x.png
make_icon 256 icon_256x256.png
make_icon 512 icon_256x256@2x.png
make_icon 512 icon_512x512.png
make_icon 1024 icon_512x512@2x.png
iconutil -c icns "$iconset" -o "$resources/AppIcon.icns"
cp "$icon_source" "$resources/AppIcon.svg"

full_version="$(node -p "require('$repo_root/package.json').version")"
short_version="${full_version%%-*}"
build_version="$(printf '%s' "$full_version" | sed -nE 's/.*-(rc|alpha)\.([0-9]+)$/\2/p')"
[[ -n "$build_version" ]] || build_version=1
cat > "$contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>zh_CN</string>
  <key>CFBundleDisplayName</key><string>DeepSeek Harness 团战版</string>
  <key>CFBundleExecutable</key><string>DeepSeekHarness</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIdentifier</key><string>com.bluesky.deepseek-harness-team-battle</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>DeepSeek Harness 团战版</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$short_version</string>
  <key>CFBundleVersion</key><string>$build_version</string>
  <key>DSHFullVersion</key><string>$full_version</string>
  <key>LSArchitecturePriority</key><array><string>arm64</string></array>
  <key>LSMinimumSystemVersion</key><string>15.0</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
</dict>
</plist>
PLIST
plutil -lint "$contents/Info.plist" >/dev/null

echo "build:macos: verifying native architectures and deployment targets"
macho_candidates=()
while IFS= read -r -d '' candidate; do
  description="$(file -b "$candidate")"
  if [[ "$description" == *Mach-O* ]]; then
    [[ "$description" == *arm64* ]] || {
      echo "build:macos found a Mach-O file without arm64: $candidate ($description)" >&2
      exit 1
    }
    macho_candidates+=("$candidate")
  fi
done < <(find "$contents" -type f \( \
  -name '*.node' -o -name '*.dylib' -o -name '*.so' -o -perm -u+x \
\) -print0)
[[ "${#macho_candidates[@]}" -gt 0 ]] || { echo "build:macos found no Mach-O payloads" >&2; exit 1; }
python3 "$script_dir/check-deployment-target.py" "${macho_candidates[@]}"

echo "build:macos: signing native payloads"
for candidate in "${macho_candidates[@]}"; do
  codesign --force --sign - --timestamp=none "$candidate" >/dev/null
done
codesign --force --sign - --timestamp=none "$staged_app" >/dev/null
codesign --verify --deep --strict --verbose=2 "$staged_app"

bash "$manifest_script" verify "$repo_root" "$initial_source_manifest"

mkdir -p "$output_parent"
[[ "$output_app" == "$repo_root/dist/macos/DeepSeek Harness 团战版.app" ]] || {
  echo "refusing unexpected output path: $output_app" >&2
  exit 1
}
rm -rf "$output_app"
mv "$staged_app" "$output_app"
trap - EXIT INT TERM
rm -rf "$build_root"
echo "build:macos: wrote $output_app"
