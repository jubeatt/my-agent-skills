#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF_USAGE'
Usage: scripts/link.sh [options]

Link repo skills into each agent's skills directory. Safe to re-run.

  ~/.agents/skills         -> .agents/skills          (Codex; whole directory)
  ~/.kiro/skills           -> .agents/skills          (Kiro; whole directory)
  ~/.claude/skills/<name>  -> .agents/skills/<name>   (Claude Code; per skill)

Claude Code's directory also holds skills from other sources (e.g. synced/),
so it gets one link per skill. Links there that point into this repo but whose
skill no longer exists are removed. Real files and directories are never
touched; they are reported and the script exits non-zero.

Options:
  -n, --dry-run   Show what would change without writing anything
  -h, --help      Show this help

Environment overrides: AGENTS_SKILLS_DIR, KIRO_SKILLS_DIR, CLAUDE_SKILLS_DIR
EOF_USAGE
}

die() {
  echo "Error: $*" >&2
  exit 1
}

dry_run=false
while (($# > 0)); do
  case "$1" in
    -n | --dry-run)
      dry_run=true
      shift
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

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
source_dir="$repo_root/.agents/skills"
[[ -d "$source_dir" ]] || die "source directory does not exist: $source_dir"

dir_link_targets=(
  "${AGENTS_SKILLS_DIR:-$HOME/.agents/skills}"
  "${KIRO_SKILLS_DIR:-$HOME/.kiro/skills}"
)
claude_dir="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

conflicts=0

run() {
  if [[ "$dry_run" == true ]]; then
    echo "  $*"
  else
    "$@"
  fi
}

conflict() {
  echo "Skipping $1 (exists and is not a link to this repo; move it away and re-run)" >&2
  conflicts=$((conflicts + 1))
}

# Point dest at src, replacing only a symlink or an empty directory.
link_path() {
  local src="$1" dest="$2"

  if [[ -L "$dest" ]]; then
    [[ "$(readlink "$dest")" != "$src" ]] || return 0
    echo "Relinking $dest"
    run ln -sfn "$src" "$dest"
  elif [[ -d "$dest" && -z "$(ls -A "$dest")" ]]; then
    echo "Linking $dest (replacing empty directory)"
    run rmdir "$dest"
    run ln -s "$src" "$dest"
  elif [[ -e "$dest" ]]; then
    conflict "$dest"
  else
    echo "Linking $dest"
    [[ -d "$(dirname "$dest")" ]] || run mkdir -p "$(dirname "$dest")"
    run ln -s "$src" "$dest"
  fi
}

for dest in "${dir_link_targets[@]}"; do
  link_path "$source_dir" "$dest"
done

[[ -d "$claude_dir" ]] || run mkdir -p "$claude_dir"

shopt -s nullglob
for skill_path in "$source_dir"/*; do
  [[ -d "$skill_path" && -f "$skill_path/SKILL.md" ]] || continue
  dest="$claude_dir/$(basename "$skill_path")"
  if [[ -L "$dest" && "$(readlink "$dest")" != "$source_dir"/* ]]; then
    conflict "$dest"
    continue
  fi
  link_path "$skill_path" "$dest"
done

for dest in "$claude_dir"/*; do
  [[ -L "$dest" && "$(readlink "$dest")" == "$source_dir"/* ]] || continue
  if [[ ! -f "$dest/SKILL.md" ]]; then
    echo "Pruning $dest"
    run rm "$dest"
  fi
done

if ((conflicts > 0)); then
  echo "$conflicts path(s) skipped." >&2
  exit 1
fi
