/**
 * AC-consumer-constraints-17: the outline guard. Two surfaces, two messages, one pattern: the
 * package's default export prints the consumer message, and this repository's own root config
 * reads the same pattern from the package and prints its house message instead.
 *
 * AC-consumer-constraints-18 and -42 describe two OTHER possible outcomes of the decision on
 * shipping the guard (the guard declined entirely, or shipped only behind an opt-in export) and
 * do not apply here: the guard ships in the default export with no opt-in export, so there is no
 * declined-shape or opt-in-shape config to test against real bytes. Recorded here rather than
 * silently skipped so a reader does not go looking for a missing test: AC-18 and AC-42's own
 * "Given" clause states the precondition under which each would apply, and that precondition
 * did not obtain.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import stylelint, { type Config } from 'stylelint'
import { describe, expect, it } from 'vitest'

import config, { OUTLINE_GUARD_CONSUMER_MESSAGE, OUTLINE_GUARD_PATTERN } from '../index.js'
import { pendingChangesetSurfaces } from './helpers/changesets.ts'
import { commentText, findOutcomeWords, type Surface } from './helpers/outcome-words.ts'
import { packTarball } from './helpers/pack.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../..')

function stripRuleSuffix(text: string): string {
  return text.replace(/ \([\w./-]+\)$/, '')
}

describe('AC-consumer-constraints-17 covers: R11c, R12, R10', () => {
  it('reports outline: none / outline: 0 in a consumer fixture with the 444-byte message', async () => {
    for (const declaration of ['outline: none', 'outline: 0']) {
      const result = await stylelint.lint({ code: `.a { ${declaration}; }`, config })
      const warning = result.results[0]!.warnings.find(
        (w) => w.rule === 'declaration-property-value-disallowed-list',
      )
      expect(warning).toBeDefined()
      expect(stripRuleSuffix(warning!.text)).toBe(OUTLINE_GUARD_CONSUMER_MESSAGE)
    }
  })

  it.each(['packages/core/src/index.css', 'packages/core/src/reset.css'])(
    'reports the same declarations in %s under the root config with the house message, byte-identical',
    async (file) => {
      const rcPath = path.join(ROOT, '.stylelintrc.json')
      const rootConfig = JSON.parse(readFileSync(rcPath, 'utf8')) as Config
      for (const declaration of ['outline: none', 'outline: 0']) {
        const result = await stylelint.lint({
          code: `.a { ${declaration}; }`,
          codeFilename: path.join(ROOT, file),
          config: rootConfig,
          configBasedir: ROOT,
        })
        const warning = result.results[0]!.warnings.find(
          (w) => w.rule === 'declaration-property-value-disallowed-list',
        )
        expect(warning, `${file}: ${declaration}`).toBeDefined()
        const text = stripRuleSuffix(warning!.text)
        expect(Buffer.byteLength(text, 'utf8')).toBe(1012)
        expect(createHash('sha256').update(text).digest('hex').slice(0, 16)).toBe(
          'e9e40077899491ed',
        )
      }
    },
  )

  it('the guard value pattern resolved for the consumer fixture and for our tree is deep-equal', async () => {
    const consumerResolved = await stylelint.resolveConfig(process.cwd(), { config })
    const rcPath = path.join(ROOT, '.stylelintrc.json')
    const rootConfig = JSON.parse(readFileSync(rcPath, 'utf8')) as Config
    const houseResolved = await stylelint.resolveConfig(
      path.join(ROOT, 'packages/core/src/index.css'),
      {
        config: rootConfig,
        configBasedir: ROOT,
      },
    )
    const consumerRule = consumerResolved?.rules?.[
      'declaration-property-value-disallowed-list'
    ] as unknown[]
    const houseRule = houseResolved?.rules?.[
      'declaration-property-value-disallowed-list'
    ] as unknown[]
    expect(consumerRule[0]).toEqual(houseRule[0])
  })

  it('the exported pattern is used, never a copy, by this test failing if it drifts', () => {
    expect(config.rules!['declaration-property-value-disallowed-list']).toBeDefined()
    const [ruleOptions] = config.rules!['declaration-property-value-disallowed-list'] as [
      { outline: string[] },
    ]
    expect(ruleOptions.outline).toEqual(OUTLINE_GUARD_PATTERN)
  })
})

/**
 * The core README's "Editor, linter and coding agent" section, up to the next section.
 */
function coreReadmeSection(): string {
  const readme = readFileSync(path.join(ROOT, 'packages/core/README.md'), 'utf8')
  const start = readme.indexOf('## Editor, linter and coding agent')
  const end = readme.indexOf('\n## Exports', start + 1)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return readme.slice(start, end)
}

