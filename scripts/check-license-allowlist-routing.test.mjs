/**
 * `AC-token-build-29`'s own `When`: `check-license-allowlist.mjs`'s
 * unit tests (`check-license-allowlist.test.mjs`, `packages/tokens/test/
 * license-allowlist-gate.test.ts`) assert the classifier's verdicts on constructed licence
 * STRINGS. Neither asserts that `pnpm licenses list --prod` actually ROUTES a real prod
 * dependency's licence into that classifier — the property the licensing steward and the
 * quality reviewer each proved
 * by hand by adding a real
 * dependency to this workspace and observing the gate fail closed, then reverting.
 *
 * Without mutating this repo's own dependency graph, this drives a SCRATCH pnpm project,
 * built fresh under the OS temp directory (never inside this repo, so it is never itself a
 * workspace member), with a real `file:` dependency declaring a real, unambiguous licence.
 * `pnpm licenses list` reads that dependency's own installed `package.json` `license` field,
 * so this exercises the exact code path `runLicensesList` (exported for this reason) runs
 * in CI — no lockfile fabrication, no synthetic JSON standing in for pnpm's own output.
 *
 * The last test in this file drives the real `main()` over the same scratch project, which is
 * what asserts the --prod scope reaches the classifier AND that a violation reaches the
 * contributor: a `main()` that stops calling its reporter prints zero bytes on both streams
 * and still exits 1, and no test that calls the reporter itself can see that.
 *
 * Physical-path resolution matters here: `mkdtemp` under macOS returns a
 * path through the `/var` -> `/private/var` symlink, and `pnpm`'s own `cwd` resolution can
 * disagree with a caller that compares paths naively. Not an issue for this file specifically
 * (nothing here compares `import.meta.url` against `process.argv[1]`), but the scratch dir
 * is resolved to its real path anyway, defensively, since `pnpm install` writes a
 * `node_modules/.modules.yaml` recording the project root and a symlinked cwd has caused
 * spurious "no project found" errors in other tooling.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  ALLOWLIST_FAILURE_GUIDANCE,
  ALLOWLIST_FAILURE_HEADER,
  classifyBucketB,
  main,
  runLicensesList,
} from './check-license-allowlist.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const policy = JSON.parse(readFileSync(path.join(ROOT, 'license-policy.json'), 'utf8'))

/**
 * Builds a standalone scratch pnpm project (never inside this repo's workspace) with one
 * `dependencies` entry, a local `file:` package declaring `licence` as its own `license`
 * field. Runs a real `pnpm install`, so the scratch project's `node_modules` is what
 * `pnpm licenses list` actually reads — not a hand-written double. Returns the resolved
 * scratch project directory; the caller is responsible for `rmSync(dir, { recursive: true })`.
 */
function buildScratchProjectWithProdDependency(licence) {
  const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), 'nave-license-routing-')))
  const depDir = path.join(scratch, 'scratch-dep')
  mkdirSync(depDir, { recursive: true })
  writeFileSync(
    path.join(depDir, 'package.json'),
    JSON.stringify({ name: 'scratch-dep', version: '1.0.0', license: licence }, undefined, 2),
  )
  writeFileSync(
    path.join(scratch, 'package.json'),
    JSON.stringify(
      {
        name: 'scratch-license-routing-project',
        version: '1.0.0',
        private: true,
        dependencies: { 'scratch-dep': 'file:./scratch-dep' },
      },
      undefined,
      2,
    ),
  )
  // Standalone project outside this repo: no workspace file to ignore. `pnpm licenses
  // list` itself requires a lockfile to exist (ERR_PNPM_LICENSES_NO_LOCKFILE otherwise),
  // so a plain `pnpm install` (which writes one) is used, not `--no-lockfile`.
  execFileSync('pnpm', ['install'], { cwd: scratch, encoding: 'utf8' })
  return scratch
}

test(
  "runLicensesList reports a real installed file: dependency's declared licence as GPL-3.0-only, and classifyBucketB refuses it",
  { timeout: 60_000 },
  () => {
    const scratch = buildScratchProjectWithProdDependency('GPL-3.0-only')
    try {
      const prodJson = runLicensesList(['--prod'], scratch)
      const prodEntries = Object.entries(prodJson)
      const found = prodEntries.find(([, packages]) =>
        packages.some((pkg) => pkg.name === 'scratch-dep'),
      )
      assert.ok(found, `scratch-dep not found in pnpm licenses list --prod output at ${scratch}`)
      const [license] = found
      assert.equal(license, 'GPL-3.0-only')

      const { allowed, reason } = classifyBucketB(license, policy)
      assert.equal(allowed, false)
      assert.match(reason, /not on the permissive allow-list/)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  },
)

test(
  'runLicensesList surfaces a real installed file: dependency, and classifyBucketB admits the licence pnpm reports for it as permissive',
  { timeout: 60_000 },
  () => {
    const scratch = buildScratchProjectWithProdDependency('ISC')
    try {
      const prodJson = runLicensesList(['--prod'], scratch)
      const prodEntries = Object.entries(prodJson)
      const found = prodEntries.find(([, packages]) =>
        packages.some((pkg) => pkg.name === 'scratch-dep'),
      )
      assert.ok(found, `scratch-dep not found in pnpm licenses list --prod output at ${scratch}`)
      const [license] = found

      const { allowed, reason } = classifyBucketB(license, policy)
      assert.equal(allowed, true)
      assert.equal(reason, 'permissive')
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  },
)

// The two tests above stop at the classifier, and the composed-output test in
// check-license-allowlist.test.mjs calls the reporter itself, so neither can see `main()`
// dropping the reporter call: a red run then prints zero bytes on both streams and exits 1,
// which tells a contributor nothing at all. This drives the real entry point end to end,
// against the repository's own `license-policy.json` copied into the scratch project (so the
// verdict is the real policy's, not a fixture's), and asserts the cleared bytes actually
// reach stderr. `main()` sets `process.exitCode`, which outlives the test and would fail the
// whole run, so it is saved and restored alongside console.error.
test(
  'main() routes the --prod scope through the classifier and prints the composed cleared message',
  { timeout: 60_000 },
  () => {
    const scratch = buildScratchProjectWithProdDependency('GPL-3.0-only')
    try {
      writeFileSync(
        path.join(scratch, 'license-policy.json'),
        readFileSync(path.join(ROOT, 'license-policy.json'), 'utf8'),
      )

      const calls = []
      const originalConsoleError = console.error
      const originalExitCode = process.exitCode
      let exitCode
      console.error = (message) => {
        calls.push(message)
      }
      try {
        main(scratch)
        exitCode = process.exitCode
      } finally {
        console.error = originalConsoleError
        process.exitCode = originalExitCode
      }

      assert.equal(exitCode, 1)
      assert.equal(calls.length, 3)
      assert.equal(calls[0], ALLOWLIST_FAILURE_HEADER)
      // The version segment is left unasserted: `pnpm licenses list` reports no version for a
      // `file:` dependency, so this line reads `scratch-dep@null`. That is a property of the
      // scratch fixture, not of the routing this test is about, and pinning it here would tie
      // the test to a pnpm output detail it does not exercise.
      assert.match(calls[1], /^ {2}- \[bucket B \(prod\)] scratch-dep@\S+: "GPL-3\.0-only" /)
      assert.equal(calls[2], ALLOWLIST_FAILURE_GUIDANCE)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  },
)
