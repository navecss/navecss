/**
 * PINS THE TWO LOGO FILES IN `.github/assets/` ON THEIR EXACT BYTES.
 *
 * `logo-horizontal-noorbit.light.svg` and `logo-horizontal-noorbit.dark.svg` are the project's
 * logo, the Nave compass mark with the NaveCSS name, shown at the top of the root README. They are
 * reproduced as exact bytes. How they may be used is set out in `TRADEMARKS.md` and in the note
 * beside them, `.github/assets/LICENSE.md`.
 *
 * If this test fails, a file changed. Do not reformat, optimise (for example with svgo), re-export
 * or re-colour either file, even where the result renders the same, and do not fix a failure by
 * recomputing its digest: a change to either file needs the maintainer's agreement first. Open an
 * issue proposing the change and get that agreement before updating the pin below. If the change
 * was an accident (a formatter, or an editor that rewrote the file on save), restore the file
 * instead.
 *
 * WHY RAW BYTES AND NOT A FOLDED FORM. Most prose pins in `cleared-text-pins.test.mjs` compare a
 * folded form, so that re-wrapping a sentence without changing a word stays green. These files are
 * not prose, so no change to them is a re-wrap: every byte is pinned, whitespace included.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. A green run shows only that the two files have not moved
 * since their digests were recorded. It does not show that they render correctly, that the README
 * still displays them, or that the note beside them is unchanged (that note is pinned in
 * `cleared-text-pins.test.mjs`).
 *
 * WIRING. This file matches `scripts/*.test.mjs`, which `scripts:test` already runs and `ci:check`
 * already chains.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The note this suite prints on every failure, alongside the digest details: what changed, why a
 * recomputed digest does not fix it, and what to do next. Kept as one constant so the wording is
 * identical whether the file went missing or its bytes moved.
 */
const RIDER =
  "This file is the project's logo, the Nave compass mark with the NaveCSS name, reproduced " +
  'here as exact bytes. Do not reformat, optimise (for example with svgo), re-export or ' +
  're-colour it: any change to these bytes, even one that renders the same, needs the ' +
  "maintainer's agreement, and a recomputed digest is not that agreement. If you changed it " +
  'on purpose, open an issue proposing the change and get that agreement before updating ' +
  'this pin; otherwise, restore the file. How it may be used is set out in TRADEMARKS.md ' +
  'and in the note beside it, .github/assets/LICENSE.md.'

/**
 * Asserts that the file at `absolutePath` exists and that the raw SHA-256 of its bytes (no
 * encoding, no folding: these are binary-adjacent SVGs, not prose) equals `expectedSha256`. Never
 * interpolates the file's own content into a failure message: the rider explains what to do
 * without ever needing to show the bytes themselves.
 */
function assertExactBytes(label, absolutePath, expectedSha256) {
  if (!existsSync(absolutePath)) {
    assert.fail(`"${label}" is missing. ${RIDER}`)
  }
  const buffer = readFileSync(absolutePath)
  const actual = createHash('sha256').update(buffer).digest('hex')
  assert.equal(
    actual,
    expectedSha256,
    `"${label}" no longer matches its reviewed bytes (expected SHA-256 ${expectedSha256}, got ` +
      `${actual} over the raw file). ${RIDER}`,
  )
}

test('.github/assets/logo-horizontal-noorbit.light.svg: exact bytes', () => {
  assertExactBytes(
    '.github/assets/logo-horizontal-noorbit.light.svg',
    path.join(ROOT, '.github/assets/logo-horizontal-noorbit.light.svg'),
    'd18e83b2a547cf6e135983d9d36f363e778102b06eafca3c74ddc7f3cfb2ab89',
  )
})

test('.github/assets/logo-horizontal-noorbit.dark.svg: exact bytes', () => {
  assertExactBytes(
    '.github/assets/logo-horizontal-noorbit.dark.svg',
    path.join(ROOT, '.github/assets/logo-horizontal-noorbit.dark.svg'),
    'efe6af135fbcca751a0196f130a1d38e8d0603efb5360944f711166cb70a7584',
  )
})

// ---------------------------------------------------------------------------------------------
// Rows: fixture-driven cases for each defect fixed in this file, run against assertExactBytes.
// ---------------------------------------------------------------------------------------------

test('row: bytes that no longer match the recorded digest fail with the rider, never the file content', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-brand-asset-pins-'))
  try {
    const file = path.join(dir, 'mark.svg')
    writeFileSync(file, 'not the reviewed bytes')
    assert.throws(
      () => assertExactBytes('mark.svg', file, '0'.repeat(64)),
      (error) => {
        assert.match(error.message, /no longer matches its reviewed bytes/)
        assert.ok(error.message.includes(RIDER))
        assert.ok(!error.message.includes('not the reviewed bytes'))
        return true
      },
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('row: a missing file fails with the "is missing" message and the rider', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-brand-asset-pins-'))
  try {
    const file = path.join(dir, 'absent.svg')
    assert.throws(
      () => assertExactBytes('absent.svg', file, '0'.repeat(64)),
      (error) => {
        assert.ok(error.message.startsWith('"absent.svg" is missing. '))
        assert.ok(error.message.includes(RIDER))
        return true
      },
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
