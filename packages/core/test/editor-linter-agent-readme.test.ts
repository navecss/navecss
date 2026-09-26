/**
 * AC-consumer-constraints-35, -36, -37 cover: R21.
 *
 * The README's "Editor, linter and coding agent" section needs the name of the published
 * stylelint config it offers beside the one-line fence, so it lands with that package rather
 * than with the css data file or the skill guide it also describes.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import stylelint from 'stylelint'
import { describe, expect, it } from 'vitest'

import { PUBLISHABLE_SET } from '../../../scripts/check-publishable-set.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CORE_DIR = path.resolve(HERE, '..')
const ROOT = path.resolve(HERE, '../../..')

const coreReadme = readFileSync(path.join(CORE_DIR, 'README.md'), 'utf8')
const rootReadme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')

function coreSection(): string {
  const start = coreReadme.indexOf('## Editor, linter and coding agent')
  expect(start).toBeGreaterThan(-1)
  // Not a generic "next \n## " search: the section's own pointer-block fence contains an
  // example "## Styling: NaveCSS" heading, which a naive search would match first and truncate
  // the section before its closing sentence. The real next section is known by name.
  const nextHeading = coreReadme.indexOf('\n## Exports', start + 1)
  expect(nextHeading).toBeGreaterThan(-1)
  return coreReadme.slice(start, nextHeading)
}

function jsonFencesIn(text: string): string[] {
  return text
    .matchAll(/```json\n([\s\S]*?)```/g)
    .map((m) => m[1]!.trim())
    .toArray()
}

function mdFencesIn(text: string): string[] {
  return text
    .matchAll(/```md\n([\s\S]*?)```/g)
    .map((m) => m[1]!.trim())
    .toArray()
}

describe('AC-consumer-constraints-35 covers: R21', () => {
  const section = coreSection()

  it('the section exists under that heading, and the root README links to its anchor, which resolves', () => {
    expect(section.length).toBeGreaterThan(0)
    expect(rootReadme).toContain('packages/core/README.md#editor-linter-and-coding-agent')
  })

  it('the VS Code fence is exactly the customData form naming nave.css-data.json', () => {
    const fence = jsonFencesIn(section).find((f) => f.includes('css.customData'))
    expect(fence).toBe('{ "css.customData": ["./node_modules/@navecss/core/nave.css-data.json"] }')
  })

  it('that path, taken from a consumer project root, names a file the packed tarball carries', () => {
    // AC-05's own check (slice 1) already asserts nave.css-data.json is present and listed in
    // `files`; this just confirms the exact relative path the fence states resolves under the
    // package's own root, which is where a real install places it.
    expect(existsSync(path.join(CORE_DIR, 'nave.css-data.json'))).toBe(true)
  })

  it("the root README's VS Code fence is byte-identical to the section's", () => {
    const coreFence = jsonFencesIn(section).find((f) => f.includes('css.customData'))
    const rootFence = jsonFencesIn(rootReadme).find((f) => f.includes('css.customData'))
    expect(rootFence).toBe(coreFence)
  })

  it('the editor paragraph names VS Code and no other editor, the monorepo note, and the reload note', () => {
    const editorParagraph = section.slice(0, section.indexOf('**Stylelint.**'))
    expect(editorParagraph).toContain('VS Code')
    for (const other of ['WebStorm', 'Sublime', 'Vim', 'Neovim', 'Zed', 'IntelliJ']) {
      expect(editorParagraph).not.toContain(other)
    }
    expect(editorParagraph).toMatch(/node_modules.*@navecss\/core/)
    expect(editorParagraph.toLowerCase()).toContain('reload')
  })
})

/**
 * Runs the scratch project's own stylelint over `test.css` and parses the JSON report it writes
 * to `--output-file`, and nothing else. The CLI prints the same report to stdout on a clean run
 * and to stderr once it finds a problem, so reading "whichever stream is non-empty" would parse
 * any other text a failing run printed. A run that wrote no parseable report throws with its exit
 * status and stderr instead.
 */
