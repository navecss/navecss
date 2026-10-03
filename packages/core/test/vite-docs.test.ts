/**
 * What the Vite plugin's documentation has to say, and what it must stop saying: AC-directive-core-39
 * (the surfaces the Vite plugin makes stale), and the README sentences AC-16, -32, -33, -35, -36 and -38 each
 * name. Plus the two fences that carry a claim a build can check: the Vite setup fence (its floor keys
 * keep `light-dark()` under Lightning CSS) and CONSUMER-ATOMS.md's type imports (no `postcss` needed).
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'

import { extractFences } from './doc-fences.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(CORE_ROOT, '../..')

const rootReadme = readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8')
const coreReadme = readFileSync(path.join(CORE_ROOT, 'README.md'), 'utf8')
const consumerAtoms = readFileSync(path.join(CORE_ROOT, 'CONSUMER-ATOMS.md'), 'utf8')
const manifest = JSON.parse(readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8')) as {
  description: string
  keywords: string[]
}

/**
 * The text of a `##`/`###` section: from its heading to the next heading of the same or a shallower
 * level.
 */
function section(markdown: string, heading: string): string {
  const level = heading.match(/^#+/)![0].length
  const start = markdown.indexOf(`\n${heading}\n`)
  expect(start, `no "${heading}" heading`).toBeGreaterThanOrEqual(0)
  const rest = markdown.slice(start + heading.length + 2)
  const next = new RegExp(`\\n#{1,${level}} `).exec(rest)
  return next ? rest.slice(0, next.index) : rest
}

const flat = (text: string): string => text.replaceAll(/\s+/g, ' ')

describe('AC-directive-core-39 — the root README teaches the Vite plugin as Vite’s one route', () => {
  it('the Packages row names more than a PostCSS plugin', () => {
    const row = rootReadme.split('\n').find((line) => line.includes('| `@navecss/core`'))

    expect(row).toMatch(/Vite plugin/)
  })

  it('the Quick start fence lists navePlugin() from @navecss/core/vite in plugins', () => {
    const quickStart = rootReadme.slice(
      rootReadme.indexOf('## Quick start'),
      rootReadme.indexOf('## Getting started'),
    )
    const fence = extractFences('README.md', quickStart).find((f) =>
      f.body.includes("from '@navecss/core/vite'"),
    )

    expect(fence?.body).toMatch(/plugins:\s*\[navePlugin\(\)\]/)
  })

  it('no longer states a PostCSS pipeline as required for @nave', () => {
    expect(rootReadme).not.toContain('**A PostCSS pipeline, for the `@nave` directive.**')
  })
})

describe('AC-directive-core-39 — the core README no longer states PostCSS as required for @nave', () => {
  it('the header names more than a PostCSS plugin', () => {
    const header = coreReadme.split('\n').find((line) => line.startsWith('> '))

    expect(header).toMatch(/Vite/)
  })

  it('Requirements names the Vite plugin, and still links #postcss-plugin-setup', () => {
    const requirements = section(coreReadme, '## Requirements')

    expect(requirements).toMatch(/Vite plugin/)
    expect(requirements).not.toContain('**PostCSS 8, for `@nave` only.**')
    expect(requirements).toContain('(#postcss-plugin-setup)')
  })

  it('the @nave and cx() tier sentences name the Vite plugin, not PostCSS alone', () => {
    expect(coreReadme).not.toContain('Requires the PostCSS plugin.')
    expect(coreReadme).toContain('Requires the Vite plugin or the PostCSS plugin.')
    expect(coreReadme).not.toContain('add a PostCSS plugin to your build')
  })

  it('has a Vite setup subsection and a ### PostCSS plugin setup subsection under one setup heading', () => {
    expect(coreReadme).toMatch(/\n### Vite plugin setup\n/)
    expect(coreReadme).toMatch(/\n### PostCSS plugin setup\n/)
    expect(coreReadme.indexOf('### Vite plugin setup')).toBeLessThan(
      coreReadme.indexOf('### PostCSS plugin setup'),
    )
  })

  it('keeps the Lightning CSS trap paragraph and "Plugin order" under the PostCSS subsection', () => {
    const postcssSetup = section(coreReadme, '### PostCSS plugin setup')

    expect(postcssSetup).toContain("css.transformer: 'lightningcss'")
    expect(postcssSetup).toMatch(/Plugin order/)
  })

  it('keeps ### Where `@nave` is valid byte for byte', () => {
    expect(coreReadme).toContain('\n### Where `@nave` is valid\n')
  })

  it('the Exports table has a row for @navecss/core/vite', () => {
    expect(coreReadme).toMatch(/\| `@navecss\/core\/vite`\s+\|/)
  })

  it('package.json keywords hold postcss-plugin and vite-plugin, and the description names more than PostCSS', () => {
    expect(manifest.keywords).toContain('postcss-plugin')
    expect(manifest.keywords).toContain('vite-plugin')
    expect(manifest.description).toMatch(/Vite/)
  })
})

describe('the Vite plugin’s README section says what the criteria require it to say', () => {
  const vite = flat(section(coreReadme, '### Vite plugin setup'))

  it('AC-33: dev has no scan, and ?inline CSS and public/ files are not scanned', () => {
    expect(vite).toMatch(/dev server serves no bundle[^.]*no scan/i)
    expect(vite).toMatch(/\?inline/)
    expect(vite).toMatch(/public\//)
  })

  it('AC-32: Astro is named as not covered, or has a row (exactly one of the two)', () => {
    expect(vite).toMatch(/Astro[^.]*not covered/i)
  })

  it('AC-16: the fold is per stylesheet, and a bundler stopping at the first failing file reports one per build', () => {
    expect(flat(coreReadme)).toMatch(/in one stylesheet/)
    expect(flat(coreReadme)).toMatch(/stops at the first failing file reports one file per build/)
  })

  it('AC-35: it states the cost of wrapping the logger, and that an escaped spelling may still warn', () => {
    expect(vite).toMatch(/customLogger/)
    expect(vite).toMatch(/escaped spelling/)
  })

  it('states the supported Vite range as measured, not declared', () => {
    expect(vite).toMatch(/measured/i)
    expect(vite).toMatch(/Vite 8/)
  })

  it('AC-38: says to move navePlugin() from css.postcss or postcss.config.js to plugins, and that leaving both is harmless', () => {
    expect(vite).toMatch(/css\.postcss/)
    expect(vite).toMatch(/postcss\.config\.js/)
    expect(vite).toMatch(/leaving both is harmless/i)
    expect(vite).toContain("from '@navecss/core/vite'")
  })

  it('AC-36: one fence sets both floor keys, and a sentence says build.cssTarget alone still rewrites light-dark()', () => {
    const fences = extractFences('README.md', section(coreReadme, '### Vite plugin setup'))

    expect(
      fences.filter((f) => f.body.includes('cssTarget') && f.body.includes('targets')),
    ).toHaveLength(1)
    expect(vite).toMatch(/build\.cssTarget` alone still rewrites `light-dark\(\)`/)
  })
})

describe('the changeset carries the migration instruction (AC-38)', () => {
  it('says to move navePlugin() to plugins from @navecss/core/vite, and that leaving both is harmless', () => {
    const dir = path.join(REPO_ROOT, '.changeset')
    const pending = readdirSync(dir)
      .filter((name) => name.endsWith('.md') && name !== 'README.md')
      .map((name) => flat(readFileSync(path.join(dir, name), 'utf8')))
      .find((text) => text.includes('@navecss/core/vite'))

    expect(pending, 'no pending changeset names @navecss/core/vite').toBeDefined()
    expect(pending).toMatch(/css\.postcss/)
    expect(pending).toMatch(/postcss\.config\.js/)
    expect(pending).toMatch(/leaving both is harmless/i)
    expect(pending).toMatch(/'@navecss\/core': minor/)
  })
})

describe('AC-directive-core-36 — the README’s Vite fence, built', () => {
  it('under Lightning CSS keeps every light-dark() of the token stylesheet', async () => {
    const fence = extractFences('README.md', section(coreReadme, '### Vite plugin setup')).find(
      (f) => f.body.includes('cssTarget') && f.body.includes('targets'),
    )
    expect(fence).toBeDefined()

    const root = mkdtempSync(path.join(CORE_ROOT, '.nave-vite-fence-'))
    try {
      mkdirSync(path.join(root, 'src'))
      writeFileSync(
        path.join(root, 'index.html'),
        '<script type="module" src="/src/main.js"></script>',
      )
      writeFileSync(path.join(root, 'src/main.js'), "import '@navecss/tokens/css'")
      writeFileSync(path.join(root, 'vite.config.mjs'), fence!.body)
      const result = await build({
        root,
        configFile: path.join(root, 'vite.config.mjs'),
        logLevel: 'silent',
        build: { write: false },
      })
      const outputs = (Array.isArray(result) ? result : [result]) as unknown as {
        output: { fileName: string; source?: string }[]
      }[]
      const css = outputs
        .flatMap((o) => o.output)
        .filter((o) => o.fileName.endsWith('.css'))
        .map((o) => o.source)
        .join('')

      expect(css.split('light-dark(').length - 1).toBeGreaterThan(0)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  }, 60_000)
})

describe(
  'AC-directive-core-39 — CONSUMER-ATOMS.md needs no PostCSS to type-check',
  { timeout: 120_000 },
  () => {
    it('imports AtomDefinition from @navecss/core/atoms, in every fence', () => {
      const imports = extractFences('CONSUMER-ATOMS.md', consumerAtoms)
        .map((f) => f.body)
        .filter((body) => body.includes('AtomDefinition'))

      expect(imports.length).toBeGreaterThan(1)
      for (const body of imports) {
        expect(body).toContain("import type { AtomDefinition } from '@navecss/core/atoms'")
        expect(body).not.toContain("@navecss/core/postcss'")
      }
    })

    it('every TypeScript fence that declares atoms type-checks with skipLibCheck off and no postcss installed', () => {
      const fences = extractFences('CONSUMER-ATOMS.md', consumerAtoms).filter(
        (f) => f.body.includes('AtomDefinition') && f.body.includes('export const'),
      )
      expect(fences.length).toBeGreaterThan(0)
      const dir = mkdtempSync(path.join(CORE_ROOT, '.nave-atoms-types-'))
      try {
        const files = fences.map((fence, i) => {
          const file = path.join(dir, `atoms-${i}.ts`)
          writeFileSync(
            file,
            // The breakpoints import stays bare, so the check resolves it against the installed
            // `@navecss/tokens` the way a consumer's does.
            fence.body.replaceAll("'@navecss/core/atoms'", "'../dist/atoms.js'"),
          )
          return file
        })
        const program = ts.createProgram(files, {
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          target: ts.ScriptTarget.ESNext,
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          types: ['node'],
          ignoreDeprecations: '6.0',
          baseUrl: dir,
          paths: { postcss: ['./no-postcss-installed'] },
        })
        const messages = ts
          .getPreEmitDiagnostics(program)
          .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))

        expect(messages).toEqual([])
      } finally {
        rmSync(dir, { force: true, recursive: true })
      }
    })
  },
)
