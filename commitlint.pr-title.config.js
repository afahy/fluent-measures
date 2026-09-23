import base from './commitlint.config.js';

// Rules for pull request titles only. With squash merging, the title becomes the commit on
// `main`, so it gets stricter checks than the individual commits in a PR.
export default {
  ...base,
  // Commitlint skips merge, revert, fixup!/squash! and version-only messages by default.
  // Commits keep that behavior so "Update branch" merge commits pass, but a title must
  // always be a Conventional Commit.
  defaultIgnores: false,
  plugins: [
    {
      rules: {
        // Not \b: it treats "_" as a word character, so "_AFA-1_" would slip through.
        'no-ticket-id': ({ header }) => [
          !/(?<![a-z0-9])afa-\d+/i.test(header ?? ''),
          'put the Linear ticket on the Fixes line of the PR description, not in the title',
        ],
      },
    },
  ],
  rules: {
    ...base.rules,
    // Squash merging appends " (#NN)", and the commit on `main` must fit in 72.
    'header-max-length': [2, 'always', 65],
    'no-ticket-id': [2, 'always'],
  },
};
