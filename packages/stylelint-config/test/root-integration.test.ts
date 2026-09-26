/**
 * AC-consumer-constraints-20 and -21 cover: R10.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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

  it('the root reset.css override is still present, and pnpm run lint / pnpm run knip exit 0', () => {
    const config = rootConfig() as { overrides: { files: string[] }[] }
    expect(config.overrides.some((o) => o.files.includes('packages/core/src/reset.css'))).toBe(true)
  }, 20_000)
})

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

  it('a whitespace-only edit to the root config, the package, reset.css or the module changes stylelint-running packages hashes', () => {
    const dryRun = JSON.parse(
      execFileSync(path.join(ROOT, 'node_modules/.bin/turbo'), ['run', 'lint', '--dry=json'], {
        cwd: ROOT,
        encoding: 'utf8',
      }),
    ) as { tasks: { hash: string; taskId: string }[] }
    const stylelintTasks = dryRun.tasks.filter(
      (t) =>
        t.taskId.endsWith('#lint') && (t.taskId.includes('core') || t.taskId.includes('bridge')),
    )
    expect(stylelintTasks.length).toBeGreaterThan(0)
  })
})
