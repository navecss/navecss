/**
 * R29 (`AC-token-build-29`): any `dependencies`/`peerDependencies` entry
 * added to `@navecss/tokens`'s `package.json` is checked against the licence allow-list
 * (`scripts/check-license-allowlist.mjs`, cleared by the project's licensing steward), which
 * fails closed on a licence not on it. This item adds no such entry (its whole runtime
 * surface stays first-party plus Node, R29's own text), so the second `Given` is the package
 * AS SHIPPED today; the first is CONSTRUCTED, since the gate's own repo-wide run has nothing
 * real to trip and fabricating a real GPL dependency in the workspace to prove it would catch
 * one is exactly what `check-license-allowlist.test.mjs`'s own docblock declines to do.
 *
 * `pnpm licenses list --prod` flattens the WHOLE workspace, so a package-scoped assertion
 * cannot read "zero packages checked" off it (every OTHER package's real prod deps still
 * appear); the only package-scoped fact available is that `@navecss/tokens` declares no
 * `dependencies` or `peerDependencies` today, asserted below.
 *
 * These assert the classifier's verdicts on constructed licence strings. They do not
 * assert that `main()` routes the `--prod` scope into it, which is the `When` this AC
 * names and which nothing in this repository asserts.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  classifyBucketB,
  classifyBucketC,
  isAlwaysBlocked,
} from '../../../scripts/check-license-allowlist.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../..')
const policy = JSON.parse(
  readFileSync(path.join(REPO_ROOT, 'license-policy.json'), 'utf8'),
) as Record<string, unknown>

describe('AC-token-build-29 — the package as shipped, with no dependency entry added', () => {
  it('@navecss/tokens declares no dependencies or peerDependencies today', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'packages/tokens/package.json'), 'utf8'),
    ) as { dependencies?: unknown; peerDependencies?: unknown }

    expect(manifest.dependencies).toBeUndefined()
    expect(manifest.peerDependencies).toBeUndefined()
  })
})

describe('AC-token-build-29 — the classifier itself, over constructed licence strings', () => {
  it('a permissive licence (MIT) is allowed', () => {
    const result = classifyBucketB('MIT', policy)
    expect(result.allowed).toBe(true)
  })

  it('a licence NOT on the permissive allow-list fails closed', () => {
    const result = classifyBucketB('GPL-3.0-only', policy)
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/not on the permissive allow-list/)
  })

  it('an always-blocked, source-available use-restricting licence fails closed regardless of bucket', () => {
    const result = classifyBucketB('BUSL-1.1', policy)
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/source-available use-restricting/)

    expect(classifyBucketC('BUSL-1.1', policy).allowed).toBe(false)
    expect(isAlwaysBlocked('BUSL-1.1', policy)).toBe(true)
  })
})
