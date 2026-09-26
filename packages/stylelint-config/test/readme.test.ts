/**
 * AC-consumer-constraints-29 covers: R18.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import stylelint, { type Config } from 'stylelint'
import { describe, expect, it } from 'vitest'

import config from '../index.js'
import { bareNamesPerListOrTable, checkedPropertyNames } from './helpers/bare-names.ts'
import { cssPropertyNames } from './helpers/css-properties.ts'
import { packTarball } from './helpers/pack.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../..')

function jsonFences(markdown: string): string[] {
  return markdown
    .matchAll(/```json\n([\s\S]*?)```/g)
    .map((m) => m[1]!.trim())
    .toArray()
}

async function isReported(config: Config, code: string): Promise<boolean> {
  const result = await stylelint.lint({ code, config })
  return result.results[0]!.warnings.length > 0
}

/**
 * Each "does not check" rule the README states, as the words the README uses for it and the
 * fixture that shows it holding under the default export. A row fails when the README stops
 * saying it or when the config stops behaving as it says, so the two are corrected together.
 */
const STATED_LIMITATIONS: readonly (readonly [string, string, boolean])[] = [
  ['A `var()` passes whatever it names', '.a { color: var(--nave-not-declared); }', false],
  ['`light-dark(#fff, var(--x))`', '.a { color: light-dark(#fff, var(--x)); }', false],
  ['Properties outside its own list are not checked', '.a { width: 13px; }', false],
  ['`border: 1px solid red` is reported', '.a { border: 1px solid red; }', true],
  ['`border: red 1px solid` is not', '.a { border: red 1px solid; }', false],
  ['`border: 1px red`', '.a { border: 1px red; }', false],
  ['`text-decoration: underline red`', '.a { text-decoration: underline red; }', false],
  ['`border-block: 1px solid red`', '.a { border-block: 1px solid red; }', false],
  ['`border-inline-start: 1px solid red`', '.a { border-inline-start: 1px solid red; }', false],
  [
    '`border-block-color: red` written on its own is reported',
    '.a { border-block-color: red; }',
    true,
  ],
  [
    'A comma-separated `transition` list is not checked',
    '.a { transition: opacity 200ms, color 300ms; }',
    false,
  ],
  ['The `font` shorthand is, in effect, not checked', '.a { font: 700 13px/1.2 Arial; }', false],
  ['`font-family: var(--x), sans-serif`', '.a { font-family: var(--x), sans-serif; }', true],
  ['`color: var(--x, red)`', '.a { color: var(--x, red); }', false],
  ['`padding: var(--x, 13px)`', '.a { padding: var(--x, 13px); }', false],
  ['`color: $red`', '.a { color: $red; }', false],
  ['`color: @red`', '.a { color: @red; }', false],
  ['`padding: $space`', '.a { padding: $space; }', false],
]

