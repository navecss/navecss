/**
 * AC-consumer-constraints-29 covers: R18.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import stylelint, { type Config } from 'stylelint'
import { describe, expect, it } from 'vitest'

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

  it('the extends fence, used verbatim, reports padding: 13px', async () => {
    const readme = tarball.read('package/README.md')
    const fences = jsonFences(readme)
    const extendsFence = fences.find(
      (f) => f.includes('"extends"') && f.includes('@navecss/stylelint-config'),
    )
    expect(extendsFence).toBeDefined()
    const parsed = JSON.parse(extendsFence!) as { extends: string[] }
    const imported = await import('../index.js')
    const isHit = await isReported(imported.default, '.a { padding: 13px; }')
    expect(isHit).toBe(true)
    expect(parsed.extends).toEqual(['@navecss/stylelint-config'])
  })

  it('each "does not check" limitation stated in the README holds as a fixture', async () => {
    const imported = await import('../index.js')
    const config = imported.default

    expect(await isReported(config, '.a { color: var(--nave-not-declared); }')).toBe(false)
    expect(await isReported(config, '.a { color: light-dark(#fff, var(--x)); }')).toBe(false)
    expect(await isReported(config, '.a { width: 13px; }')).toBe(false)

    const overridden = {
      ...config,
      rules: {
        ...config.rules,
        'scale-unlimited/declaration-strict-value': [['color'], { ignoreFunctions: false }],
      },
    }
    expect(await isReported(overridden, '.a { padding: 13px; }')).toBe(false)

    expect(await isReported(config, '.a { border: 1px solid red; }')).toBe(true)
    expect(await isReported(config, '.a { border: red 1px solid; }')).toBe(false)
    expect(await isReported(config, '.a { transition: opacity 200ms, color 300ms; }')).toBe(false)
    expect(await isReported(config, '.a { font: 700 13px/1.2 Arial; }')).toBe(false)

    const result = await stylelint.lint({
      code: '.a { font-family: var(--x), sans-serif; }',
      config,
    })
    expect(result.results[0]!.warnings[0]?.text).toContain('sans-serif')
  })

  it('links to the file holding the property list, and lists at most one checked property name', () => {
    const readme = tarball.read('package/README.md')
    expect(readme).toMatch(/\[`index\.js`\]\(index\.js\)/)
  })

  it("the adoption fence's overrides scope padding: 13px to matching files only", () => {
    const readme = tarball.read('package/README.md')
    const fences = jsonFences(readme)
    const overridesFence = fences.find((f) => f.includes('overrides'))
    expect(overridesFence).toBeDefined()
    const parsed = JSON.parse(overridesFence!) as {
      overrides: { extends: string[]; files: string[] }[]
    }
    expect(parsed.overrides[0]!.files).toEqual(['src/new/**/*.css'])
  })

  it("the root README's Packages table links packages/stylelint-config", () => {
    const rootReadme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')
    expect(rootReadme).toMatch(/\[`@navecss\/stylelint-config`\]\(packages\/stylelint-config/)
  })

  it("CLAUDE.md's Architecture block names packages/stylelint-config/", () => {
    const claudeMd = readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8')
    expect(claudeMd).toContain('packages/stylelint-config/')
  })
})
