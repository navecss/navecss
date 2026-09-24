#!/usr/bin/env node
/**
 * Regression test for the `check:pack` dry-run defect. `pnpm publish --dry-run` exports
 * `npm_config_dry_run=true` into the environment of every script it runs, `prepublishOnly`
 * inherits it, and `attw --pack` shells out to a NESTED `pnpm pack` that also honours the
 * inherited flag and writes no tarball — so `attw` then opens a filename that was never
 * created and `check:pack` fails with `ENOENT: no such file or directory, open
 * 'navecss-<pkg>-0.1.0.tgz'`, exit 3.
 *
 * The competing hypothesis — a working-directory/staging difference, which WOULD have
 * blocked a real publish — was positively ruled out: `publint`'s own nested pack, run inside
 * the identical dry-run context, succeeds, so the nested context CAN pack; only `attw`'s
 * pack-then-open-by-predicted-name approach breaks under the suppressed write.
 *
 * `check:pack` itself has no dry-run mode of its own — it always packs a real tarball and
 * reads it — so unconditionally clearing `npm_config_dry_run` before invoking `publint`/`attw`
 * is safe for every caller: a legitimate `pnpm publish --dry-run` still gets a fully real
 * `check:pack` run, and its own scripts:check/ci:check callers already pass through no dry-run
 * flag today. This is a caller-independence fix, not a mode.
 *
 * Spawns the REAL shipped `pnpm run check:pack` (not a synthetic reproduction), in
 * `packages/core` (the fastest publishable package, and where the defect was first
 * reproduced). Runs it twice: once with `npm_config_dry_run=true` INJECTED (the exact
 * `pnpm publish --dry-run` shape) and once without, to pin that the fix did not merely
 * relocate the bug onto the caller who does NOT set the flag.
 *
 * REQUIRES BUILT OUTPUT: `publint`/`attw` resolve each package's `exports` against real files
 * under `dist/`, so this test needs a prior `pnpm run build`. `ci:check` runs `build` before
 * `scripts:test` — an order `scripts/check-ci-check-order.mjs` pins — so the gate is safe;
 * running `pnpm run scripts:test` alone on an unbuilt tree is not.
 *
 * The spawning cases below cover `packages/core` only. The manifest case pins the wrapper
 * across ALL FOUR publishable packages, so reverting it on any one of them is caught without
 * paying for four more packs, and the last case exercises the wrapper itself.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CORE_DIR = path.join(ROOT, 'packages/core')

function runCheckPack(extraEnv) {
  return spawnSync('pnpm', ['run', 'check:pack'], {
    cwd: CORE_DIR,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
  })
}

test('check:pack succeeds under an INHERITED npm_config_dry_run (the pnpm publish --dry-run shape)', () => {
  const result = runCheckPack({ npm_config_dry_run: 'true' })
  assert.equal(
    result.status,
    0,
    `check:pack failed under an inherited npm_config_dry_run flag (exit ${result.status}); ` +
      `this is the exact dry-run defect this test guards against (attw --pack cannot find the tarball it ` +
      `just packed, because the nested pnpm pack also honoured the inherited flag and wrote ` +
      `nothing). stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  )
})

test('check:pack still succeeds with no dry-run flag set (the ordinary, unaffected case)', () => {
  const env = { ...process.env }
  delete env.npm_config_dry_run
  const result = spawnSync('pnpm', ['run', 'check:pack'], { cwd: CORE_DIR, env, encoding: 'utf8' })
  assert.equal(
    result.status,
    0,
    `check:pack failed with no dry-run flag at all (exit ${result.status}) — the fix must not ` +
      `have broken the ordinary case. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  )
})

test('every publishable package wraps both publint and attw in the without-dry-run helper', () => {
  for (const pkg of ['core', 'tokens', 'cli', 'bridge']) {
    const manifest = JSON.parse(
      readFileSync(path.join(ROOT, 'packages', pkg, 'package.json'), 'utf8'),
    )
    const script = manifest.scripts['check:pack']
    assert.match(
      script,
      /^node \.\.\/\.\.\/scripts\/without-dry-run\.mjs publint\b/,
      `${pkg}: publint is not wrapped in without-dry-run`,
    )
    assert.match(
      script,
      /&& node \.\.\/\.\.\/scripts\/without-dry-run\.mjs attw --pack\b/,
      `${pkg}: attw --pack is not wrapped in without-dry-run`,
    )
  }
})

test('without-dry-run clears the flag in any case spelling and propagates the exit code', () => {
  const wrapper = path.join(ROOT, 'scripts/without-dry-run.mjs')
  const probe =
    'process.stdout.write(' +
    'Object.keys(process.env).filter((k) => k.toLowerCase() === "npm_config_dry_run").join(",")' +
    '); process.exit(7)'

  for (const spelling of ['npm_config_dry_run', 'NPM_CONFIG_DRY_RUN']) {
    const result = spawnSync(process.execPath, [wrapper, process.execPath, '-e', probe], {
      env: { ...process.env, [spelling]: 'true' },
      encoding: 'utf8',
    })
    assert.equal(result.stdout, '', `${spelling} was not cleared before reaching the child`)
    assert.equal(result.status, 7, `${spelling}: the child's exit code was not propagated`)
  }
})