/**
 * Every surface the outline scan reads, the package's from its packed tarball.
 */
function shippedSurfaces(): Surface[] {
  const tarball = packTarball()
  const skillPath = path.join(ROOT, 'packages/core/skills/navecss/SKILL.md')
  const manifest = JSON.parse(tarball.read('package/package.json')) as { description: string }
  return [
    { name: 'README.md', text: tarball.read('package/README.md') },
    { name: 'package.json description', text: manifest.description },
    // Pending changesets only: a release consumes them.
    ...pendingChangesetSurfaces(),
    { name: 'core README section', text: coreReadmeSection() },
    // Generated by the skill guide's own build; present once that guide has landed.
    ...(existsSync(skillPath) ? [{ name: 'SKILL.md', text: readFileSync(skillPath, 'utf8') }] : []),
    { name: 'packed index.js comments', text: commentText(tarball.read('package/index.js')) },
    {
      name: 'packed index.d.ts comments',
      text: commentText(tarball.read('package/index.d.ts')),
    },
  ]
}

describe('AC-consumer-constraints-19 covers: R12', () => {
  const FORBIDDEN_WORDS = [
    'accessib',
    'a11y',
    'WCAG',
    'screen reader',
    'keyboard user',
    'protect',
    'ensure',
    'guarantee',
    'conform',
  ]

  const OUTLINE_SCAN = {
    mentions: /outline|focus (guard|indicator)/i,
    words: FORBIDDEN_WORDS,
    unit: 'paragraph',
  } as const

  it('reads every surface it names, each one non-empty', () => {
    const surfaces = shippedSurfaces()
    const changesets = pendingChangesetSurfaces().length > 0 ? ['changeset'] : []
    expect(surfaces.map((s) => s.name)).toEqual(
      expect.arrayContaining([...changesets, 'core README section', 'packed index.js comments']),
    )
    for (const { name, text } of surfaces) {
      expect(text.trim().length, `${name} is empty`).toBeGreaterThan(0)
    }
  })

  it('no shipped passage mentioning the outline check contains an outcome word', () => {
    expect(findOutcomeWords(shippedSurfaces(), OUTLINE_SCAN)).toEqual([])
  })

  it('the same scan reports the planted sentence, placed in the README beside the guard', () => {
    const readme = packTarball().read('package/README.md')
    const planted = readme.replace(
      /(## The outline guard\n\n[^\n]+(?:\n[^\n]+)*)/,
      '$1 It protects keyboard users from losing focus visibility.',
    )
    expect(planted).not.toBe(readme)
    const hits = findOutcomeWords([{ name: 'README.md', text: planted }], OUTLINE_SCAN)
    expect(hits.map((hit) => hit.word)).toEqual(
      expect.arrayContaining(['protect', 'keyboard user']),
    )
  })

  it('no packed file names the check by an outcome it does not measure ("focus guard", "accessibility review")', () => {
    const tarball = packTarball()
    const textFiles = tarball.files.filter((f) => /\.(md|js|ts|json)$/.test(f))
    expect(textFiles).toContain('package/README.md')
    const naming = textFiles.filter((file) =>
      /focus guard|accessibility review/i.test(tarball.read(file)),
    )
    expect(naming).toEqual([])
  })
})

/**
 * The warnings on `outline: none` for a consumer config that extends the package by name and
 * sets `rules` of its own.
 */
async function warningsExtendingPackage(
  rules: NonNullable<Config['rules']>,
): Promise<{ rule: string }[]> {
  const result = await stylelint.lint({
    code: '.a { outline: none; }',
    config: { extends: ['@navecss/stylelint-config'], rules },
    configBasedir: ROOT,
  })
  return result.results[0]!.warnings
}

describe("the README's opt-out names the rule, and works as stated", () => {
  it('the outline guard section names declaration-property-value-disallowed-list', () => {
    const readme = readFileSync(path.join(HERE, '../README.md'), 'utf8')
    const section = readme.slice(
      readme.indexOf('## The outline guard'),
      readme.indexOf('## License'),
    )
    expect(section).toContain('declaration-property-value-disallowed-list')
  })

  it('setting that rule to null in a consumer config reports nothing on outline: none', async () => {
    // The control: through the same extends, without the opt-out, it is reported.
    const reported = await warningsExtendingPackage({})
    expect(reported.map((w) => w.rule)).toContain('declaration-property-value-disallowed-list')
    // The opt-out exactly as a consumer's JSON config writes it.
    const optOut = JSON.parse(
      '{ "declaration-property-value-disallowed-list": null }',
    ) as NonNullable<Config['rules']>
    expect(await warningsExtendingPackage(optOut)).toEqual([])
  })
})
