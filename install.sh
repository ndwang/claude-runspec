#!/usr/bin/env bash
# install.sh — copy the runspec bundle into a target git repo (the mechanical half of setup).
#
# Usage: bash install.sh [TARGET_DIR] [--force]
#   TARGET_DIR  where to install (default: the current directory)
#   --force     overwrite bundle files that already exist (default: skip them and report)
#
# Deterministic and idempotent. The project-fit half (interview, AGENTS.md, test command,
# green baseline) is done by an interactive agent following SETUP.md — this script does not.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$PWD"
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) TARGET="$(cd "$arg" 2>/dev/null && pwd)" || { echo "no such directory: $arg" >&2; exit 2; } ;;
  esac
done

if [ "$SRC" = "$TARGET" ]; then
  echo "Refusing to install runspec into its own source directory." >&2
  exit 2
fi

# The bundle — copied byte-for-byte, relative to the repo root.
FILES=(
  ".claude/workflows/runspec.mjs"
  ".claude/skills/spec-review/SKILL.md"
  ".claude/skills/docs-maintainer/SKILL.md"
  ".claude/skills/test-driver/SKILL.md"
  "SPEC_TEMPLATE.md"
)

installed=()
skipped=()
for f in "${FILES[@]}"; do
  dest="$TARGET/$f"
  if [ -e "$dest" ] && [ "$FORCE" -ne 1 ]; then
    skipped+=("$f")
    continue
  fi
  mkdir -p "$(dirname "$dest")"
  cp "$SRC/$f" "$dest"
  installed+=("$f")
done

# specs/ scaffold (the planner writes specs here; archive/ holds completed ones).
mkdir -p "$TARGET/specs/archive"
[ -e "$TARGET/specs/archive/.gitkeep" ] || : > "$TARGET/specs/archive/.gitkeep"

# .gitignore entries — append only if missing (idempotent).
gi="$TARGET/.gitignore"
if [ -f "$gi" ] && [ -n "$(tail -c1 "$gi")" ]; then printf '\n' >> "$gi"; fi
for entry in ".worktrees/" "run-reports/"; do
  if ! { [ -f "$gi" ] && grep -qxF "$entry" "$gi"; }; then
    printf '%s\n' "$entry" >> "$gi"
  fi
done

echo "runspec → $TARGET"
printf '  installed: %s\n' "${installed[*]:-(none)}"
if [ "${#skipped[@]}" -gt 0 ]; then
  printf '  skipped (already present): %s\n' "${skipped[*]}"
  echo "  re-run with --force to overwrite skipped files."
fi
echo "  next: open Claude Code in the repo and follow SETUP.md to finish setup."
