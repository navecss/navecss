/**
 * AC-directive-core-40 and AC-directive-core-41: the Lightning CSS adapter imports nothing from
 * Lightning CSS, and Lightning CSS never sees a directive, on the oldest supported release and the
 * newest one this repository installs. The `transform()` path's Chromium clause (`.o` computes
 * `display: flex`) is `test/browser/lightningcss-adapter.browser.test.ts`'s, over the CSS
 * `scripts/generate-lightningcss-fixtures.ts` writes.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SourceMapConsumer } from 'source-map'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { atoms } from '../src/atoms.ts'
import lightningDefault, { navePlugin } from '../src/lightningcss.ts'
import { installedVersion, LIGHTNING_RELEASES } from './helpers/lightningcss-releases.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CORE_ROOT = path.resolve(HERE, '..')
const DIST = path.join(CORE_ROOT, 'dist')

const scratch = { dir: '' }

beforeEach(() => {
  scratch.dir = mkdtempSync(path.join(tmpdir(), 'nave-lightning-'))
})

afterEach(() => {
  rmSync(scratch.dir, { force: true, recursive: true })
})

function write(name: string, text: string): string {
  const file = path.join(scratch.dir, name)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text, 'utf8')
  return file
}

const FOCUS_VISIBLE = atoms.focusRing.pseudos![':focus-visible']!

/**
 * Whether the printed CSS holds `.imported`'s own `:focus-visible` rule carrying every
 * declaration `focusRing`'s pseudo block has, whichever way the printer nested it: the
 * `:focus-visible` block is read from inside the `.imported` block, never from any other rule.
 */
function hasFocusRule(css: string): boolean {
  const flat = css.replaceAll(/\s+/g, ' ')
  const start = flat.indexOf('.imported {')
  if (start === -1) return false
  let depth = 0
  let end = flat.length
  for (let index = flat.indexOf('{', start); index < flat.length; index++) {
    if (flat[index] === '{') depth++
    if (flat[index] === '}' && --depth === 0) {
      end = index
      break
    }
  }
  const own = flat.slice(start, end)
  const body = /:focus-visible \{([^}]*)\}/.exec(own)?.[1] ?? ''
  return Object.entries(FOCUS_VISIBLE).every(([prop, value]) => body.includes(`${prop}: ${value}`))
}

