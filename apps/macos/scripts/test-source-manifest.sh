#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
manifest_script="$script_dir/source-manifest.sh"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/dsh-team-battle-macos-source-manifest-test.XXXXXX")"
cleanup() { rm -rf "$fixture_root"; }
trap cleanup EXIT INT TERM
repo="$fixture_root/repo"
expected="$fixture_root/expected.sha256"

write_fixture() {
  local relative="$1"
  mkdir -p "$(dirname "$repo/$relative")"
  printf 'fixture: %s\n' "$relative" > "$repo/$relative"
}

required_files=(
  .gitignore
  LICENSE
  THIRD_PARTY_NOTICES.md
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  tsconfig.base.client.json
  tsconfig.base.json
  tsconfig.client.json
  tsconfig.host.json
  tsconfig.json
  tsdown.config.ts
  apps/macos/Package.swift
  apps/macos/package.json
  apps/macos/runtime-entry.mjs
  apps/macos/README.i18n.yaml
  apps/macos/README.md
  apps/macos/README.zh.md
  scripts/build-python-release.py
  scripts/check-macos-deployment-target.py
  scripts/publication-payload.ts
  scripts/release/families.ts
  scripts/release/pack.ts
  scripts/release/process.ts
  scripts/release/tarball.ts
)
for relative in "${required_files[@]}"; do write_fixture "$relative"; done

fixture_sources=(
  apps/cli/src/bin.ts
  apps/web/src/main.ts
  apps/macos/Resources/AppIcon.svg
  apps/macos/Sources/App.swift
  native/landlock-run/src/lib.rs
  native/system/Cargo.toml
  native/system/packages/entry/src/main.c
  native/system/packages/entry/src/index.ts
  native/system/packages/darwin-arm64/package.json
  native/system/scripts/build.ts
  packages/example/package/src/index.ts
  packages/example/package/src/lib/helper.ts
  packages/example/package/src/source-link-target-a.ts
  packages/example/package/src/source-link-target-b.ts
  packages/example/package/src/types/model.ts
  patches/dependency.patch
  python/sdk-runtime/src/deepseek_harness_runtime/runtime/platforms.json
  python/sdk-runtime/src/runtime.py
  scripts/clean.ts
  snapshots/web/smoke/cordis.yml
  native/landlock-run/packages/linux-arm64/package.json
  vendor/example/src/index.ts
  website/.vitepress/config.mts
  website/config.ts
)
for relative in "${fixture_sources[@]}"; do write_fixture "$relative"; done
mkdir -p "$repo/apps/macos/scripts" "$repo/snapshots"
cp "$manifest_script" "$repo/apps/macos/scripts/source-manifest.sh"
cp "$script_dir/test.sh" "$repo/apps/macos/scripts/test.sh"
chmod 755 "$repo/apps/macos/scripts/source-manifest.sh" "$repo/apps/macos/scripts/test.sh"

excluded_outputs=(
  apps/cli/lib/bin.js
  apps/web/dist/index.js
  apps/web/node_modules/pkg/index.js
  apps/macos/.build/release/App
  packages/example/package/lib/index.js
  packages/example/package/types/index.d.ts
  python/sdk-runtime/build/runtime.py
  python/sdk-runtime/src/deepseek_harness_runtime/runtime/deepseek-harness-sdk-runtime-macos-arm64
  python/sdk-runtime/src/deepseek_harness_runtime/runtime/node/bin/node
  native/landlock-run/packages/linux-arm64/bin/addon.node
  native/landlock-run/target/release/runner
  native/system/.claude/cache.json
  native/system/.release/archive.tar
  native/system/dist/system.node
  native/system/target/release/runner
  native/system/packages/darwin-arm64/bin/system.node
  native/system/packages/entry/lib/flock.d.ts
  native/system/packages/entry/lib/flock.js
  native/system/packages/entry/lib/index.d.ts
  native/system/packages/entry/lib/index.js
  vendor/example/lib/index.js
  website/.dist/index.html
  website/.generated/index.md
  website/.vite/cache.json
)
for relative in "${excluded_outputs[@]}"; do write_fixture "$relative"; done
write_fixture dist/macos/stale.app
write_fixture .git/objects/private
write_fixture solar-system-textbook/index.html

printf 'outside target\n' > "$fixture_root/outside.ts"
ln -s "$fixture_root/outside.ts" "$repo/apps/web/src/external-link.ts"
if bash "$manifest_script" write "$repo" "$expected" >/dev/null 2>&1; then
  echo "test:macos source manifest accepted a symbolic link outside the repository" >&2
  exit 1
fi
rm "$repo/apps/web/src/external-link.ts"

ln -s ../dist/index.js "$repo/apps/web/src/generated-link.ts"
if bash "$manifest_script" write "$repo" "$expected" >/dev/null 2>&1; then
  echo "test:macos source manifest accepted a symbolic link to an excluded generated file" >&2
  exit 1
fi
rm "$repo/apps/web/src/generated-link.ts"

