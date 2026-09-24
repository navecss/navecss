export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Enforce package name scopes on all commits.
    // This keeps the changelog organised by package and enables
    // Changesets to correctly attribute changes.
    'scope-enum': [
      2,
      'always',
      [
        'tokens', // @navecss/tokens
        'core', // @navecss/core
        'bridge', // @navecss/bridge
        'cli', // @navecss/cli
        'repo', // root-level changes (config, CI, docs)
        'deps', // dependency updates
        'release', // version bumps, changelog
      ],
    ],
    'scope-case': [2, 'always', 'lower-case'],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'type-enum': [
      2,
      'always',
      [
        'feat', // new feature
        'fix', // bug fix
        'chore', // maintenance, no production code change
        'docs', // documentation only
        'test', // tests only
        'refactor', // code restructuring, no behaviour change
        'perf', // performance improvement
        'ci', // CI/CD changes
        'build', // build system changes
        'style', // formatting, no logic change
        'revert', // revert a previous commit
      ],
    ],
    // Body and footer are optional but if present must have a blank line separator
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
  },
}
