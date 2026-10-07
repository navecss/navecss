/**
 * AC-consumer-constraints-20 and -21 cover: R10.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
 * The workspace packages whose `lint` script runs stylelint, read from their manifests and not
 * written into the test, so a package that starts or stops running stylelint changes the set and
 * not the test.
 */
function stylelintPackages(): string[] {
  return readdirSync(path.join(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifestPath = path.join(ROOT, 'packages', entry.name, 'package.json')
      if (!existsSync(manifestPath)) {
        return []
      }
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        name: string
        scripts?: Record<string, string>
      }
      return manifest.scripts?.lint?.includes('stylelint') === true ? [manifest.name] : []
    })
    .toSorted((a, b) => a.localeCompare(b))
}

/**
 * The turbo `lint` task hash of every package that runs stylelint, from a dry run in `cwd`. A
 * package with no `lint` task in the dry run fails here rather than dropping out of the set.
 */
function stylelintTaskHashes(cwd: string): Record<string, string> {
  const dryRun = JSON.parse(
    execFileSync(path.join(ROOT, 'node_modules/.bin/turbo'), ['run', 'lint', '--dry=json'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  ) as { tasks: { hash: string; taskId: string }[] }
  const members = stylelintPackages()
  expect(members).toContain('@navecss/core')
  const hashes: Record<string, string> = {}
  for (const name of members) {
    const task = dryRun.tasks.find((t) => t.taskId === `${name}#lint`)
    expect(task, `${name} has a lint task in the dry run`).toBeDefined()
    hashes[`${name}#lint`] = task?.hash ?? ''
  }
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
    ['.stylelintrc.json', 'every package that runs stylelint'],
    ['packages/stylelint-config/README.md', 'every package that runs stylelint'],
    ['stylelint.outline-guard.mjs', 'every package that runs stylelint'],
    ['packages/core/src/reset.css', '@navecss/core, at least'],
  ])(
    'a whitespace-only edit to %s changes the lint hashes of %s',
    (file, scope) => {
      const scratch = scratchCopyOfTrackedFiles()
      try {
        const before = stylelintTaskHashes(scratch)
        const target = path.join(scratch, file)
        writeFileSync(target, `${readFileSync(target, 'utf8')}\n`)
        const after = stylelintTaskHashes(scratch)
        const changed = Object.keys(before)
          .filter((taskId) => before[taskId] !== after[taskId])
          .toSorted((a, b) => a.localeCompare(b))
        const expected =
          scope === '@navecss/core, at least'
            ? ['@navecss/core#lint']
            : Object.keys(before).toSorted((a, b) => a.localeCompare(b))
        expect(changed).toEqual(expect.arrayContaining(expected))
      } finally {
        rmSync(scratch, { recursive: true, force: true })
      }
    },
    120_000,
  )
})
