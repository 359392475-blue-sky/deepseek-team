#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
expected_id="com.bluesky.deepseek-harness-team-battle"
requested_test_root="${DSH_MACOS_INSTALL_TEST_ROOT:-}"

if [[ -n "$requested_test_root" ]]; then
  test_root_without_slash="${requested_test_root%/}"
  [[ -n "$test_root_without_slash" ]] || test_root_without_slash="/"
  [[ "$requested_test_root" == /* && -d "$requested_test_root" && ! -L "$test_root_without_slash" ]] || {
    echo "install:macos test root must be an absolute non-symlink directory" >&2
    exit 1
  }
  test_root="$(cd "$requested_test_root" && pwd -P)"
  user_temp="$(cd "$(getconf DARWIN_USER_TEMP_DIR)" && pwd -P)"
  [[ "$test_root" == "$user_temp/"* ]] || {
    echo "install:macos test root must be strictly inside the macOS user temporary directory" >&2
    exit 1
  }
  source_app="${DSH_MACOS_SOURCE_APP:?install:macos test mode requires DSH_MACOS_SOURCE_APP}"
  applications_dir="$test_root/Applications"
  backup_root="$test_root/Backups"
  trash_root="$test_root/Trash"
else
  test_root=""
  source_app="$repo_root/dist/macos/DeepSeek Harness 团战版.app"
  applications_dir="/Applications"
  backup_root="$HOME/Library/Application Support/DeepSeek Harness Team Battle/Backups"
  trash_root="$HOME/.Trash"
fi
target_app="$applications_dir/DeepSeek Harness 团战版.app"

running_bundle_pid() {
  local bundle="$1"
  local bundle_path
  local command command_path pid
  bundle_path="$(cd "$bundle" && pwd -P)"
  while read -r pid command; do
    [[ -f "$command" ]] || continue
    command_path="$(cd "$(dirname "$command")" && pwd -P)/$(basename "$command")"
    case "$command_path" in
      "$bundle_path/Contents/MacOS/DeepSeekHarness" | "$bundle_path/Contents/Resources/runtime/bin/node") ;;
      *) continue ;;
    esac
    printf '%s\n' "$pid"
    return 0
  done < <(ps -axo pid=,comm=)
}

make_bundle_owner_writable() {
  local bundle="$1"
  [[ -d "$bundle" && ! -L "$bundle" ]] || return 0
  find "$bundle" \( -type f -o -type d \) -exec chmod u+w {} +
}

first_writable_bundle_path() {
  local bundle="$1"
  find "$bundle" \( -type f -o -type d \) \
    \( -perm -u+w -o -perm -g+w -o -perm -o+w \) \
    -print -quit
}

seal_bundle() {
  local bundle="$1"
  [[ -d "$bundle" && ! -L "$bundle" ]] || {
    echo "install:macos refuses to seal a non-directory or symbolic-link bundle: $bundle" >&2
    return 1
  }
  find "$bundle" \( -type f -o -type d \) -exec chmod a-w {} +
  if [[ -n "$(first_writable_bundle_path "$bundle")" ]]; then
    echo "install:macos could not make the installed bundle read-only: $bundle" >&2
    return 1
  fi
}

[[ -d "$source_app" && ! -L "$source_app" ]] || { echo "install:macos requires a regular bundle from pnpm run build:macos" >&2; exit 1; }
source_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$source_app/Contents/Info.plist")"
[[ "$source_id" == "$expected_id" ]] || {
  echo "install:macos source bundle id is $source_id, expected $expected_id" >&2
  exit 1
}
codesign --verify --deep --strict --verbose=2 "$source_app"
bash "$script_dir/source-manifest.sh" verify \
  "$repo_root" \
  "$source_app/Contents/Resources/SOURCE_MANIFEST.sha256"

[[ -d "$applications_dir" && ! -L "$applications_dir" ]] || {
  echo "install:macos applications directory is not a regular directory: $applications_dir" >&2
  exit 1
}

if [[ -e "$target_app" || -L "$target_app" ]]; then
  [[ ! -L "$target_app" ]] || {
    echo "install:macos refuses to replace a symbolic link at $target_app" >&2
    exit 1
  }
  [[ -f "$target_app/Contents/Info.plist" ]] || {
    echo "install:macos refuses to replace a same-named item without Info.plist" >&2
    exit 1
  }
  target_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$target_app/Contents/Info.plist" 2>/dev/null || true)"
  [[ "$target_id" == "$expected_id" ]] || {
    echo "install:macos refuses to replace bundle id ${target_id:-unknown}" >&2
    exit 1
  }
  codesign --verify --deep --strict "$target_app" >/dev/null 2>&1 || {
    echo "install:macos refuses to replace an invalidly signed application" >&2
    exit 1
  }
  running_pid="$(running_bundle_pid "$target_app")"
  [[ -z "$running_pid" ]] || {
    echo "install:macos refuses to replace a running application (pid $running_pid); quit DeepSeek Harness 团战版 and retry" >&2
    exit 1
  }
fi

if [[ -n "$test_root" ]]; then
  backup_components=("$test_root" "$backup_root" "$trash_root")
else
  backup_components=(
    "$HOME"
    "$HOME/Library"
    "$HOME/Library/Application Support"
    "$HOME/Library/Application Support/DeepSeek Harness Team Battle"
    "$backup_root"
    "$trash_root"
  )
fi
for component in "${backup_components[@]}"; do
  [[ ! -L "$component" ]] || {
    echo "install:macos refuses a symlink in the backup path: $component" >&2
    exit 1
  }
done
mkdir -p "$backup_root" "$trash_root"
[[ -d "$backup_root" && ! -L "$backup_root" ]] || {
  echo "install:macos backup root is not a regular directory" >&2
  exit 1
}
[[ -d "$trash_root" && ! -L "$trash_root" ]] || {
  echo "install:macos Trash directory is not a regular directory" >&2
  exit 1
}

scan_backups() {
  local candidate candidate_id candidate_name
  regular_backups=()
  for candidate in "$backup_root"/DeepSeek\ Harness\ Team\ Battle-*.app; do
    [[ -e "$candidate" || -L "$candidate" ]] || continue
    candidate_name="${candidate##*/}"
    [[ "$candidate_name" =~ ^DeepSeek\ Harness\ Team\ Battle-[0-9]{8}-[0-9]{6}-[0-9]+\.app$ ]] || {
      echo "install:macos refuses an unexpected backup name: $candidate" >&2
      return 1
    }
    [[ -d "$candidate" && ! -L "$candidate" && -f "$candidate/Contents/Info.plist" ]] || {
      echo "install:macos refuses a non-bundle or symbolic-link backup candidate: $candidate" >&2
      return 1
    }
    candidate_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$candidate/Contents/Info.plist" 2>/dev/null || true)"
    [[ "$candidate_id" == "$expected_id" ]] || {
      echo "install:macos refuses backup bundle id ${candidate_id:-unknown}: $candidate" >&2
      return 1
    }
    codesign --verify --deep --strict "$candidate" >/dev/null 2>&1 || {
      echo "install:macos refuses an invalidly signed backup bundle: $candidate" >&2
      return 1
    }
    regular_backups+=("$candidate")
  done
}

