import { env } from 'node:process';

// The variables that tell git which repository to use, as `git rev-parse --local-env-vars` lists
// them. Git sets some of them when it runs a hook: in a linked worktree, the pre-push hook gets
// GIT_DIR. A `git` that a test starts would inherit them and change this repository instead of the
// test's own, so a test must leave them out.
const REPOSITORY_VARIABLES = new Set([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_PARAMETERS',
  'GIT_DIR',
  'GIT_GRAFT_FILE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_REPLACE_REF_BASE',
  'GIT_SHALLOW_FILE',
  'GIT_WORK_TREE',
]);

/**
 * Returns `base` without the variables that tell git which repository to use. Use it for each
 * child process that runs git, a git hook or a package manager.
 */
export function withoutGitRepository(base: typeof env = env): typeof env {
  return Object.fromEntries(
    Object.entries(base).filter(
      // GIT_CONFIG_KEY_n and GIT_CONFIG_VALUE_n go with GIT_CONFIG_COUNT.
      ([name]) => !REPOSITORY_VARIABLES.has(name) && !/^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(name)
    )
  );
}
