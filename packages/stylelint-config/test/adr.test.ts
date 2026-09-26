/**
 * AC-consumer-constraints-30 covers: R19.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../..')
const ADR_DIR = path.join(ROOT, 'docs/04-adr')

describe('AC-consumer-constraints-30 covers: R19', () => {
  it('check-adr-structure passes', () => {
    expect(() =>
      execFileSync('node', [path.join(ROOT, 'scripts/check-adr-structure.mjs')], {
        cwd: ROOT,
        encoding: 'utf8',
      }),
    ).not.toThrow()
  })

  it('a new ADR states the fixed pair and that this package versions independently', () => {
    const files = readdirSync(ADR_DIR).filter((f) => /^\d{4}-.*\.md$/.test(f))
    const releaseTopologyAdr = files.find((f) => {
      const content = readFileSync(path.join(ADR_DIR, f), 'utf8')
      return content.includes('@navecss/stylelint-config') && /fixed/i.test(content)
    })
    expect(releaseTopologyAdr, 'no ADR found stating the release topology').toBeDefined()

    const content = readFileSync(path.join(ADR_DIR, releaseTopologyAdr!), 'utf8')
    expect(content).toMatch(/@navecss\/tokens/)
    expect(content).toMatch(/@navecss\/core/)
    expect(content).toMatch(/versions independently/)
    // the reason is carried in the ADR itself, not by pointer to another document
    expect(content.length).toBeGreaterThan(500)
  })

  it('the ADR index lists the new record', () => {
    const index = readFileSync(path.join(ADR_DIR, 'index.md'), 'utf8')
    expect(index).toMatch(/release topology/i)
  })

  it('the ADR is present in the repository tree', () => {
    expect(existsSync(path.join(ADR_DIR, '0007-release-topology.md'))).toBe(true)
  })
})
