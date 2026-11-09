# Each git hook that runs pnpm sources this file first. Shells that agents and GUI tools start
# often don't have pnpm on PATH. Then this file puts .husky/bin first on PATH, so the hook and each
# command that it starts run the pnpm script there. When pnpm is on PATH, nothing changes.
if ! command -v pnpm >/dev/null 2>&1; then
  PATH="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/bin:$PATH"
  export PATH
fi
