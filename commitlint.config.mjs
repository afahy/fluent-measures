export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-line-length': [2, 'always', 100],
    'header-max-length': [2, 'always', 72],
    'scope-enum': [2, 'always', ['core', 'docs', 'deps', 'ci', 'config']],
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
  },
};