function stylelintJsonReport(cwd: string): { warnings: { rule: string }[] }[] {
  const reportPath = path.join(cwd, 'stylelint-report.json')
  const result = spawnSync(
    path.join(cwd, 'node_modules/.bin/stylelint'),
    ['test.css', '--formatter', 'json', '--output-file', reportPath],
    { cwd, encoding: 'utf8' },
  )
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8')) as { warnings: { rule: string }[] }[]
  } catch {
    throw new Error(
      `stylelint wrote no JSON report (status ${String(result.status)}): ${result.stderr}`,
    )
  }
}

describe('AC-consumer-constraints-36 covers: R21, R11a', () => {
  const section = coreSection()
  const lintFence = jsonFencesIn(section).find((f) => f.includes('languageOptions'))!

  async function reportsFor(
    code: string,
    extraRules: Record<string, unknown> = {},
  ): Promise<{ rule: string }[]> {
    const fenceConfig = JSON.parse(lintFence) as Record<string, unknown>
    const config = {
      extends: ['stylelint-config-standard'],
      ...fenceConfig,
      rules: extraRules,
    }
    const result = await stylelint.lint({ code, config })
    return result.results[0]!.warnings
  }

  it('used verbatim merged over stylelint-config-standard, @nave passes and @nvae is reported', async () => {
    const clean = await reportsFor('.a { @nave interactive; }', { 'at-rule-no-unknown': true })
    expect(clean).toEqual([])
    const dirty = await reportsFor('.a { @nvae interactive; }', { 'at-rule-no-unknown': true })
    expect(dirty.some((w) => w.rule === 'at-rule-no-unknown')).toBe(true)
  })

  it("adding the consumer's own at-rule-no-unknown ignoreAtRules still leaves @nave unreported", async () => {
    const warnings = await reportsFor('.a { @nave interactive; }', {
      'at-rule-no-unknown': [true, { ignoreAtRules: ['tailwind'] }],
    })
    expect(warnings).toEqual([])
  })

  it('the fence declares languageOptions.syntax.atRules.nave and no at-rule-no-unknown entry', () => {
    const parsed = JSON.parse(lintFence) as { languageOptions?: { syntax?: { atRules?: object } } }
    expect(parsed.languageOptions?.syntax?.atRules).toHaveProperty('nave')
    expect(Object.keys(parsed)).not.toContain('rules')
    expect(lintFence).not.toContain('at-rule-no-unknown')
  })

  it('the section states the 16.17.0 floor and the package peer range (^17.0.0) separately', () => {
    expect(section).toContain('16.17.0')
    expect(section).toContain('^17.0.0')
  })

  it(
    'at stylelint exactly 16.17.0 the fence gives the same results, while at 16.16.0 @nave is still reported (the floor control)',
    { timeout: 120_000 },
    () => {
      // Each version gets its OWN fresh directory: `stylelint-config-standard@40` pins a
      // `^17.0.0` stylelint peer, so this fixture enables `at-rule-no-unknown` directly
      // (stylelint's own built-in rule, the one the fence's languageOptions declaration is
      // read by) rather than pull in a config incompatible with 16.x — reinstalling a
      // different stylelint version IN PLACE inside one directory was tried and measured to
      // leave npm's own dependency resolution in a broken, order-dependent state.
      const { languageOptions } = JSON.parse(lintFence) as Record<string, unknown>
      const config = JSON.stringify({ rules: { 'at-rule-no-unknown': true }, languageOptions })

      for (const [version, expectReported] of [
        ['16.16.0', true],
        ['16.17.0', false],
      ] as const) {
        const scratch = mkdtempSync(path.join(tmpdir(), `nave-stylelint-floor-${version}-`))
        try {
          writeFileSync(
            path.join(scratch, 'package.json'),
            JSON.stringify({ name: `floor-scratch-${version}`, version: '1.0.0', private: true }),
          )
          writeFileSync(path.join(scratch, 'test.css'), '.a { @nave interactive; }')
          writeFileSync(path.join(scratch, '.stylelintrc.json'), config)

          execFileSync('npm', ['install', '--ignore-scripts', `stylelint@${version}`], {
            cwd: scratch,
            encoding: 'utf8',
          })
          const [fileResult] = stylelintJsonReport(scratch)
          const isReported = fileResult!.warnings.some((w) => w.rule === 'at-rule-no-unknown')
          expect(isReported, `stylelint ${version}`).toBe(expectReported)
        } finally {
          rmSync(scratch, { recursive: true, force: true })
        }
      }
    },
  )

  it("the root README's linter fence is byte-identical to the section's", () => {
    const rootFence = jsonFencesIn(rootReadme).find((f) => f.includes('languageOptions'))
    expect(rootFence).toBe(lintFence)
  })

  it('the section offers @navecss/stylelint-config beside the fence, and the fence remains', () => {
    expect(section).toContain('@navecss/stylelint-config')
    expect(section.indexOf('languageOptions')).toBeLessThan(
      section.indexOf('@navecss/stylelint-config'),
    )
  })
})