ln -s source-link-target-a.ts "$repo/packages/example/package/src/source-link"
bash "$manifest_script" write "$repo" "$expected"
mkdir -p "$repo/dist/macos/DeepSeek Harness 团战版.app/Contents/Resources"
cp "$expected" "$repo/dist/macos/DeepSeek Harness 团战版.app/Contents/Resources/SOURCE_MANIFEST.sha256"

for relative in \
  apps/web/src/main.ts \
  packages/example/package/src/index.ts \
  packages/example/package/src/lib/helper.ts \
  packages/example/package/src/types/model.ts \
  python/sdk-runtime/src/deepseek_harness_runtime/runtime/platforms.json \
  native/landlock-run/packages/linux-arm64/package.json \
  native/system/Cargo.toml \
  native/system/packages/entry/src/main.c \
  native/system/packages/entry/src/index.ts \
  native/system/packages/darwin-arm64/package.json \
  native/system/scripts/build.ts \
  snapshots/web/smoke/cordis.yml \
  apps/macos/scripts/source-manifest.sh \
  .gitignore \
  LICENSE \
  THIRD_PARTY_NOTICES.md \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  patches/dependency.patch; do
  grep -Fq "$relative" "$expected" || {
    echo "test:macos source manifest omitted $relative" >&2
    exit 1
  }
done
for relative in "${excluded_outputs[@]}" dist/macos/stale.app .git/objects/private solar-system-textbook/index.html; do
  if grep -Fq "$relative" "$expected"; then
    echo "test:macos source manifest included excluded path $relative" >&2
    exit 1
  fi
done
awk -F '\t' '$2 == "symlink" && $3 ~ /^[0-7][0-7][0-7][0-7]$/ && $4 == "packages/example/package/src/source-link" && $5 == "\"source-link-target-a.ts\"" { found = 1 } END { exit !found }' "$expected" || {
  echo "test:macos source manifest did not record the symlink target" >&2
  exit 1
}
bash "$manifest_script" verify "$repo" "$expected"

for relative in "${excluded_outputs[@]}"; do
  printf 'changed generated output\n' >> "$repo/$relative"
done
bash "$manifest_script" verify "$repo" "$expected"

for relative in \
  native/system/Cargo.toml \
  native/system/packages/entry/src/main.c \
  native/system/packages/entry/src/index.ts \
  native/system/scripts/build.ts; do
  printf 'changed native source\n' >> "$repo/$relative"
  if bash "$manifest_script" verify "$repo" "$expected" >/dev/null 2>&1; then
    echo "test:macos source manifest accepted stale $relative" >&2
    exit 1
  fi
  bash "$manifest_script" write "$repo" "$expected"
done
cp "$expected" "$repo/dist/macos/DeepSeek Harness 团战版.app/Contents/Resources/SOURCE_MANIFEST.sha256"

printf 'changed web source\n' >> "$repo/apps/web/src/main.ts"
ci_skip_log="$fixture_root/ci-skip.log"
if CI=true DSH_MACOS_BUNDLE_ALREADY_BUILT=1 bash "$repo/apps/macos/scripts/test.sh" >"$ci_skip_log" 2>&1; then
  echo "test:macos CI skip accepted stale apps/web/src/main.ts" >&2
  exit 1
fi
grep -Fq 'using the bundle built by the preceding CI step' "$ci_skip_log" || {
  echo "test:macos source manifest did not exercise the CI skip path" >&2
  exit 1
}
grep -Fq 'bundle source manifest is stale' "$ci_skip_log" || {
  echo "test:macos CI skip did not reject the stale bundle at source-manifest preflight" >&2
  exit 1
}
if bash "$manifest_script" verify "$repo" "$expected" >/dev/null 2>&1; then
  echo "test:macos source manifest accepted stale apps/web/src/main.ts" >&2
  exit 1
fi
bash "$manifest_script" write "$repo" "$expected"

printf 'changed package source\n' >> "$repo/packages/example/package/src/index.ts"
if bash "$manifest_script" verify "$repo" "$expected" >/dev/null 2>&1; then
  echo "test:macos source manifest accepted stale packages/**/src" >&2
  exit 1
fi
bash "$manifest_script" write "$repo" "$expected"

chmod 755 "$repo/packages/example/package/src/index.ts"
if bash "$manifest_script" verify "$repo" "$expected" >/dev/null 2>&1; then
  echo "test:macos source manifest ignored an executable-mode change" >&2
  exit 1
fi
bash "$manifest_script" write "$repo" "$expected"

rm "$repo/packages/example/package/src/source-link"
ln -s source-link-target-b.ts "$repo/packages/example/package/src/source-link"
if bash "$manifest_script" verify "$repo" "$expected" >/dev/null 2>&1; then
  echo "test:macos source manifest ignored a symlink-target change" >&2
  exit 1
fi
bash "$manifest_script" write "$repo" "$expected"

printf '# changed helper\n' >> "$repo/apps/macos/scripts/source-manifest.sh"
if bash "$manifest_script" verify "$repo" "$expected" >/dev/null 2>&1; then
  echo "test:macos source manifest did not cover its own helper" >&2
  exit 1
fi

echo "test:macos: complete source manifest freshness checks passed"