seal_validated_backups() {
  local index
  for ((index = 0; index < ${#regular_backups[@]}; index++)); do
    seal_bundle "${regular_backups[$index]}"
  done
}

# Validate every path that could later be pruned before changing the installed app.
scan_backups
seal_validated_backups

install_temp="$applications_dir/.DeepSeek-Harness-Team-Battle-install-$$.app"
[[ ! -e "$install_temp" && ! -L "$install_temp" ]] || {
  echo "install:macos temporary target already exists" >&2
  exit 1
}
backup=""
had_target=false
transaction_active=false
cleanup() {
  local status=$?
  local rollback_failed=false
  trap - EXIT INT TERM
  set +e

  if [[ "$transaction_active" == "true" ]]; then
    if [[ "$had_target" == "true" ]]; then
      if [[ -n "$backup" && -d "$backup" && ! -L "$backup" ]]; then
        if [[ -e "$target_app" || -L "$target_app" ]]; then
          if [[ -d "$target_app" && ! -L "$target_app" && ! -e "$install_temp" && ! -L "$install_temp" ]]; then
            make_bundle_owner_writable "$target_app" || rollback_failed=true
            if [[ "$rollback_failed" == "false" ]]; then
              mv "$target_app" "$install_temp" || rollback_failed=true
            fi
          else
            rollback_failed=true
          fi
        fi
        make_bundle_owner_writable "$backup" || rollback_failed=true
        if [[ "$rollback_failed" == "false" ]]; then
          mv "$backup" "$target_app" || rollback_failed=true
        fi
      fi
      if [[ -d "$target_app" && ! -L "$target_app" ]]; then
        seal_bundle "$target_app" || rollback_failed=true
        codesign --verify --deep --strict "$target_app" >/dev/null 2>&1 || rollback_failed=true
      else
        rollback_failed=true
      fi
    elif [[ -e "$target_app" || -L "$target_app" ]]; then
      if [[ -d "$target_app" && ! -L "$target_app" && ! -e "$install_temp" && ! -L "$install_temp" ]]; then
        make_bundle_owner_writable "$target_app" || rollback_failed=true
        if [[ "$rollback_failed" == "false" ]]; then
          mv "$target_app" "$install_temp" || rollback_failed=true
        fi
      else
        rollback_failed=true
      fi
    fi
  fi

  make_bundle_owner_writable "$install_temp" || true
  rm -rf "$install_temp"
  if [[ "$rollback_failed" == "true" ]]; then
    echo "install:macos rollback could not restore and reseal the previous application" >&2
    exit 1
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM
/usr/bin/ditto "$source_app" "$install_temp"
seal_bundle "$install_temp"
codesign --verify --deep --strict --verbose=2 "$install_temp"

transaction_active=true
if [[ -e "$target_app" || -L "$target_app" ]]; then
  had_target=true
  backup="$backup_root/DeepSeek Harness Team Battle-$(date +%Y%m%d-%H%M%S)-$$.app"
  [[ ! -e "$backup" && ! -L "$backup" ]] || {
    echo "install:macos backup target already exists: $backup" >&2
    exit 1
  }
  make_bundle_owner_writable "$target_app"
  mv "$target_app" "$backup"
  seal_bundle "$backup"
fi

if [[ -n "$test_root" && "${DSH_MACOS_INSTALL_TEST_FAIL_AFTER_BACKUP:-}" == "1" ]]; then
  echo "install:macos injected failure after backup" >&2
  exit 86
fi

mv "$install_temp" "$target_app"
if ! codesign --verify --deep --strict --verbose=2 "$target_app"; then
  echo "install:macos installed bundle failed signature verification" >&2
  exit 1
fi
if [[ -n "$(first_writable_bundle_path "$target_app")" ]]; then
  echo "install:macos installed bundle is not read-only" >&2
  exit 1
fi
transaction_active=false
trap - EXIT INT TERM

# Revalidate the exact candidates immediately before the recoverable prune.
scan_backups
while [[ "${#regular_backups[@]}" -gt 2 ]]; do
  oldest="${regular_backups[0]}"
  oldest_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$oldest/Contents/Info.plist" 2>/dev/null || true)"
  [[ "$oldest" == "$backup_root"/DeepSeek\ Harness\ Team\ Battle-*.app && -d "$oldest" && ! -L "$oldest" && "$oldest_id" == "$expected_id" ]] || {
    echo "install:macos refuses unsafe backup candidate: $oldest" >&2
    exit 1
  }
  trash_name="${oldest##*/}"
  trash_destination="$trash_root/$trash_name"
  if [[ -e "$trash_destination" || -L "$trash_destination" ]]; then
    trash_destination="$trash_root/${trash_name%.app}-$(date +%Y%m%d-%H%M%S)-$$.app"
  fi
  [[ ! -e "$trash_destination" && ! -L "$trash_destination" ]] || {
    echo "install:macos refuses an occupied Trash destination: $trash_destination" >&2
    exit 1
  }
  make_bundle_owner_writable "$oldest"
  if ! mv "$oldest" "$trash_destination"; then
    seal_bundle "$oldest" || true
    exit 1
  fi
  if ! seal_bundle "$trash_destination"; then
    make_bundle_owner_writable "$trash_destination" || true
    if mv "$trash_destination" "$oldest"; then
      seal_bundle "$oldest" || true
    fi
    echo "install:macos could not reseal the pruned backup in Trash" >&2
    exit 1
  fi
  regular_backups=("${regular_backups[@]:1}")
  echo "install:macos: moved old backup to Trash: $oldest"
done

echo "install:macos: installed $target_app"
[[ -z "$backup" ]] || echo "install:macos: previous app backed up at $backup"
