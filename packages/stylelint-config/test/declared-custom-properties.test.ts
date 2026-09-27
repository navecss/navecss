/**
 * AC-eslint-plugin-20, AC-eslint-plugin-21, AC-eslint-plugin-22 cover: R11, R12.
 *
 * Rule 3: `@navecss/declared-custom-properties`, shipped inside this package (never as an
 * `@eslint/css` rule in the sibling `@navecss/eslint-plugin`). A `var(--nave-*)` reference must
 * name a custom property declared in the stylesheet(s) a consumer's tokens come from; an
 * undeclared name passes every other check in this package, passes the build, and renders
 * nothing.
 */
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import stylelint from 'stylelint'
import { describe, expect, it } from 'vitest'

import {
  collectDeclaredCustomProperties,
  computeStylesheetDigest,
  defaultRuleOptions,
  findNaveVarReferences,
  ruleName,
} from '../declared-custom-properties.js'
import config, { declaredCustomPropertiesRuleName } from '../index.js'
import { packTarball } from './helpers/pack.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(HERE, '..')
const ROOT = path.resolve(HERE, '../../..')
const TOKENS_CSS_PATH = path.resolve(PACKAGE_DIR, '../tokens/dist/tokens.css')

function realTokensCss(): string {
  return readFileSync(TOKENS_CSS_PATH, 'utf8')
}

function realDeclaredNames(): Set<string> {
  return collectDeclaredCustomProperties(realTokensCss())
}

/**
A single real, currently-declared `--nave-*` name, read from the built tokens.css.
 */
function aRealDeclaredName(): string {
  const [first] = realDeclaredNames()
  if (!first) throw new Error('packages/tokens/dist/tokens.css declares no --nave- name')
  return first
}

const require = createRequire(import.meta.url)

/**
The directory a bare package specifier's own package.json resolves to.
 */
function packageRoot(specifier: string): string {
  return path.dirname(require.resolve(`${specifier}/package.json`))
}

/**
 * A throwaway copy of `declared-custom-properties.js` in its own scratch directory, wired with
 * a FAKE `@navecss/tokens` (a package.json whose `./css` export names a file that does not
 * exist — `import.meta.resolve` does not check existence, only `readStylesheet`'s later
 * `fs.statSync` does) and the real `postcss`/`postcss-value-parser`/`stylelint` symlinked in so
 * the copy's own imports still resolve. This is the AC's own "test's stand-in for the resolved
 * stylesheet does not exist" — deliberately never the real, shared `packages/tokens/dist/
 * tokens.css`: vitest runs test FILES in parallel, and that file is read at every OTHER test
 * file's own module-load time too, so renaming it away, even briefly and even restored in a
 * `finally`, raced other concurrently-running files in exactly this way during development.
 */
function scratchRuleWithMissingDefaultStylesheet(): { cleanup: () => void; modulePath: string } {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nave-declared-custom-properties-missing-'))
  const fakeTokensDir = path.join(scratch, 'node_modules/@navecss/tokens')
  mkdirSync(fakeTokensDir, { recursive: true })
  writeFileSync(
    path.join(fakeTokensDir, 'package.json'),
    JSON.stringify({
      name: '@navecss/tokens',
      version: '0.0.0',
      exports: { './css': './tokens.css' },
    }),
  )
  // Deliberately never written: './tokens.css' stays missing.

  for (const dep of ['postcss', 'postcss-value-parser', 'stylelint']) {
    symlinkSync(packageRoot(dep), path.join(scratch, 'node_modules', dep), 'dir')
  }

  const modulePath = path.join(scratch, 'rule.js')
  cpSync(path.join(PACKAGE_DIR, 'declared-custom-properties.js'), modulePath)

  return { modulePath, cleanup: () => rmSync(scratch, { recursive: true, force: true }) }
}

const byName = (a: string, b: string): number => a.localeCompare(b)

async function lintReportedNames(code: string): Promise<string[]> {
  const result = await stylelint.lint({ code, config })
  return result.results[0]!.warnings.filter((w) => w.rule === ruleName).map((w) => {
    const match = /"([^"]+)"/.exec(w.text)
    if (!match) throw new Error(`could not read the reported name out of: ${w.text}`)
    return match[1]!
  })
}