describe('AC-directive-core-40 — the Lightning CSS adapter imports nothing from Lightning CSS', () => {
  it('returns exactly expand and resolver, whose only key is read, with no visitor or customAtRules', () => {
    const plugin = navePlugin()

    expect(Object.keys(plugin).toSorted()).toEqual(['expand', 'resolver'])
    expect(Object.keys(plugin.resolver)).toEqual(['read'])
    expect(plugin).not.toHaveProperty('visitor')
    expect(plugin).not.toHaveProperty('customAtRules')
    expect(typeof plugin.expand).toBe('function')
    expect(typeof plugin.resolver.read).toBe('function')
  })

  it('is also the default export (AC-28), the same function object as the named navePlugin', () => {
    expect(lightningDefault).toBe(navePlugin)
  })

  it('declares the default export in its declaration file, with navePlugin’s type', () => {
    const declarations = readFileSync(path.join(DIST, 'lightningcss.d.ts'), 'utf8')

    expect(declarations).toMatch(
      /export\s*\{[^}]*\bnavePlugin as default\b[^}]*\}|export default navePlugin/,
    )
    expect(declarations).toMatch(/\bnavePlugin\b/)
  })

  it('no file of the subpath, .js, .d.ts or any chunk they import, holds a lightningcss specifier', () => {
    const files = new Set<string>()
    const queue = ['lightningcss.js', 'lightningcss.d.ts']
    while (queue.length > 0) {
      const name = queue.pop()!
      if (files.has(name)) continue
      files.add(name)
      const text = readFileSync(path.join(DIST, name), 'utf8')
      for (const match of text.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)) queue.push(match[1]!)
      for (const match of text.matchAll(/\bimport\(\s*['"]\.\/([^'"]+)['"]/g)) queue.push(match[1]!)
    }

    expect(files.has('lightningcss.js')).toBe(true)
    for (const name of files) {
      const text = readFileSync(path.join(DIST, name), 'utf8')
      expect(text, `${name} names lightningcss as a specifier`).not.toMatch(
        /(?:from|import)\s*\(?\s*['"]lightningcss/,
      )
      expect(text, `${name} quotes a lightningcss specifier`).not.toMatch(/['"]lightningcss['"/]/)
    }
  })

  it('declares lightningcss as nothing but a devDependency: no dependency, peer or bundled entry names it', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8'),
    ) as Record<string, unknown>
    const declaring = [
      'dependencies',
      'peerDependencies',
      'peerDependenciesMeta',
      'optionalDependencies',
      'bundledDependencies',
      'bundleDependencies',
      'overrides',
      'resolutions',
    ]

    for (const field of declaring) {
      expect(JSON.stringify(manifest[field] ?? null), field).not.toContain('lightningcss')
    }
    expect(JSON.stringify(manifest.devDependencies)).toContain('lightningcss')
  })

  it('the source file imports nothing from lightningcss, types included', () => {
    const code = readFileSync(path.join(CORE_ROOT, 'src', 'lightningcss.ts'), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(?:\*|\/\/|\/\*)/.test(line))
      .join('\n')

    expect(code).not.toMatch(/from\s+['"]lightningcss/)
    expect(code).not.toMatch(/import\(\s*['"]lightningcss/)
    expect(code).toContain("from 'node:fs'")
  })
})

describe.each(LIGHTNING_RELEASES)(
  'AC-directive-core-41 — Lightning CSS never sees a directive, on $label',
  (release) => {
    const lib = release.lib

    it('runs the release this suite says it does', () => {
      const version = installedVersion(release.package)

      if (release.package === 'lightningcss-1-22') expect(version).toBe('1.22.1')
      else expect(version.split('.').map(Number)[1]).toBeGreaterThanOrEqual(22)
    })

    it('transform(): zero warnings, no @nave, the imported file carries the focus rule', () => {
      const nave = navePlugin()
      const entry = nave.expand(
        '@import "./card.css";\n.o { display: grid; @nave flex; }\n',
        path.join(scratch.dir, 'entry.css'),
      )
      const card = nave.expand(
        '.imported { @nave focusRing; }\n',
        path.join(scratch.dir, 'card.css'),
      )

      const entryOut = lib.transform({
        filename: path.join(scratch.dir, 'entry.css'),
        code: entry.code,
        inputSourceMap: entry.map,
      })
      const cardOut = lib.transform({
        filename: path.join(scratch.dir, 'card.css'),
        code: card.code,
        inputSourceMap: card.map,
      })

      expect(entryOut.warnings).toEqual([])
      expect(cardOut.warnings).toEqual([])
      expect(entryOut.code.toString()).not.toContain('@nave')
      expect(cardOut.code.toString()).not.toContain('@nave')
      expect(entryOut.code.toString()).toMatch(/display:\s*flex/)
      expect(hasFocusRule(cardOut.code.toString())).toBe(true)
    })

    it('transform(): the code comes back as bytes and the map as a string, ready to pass on', () => {
      const result = navePlugin().expand('.a { @nave flex; }', 'a.css')

      expect(result.code).toBeInstanceOf(Uint8Array)
      expect(typeof result.map).toBe('string')
      expect(JSON.parse(result.map)).toMatchObject({ version: 3 })
    })

    it('transform(): takes bytes as well as a string, and expands them the same', () => {
      const nave = navePlugin()
      const text = '.a { color: red; @nave flex; }\n'

      const fromText = nave.expand(text, 'a.css')
      const fromBytes = nave.expand(new TextEncoder().encode(text), 'a.css')

      expect(Buffer.from(fromBytes.code).toString()).toBe(Buffer.from(fromText.code).toString())
      expect(fromBytes.map).toBe(fromText.map)
    })

    it('bundleAsync(): the import is read through the resolver, zero warnings, no @nave, the focus rule present', async () => {
      write('card.css', '.imported { @nave focusRing; }\n')
      const entry = write('entry.css', '@import "./card.css";\n.o { display: grid; @nave flex; }\n')

      const result = await lib.bundleAsync({ filename: entry, resolver: navePlugin().resolver })

      expect(result.warnings).toEqual([])
      expect(result.code.toString()).not.toContain('@nave')
      expect(result.code.toString()).toMatch(/display:\s*flex/)
      expect(hasFocusRule(result.code.toString())).toBe(true)
    })

    it('transform(): an unknown atom in a prelude that Lightning CSS could not parse throws Nave’s text, naming the file and line', () => {
      const nave = navePlugin()
      const file = path.join(scratch.dir, 'x.css')

      expect(() => nave.expand('\n\n.x { @nave flex, block; }\n', file)).toThrow(
        new RegExp(
          `${file.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}:3:\\d+: .*separate atom names with spaces`,
        ),
      )
    })

    it('transform(): an empty directive throws "@nave: directive names no atom", not a Lightning CSS error', () => {
      expect(() => navePlugin().expand('.x { @nave; }', 'x.css')).toThrow(
        '@nave: directive names no atom',
      )
    })

    it('bundleAsync(): the same errors come through the resolver, not as a Lightning CSS parse error', async () => {
      const entry = write('entry.css', '.x { @nave flex, block; }\n')

      await expect(
        lib.bundleAsync({ filename: entry, resolver: navePlugin().resolver }),
      ).rejects.toThrow(/separate atom names with spaces/)
    })

    it('transform(): the output map sends an untouched rule to its authored position, and the rules Nave inserted to their directive', async () => {
      // Lightning CSS's own map records rules, not declarations, so only rules are asserted. The
      // source is renamed so the hop through `inputSourceMap` is observable.
      const authored = [
        '.a {',
        '  color: red;',
        '  &:hover { color: blue }',
        '  @nave flex;',
        '  margin: 0;',
        '}',
        '',
        '.b {',
        '  padding: 1px;',
        '  @nave focusRing;',
        '  gap: 0;',
        '}',
        '',
      ].join('\n')
      const expanded = navePlugin().expand(authored, 'a.css')
      const chained = JSON.stringify({ ...JSON.parse(expanded.map), sources: ['a.scss'] })

      const result = lib.transform({
        filename: 'a.css',
        code: expanded.code,
        sourceMap: true,
        inputSourceMap: chained,
      })
      const printed = result.code.toString().split('\n')
      const consumer = await new SourceMapConsumer(JSON.parse(result.map!.toString()))
      const originOf = (
        opening: string,
      ): { column: number | null; line: number | null; source: string | null } => {
        const index = printed.findIndex((line) => line.trim() === opening)
        expect(index, `no "${opening}" line in:\n${printed.join('\n')}`).toBeGreaterThanOrEqual(0)
        return consumer.originalPositionFor({
          line: index + 1,
          column: printed[index]!.length - printed[index]!.trimStart().length,
        })
      }
      const at = (line: number, column: number): object =>
        expect.objectContaining({ source: 'a.scss', line, column })
      try {
        expect(originOf('.a {')).toEqual(at(1, 0))
        expect(originOf('&:hover {')).toEqual(at(3, 2))
        expect(originOf('& {')).toEqual(at(4, 2))
        expect(originOf('.b {')).toEqual(at(8, 0))
        expect(originOf('&:focus-visible {')).toEqual(at(10, 2))
      } finally {
        consumer.destroy()
      }
    })

    it('bundleAsync(): each file’s expanded text keeps as many line terminators as its input', () => {
      const input = '.i {\n  @nave flex;\n  color: red;\n}\n/* a\n b */\n.j { @nave focusRing; }\n'
      const file = write('card.css', input)

      const output = navePlugin().resolver.read(file)

      expect(output.match(/\n/g)?.length).toBe(input.match(/\n/g)?.length)
    })

    it('bundleAsync(): an invalid token on line 7 of card.css, after the directive on line 2, reports line 7', async () => {
      const card = [
        '.a {',
        '  @nave flex;',
        '  color: red;',
        '}',
        '',
        '',
        '.c ) {',
        '  color: red;',
        '}',
        '',
      ].join('\n')
      write('card.css', card)
      const entry = write('entry.css', '@import "./card.css";\n.o { color: blue; }\n')

      const error = await lib
        .bundleAsync({ filename: entry, resolver: navePlugin().resolver })
        .then(
          () => undefined,
          (reason: unknown) => reason as { fileName?: string; loc?: { line: number } },
        )

      expect(error, 'Lightning CSS accepted the invalid token').toBeDefined()
      expect(error!.loc?.line).toBe(7)
      expect(path.resolve(error!.fileName!)).toBe(path.join(scratch.dir, 'card.css'))
    })

    it('bundleAsync(): an imported stylesheet that starts with a byte order mark keeps its first rule in the bundle', async () => {
      write('x.css', '.x { color: green; }\n')
      write('b.css', '\u{FEFF}.b { @nave flex; }\n')
      const entry = write('a.css', '@import "x.css";\n@import "b.css";\n.a { color: red; }\n')

      const { code } = await lib.bundleAsync({ filename: entry, resolver: navePlugin().resolver })

      expect(code.toString()).not.toContain('\u{FEFF}')
      expect(code.toString()).toMatch(/(^|\n)\.b\s*\{\s*display:\s*flex/)
    })

    it('AC-directive-core-26: neither expand() nor transform() adds an @import or a url() of its own, over every atom', () => {
      const expanded = navePlugin().expand(`.a { @nave ${Object.keys(atoms).join(' ')}; }`, 'a.css')
      const result = lib.transform({ filename: 'a.css', code: expanded.code })

      expect(Buffer.from(expanded.code).toString()).not.toMatch(/@import|url\(/i)
      expect(result.code.toString()).not.toMatch(/@import|url\(/i)
    })
  },
)

describe('the adapter’s options', () => {
  it('onUnknown: "warn" prints one warning per problem and still expands the valid names', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const nave = navePlugin({ onUnknown: 'warn' })
      const result = nave.expand('.x {\n  @nave flex nope;\n}\n', '/proj/x.css')

      expect(Buffer.from(result.code).toString()).toContain('display: flex')
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]![0])).toMatch(
        /^\/proj\/x\.css:2:14: @nave: unknown atom "nope"/,
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('onUnknown: "ignore" reports nothing and still expands the valid names', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const result = navePlugin({ onUnknown: 'ignore' }).expand('.x { @nave flex nope; }', 'x.css')

      expect(Buffer.from(result.code).toString()).toContain('display: flex')
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('extend adds atoms of the consumer’s own', () => {
    const nave = navePlugin({ extend: { brandBox: { declarations: { color: 'red' } } } })

    expect(Buffer.from(nave.expand('.x { @nave brandBox; }', 'x.css').code).toString()).toContain(
      'color: red',
    )
  })

  it('under error, every problem in one stylesheet is one thrown report whose first line is the first problem’s text', () => {
    const css = '.root {\n  @nave flx interactve;\n}\n.icon {\n  @nave srOnlyy;\n}\n'

    expect(() => navePlugin().expand(css, '/proj/a.css')).toThrow(
      /^\/proj\/a\.css:2:9: @nave: unknown atom "flx"\. Did you mean "flex"\?\n2 more in this stylesheet:\n2:13: unknown atom "interactve"\. Did you mean "interactive"\?\n5:9: unknown atom "srOnlyy"\. Did you mean "srOnly"\?$/,
    )
  })

  it('resolver.read writes nothing: the directory holds only what the test put there', () => {
    const before = readdirSync(scratch.dir)
    write('only.css', '.a { @nave flex; }')

    navePlugin().resolver.read(path.join(scratch.dir, 'only.css'))

    expect(readdirSync(scratch.dir).toSorted()).toEqual([...before, 'only.css'].toSorted())
  })
})

describe('a byte order mark', () => {
  it('is kept at the start of the bytes, and does not shift a diagnostic’s column', () => {
    const nave = navePlugin()
    const bom = '﻿'

    expect(() => nave.expand(`${bom}.x { @nave nope; }`, '/p/a.css')).toThrow(/a\.css:1:12: /)
    const result = nave.expand(`${bom}.a { @nave flex; }`, 'a.css')
    expect(Buffer.from(result.code).toString().startsWith(`${bom}.a {`)).toBe(true)
  })

  it('does not shift a diagnostic’s column when the resolver reads the file either', () => {
    const file = write('a.css', '\u{FEFF}.x { @nave nope; }')

    expect(() => navePlugin().resolver.read(file)).toThrow(/a\.css:1:12: /)
  })

  it('is left off what the resolver reads, so a stylesheet joined into a bundle holds none mid-way', () => {
    const file = write('a.css', '\u{FEFF}.a { @nave flex; }')

    expect(navePlugin().resolver.read(file).startsWith('.a {')).toBe(true)
  })
})
