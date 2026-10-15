/**
 * AC-astro-38 covers: R11.
 * AC-astro-39 covers: R11.
 * AC-astro-40 covers: R12 (the eslint-plugin half: astro-eslint-parser is a dev dependency only,
 * and nothing under `src` imports it or `eslint-plugin-astro`).
 *
 * An `.astro` file linted through `astro-eslint-parser` is read by the rules as JSX: `class` is
 * checked, `class:list` is not read. The README says exactly that, and this file pins both.
 */
import * as astroParser from 'astro-eslint-parser'
import { ESLint } from 'eslint'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import plugin from '../src/index.ts'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const README = readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8')

const FIXTURE = [
  '---',
  '---',
  '<div class="card">',
  "<div class:list={['card']}>",
  '</div>',
  '</div>',
  '',
].join('\n')

const workDir = mkdtempSync(path.join(tmpdir(), 'nave-astro-lint-'))
writeFileSync(path.join(workDir, 'card.astro'), FIXTURE)

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

const astroFiles = { files: ['**/*.astro'], languageOptions: { parser: astroParser } }

async function lintCard(
  configs: ESLint.Options['baseConfig'],
): Promise<ESLint.LintResult['messages']> {
  const eslint = new ESLint({ cwd: workDir, overrideConfigFile: true, overrideConfig: configs })
  const [result] = await eslint.lintFiles(['card.astro'])
  return result!.messages
}

describe('AC-astro-38: an .astro file read through astro-eslint-parser', () => {
  it('reports the class literal on line 3 and does not read class:list on line 4', async () => {
    const messages = await lintCard([astroFiles, plugin.configs!.recommended as never])
    expect(messages.map((m) => [m.line, m.ruleId])).toEqual([[3, '@navecss/class-channel']])
  })

  it('control: without the plugin rules the same file reports nothing, so line 3 is the rules running', async () => {
    const messages = await lintCard([astroFiles])
    expect(messages).toEqual([])
  })
})

describe('AC-astro-39: the README says what is measured about .astro', () => {
  const AFTER = [
    '- **JSX only**, at this version: Vue, Svelte, plain HTML templates and slot props',
    "  (`classNames={{ root: '...' }}`) are outside every rule here. An `.astro` file linted through",
    '  `eslint-plugin-astro` is read, because its parser gives the rules the template as JSX: `class`',
    '  and a `style` object are checked as in JSX, so a class your `<style>` block styles is reported',
    "  unless `allow` declares it. Astro's `class:list` and a `style` written as a string are not read.",
    '',
  ].join('\n')

  const bullet = README.slice(
    README.indexOf('- **JSX only**'),
    README.indexOf('- A class reached through an imported constant'),
  )

  it('the first bullet equals the measured text byte for byte', () => {
    expect(bullet).toBe(AFTER)
  })

  it('names eslint-plugin-astro, class:list and a style written as a string', () => {
    expect(bullet).toContain('`eslint-plugin-astro`')
    expect(bullet).toContain('`class:list`')
    expect(bullet).toContain('a `style` written as a string')
  })

  it('no longer lists Astro among the sources outside every rule', () => {
    expect(bullet.split('are outside every rule here', 1)[0]).not.toContain('Astro')
  })

  it('names no ESLint version', () => {
    expect(bullet).not.toMatch(/\d/)
  })
})

describe('AC-astro-40: the parser is a dev dependency only and no source imports it', () => {
  const manifest = JSON.parse(
    readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8'),
  ) as Record<string, Record<string, string> | undefined>
  const NAMES = ['astro', 'astro-eslint-parser', 'eslint-plugin-astro']

  it('appears in devDependencies and in no other dependency field', () => {
    expect(Object.keys(manifest.devDependencies ?? {})).toContain('astro-eslint-parser')
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const name of NAMES) expect(Object.keys(manifest[field] ?? {})).not.toContain(name)
    }
  })

  it('nothing under src names astro-eslint-parser or eslint-plugin-astro', () => {
    const files = listSources(path.join(PACKAGE_DIR, 'src'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/astro-eslint-parser|eslint-plugin-astro/)
    }
  })
})

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    return statSync(full).isDirectory() ? listSources(full) : [full]
  })
}
