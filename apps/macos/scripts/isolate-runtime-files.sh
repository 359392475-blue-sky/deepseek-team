#!/bin/bash
set -euo pipefail

if [[ "$#" -ne 2 ]]; then
  echo "usage: isolate-runtime-files.sh <runtime-directory> <scratch-directory>" >&2
  exit 1
fi

runtime="$1"
scratch="$2"
[[ -d "$runtime" && ! -L "$runtime" ]] || {
  echo "isolate-runtime-files: runtime is not a regular directory: $runtime" >&2
  exit 1
}
[[ ! -e "$scratch" && ! -L "$scratch" ]] || {
  echo "isolate-runtime-files: scratch path already exists: $scratch" >&2
  exit 1
}
mkdir -p "$scratch"

copy_index=0
while IFS= read -r -d '' shared_file; do
  copy_index=$((copy_index + 1))
  private_file="$scratch/$copy_index"
  cp -p "$shared_file" "$private_file"
  [[ -f "$private_file" && ! -L "$private_file" ]] || {
    echo "isolate-runtime-files: private copy is not a regular file: $shared_file" >&2
    exit 1
  }
  mv -f "$private_file" "$shared_file"
done < <(find "$runtime" -type f -links +1 -print0)

shared_file="$(find "$runtime" -type f -links +1 -print -quit)"
[[ -z "$shared_file" ]] || {
  echo "isolate-runtime-files: runtime file still shares its inode: $shared_file" >&2
  exit 1
}
