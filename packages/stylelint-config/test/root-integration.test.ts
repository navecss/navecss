/**
 * AC-consumer-constraints-20 and -21 cover: R10.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import stylelint from 'stylelint'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../..')

function rootConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(ROOT, '.stylelintrc.json'), 'utf8')) as Record<
    string,
    unknown
  >
}

function spawnSyncNode(args: string[], cwd: string): ReturnType<typeof spawnSync> {
  return spawnSync('node', args, { cwd, encoding: 'utf8' })
}

describe('AC-consumer-constraints-20 covers: R10, R12', () => {
  it('extends lists stylelint-config-standard, then @navecss/stylelint-config, then the outline-guard module', () => {
    const config = rootConfig() as { extends: string[] }
    expect(config.extends).toEqual([
      'stylelint-config-standard',
      '@navecss/stylelint-config',
      './stylelint.outline-guard.mjs',
    ])
  })

  it('root devDependencies names @navecss/stylelint-config at workspace:*, resolved to packages/stylelint-config', () => {
    const rootManifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>
    }
    expect(rootManifest.devDependencies['@navecss/stylelint-config']).toBe('workspace:*')

    const resolvedPath = path.dirname(
      execFileSync(
        'node',
        ['-e', "console.log(require.resolve('@navecss/stylelint-config/package.json'))"],
        {
          cwd: ROOT,
          encoding: 'utf8',
        },
      ).trim(),
    )
    expect(realpathSync(resolvedPath)).toBe(
      realpathSync(path.join(ROOT, 'packages/stylelint-config')),
    )
  })

  it('no rule id any config @navecss/stylelint-config exports is a key of the root top-level rules', async () => {
    const config = rootConfig() as { rules: Record<string, unknown> }
    const imported = await import('../index.js')
    const pkgRuleIds = Object.keys(imported.default.rules ?? {})
    for (const ruleId of pkgRuleIds) {
      expect(Object.keys(config.rules)).not.toContain(ruleId)
    }
  })

  it("the outline-guard module's source contains no copy of the guard's pattern", () => {
    const source = readFileSync(path.join(ROOT, 'stylelint.outline-guard.mjs'), 'utf8')
    expect(source).not.toMatch(/\^\(none\|0\)\$/)
    expect(source).toMatch(/stylelintConfig\.rules/)
  })

  it('a scratch copy of the module against a stand-in package that no longer ships the guard throws (the negative control)', () => {
    const scratchTmp = mkdtempSync(path.join(tmpdir(), 'nave-root-module-negative-'))
    const scratch = realpathSync(scratchTmp)
    try {
      // The module's own source, unmodified, except its ONE import specifier: pointed at a
      // stand-in whose default export has no `declaration-property-value-disallowed-list`
      // rule, exactly the shape the real package would have if the guard were ever dropped.
      // Nothing about the module's own throw logic is touched.
      const guardSource = readFileSync(
        path.join(ROOT, 'stylelint.outline-guard.mjs'),
        'utf8',
      ).replace(
        "import stylelintConfig from '@navecss/stylelint-config'",
        "import stylelintConfig from './stand-in.mjs'",
      )
      writeFileSync(path.join(scratch, 'guard.mjs'), guardSource)
      writeFileSync(
        path.join(scratch, 'stand-in.mjs'),
        'export default { rules: { "scale-unlimited/declaration-strict-value": [[], {}] } }\n',
      )

      const result = spawnSyncNode(['guard.mjs'], scratch)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/declaration-property-value-disallowed-list/)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('the effective strict-value options for a core src file deep-equal the package export', async () => {
    const config = rootConfig()
    const imported = await import('../index.js')
    const resolved = await stylelint.resolveConfig(path.join(ROOT, 'packages/core/src/index.css'), {
      config,
      configBasedir: ROOT,
    })
    expect(resolved?.rules?.['scale-unlimited/declaration-strict-value']).toEqual(
      imported.default.rules?.['scale-unlimited/declaration-strict-value'],
    )
  })

  it('the root reset.css override is still present (pnpm run lint and pnpm run knip are held by the repository gate)', () => {
    const config = rootConfig() as { overrides: { files: string[] }[] }
    expect(config.overrides.some((o) => o.files.includes('packages/core/src/reset.css'))).toBe(true)
  })
})

/**
 * A copy of every tracked file, taken with plain file copies (no links back into this tree),
 * so the whitespace edits below never touch the working tree. It carries no `.git`, and turbo
 * hashes its inputs from the files themselves there.
 */
