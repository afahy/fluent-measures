#!/bin/sh
# setup.sh: makes the package and the reviewer folders of a usability round.
#
#   sh setup.sh package <repo> <run>
#       Builds <repo> and packs it to <run>/pkg/. Run it once per run, from the commit that the
#       docs describe (origin/main or the ticket worktree). Then run grade.mjs selfcheck.
#   sh setup.sh reviewer <run> <round> <reviewer-id> <page-url> <repo> [width] [scheme]
#       Makes <run>/round-<round>/reviewer-<id>/ with a sandbox project that has the packed
#       package installed, an empty trace, and env.sh. With HOLDOUT=1, tasks.md also gets the
#       holdout tasks H1 and H2 (baseline and final rounds only).
set -eu
kit=$(cd "$(dirname "$0")" && pwd)

case "${1:-}" in
package)
  repo=$2 run=$3
  mkdir -p "$run/pkg"
  (cd "$repo" && PATH="$repo/.husky/bin:$PATH" pnpm build >/dev/null &&
    PATH="$repo/.husky/bin:$PATH" pnpm pack --pack-destination "$run/pkg" >/dev/null)
  ls "$run"/pkg/*.tgz
  git -C "$repo" rev-parse HEAD >"$run/pkg/commit.txt"
  echo "Packed $(cat "$run/pkg/commit.txt")."
  ;;
reviewer)
  run=$2 round=$3 id=$4 page=$5 repo=$6 width=${7:-1440} scheme=${8:-light}
  tarball=$(ls "$run"/pkg/*.tgz | head -1)
  dir="$run/round-$round/reviewer-$id"
  if [ -e "$dir" ]; then echo "$dir exists. Use a new reviewer id." >&2; exit 1; fi
  mkdir -p "$dir/sandbox" "$dir/shots"
  cat >"$dir/sandbox/package.json" <<EOF
{ "name": "my-app", "private": true, "type": "module" }
EOF
  (cd "$dir/sandbox" && npm install --no-audit --no-fund --offline "$tarball" >/dev/null 2>&1 ||
    npm install --no-audit --no-fund "$tarball" >/dev/null)
  # Reviewers may read $KIT, so it holds only the two tools, never the grader or the holdout tasks.
  mkdir -p "$run/reviewer-kit"
  cp "$kit/browse.mjs" "$kit/try.mjs" "$run/reviewer-kit/"
  : >"$dir/trace.jsonl"
  cp "$kit/tasks.md" "$dir/tasks.md"
  if [ "${HOLDOUT:-0}" = 1 ]; then cat "$kit/tasks-holdout.md" >>"$dir/tasks.md"; fi
  cat >"$dir/env.sh" <<EOF
export PAGE_URL='$page'
export REPO='$repo'
export KIT='$run/reviewer-kit'
export SANDBOX='$dir/sandbox'
export TRACE='$dir/trace.jsonl'
export SHOTS='$dir/shots'
export VIEW_WIDTH='$width'
export VIEW_HEIGHT='900'
export VIEW_SCHEME='$scheme'
EOF
  echo "$dir"
  ;;
*)
  echo "usage: sh setup.sh package <repo> <run> | reviewer <run> <round> <id> <page-url> <repo> [width] [scheme]" >&2
  exit 2
  ;;
esac