describe('AC-consumer-constraints-29 covers: R18', () => {
  const tarball = packTarball()

  it('the tarball contains package/README.md and it names the install command', () => {
    expect(tarball.files).toContain('package/README.md')
    const readme = tarball.read('package/README.md')
    expect(readme).toContain('pnpm add -D @navecss/stylelint-config')
  })

  it('the stated peer range and Node floor equal package.json at test time', () => {
    const readme = tarball.read('package/README.md')
    const manifest = JSON.parse(tarball.read('package/package.json')) as {
      engines: { node: string }
      peerDependencies: { stylelint: string }
    }
    expect(readme).toContain(manifest.peerDependencies.stylelint)
    expect(readme).toContain(manifest.engines.node)
  })

  it('the extends fence, used verbatim as a consumer config, reports padding: 13px', async () => {
    const readme = tarball.read('package/README.md')
    const extendsFence = jsonFences(readme).find(
      (f) => f.includes('"extends"') && !f.includes('overrides'),
    )
    expect(extendsFence).toBeDefined()
    const fence = JSON.parse(extendsFence!) as Config
    expect(fence.extends).toEqual(['@navecss/stylelint-config'])
    const result = await stylelint.lint({
      code: '.a { padding: 13px; }',
      config: fence,
      configBasedir: ROOT,
    })
    expect(result.results[0]!.warnings.map((w) => w.rule)).toContain(
      'scale-unlimited/declaration-strict-value',
    )
  })

  it.each(STATED_LIMITATIONS)(
    'the README states "%s", and it holds as a fixture',
    async (statement, code, expected) => {
      const readme = tarball.read('package/README.md').replaceAll(/\s+/g, ' ')
      expect(readme).toContain(statement)
      const imported = await import('../index.js')
      expect(await isReported(imported.default, code)).toBe(expected)
    },
  )

  it('a preprocessor variable passes as a part, not as a whole value: padding: 13px $space is reported', async () => {
    const imported = await import('../index.js')
    expect(await isReported(imported.default, '.a { padding: 13px $space; }')).toBe(true)
  })

  it('a consumer strict-value setting of its own replaces this one (the README says so)', async () => {
    const readme = tarball.read('package/README.md').replaceAll(/\s+/g, ' ')
    expect(readme).toContain('A rule your own stylelint config also sets replaces')
    const imported = await import('../index.js')
    const config = imported.default
    const overridden = {
      ...config,
      rules: {
        ...config.rules,
        'scale-unlimited/declaration-strict-value': [['color'], { ignoreFunctions: false }],
      },
    }
    expect(await isReported(overridden, '.a { padding: 13px; }')).toBe(false)
  })

  it('the font-family report names the failing part, sans-serif', async () => {
    const imported = await import('../index.js')
    const result = await stylelint.lint({
      code: '.a { font-family: var(--x), sans-serif; }',
      config: imported.default,
    })
    expect(result.results[0]!.warnings[0]?.text).toContain('sans-serif')
  })

  const checkedNames = checkedPropertyNames(
    (config.rules!['scale-unlimited/declaration-strict-value'] as [string[]])[0],
    cssPropertyNames(),
  )
  const mostBareNamesInOneListOrTable = (markdown: string): number =>
    Math.max(0, ...bareNamesPerListOrTable(markdown, checkedNames).map((names) => names.length))

  it('links to the file holding the property list, and no list or table in it holds more than one checked property name in bare form', () => {
    const readme = tarball.read('package/README.md')
    expect(readme).toMatch(/\[`index\.js`\]\(index\.js\)/)
    expect(checkedNames.size).toBeGreaterThan(19)
    expect(mostBareNamesInOneListOrTable(readme)).toBeLessThanOrEqual(1)
  })

  it.each([
    ['a bullet list of code spans', '- `color`\n- `padding`\n- `margin`\n- `gap`\n'],
    ['a plain-text bullet list', '- fill\n- stroke\n'],
    ['a nested list', '- Checked:\n  - `opacity`.\n  - `z-index`,\n'],
    [
      'a table of names',
      '| Property | Admits |\n| --- | --- |\n| `font-size` | `1em` |\n| `opacity` | `0` |\n',
    ],
    ['an inline run of names in one item', '- Checked: `fill`, `stroke`, `gap`.\n'],
    ['a loose list, blank lines between its items', '- `fill`\n\n- `stroke`\n'],
  ])('a copy of the list pasted as %s counts more than one', (_, pasted) => {
    const readme = tarball.read('package/README.md')
    expect(mostBareNamesInOneListOrTable(`${readme}\n\n${pasted}`)).toBeGreaterThan(1)
  })

  it('names used in example declarations or as words in a sentence are not counted', () => {
    const examples = [
      '- `color: var(--x, red)` and `padding: $space` pass.',
      '- The color and padding entries admit a var().',
      '- `font-family: var(--x), sans-serif` is reported.',
    ].join('\n')
    expect(mostBareNamesInOneListOrTable(examples)).toBe(0)
  })

  it('the adoption fence, used verbatim over stylelint-config-standard, reports padding: 13px only in files matching its overrides', async () => {
    const readme = tarball.read('package/README.md')
    const overridesFence = jsonFences(readme).find((f) => f.includes('overrides'))
    expect(overridesFence).toBeDefined()
    const fence = JSON.parse(overridesFence!) as Config
    const reportsIn = async (file: string): Promise<string[]> => {
      const result = await stylelint.lint({
        code: '.a { padding: 13px; }',
        codeFilename: path.join(ROOT, file),
        config: { extends: ['stylelint-config-standard'], ...fence },
        configBasedir: ROOT,
      })
      return result.results[0]!.warnings.map((w) => w.rule)
    }
    expect(await reportsIn('src/new/a.css')).toContain('scale-unlimited/declaration-strict-value')
    expect(await reportsIn('src/old/a.css')).not.toContain(
      'scale-unlimited/declaration-strict-value',
    )
  })

  it("the root README's Packages table links packages/stylelint-config", () => {
    const rootReadme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')
    expect(rootReadme).toMatch(/\[`@navecss\/stylelint-config`\]\(packages\/stylelint-config/)
  })

  it('no site describing the check says it is scoped to Nave tokens: any var() passes', () => {
    const scoped = /tokens-only|against `?--nave-|use a token/i
    const manifest = JSON.parse(tarball.read('package/package.json')) as { description: string }
    const rootReadme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')
    const claudeMd = readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8')
    const coreReadme = readFileSync(path.join(ROOT, 'packages/core/README.md'), 'utf8')
    const coreStart = coreReadme.indexOf('## Editor, linter and coding agent')
    expect(coreStart).toBeGreaterThan(-1)
    const sites = {
      'README.md': tarball.read('package/README.md'),
      'package.json description': manifest.description,
      'index.js': tarball.read('package/index.js'),
      'index.d.ts': tarball.read('package/index.d.ts'),
      "root README's Packages row": rootReadme
        .split('\n')
        .filter((line) => line.includes('[`@navecss/stylelint-config`]'))
        .join('\n'),
      "CLAUDE.md's Architecture line": claudeMd
        .split('\n')
        .filter((line) => line.startsWith('packages/stylelint-config/'))
        .join('\n'),
      "core README's editor and linter section": coreReadme.slice(
        coreStart,
        coreReadme.indexOf('\n## ', coreStart + 1),
      ),
    }
    for (const [site, text] of Object.entries(sites)) {
      expect(text.trim().length, `${site} is empty`).toBeGreaterThan(0)
    }
    const scopedSites = Object.entries(sites)
      .filter(([, text]) => scoped.test(text))
      .map(([site]) => site)
    expect(scopedSites).toEqual([])
  })

  it("CLAUDE.md's Architecture block names packages/stylelint-config/", () => {
    const claudeMd = readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8')
    expect(claudeMd).toContain('packages/stylelint-config/')
  })
})