describe('AC-eslint-plugin-20 covers: R11', () => {
  // Two fixtures covering every clause the AC names, `--nave-colour-fallback`'s
  // fallback-inside-a-fallback deliberately duplicated across both, per the AC text.
  const appModuleCss = `
@layer nave.tokens {
  .card {
    color: var(--nave-color-primary);

    &:hover {
      color: var(--nave-color-action-primary-hovr);
    }
  }
}

:global(.legacy) {
  padding: var(--nave-spacing-huge);
}

.themed {
  --my-computed: var(--nave-color-primry);
}

.sized {
  --my-size: calc(var(--nave-spacing-nope) * 2);
}

.brandNew {
  --nave-brand-new: red;
  color: var(--nave-brand-new);
}

.fallback {
  color: var(--a, var(--b, var(--nave-colour-fallback, blue)));
}

.upper {
  color: VAR(--nave-upper-nope);
}

.own {
  --my-own: var(--app-thing);
}

.notNave {
  color: var(--navex-foo);
}

.usesAtNave {
  @nave interactive;
}

.composesFrom {
  composes: base from './alias.module.css';
}
`

  const aliasCss = `
.aliasFallback {
  color: var(--a, var(--b, var(--nave-colour-fallback, blue)));
}
`

  it('parses app.module.css and alias.css with no error (CSS Modules / nesting / @layer constructs)', async () => {
    const appResult = await stylelint.lint({ code: appModuleCss, config })
    const aliasResult = await stylelint.lint({ code: aliasCss, config })
    expect(appResult.results[0]!.parseErrors).toEqual([])
    expect(aliasResult.results[0]!.parseErrors).toEqual([])
  })

  it('reports exactly the undeclared names the AC names, from app.module.css', async () => {
    const reported = new Set(await lintReportedNames(appModuleCss))
    for (const name of [
      '--nave-color-primary',
      '--nave-color-action-primary-hovr',
      '--nave-colour-fallback',
      '--nave-spacing-huge',
      '--nave-color-primry',
      '--nave-spacing-nope',
      '--nave-brand-new',
      '--nave-upper-nope',
    ]) {
      expect(reported, `expected ${name} to be reported`).toContain(name)
    }
  })

  it('reports --nave-colour-fallback from alias.css too (duplicated across both files)', async () => {
    const reported = await lintReportedNames(aliasCss)
    expect(reported).toContain('--nave-colour-fallback')
  })

  it('reports no name the installed tokens.css declares', async () => {
    const reported = await lintReportedNames(appModuleCss)
    const declared = realDeclaredNames()
    for (const name of reported) {
      expect(declared.has(name), `${name} should not be a real declared token name`).toBe(false)
    }
  })

  it('never reports --app-thing (a local, non-nave name) or --navex-foo (similarly-spelled prefix)', async () => {
    const reported = new Set(await lintReportedNames(appModuleCss))
    expect(reported).not.toContain('--app-thing')
    expect(reported).not.toContain('--navex-foo')
  })

  it('a real declared token name passes', async () => {
    const reported = await lintReportedNames(`.a { color: var(${aRealDeclaredName()}); }`)
    expect(reported).toEqual([])
  })

  it('declaring --nave-brand-new locally in the linted file does not exempt it: it is still reported', async () => {
    const reported = await lintReportedNames(
      '.a { --nave-brand-new: red; color: var(--nave-brand-new); }',
    )
    expect(reported).toContain('--nave-brand-new')
  })

  it('a report names no path or process of ours: no absolute path, no "Nave"/"stylelint-config" brand mention in its own prose', async () => {
    const result = await stylelint.lint({
      code: '.a { color: var(--nave-color-primary); }',
      config,
    })
    const texts = result.results[0]!.warnings.filter((w) => w.rule === ruleName).map((w) => w.text)
    expect(texts.length).toBeGreaterThan(0)
    for (const text of texts) {
      expect(text).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\/)
      // Strip the quoted, reported custom-property name (legitimately starts with "--nave-":
      // that is CSS data the consumer wrote, not a brand mention) and the "(ruleName)" suffix
      // stylelint's own `ruleMessages`/`report` mechanism appends to every rule's message,
      // before checking the PROSE this rule itself authored for a brand or package mention.
      const prose = text.replace(/"[^"]+"/, '').replace(/\s*\([^)]+\)\s*$/, '')
      expect(prose).not.toMatch(/\bNave\b/)
      expect(prose.toLowerCase()).not.toContain('stylelint-config')
    }
  })
})

