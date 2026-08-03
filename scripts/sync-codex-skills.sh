#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/sync-codex-skills.sh [options]

Sync repo skills into Codex's skills directory without touching .system.

Options:
  -n, --dry-run        Show what would change without writing files
      --prune          Remove top-level target skill directories missing from source
      --source <dir>   Source skills directory (default: .agents/skills)
      --target <dir>   Target skills directory (default: $CODEX_SKILLS_DIR or ~/.codex/skills)
  -h, --help           Show this help
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
source_dir="$repo_root/.agents/skills"
target_dir="${CODEX_SKILLS_DIR:-$HOME/.codex/skills}"
dry_run=false
prune=false

while (($# > 0)); do
  case "$1" in
    -n | --dry-run)
      dry_run=true
      shift
      ;;
    --prune)
      prune=true
      shift
      ;;
    --source)
      (($# >= 2)) || die "--source requires a directory"
      source_dir="$2"
      shift 2
      ;;
    --target)
      (($# >= 2)) || die "--target requires a directory"
      target_dir="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

[[ -d "$source_dir" ]] || die "source directory does not exist: $source_dir"
command -v rsync >/dev/null 2>&1 || die "rsync is required"

source_dir="$(cd "$source_dir" && pwd -P)"
[[ "$source_dir" != "/" ]] || die "refusing to use / as source"

mkdir -p "$target_dir"
target_dir="$(cd "$target_dir" && pwd -P)"
[[ "$target_dir" != "/" ]] || die "refusing to use / as target"
[[ "$source_dir" != "$target_dir" ]] || die "source and target must be different"

rsync_args=(-a --delete)
if [[ "$dry_run" == true ]]; then
  rsync_args+=(--dry-run --itemize-changes)
fi

echo "Source: $source_dir"
echo "Target: $target_dir"
echo

shopt -s nullglob
source_skills=("$source_dir"/*)
if ((${#source_skills[@]} == 0)); then
  die "source directory has no skills: $source_dir"
fi

for skill_path in "${source_skills[@]}"; do
  [[ -d "$skill_path" ]] || continue
  skill_name="$(basename "$skill_path")"
  [[ "$skill_name" != .* ]] || continue
  if [[ ! -f "$skill_path/SKILL.md" ]]; then
    echo "Skipping $skill_name (missing SKILL.md)"
    continue
  fi

  echo "Syncing $skill_name"
  rsync "${rsync_args[@]}" "$skill_path/" "$target_dir/$skill_name/"
done

if [[ "$prune" == true ]]; then
  echo
  echo "Pruning target skills missing from source"

  target_skills=("$target_dir"/*)
  for target_skill_path in "${target_skills[@]}"; do
    [[ -d "$target_skill_path" ]] || continue
    skill_name="$(basename "$target_skill_path")"
    [[ "$skill_name" != .* ]] || continue

    if [[ ! -f "$source_dir/$skill_name/SKILL.md" ]]; then
      echo "Removing $skill_name"
      if [[ "$dry_run" != true ]]; then
        rm -rf "$target_skill_path"
      fi
    fi
  done
fi

echo
if [[ "$dry_run" == true ]]; then
  echo "Dry run complete."
else
  echo "Sync complete."
fi
