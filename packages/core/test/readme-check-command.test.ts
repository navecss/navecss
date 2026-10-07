/**
 * AC-directive-core-24: the `navecss-core check` invocation the README
 * teaches is one the built bin actually accepts, its exit contract is
 * documented in full, and every invocation of it across the package's own
 * docs is written the way a consumer should copy it — chained with `&&`
 * inside a `package.json` script, never as a bare `npx` call.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { shippedChangesetProse } from './helpers/released-changeset.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BIN = path.resolve(HERE, '..', 'dist', 'bin.js')
const CORE_README = path.resolve(HERE, '..', 'README.md')
const ROOT_README = path.resolve(HERE, '..', '..', '..', 'README.md')
const CONSUMER_ATOMS = path.resolve(HERE, '..', 'CONSUMER-ATOMS.md')
const CORE_CHANGELOG = path.resolve(HERE, '..', 'CHANGELOG.md')
const CHANGESET = path.resolve(HERE, '..', '..', '..', '.changeset', 'directive-core-resolver.md')

/**
 * The prose the directive-core change ships: its pending changeset while one exists, and the
 * CHANGELOG entry the release wrote from it afterwards.
 */
const changesetProse = (): string =>
  shippedChangesetProse(
    CHANGESET,
    CORE_CHANGELOG,
    "The `@nave` directive's resolution and placement",
  )

const readFile = (filePath: string) => (): string => readFileSync(filePath, 'utf8')

function run(cwd: string, ...args: string[]): { out: string; status: number | null } {
  const result = spawnSync(process.execPath, [BIN, 'check', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
  })
  return { out: result.stdout + result.stderr, status: result.status }
}

/**
Every fenced code block in `text`, as its raw body (fence markers stripped).
 */
function fencedBlocks(text: string): string[] {
  const blocks: string[] = []
  const re = /```[^\n]*\n([\s\S]*?)```/g
  for (const match of text.matchAll(re)) blocks.push(match[1]!)
  return blocks
}

describe('AC-directive-core-24 — the README-taught check command actually runs', () => {
  it("derives the command from the package's own README and runs it clean", () => {
    const readmeText = readFileSync(CORE_README, 'utf8')
    const match = /navecss-core check (--source=\S+)/.exec(readmeText)
    expect(match).not.toBeNull()
    const flag = match![1]!.replace(/"$/, '')

    const dir = mkdtempSync(path.join(tmpdir(), 'nave-readme-check-'))
    try {
      mkdirSync(path.join(dir, 'dist'))
      writeFileSync(path.join(dir, 'dist', 'a.css'), '.a{color:red}')

      const result = run(dir, flag)

      expect(result.status).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('states all three exit codes', () => {
    const readmeText = readFileSync(CORE_README, 'utf8')

    expect(readmeText).toMatch(/-\s*`0`\s*—/)
    expect(readmeText).toMatch(/-\s*`1`\s*—/)
    expect(readmeText).toMatch(/-\s*`2`\s*—/)
  })

  it.each([
    ['README.md', readFile(ROOT_README)],
    ['packages/core/README.md', readFile(CORE_README)],
    ['packages/core/CONSUMER-ATOMS.md', readFile(CONSUMER_ATOMS)],
    ['the directive-core changeset, or the CHANGELOG entry that released it', changesetProse],
  ])(
    '%s: every runnable check invocation is chained with && inside a package.json script fence',
    (_name, read) => {
      const text = read()
      const invocationPattern = /navecss-core check --source=\S+/g
      const blocks = fencedBlocks(text)

      for (const invocation of text.matchAll(invocationPattern)) {
        const isChainedFence = blocks.some(
          (block) => block.includes(invocation[0]) && block.includes('&&'),
        )
        expect(isChainedFence).toBe(true)
      }
    },
  )

  it.each([
    ['README.md', readFile(ROOT_README)],
    ['packages/core/README.md', readFile(CORE_README)],
    ['packages/core/CONSUMER-ATOMS.md', readFile(CONSUMER_ATOMS)],
    ['the directive-core changeset, or the CHANGELOG entry that released it', changesetProse],
  ])('%s: never teaches a bare npx invocation', (_name, read) => {
    const text = read()

    expect(text.replaceAll(/\s+/g, ' ')).not.toContain('npx navecss-core')
  })
})