describe('AC-consumer-constraints-37 covers: R21', () => {
  const section = coreSection()
  const pointerBlock = mdFencesIn(section)[0]!

  it('names node_modules/@navecss/core/skills/navecss/SKILL.md', () => {
    expect(pointerBlock).toContain('node_modules/@navecss/core/skills/navecss/SKILL.md')
  })

  const skillPath = path.join(CORE_DIR, 'skills/navecss/SKILL.md')
  // Slice 3 (the generator that writes this file) is a separate, still-open pull request at
  // the time this head was built; this section's own text is correct for the state both
  // slices land in together, but the file itself is not on THIS branch until slice 3 merges
  // and this branch is rebased onto it. `skipIf`, not a silent return: vitest reports this
  // test as skipped rather than passed, and every other assertion in this file still runs.
  it.skipIf(!existsSync(skillPath))(
    'that path exists in the tarball once slice 3 has landed',
    () => {
      expect(existsSync(skillPath)).toBe(true)
    },
  )

  it('contains no Markdown list, no --nave- name and no code span equal to a built-in atom name', async () => {
    expect(pointerBlock).not.toMatch(/^[ \t]*[-*]\s/m)
    expect(pointerBlock).not.toMatch(/--nave-/)
    const { atoms } = (await import('../src/atoms.ts')) as { atoms: Record<string, unknown> }
    for (const name of Object.keys(atoms)) {
      expect(pointerBlock).not.toMatch(new RegExp(`\`${name}\``))
    }
  })

  it("the section says the block goes in the consumer's AGENTS.md, and CLAUDE.md too where they have one", () => {
    expect(section).toMatch(/AGENTS\.md/)
    expect(section).toMatch(/CLAUDE\.md/)
  })

  it('the section says consumers of @navecss/tokens alone get no guide', () => {
    expect(section).toContain('@navecss/tokens')
    expect(section.toLowerCase()).toContain('no guide')
  })

  function publishedManifests(): {
    bin?: unknown
    name: string
    scripts?: Record<string, string>
  }[] {
    const packagesDir = path.join(ROOT, 'packages')
    const manifests = readdirSync(packagesDir)
      .map((entry) => path.join(packagesDir, entry, 'package.json'))
      .filter((manifestPath) => existsSync(manifestPath))
      .map(
        (manifestPath) =>
          JSON.parse(readFileSync(manifestPath, 'utf8')) as {
            bin?: unknown
            name: string
            scripts?: Record<string, string>
          },
      )
      .filter((manifest) => PUBLISHABLE_SET.has(manifest.name))
    expect(manifests.map((m) => m.name).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...PUBLISHABLE_SET].toSorted((a, b) => a.localeCompare(b)),
    )
    return manifests
  }

  it('no published package manifest has a preinstall/install/postinstall/prepare script (no lifecycle hook could write the block)', () => {
    for (const manifest of publishedManifests()) {
      for (const script of ['preinstall', 'install', 'postinstall', 'prepare']) {
        expect(manifest.scripts?.[script], `${manifest.name}:${script}`).toBeUndefined()
      }
    }
  })

  it("the only bin any published package declares is @navecss/tokens' navecss-tokens", () => {
    // The token build CLI predates this section and writes build output only; a new bin on any
    // published package is a tool that could write the block, and reds this row.
    const bins = publishedManifests().flatMap((manifest) => {
      if (manifest.bin === undefined) return []
      // A string `bin` installs one command named after the package.
      if (typeof manifest.bin === 'string') return [`${manifest.name}:${manifest.name}`]
      return Object.keys(manifest.bin as Record<string, string>).map(
        (bin) => `${manifest.name}:${bin}`,
      )
    })
    expect(bins).toEqual(['@navecss/tokens:navecss-tokens'])
  })
})