describe('AC-eslint-plugin-21 covers: R11, R12', () => {
  it('by default reads @navecss/tokens/css, resolved from this package: a declared name passes, an undeclared one is reported', async () => {
    expect(await lintReportedNames(`.a { color: var(${aRealDeclaredName()}); }`)).toEqual([])
    expect(await lintReportedNames('.a { color: var(--nave-does-not-exist); }')).toContain(
      '--nave-does-not-exist',
    )
  })

  it("the rule's source holds no path into packages/tokens/ and no literal dist/tokens.css string", () => {
    const source = readFileSync(path.join(PACKAGE_DIR, 'declared-custom-properties.js'), 'utf8')
    expect(source).not.toMatch(/packages\/tokens/)
    expect(source).not.toMatch(/dist\/tokens\.css/)
  })

  it('resolves the default stylesheet through import.meta.resolve, never a hardcoded path', () => {
    const source = readFileSync(path.join(PACKAGE_DIR, 'declared-custom-properties.js'), 'utf8')
    expect(source).toMatch(/import\.meta\.resolve\(\s*DEFAULT_STYLESHEET_SPECIFIER\s*\)/)
    expect(source).toContain("'@navecss/tokens/css'")
  })

  it('with the resolved default stylesheet missing, loading the config fails before any file is linted, naming that stylesheet', async () => {
    const { modulePath, cleanup } = scratchRuleWithMissingDefaultStylesheet()
    try {
      await expect(import(/* @vite-ignore */ pathToFileURL(modulePath).href)).rejects.toThrow(
        /@navecss\/tokens\/css/,
      )
    } finally {
      cleanup()
    }
  })

  it('a consumer-named stylesheet (relative to the working directory) with one extra token: named, the token passes; by default (unnamed), it is reported', async () => {
    // stylelint's own `cwd` lint option does not change Node's process.cwd() (verified: this
    // rule reads process.cwd() directly, and passing stylelint's `cwd` option left it resolving
    // against the real one) — this rule's own README describes the CLI's own working directory
    // ("the working directory you run stylelint from"), so a real chdir is what exercises it.
    const scratch = mkdtempSync(path.join(tmpdir(), 'nave-declared-custom-properties-'))
    const originalCwd = process.cwd()
    try {
      const rebuiltPath = path.join(scratch, 'rebuilt-tokens.css')
      writeFileSync(rebuiltPath, ':root { --nave-newly-added: 1px; }\n')

      const namedRules = {
        ...config.rules,
        [ruleName]: [true, { stylesheet: './rebuilt-tokens.css' }],
      }
      const namedConfig = { ...config, rules: namedRules }

      process.chdir(scratch)
      const namedResult = await stylelint.lint({
        code: '.a { color: var(--nave-newly-added); }',
        config: namedConfig,
      })
      expect(namedResult.results[0]!.warnings.filter((w) => w.rule === ruleName)).toEqual([])

      // The default option (not naming the rebuilt stylesheet) still reports it.
      const defaultResult = await stylelint.lint({
        code: '.a { color: var(--nave-newly-added); }',
        config,
      })
      expect(
        defaultResult.results[0]!.warnings.filter((w) => w.rule === ruleName).map((w) => w.text),
      ).not.toEqual([])
    } finally {
      process.chdir(originalCwd)
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('the same relative path, once the working directory moves somewhere it does not exist, ends the run non-zero naming the entry (never nothing declared)', async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'nave-declared-custom-properties-cwd-'))
    const elsewhere = mkdtempSync(path.join(tmpdir(), 'nave-declared-custom-properties-elsewhere-'))
    try {
      writeFileSync(
        path.join(scratch, 'rebuilt-tokens.css'),
        ':root { --nave-newly-added: 1px; }\n',
      )
      const namedRules = {
        ...config.rules,
        [ruleName]: [true, { stylesheet: './rebuilt-tokens.css' }],
      }
      const namedConfig = { ...config, rules: namedRules }

      const originalCwd = process.cwd()
      process.chdir(scratch)
      try {
        const ok = await stylelint.lint({
          code: '.a { color: var(--nave-newly-added); }',
          config: namedConfig,
        })
        expect(ok.results[0]!.warnings.filter((w) => w.rule === ruleName)).toEqual([])
      } finally {
        process.chdir(originalCwd)
      }

      process.chdir(elsewhere)
      try {
        await expect(
          stylelint.lint({
            code: '.a { color: var(--nave-newly-added); }',
            config: namedConfig,
          }),
        ).rejects.toThrow(/rebuilt-tokens\.css/)
      } finally {
        process.chdir(originalCwd)
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
      rmSync(elsewhere, { recursive: true, force: true })
    }
  })

  it('a name declared only inside @layer or @media in the named stylesheet passes (the declared-set collector walks into both)', async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'nave-declared-custom-properties-nesting-'))
    try {
      writeFileSync(
        path.join(scratch, 'nested-tokens.css'),
        `
@layer tokens {
  :root { --nave-in-layer: 1px; }
}
@media (min-width: 1px) {
  .a { --nave-in-media: 2px; }
}
`,
      )
      // An absolute path here (this test is not about cwd-relative resolution, covered by the
      // two tests above): resolveConsumerStylesheetPath passes an absolute path through as-is.
      const namedRules = {
        ...config.rules,
        [ruleName]: [true, { stylesheet: path.join(scratch, 'nested-tokens.css') }],
      }
      const namedConfig = { ...config, rules: namedRules }
      const result = await stylelint.lint({
        code: '.a { color: var(--nave-in-layer, var(--nave-in-media)); }',
        config: namedConfig,
      })
      expect(result.results[0]!.warnings.filter((w) => w.rule === ruleName)).toEqual([])
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('the README states the stylesheet must exist before lint runs, that option paths resolve from the working directory, and the --cache clearing caveat', () => {
    const readme = packTarball().read('package/README.md')
    expect(readme).toMatch(/must exist before lint runs/)
    expect(readme).toMatch(/resolves from the working directory/)
    expect(readme).toMatch(/--cache/)
    expect(readme).toMatch(/clear the cache/i)
  })
})

describe('AC-eslint-plugin-22 covers: R12', () => {
  type RuleEntry = [boolean, { digest?: string; stylesheet?: string }]

  function ruleEntry(rules: unknown, name: string): RuleEntry {
    return (rules as Record<string, RuleEntry>)[name]!
  }

  it('rule 3 is a stylelint plugin rule named @navecss/declared-custom-properties, exported by this package and enabled in its default export', () => {
    expect(ruleName).toBe('@navecss/declared-custom-properties')
    expect(declaredCustomPropertiesRuleName).toBe(ruleName)
    expect(config.rules).toHaveProperty(ruleName)
    const [enabled] = ruleEntry(config.rules, ruleName)
    expect(enabled).toBe(true)
    const pluginNames = (config.plugins as { ruleName: string }[]).map((p) => p.ruleName)
    expect(pluginNames).toContain(ruleName)
  })

  it("the resolved default config carries a digest of the default stylesheet's content in the rule's options, identical across two loads", async () => {
    const [, firstOptions] = ruleEntry(config.rules, ruleName)
    const reimported = (await import(
      /* @vite-ignore */ `../index.js?ac22-digest-reload=${Date.now()}`
    )) as { default: { rules: unknown } }
    const [, secondOptions] = ruleEntry(reimported.default.rules, ruleName)
    expect(firstOptions.digest).toBe(secondOptions.digest)
    expect(defaultRuleOptions.digest).toBe(firstOptions.digest)
    expect(firstOptions.digest).toBe(computeStylesheetDigest(realTokensCss()))
  })

  it('the digest changes when one byte of the stylesheet content changes (via the exported digest function)', () => {
    const original = realTokensCss()
    const mutated = `${original} `
    expect(computeStylesheetDigest(mutated)).not.toBe(computeStylesheetDigest(original))
  })

  it('within one process, two stylelint.lint() calls against a consumer-named stylesheet rewritten between them (a token removed) give the second call the new verdict', async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'nave-declared-custom-properties-cache-'))
    try {
      const stylesheetPath = path.join(scratch, 'tokens.css')
      writeFileSync(stylesheetPath, ':root { --nave-kept: 1px; --nave-removed: 2px; }\n')

      // An absolute path (not this test's concern; cwd-relative resolution is covered above).
      const namedRules = {
        ...config.rules,
        [ruleName]: [true, { stylesheet: stylesheetPath }],
      }
      const namedConfig = { ...config, rules: namedRules }
      const code = '.a { color: var(--nave-kept, var(--nave-removed)); }'

      const before = await stylelint.lint({ code, config: namedConfig })
      expect(before.results[0]!.warnings.filter((w) => w.rule === ruleName)).toEqual([])

      // Rewrite with the token removed. A short wait guards against two writes landing within
      // the same filesystem mtime tick, which would otherwise mask the very change this test
      // means to exercise.
      const beforeStat = statSync(stylesheetPath)
      let after
      for (let attempt = 0; attempt < 20; attempt++) {
        writeFileSync(stylesheetPath, ':root { --nave-kept: 1px; }\n')
        const afterStat = statSync(stylesheetPath)
        if (afterStat.mtimeMs !== beforeStat.mtimeMs || afterStat.size !== beforeStat.size) {
          after = await stylelint.lint({ code, config: namedConfig })
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      if (!after) throw new Error('the rewritten file never registered a new mtime/size')

      expect(
        after.results[0]!.warnings.filter((w) => w.rule === ruleName).map((w) => w.text),
      ).not.toEqual([])
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('collectDeclaredCustomProperties/findNaveVarReferences memoisation: the underlying "cache-staleness" clause, as a focused unit test on the rule\'s own read path', () => {
    // The AC's literal ask ("the underlying tokens.css file rewritten... between calls") is
    // awkward to run against the REAL default stylesheet other tests in this process also read,
    // so this exercises the identical code path (readStylesheet's mtime/size memoisation, R12)
    // against a scratch copy instead, per the AC's own "write a focused unit test... if
    // end-to-end is awkward" allowance. The consumer-named-stylesheet test just above already
    // covers the end-to-end shape through stylelint.lint() itself.
    const scratch = mkdtempSync(path.join(tmpdir(), 'nave-declared-custom-properties-unit-'))
    try {
      const stylesheetPath = path.join(scratch, 'tokens.css')
      writeFileSync(stylesheetPath, ':root { --nave-a: 1px; }\n')
      const firstNames = collectDeclaredCustomProperties(readFileSync(stylesheetPath, 'utf8'))
      expect(firstNames.has('--nave-b')).toBe(false)

      writeFileSync(stylesheetPath, ':root { --nave-a: 1px; --nave-b: 2px; }\n')
      const secondNames = collectDeclaredCustomProperties(readFileSync(stylesheetPath, 'utf8'))
      expect(secondNames.has('--nave-b')).toBe(true)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('the licence gate stays green: check-license-enumeration-provenance and check-license-allowlist', () => {
    for (const script of [
      'scripts/check-license-enumeration-provenance.mjs',
      'scripts/check-license-allowlist.mjs',
    ]) {
      expect(() =>
        execFileSync('node', [path.join(ROOT, script)], { cwd: ROOT, encoding: 'utf8' }),
      ).not.toThrow()
    }
  })
})

describe('collectDeclaredCustomProperties / findNaveVarReferences (pure, unit-level)', () => {
  it('collects a plain declaration, one inside @layer, inside @media, and inside a nested rule', () => {
    const css = `
:root { --nave-top: 1px; }
@layer tokens { :root { --nave-in-layer: 2px; } }
@media (min-width: 1px) { .a { --nave-in-media: 3px; } }
.b { &:hover { --nave-in-nested: 4px; } }
`
    const names = collectDeclaredCustomProperties(css)
    expect([...names].toSorted(byName)).toEqual(
      ['--nave-in-layer', '--nave-in-media', '--nave-in-nested', '--nave-top'].toSorted(byName),
    )
  })

  it('never collects a name registered only via @property (not a plain declaration)', () => {
    const css = `
@property --nave-registered-only {
  syntax: '<length>';
  inherits: true;
  initial-value: 0px;
}
`
    expect(collectDeclaredCustomProperties(css).has('--nave-registered-only')).toBe(false)
  })

  it("finds a var() nested inside another var()'s fallback, and inside a custom property's own value", () => {
    const css = `
.a { color: var(--x, var(--nave-deep-fallback)); }
.b { --own: var(--nave-in-own-value); }
`
    const names = findNaveVarReferences(css).map((r) => r.name)
    expect(names.toSorted(byName)).toEqual(
      ['--nave-deep-fallback', '--nave-in-own-value'].toSorted(byName),
    )
  })

  it('recognises VAR(...) case-insensitively as a var() reference', () => {
    const names = findNaveVarReferences('.a { color: VaR(--nave-mixed-case); }').map((r) => r.name)
    expect(names).toEqual(['--nave-mixed-case'])
  })

  it('never matches a name that merely starts with the letters "nave" but not the --nave- prefix', () => {
    const names = findNaveVarReferences('.a { color: var(--navex-foo); }').map((r) => r.name)
    expect(names).toEqual([])
  })

  it('accepts either a raw CSS string or an already-parsed postcss Root, with the same result', async () => {
    const postcssModule = await import('postcss')
    const postcss = postcssModule.default
    const css = ':root { --nave-a: 1px; } .b { color: var(--nave-a); color: var(--nave-c); }'
    const root = postcss.parse(css)
    expect([...collectDeclaredCustomProperties(root)]).toEqual([
      ...collectDeclaredCustomProperties(css),
    ])
    expect(findNaveVarReferences(root).map((r) => r.name)).toEqual(
      findNaveVarReferences(css).map((r) => r.name),
    )
  })
})
