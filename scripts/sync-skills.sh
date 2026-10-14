#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF_USAGE'
Usage: scripts/sync-skills.sh [options]

Sync repo skills into Codex's and Claude Code's skills directories.

Only skills this script synced before (tracked in <target>/.my-agent-skills-manifest)
are ever pruned, so other skills in the target (e.g. Codex's .system, Claude's
synced/) are left alone.

Options:
  -n, --dry-run        Show what would change without writing files
      --prune          Remove previously synced skills missing from source (default)
      --no-prune       Keep previously synced skills missing from source
      --source <dir>   Source skills directory (default: .agents/skills)
      --target <dir>   Target skills directory; repeatable. Replaces the defaults:
                         $CODEX_SKILLS_DIR or ~/.codex/skills
                         $CLAUDE_SKILLS_DIR or ~/.claude/skills
  -h, --help           Show this help
EOF_USAGE
}

die() {
  echo "Error: $*" >&2
  exit 1
}

manifest_name=".my-agent-skills-manifest"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
source_dir="$repo_root/.agents/skills"
target_dirs=()
dry_run=false
prune=true

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
    --no-prune)
      prune=false
      shift
      ;;
    --source)
      (($# >= 2)) || die "--source requires a directory"
      source_dir="$2"
      shift 2
      ;;
    --target)
      (($# >= 2)) || die "--target requires a directory"
      target_dirs+=("$2")
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

if ((${#target_dirs[@]} == 0)); then
  target_dirs=(
    "${CODEX_SKILLS_DIR:-$HOME/.codex/skills}"
    "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
  )
fi

[[ -d "$source_dir" ]] || die "source directory does not exist: $source_dir"
command -v rsync >/dev/null 2>&1 || die "rsync is required"

source_dir="$(cd "$source_dir" && pwd -P)"
[[ "$source_dir" != "/" ]] || die "refusing to use / as source"

rsync_args=(-a --delete)
if [[ "$dry_run" == true ]]; then
  rsync_args+=(--dry-run --itemize-changes)
fi

shopt -s nullglob
skill_names=()
for skill_path in "$source_dir"/*; do
  [[ -d "$skill_path" ]] || continue
  skill_name="$(basename "$skill_path")"
  [[ "$skill_name" != .* ]] || continue
  if [[ ! -f "$skill_path/SKILL.md" ]]; then
    echo "Skipping $skill_name (missing SKILL.md)"
    continue
  fi
  skill_names+=("$skill_name")
done
((${#skill_names[@]} > 0)) || die "source directory has no skills: $source_dir"

sync_target() {
  local target_dir="$1"
  local manifest skill_name

  mkdir -p "$target_dir"
  target_dir="$(cd "$target_dir" && pwd -P)"
  [[ "$target_dir" != "/" ]] || die "refusing to use / as target"
  [[ "$source_dir" != "$target_dir" ]] || die "source and target must be different"
  manifest="$target_dir/$manifest_name"

  echo
  echo "Source: $source_dir"
  echo "Target: $target_dir"
  echo

  for skill_name in "${skill_names[@]}"; do
    echo "Syncing $skill_name"
    rsync "${rsync_args[@]}" "$source_dir/$skill_name/" "$target_dir/$skill_name/"
  done

  if [[ "$prune" == true && -f "$manifest" ]]; then
    echo
    echo "Pruning previously synced skills missing from source"

    while IFS= read -r skill_name; do
      [[ -n "$skill_name" && "$skill_name" != .* && "$skill_name" != */* ]] || continue
      [[ -d "$target_dir/$skill_name" ]] || continue
      if [[ ! -f "$source_dir/$skill_name/SKILL.md" ]]; then
        echo "Removing $skill_name"
        if [[ "$dry_run" != true ]]; then
          rm -rf "${target_dir:?}/$skill_name"
        fi
      fi
    done <"$manifest"
  fi

  if [[ "$dry_run" != true ]]; then
    printf '%s\n' "${skill_names[@]}" >"$manifest"
  fi
}

for target_dir in "${target_dirs[@]}"; do
  sync_target "$target_dir"
done

echo
if [[ "$dry_run" == true ]]; then
  echo "Dry run complete."
else
  echo "Sync complete."
fi
