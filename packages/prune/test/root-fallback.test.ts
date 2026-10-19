/**
 * The root the plugin infers falls back to the project directory whenever Next.js's own search
 * cannot be used: its module does not load, its function throws, or it answers in a shape other
 * than `{ rootDir: string }`. The fallback declares less than Turbopack's root holds, never more.
 */
import type * as NodeModule from 'node:module'

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const scratch: string[] = []
afterEach(() => {
  vi.doUnmock('node:module')
  vi.resetModules()
  vi.unstubAllEnvs()
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
  scratch.length = 0
})

/**
 * A workspace whose top holds a pnpm workspace config, and its app at `apps/web`.
 */
function workspace(): { readonly top: string; readonly web: string } {
  const made = mkdtempSync(path.join(tmpdir(), 'prune-root-'))
  const top = realpathSync(made)
  scratch.push(top)
  const web = path.join(top, 'apps/web')
  mkdirSync(web, { recursive: true })
  writeFileSync(path.join(top, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n")
  return { top, web }
}

/**
 * The root the plugin declares within for the app in `dir`, with every `require` that loads
 * Next.js's module answering through `load` (or the real one, when `load` is omitted).
 */
async function rootFor(dir: string, load?: (id: string) => unknown): Promise<string | undefined> {
  vi.stubEnv('NEXT_PRIVATE_OUTPUT_TRACE_ROOT', '')
  vi.resetModules()
  if (load !== undefined) {
    vi.doMock('node:module', async (original) => ({
      ...(await original<typeof NodeModule>()),
      createRequire: () => load,
    }))
  }
  const { declarationRoot } = await import('../src/root.ts')
  return declarationRoot({ options: {}, dir, distDir: '.next' })
}

describe('the root inferred for a project in a workspace', () => {
  it("control: is the workspace top Next.js's own search finds", async () => {
    const { top, web } = workspace()
    expect(await rootFor(web)).toBe(top)
  })

  it('is the project directory when no module loads', async () => {
    const { web } = workspace()
    const root = await rootFor(web, () => {
      throw new Error('Cannot find module')
    })
    expect(root).toBe(web)
  })

  it('is the project directory when the search throws', async () => {
    const { web } = workspace()
    const root = await rootFor(web, () => ({
      findRootDirAndLockFiles: () => {
        throw new Error('changed internals')
      },
    }))
    expect(root).toBe(web)
  })

  it.each([
    ['no function of that name', {}],
    ['a root that is not a string', { findRootDirAndLockFiles: () => ({ rootDir: 42 }) }],
    ['no root at all', { findRootDirAndLockFiles: () => ({}) }],
  ])('is the project directory when the module answers with %s', async (_case, module) => {
    const { web } = workspace()
    expect(await rootFor(web, () => module)).toBe(web)
  })
})