function scratchCopyOfTrackedFiles(): string {
  const scratchTmp = mkdtempSync(path.join(tmpdir(), 'nave-turbo-hash-'))
  const scratch = realpathSync(scratchTmp)
  const listing = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  const tracked = listing.split('\0').filter((file) => file.length > 0)
  for (const file of tracked) {
    mkdirSync(path.join(scratch, path.dirname(file)), { recursive: true })
    copyFileSync(path.join(ROOT, file), path.join(scratch, file))
  }
  return scratch
}

/**
 * The turbo task hashes of the two packages that run stylelint, from a dry run in `cwd`.
 */
function stylelintTaskHashes(cwd: string): Record<string, string> {
  const dryRun = JSON.parse(
    execFileSync(path.join(ROOT, 'node_modules/.bin/turbo'), ['run', 'lint', '--dry=json'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  ) as { tasks: { hash: string; taskId: string }[] }
  const hashes = Object.fromEntries(
    dryRun.tasks
      .filter((t) => t.taskId === '@navecss/core#lint' || t.taskId === '@navecss/bridge#lint')
      .map((t) => [t.taskId, t.hash]),
  )
  expect(Object.keys(hashes).toSorted((a, b) => a.localeCompare(b))).toEqual([
    '@navecss/bridge#lint',
    '@navecss/core#lint',
  ])
  return hashes
}

describe('AC-consumer-constraints-21 covers: R10', () => {
  it("turbo's lint task inputs contain the literal $TURBO_DEFAULT$ and the new sources", () => {
    const turboConfig = JSON.parse(readFileSync(path.join(ROOT, 'turbo.json'), 'utf8')) as {
      tasks: { lint: { inputs: string[] } }
    }
    const inputs = turboConfig.tasks.lint.inputs
    expect(inputs).toContain('$TURBO_DEFAULT$')
    expect(inputs).toContain('$TURBO_ROOT$/.stylelintrc.json')
    expect(inputs).toContain('$TURBO_ROOT$/stylelint.outline-guard.mjs')
    expect(inputs).toContain('$TURBO_ROOT$/packages/stylelint-config/**')
  })

  it.each([
    ['.stylelintrc.json', ['@navecss/bridge#lint', '@navecss/core#lint']],
    ['packages/stylelint-config/README.md', ['@navecss/bridge#lint', '@navecss/core#lint']],
    ['stylelint.outline-guard.mjs', ['@navecss/bridge#lint', '@navecss/core#lint']],
    ['packages/core/src/reset.css', ['@navecss/core#lint']],
  ])(
    'a whitespace-only edit to %s changes exactly the hashes of %j',
    (file, expectedChanged) => {
      const scratch = scratchCopyOfTrackedFiles()
      try {
        const before = stylelintTaskHashes(scratch)
        const target = path.join(scratch, file)
        writeFileSync(target, `${readFileSync(target, 'utf8')}\n`)
        const after = stylelintTaskHashes(scratch)
        const changed = Object.keys(before)
          .filter((taskId) => before[taskId] !== after[taskId])
          .toSorted((a, b) => a.localeCompare(b))
        expect(changed).toEqual(expectedChanged)
      } finally {
        rmSync(scratch, { recursive: true, force: true })
      }
    },
    120_000,
  )
})
