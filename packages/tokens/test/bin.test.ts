/**
 * R1, R4, R8, R9: the shipped, COMPILED `bin: navecss-tokens`, exercised OUT OF PROCESS
 * against a scratch "installed package" copy — `dist/` only, no monorepo path reachable,
 * exactly what a consumer's own `node_modules` looks like. Assumes `pnpm run build` has
 * already produced `dist/` (this package's own `test` script depends on `build` in
 * `turbo.json`, same convention as `test/no-inlined-dependency.test.ts`).
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..')
const DIST_DIR = path.join(PACKAGE_ROOT, 'dist')
const PACKAGE_JSON = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
  bin: Record<string, string>
  version: string
}

// Every case that copies `dist/` into a scratch install and spawns a real `node` process via
// `runNode` queues behind the OS scheduler when the whole monorepo's tests run in parallel, and
// can exceed the 5s default even though the same case takes well under a second in isolation.
// Cases that assert on static values with no spawn keep the default, so a genuine hang still
// shows up fast.
const SPAWN_TEST_TIMEOUT_MS = 20_000

// The running test's effective timeout, read by `runNode` so that a spawn inside a test still on
// the 5s default fails on every run, not only on a loaded one. Without it, a new spawn case
// added outside a `{ timeout: SPAWN_TEST_TIMEOUT_MS }` describe passes alone and flakes later.
// One shared value can only describe one running test, so it reads 0 (and `runNode` refuses)
// between tests, which covers hooks, and for concurrent tests, whose runs interleave.
const currentTest = { timeout: 0 }
beforeEach(({ task }) => {
  currentTest.timeout = task.concurrent ? 0 : task.timeout
})
afterEach(() => {
  currentTest.timeout = 0
})

interface RunResult {
  status: number
  stdout: string
  stderr: string
}

/**
 * `execFileSync` (the prior implementation) only ever returns the
 * child's STDOUT on a successful (exit `0`) run — its own docs: "stderr by default will be
 * output to the parent process' stderr unless stdio is specified" — so every caller of this
 * helper that inspected `.stderr` after a `status === 0` run was reading a hardcoded `''`,
 * never the child's real stderr. That was invisible until `build`'s new version-skew advisory
 * (stderr, exit `0`) needed asserting for real. `spawnSync` captures BOTH streams on every
 * exit status uniformly, so this switches to it rather than adding a second, differently-shaped
 * helper for the success case alone.
 */
function runNode(
  scriptPath: string,
  args: string[],
  cwd: string,
  nodeFlags: string[] = [],
): RunResult {
  if (currentTest.timeout < SPAWN_TEST_TIMEOUT_MS) {
    throw new Error(
      `runNode needs a sequential test with a timeout of at least ${SPAWN_TEST_TIMEOUT_MS}ms but read ${currentTest.timeout}ms (0 means a hook or a concurrent test); spawn only from a non-concurrent \`it\` inside a describe carrying { timeout: SPAWN_TEST_TIMEOUT_MS }`,
    )
  }
  return spawnNode([...nodeFlags, scriptPath, ...args], cwd, SPAWN_TEST_TIMEOUT_MS)
}

/**
 * A child that ends with NO exit code (killed at `killAfterMs`, killed by a signal, or never
 * started) throws rather than reporting a status: read as exit `1` it would pass every case that
 * asserts a non-zero exit. `killAfterMs` is what bounds a hung child at all, since vitest's own
 * budget cannot interrupt a synchronous `spawnSync` and only reports once it returns; the kill is
 * SIGKILL because a child can trap the default SIGTERM and keep `spawnSync` waiting.
 */
function spawnNode(nodeArgs: string[], cwd: string, killAfterMs: number): RunResult {
  const result = spawnSync(process.execPath, nodeArgs, {
    cwd,
    encoding: 'utf8',
    timeout: killAfterMs,
    killSignal: 'SIGKILL',
  })
  if (result.status === null) {
    const reason = result.error?.message ?? `signal ${result.signal}`
    throw new Error(`node ${nodeArgs.join(' ')} ended with no exit code (${reason})`)
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/**
 * R9/AC-token-build-08/AC-token-build-01: a scratch directory shaped exactly as a
 * consumer's own project — `node_modules/@navecss/tokens/` holding ONLY this package's
 * real, already-built `dist/` plus its bundled `tokens.json` and a minimal `package.json`.
 * No `packages/core/src`, no monorepo path of any kind is reachable from here — realpath'd
 * (macOS `/var/folders` is a symlink to `/private/var/folders`, which
 * `import.meta.url` resolves through and `process.cwd()`-derived paths do not, unless
 * resolved up front).
 */
function scratchInstall(): { binPath: string; projectDir: string } {
  const prefix = path.join(tmpdir(), 'navecss-tokens-bin-')
  const projectDir = realpathSync(mkdtempSync(prefix))
  const pkgDir = path.join(projectDir, 'node_modules', '@navecss', 'tokens')
  mkdirSync(pkgDir, { recursive: true })
  cpSync(DIST_DIR, path.join(pkgDir, 'dist'), { recursive: true })
  cpSync(path.join(PACKAGE_ROOT, 'tokens.json'), path.join(pkgDir, 'tokens.json'))
  writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: '@navecss/tokens', type: 'module', version: PACKAGE_JSON.version }),
  )
  return { binPath: path.join(pkgDir, 'dist', 'lib', 'bin.js'), projectDir }
}

describe('AC-token-build-01 covers: R1', () => {
  it('declares exactly one binary, named navecss-tokens (never navecss)', () => {
    expect(Object.keys(PACKAGE_JSON.bin)).toEqual(['navecss-tokens'])
  })

  it('the compiled bin imports EXACTLY node:util and ./facade.js — its only route to the pipeline is through the façade, and no other module edge exists at all', () => {
    // This was `not.toMatch(/theming\/pipeline|theming\/emit|
    // runPipeline\(/)`, three terms — a denylist under a criterion ("no pipeline logic in the
    // bin") whose own words are a whitelist, so `import { generateRamp } from
    // './theming/ramp.js'` passed it. The import set is ENUMERATED instead, so any new module
    // edge fails here whether or not anybody thought to name it in advance.
    const binSource = readFileSync(path.join(DIST_DIR, 'lib', 'bin.js'), 'utf8')
    const specifiers = binSource
      .matchAll(/(?:^|\n)\s*import\b[^'"]*['"]([^'"]+)['"]/g)
      .map((match) => match[1]!)
      .toArray()
      .toSorted((a, b) => a.localeCompare(b))
    expect(specifiers).toEqual(['./facade.js', 'node:util'])
  })

  it('@navecss/cli owns no pipeline logic (token generation, ramp construction, semantic resolution)', () => {
    const cliSource = readFileSync(path.resolve(PACKAGE_ROOT, '../cli/src/index.ts'), 'utf8')
    expect(cliSource).not.toMatch(/@navecss\/tokens|runPipeline|generateRamp|resolveSlotMapping/)
  })
})

describe(
  'AC-token-build-01 covers: R1 (out-of-process spawn cases)',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    it('validate runs to completion from a fresh install with no prior build and writes no build artifact', () => {
      const { binPath, projectDir } = scratchInstall()
      const source = path.join(projectDir, 'consumer.css')
      writeFileSync(source, ':root { --nave-color-surface-base: white; }')
      const outDirBefore = path.join(projectDir, 'dist')

      const result = runNode(binPath, ['validate', '--source', source], projectDir)

      expect(result.status).toBe(1) // this source is missing contract tokens
      // `readFileSync` throws EISDIR on an EXISTING directory just as
      // readily as ENOENT on a missing one, so `expect(() => readFileSync(...)).toThrow()`
      // cannot distinguish "never created" from "created" — only a readable FILE at this path
      // would pass it. `existsSync` states the actual claim.
      expect(existsSync(outDirBefore)).toBe(false) // no directory was ever created
    })

    it('build resolves the pipeline in the R31-mandated order (seed, ramp, per-step overrides, semantics) through the REAL shipped entry point', () => {
      const { binPath, projectDir } = scratchInstall()
      const overridesPath = path.join(projectDir, 'overrides.json')
      writeFileSync(overridesPath, JSON.stringify({ primary: { 500: 0.01 } }))

      const outWithOverride = path.join(projectDir, 'out-with-override')
      const withOverride = runNode(
        binPath,
        [
          'build',
          '--seed',
          'oklch(0.55 0.18 250)',
          '--out',
          outWithOverride,
          '--overrides',
          overridesPath,
        ],
        projectDir,
      )
      expect(withOverride.status).toBe(0)

      const outNoOverride = path.join(projectDir, 'out-no-override')
      const withoutOverride = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outNoOverride],
        projectDir,
      )
      expect(withoutOverride.status).toBe(0)

      // The per-step override changes the resolved primary ramp — a real, out-of-process
      // effect of the OVERRIDE step running after ramp generation and before semantics
      // resolve, not an in-memory unit-test double.
      const withOverrideResolved = readFileSync(
        path.join(outWithOverride, 'palette-record.json'),
        'utf8',
      )
      const withoutOverrideResolved = readFileSync(
        path.join(outNoOverride, 'palette-record.json'),
        'utf8',
      )
      expect(withOverrideResolved).not.toBe(withoutOverrideResolved)
    })
  },
)

describe(
  'AC-token-build-03 covers: R3 (bin-level: no other flag or option exists)',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    it('an unrecognised flag is refused rather than silently ignored', () => {
      const { binPath, projectDir } = scratchInstall()
      const result = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', 'out', '--config', 'x.json'],
        projectDir,
      )
      expect(result.status).toBe(2)
    })

    /**
     * `test/facade.test.ts`'s own R3 "no discovery" test writes its config
     * file into a `mkdtemp` scratch directory that is neither the IN-PROCESS `process.cwd()`
     * (fixed at `packages/tokens` for every in-process test) nor an ancestor of it — the
     * canonical scheme R3 forbids ("no search up the directory tree") is never given a file to
     * find there, so a real cwd-and-ancestors config-discovery bug would pass that test
     * invisibly. This runs the REAL compiled bin OUT of process with the config file sitting
     * exactly at its own invocation cwd — the one place discovery, if it existed, would find it
     * first — and asserts the build output is unaffected by its presence.
     */
    it('a plausible config file sitting at the invoking cwd itself changes nothing: no discovery is ever attempted', () => {
      const { binPath, projectDir: withConfigDir } = scratchInstall()
      writeFileSync(
        path.join(withConfigDir, 'navecss.config.json'),
        JSON.stringify({ seed: 'oklch(0.1 0.3 10)' }),
      )
      const outWithConfig = path.join(withConfigDir, 'out')
      const withConfig = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outWithConfig],
        withConfigDir, // the config file's own directory IS the invocation cwd
      )
      expect(withConfig.status).toBe(0)

      const { binPath: binPath2, projectDir: withoutConfigDir } = scratchInstall()
      const outWithoutConfig = path.join(withoutConfigDir, 'out')
      const withoutConfig = runNode(
        binPath2,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outWithoutConfig],
        withoutConfigDir,
      )
      expect(withoutConfig.status).toBe(0)

      expect(readFileSync(path.join(outWithConfig, 'tokens.css'), 'utf8')).toBe(
        readFileSync(path.join(outWithoutConfig, 'tokens.css'), 'utf8'),
      )
    })
  },
)

describe(
  'AC-token-build-04 covers: R4 (real, out-of-process exit codes; the SET is exactly {0, 1, 2})',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    it('build to completion with no error exits 0', () => {
      const { binPath, projectDir } = scratchInstall()
      const result = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', path.join(projectDir, 'out')],
        projectDir,
      )
      expect(result.status).toBe(0)
    })

    it("build invoked with an unparsable seed exits 2 (a malformed required argument, R4's own worked example)", () => {
      const { binPath, projectDir } = scratchInstall()
      const result = runNode(
        binPath,
        ['build', '--seed', 'not-a-colour', '--out', path.join(projectDir, 'out')],
        projectDir,
      )
      expect(result.status).toBe(2)
      expect(result.stderr.length).toBeGreaterThan(0) // R23: refused to the ERROR channel
      expect(result.stdout).toBe('') // R23's "and not to stdout" half, unasserted until now
    })

    it('build invoked with a missing required argument exits 2', () => {
      const { binPath, projectDir } = scratchInstall()
      const result = runNode(binPath, ['build', '--out', path.join(projectDir, 'out')], projectDir)
      expect(result.status).toBe(2)
    })

    it('an unknown subcommand exits 2', () => {
      const { binPath, projectDir } = scratchInstall()
      const result = runNode(binPath, ['frobnicate'], projectDir)
      expect(result.status).toBe(2)
    })

    it('validate against a source missing contract tokens exits 1', () => {
      const { binPath, projectDir } = scratchInstall()
      const source = path.join(projectDir, 'consumer.css')
      writeFileSync(source, ':root { --nave-color-surface-base: white; }')
      const result = runNode(binPath, ['validate', '--source', source], projectDir)
      expect(result.status).toBe(1)
    })

    it('the exit-code set observed across every case above is exactly {0, 1, 2}', () => {
      const { binPath, projectDir } = scratchInstall()
      const source = path.join(projectDir, 'consumer.css')
      writeFileSync(source, ':root {}')
      const outcomes = [
        runNode(
          binPath,
          ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', path.join(projectDir, 'o1')],
          projectDir,
        ),
        runNode(
          binPath,
          ['build', '--seed', 'nope', '--out', path.join(projectDir, 'o2')],
          projectDir,
        ),
        runNode(binPath, ['validate', '--source', source], projectDir),
      ]
      const statuses = new Set(outcomes.map((outcome) => outcome.status))
      expect(statuses).toEqual(new Set([0, 1, 2]))
    })
  },
)

describe('AC-token-build-07 covers: R8', () => {
  it('ships compiled per-file JavaScript under dist/ and no src/ directory', () => {
    expect(PACKAGE_ROOT).toBeTruthy()
    // `files` governs what npm packs; asserted directly against the package manifest.
    const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      files: string[]
    }
    expect(pkg.files).not.toContain('src')
    expect(pkg.files.some((f) => f.startsWith('src'))).toBe(false)

    // The criterion's own words are "its `files` field AND its
    // PUBLISHED CONTENTS are inspected" — the `pkg.files` check above cannot distinguish a
    // real compile step from a `dist/lib` directory that merely happens to exist (it passed
    // on this exact assertion with the compile step deleted). Read the actual compiled
    // files: real per-file JavaScript, not the TypeScript source verbatim.
    const facadeJs = readFileSync(path.join(DIST_DIR, 'lib', 'facade.js'), 'utf8')
    const binJs = readFileSync(path.join(DIST_DIR, 'lib', 'bin.js'), 'utf8')
    for (const compiled of [facadeJs, binJs]) {
      expect(compiled).not.toMatch(/^\s*import type\b/m)
      expect(compiled).not.toMatch(/:\s*(string|number|boolean)\b/) // a TS type annotation
    }
  })
})

describe(
  'AC-token-build-07 covers: R8 (out-of-process spawn cases)',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    it('invoked from inside a node_modules install at the declared Node floor, neither the entry point nor the bin throws ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING', () => {
      const { binPath, projectDir } = scratchInstall()
      const result = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', path.join(projectDir, 'out')],
        projectDir,
      )
      expect(result.stderr).not.toMatch(/ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING/)
      expect(result.status).toBe(0)
    })
  },
)

describe(
  'AC-token-build-04 covers: R4 (--overrides shape, malformed --source, --help)',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    it('an --overrides file that parses as JSON but is the wrong SHAPE (an array) is refused, not silently ignored', () => {
      const { binPath, projectDir } = scratchInstall()
      const overridesPath = path.join(projectDir, 'overrides.json')
      writeFileSync(overridesPath, JSON.stringify([1, 2, 3]))
      const result = runNode(
        binPath,
        [
          'build',
          '--seed',
          'oklch(0.55 0.18 250)',
          '--out',
          path.join(projectDir, 'out'),
          '--overrides',
          overridesPath,
        ],
        projectDir,
      )
      expect(result.status).toBe(2)
      expect(result.stderr).toMatch(/must be a JSON object, got an array/)
    })

    it('an --overrides file naming an unrecognised step is refused, not silently ignored', () => {
      const { binPath, projectDir } = scratchInstall()
      const overridesPath = path.join(projectDir, 'overrides.json')
      writeFileSync(overridesPath, JSON.stringify({ ramp: 'not an object' }))
      const result = runNode(
        binPath,
        [
          'build',
          '--seed',
          'oklch(0.55 0.18 250)',
          '--out',
          path.join(projectDir, 'out'),
          '--overrides',
          overridesPath,
        ],
        projectDir,
      )
      expect(result.status).toBe(2)
      expect(result.stderr).toMatch(/unrecognised step "ramp"/)
    })

    it('a malformed --source JSON file for validate is a named usage error at exit 2, not a raw SyntaxError at exit 1', () => {
      const { binPath, projectDir } = scratchInstall()
      const source = path.join(projectDir, 'broken.json')
      writeFileSync(source, 'not json at all')
      const result = runNode(binPath, ['validate', '--source', source], projectDir)
      expect(result.status).toBe(2)
      expect(result.stderr).toMatch(/is not valid JSON/)
      expect(result.stderr).not.toMatch(/^SyntaxError/m)
    })

    /**
     * A review round (the quality reviewer's note F10): `build`'s own `readFile` +
     * `namesFromSource('json', ...)` (R16's union check) runs before `composeDtcgOutputs`, so a
     * malformed `--source` is now rejected as a `UsageError` (exit 2) where it used to surface
     * as the DTCG reader's raw `SyntaxError` (exit 1). That is the RIGHT answer — it matches
     * `--overrides`'s sibling behaviour above, matches the `errors.ts`/`facade.ts` taxonomy
     * (`UsageError` = the entry point rejecting the call itself), and is the same correction already
     * made for `validate` one test up. What it was missing is a PIN: `AC-token-build-04`'s
     * exit-code test asserts only that the observed SET is `{0, 1, 2}`,
     * which is unchanged by the move, so nothing would have noticed the mapping going back.
     */
    it('a malformed --source JSON file for BUILD is a named usage error at exit 2, not a raw SyntaxError at exit 1 (the same mapping validate already had)', () => {
      const { binPath, projectDir } = scratchInstall()
      const source = path.join(projectDir, 'broken-build-source.json')
      writeFileSync(source, '{ "color": }')
      const outDir = path.join(projectDir, 'out-broken')
      const result = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outDir, '--source', source],
        projectDir,
      )
      expect(result.status).toBe(2)
      expect(result.stderr).toMatch(/is not valid JSON/)
      expect(result.stderr).toContain(source)
      expect(result.stderr).not.toMatch(/^SyntaxError/m)
      // R23: a refusal leaves no artifact on disk.
      expect(existsSync(outDir)).toBe(false)
    })

    it('--help and -h at the top level print usage and exit 0, never "unknown subcommand"', () => {
      const { binPath, projectDir } = scratchInstall()
      for (const flag of ['--help', '-h']) {
        const result = runNode(binPath, [flag], projectDir)
        expect(result.status).toBe(0)
        expect(result.stdout).toMatch(/^Usage:/)
        expect(result.stdout).not.toMatch(/unknown subcommand/)
      }
    })

    it('build --help and validate --help print usage and exit 0, never "Unknown option"', () => {
      const { binPath, projectDir } = scratchInstall()
      for (const args of [
        ['build', '--help'],
        ['validate', '--help'],
        ['build', '-h'],
      ]) {
        const result = runNode(binPath, args, projectDir)
        expect(result.status).toBe(0)
        expect(result.stdout).toMatch(/^Usage:/)
        expect(result.stderr).not.toMatch(/Unknown option/)
      }
    })

    it('a missing required flag prints the usage block alongside the specific error, not the error alone', () => {
      const { binPath, projectDir } = scratchInstall()
      const missingSeed = runNode(
        binPath,
        ['build', '--out', path.join(projectDir, 'out')],
        projectDir,
      )
      expect(missingSeed.status).toBe(2)
      expect(missingSeed.stderr).toMatch(/build requires --seed/)
      expect(missingSeed.stderr).toMatch(/Usage:/)

      const missingOut = runNode(binPath, ['build', '--seed', 'oklch(0.55 0.18 250)'], projectDir)
      expect(missingOut.status).toBe(2)
      expect(missingOut.stderr).toMatch(/build requires --out/)
      expect(missingOut.stderr).toMatch(/Usage:/)

      const missingSource = runNode(binPath, ['validate'], projectDir)
      expect(missingSource.status).toBe(2)
      expect(missingSource.stderr).toMatch(/validate requires --source/)
      expect(missingSource.stderr).toMatch(/Usage:/)
    })
  },
)

describe(
  'AC-token-build-35 covers: R35 (no test asserted this before now)',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    // The seed here is a HEX and not an `oklch()` literal on purpose.
    // R35 says the line names the seed "as resolved", and `facade.ts` used to return
    // `options.seed` verbatim — a defect an `oklch()` seed cannot expose, because the raw input
    // and the resolved value are the same string. A hex separates them.
    it('a successful build prints exactly one stdout line, naming the RESOLVED seed (not the raw input) and the files written, and no other line', () => {
      const { binPath, projectDir } = scratchInstall()
      const seed = '#3366ff'
      const outDir = path.join(projectDir, 'out')
      const result = runNode(binPath, ['build', '--seed', seed, '--out', outDir], projectDir)
      expect(result.status).toBe(0)

      const lines = result.stdout.split('\n').filter((line) => line.length > 0)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatch(/^Built from seed oklch\([\d.]+ [\d.]+ [\d.]+\): /)
      expect(lines[0]).not.toContain(seed)
      for (const file of [
        'tokens.css',
        'tokens.js',
        'tokens.d.ts',
        'breakpoints.js',
        'breakpoints.d.ts',
        'palette-record.json',
        'build-record.json',
      ]) {
        expect(lines[0]).toContain(file)
      }
    })

    it('a build that gamut-normalises its seed states so on the SAME one line, never a second line', () => {
      const { binPath, projectDir } = scratchInstall()
      const outDir = path.join(projectDir, 'out')
      // Far outside sRGB at any hue: normalizeSeed must reduce chroma.
      const result = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.5 0.5 200)', '--out', outDir],
        projectDir,
      )
      expect(result.status).toBe(0)

      const lines = result.stdout.split('\n').filter((line) => line.length > 0)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatch(/^Built from seed oklch\(/)
      expect(lines[0]).toContain('(chroma reduced to fit sRGB)')
    })

    it('a build whose seed only hits the lightness band clamp (not gamut-normalised) prints the one line with no qualifier', () => {
      const { binPath, projectDir } = scratchInstall()
      const outDir = path.join(projectDir, 'out')
      const result = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.95 0.03 90)', '--out', outDir],
        projectDir,
      )
      expect(result.status).toBe(0)

      const lines = result.stdout.split('\n').filter((line) => line.length > 0)
      expect(lines).toHaveLength(1)
      expect(lines[0]).not.toContain('chroma reduced')
    })

    it('a build whose seed lightness is at or above 1 (mapped to white) states so on the one line, never "chroma reduced"', () => {
      const { binPath, projectDir } = scratchInstall()
      const outDir = path.join(projectDir, 'out')
      const result = runNode(
        binPath,
        ['build', '--seed', 'color(srgb 1.2 1.2 1.2)', '--out', outDir],
        projectDir,
      )
      expect(result.status).toBe(0)

      const lines = result.stdout.split('\n').filter((line) => line.length > 0)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain('(mapped to white to fit sRGB)')
      expect(lines[0]).not.toContain('chroma reduced')
    })

    it('a build whose seed lightness is at or below 0 (mapped to black) states so on the one line, never "chroma reduced"', () => {
      const { binPath, projectDir } = scratchInstall()
      const outDir = path.join(projectDir, 'out')
      const result = runNode(
        binPath,
        ['build', '--seed', 'color(srgb -0.2 -0.1 0)', '--out', outDir],
        projectDir,
      )
      expect(result.status).toBe(0)

      const lines = result.stdout.split('\n').filter((line) => line.length > 0)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain('(mapped to black to fit sRGB)')
      expect(lines[0]).not.toContain('chroma reduced')
    })
  },
)

describe(
  'AC-token-build-08 covers: R9 (out-of-process black-box clause)',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    it('neither subcommand reads any path outside its own installed directory and the caller-named paths, from a directory with no monorepo present', () => {
      const { binPath, projectDir } = scratchInstall()
      const outDir = path.join(projectDir, 'out')
      const buildResult = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outDir],
        projectDir,
      )
      expect(buildResult.status).toBe(0)
      expect(buildResult.stderr).not.toMatch(/ENOENT/)

      const source = path.join(outDir, 'tokens.css')
      const validateResult = runNode(binPath, ['validate', '--source', source], projectDir)
      expect(validateResult.status).toBe(0)
      expect(validateResult.stderr).not.toMatch(/ENOENT/)
    })

    /**
     * An architecture reviewer's finding pointed at a real mechanism rather than the fs-spy the
     * original ask declined: Node's own `--permission` model, on the pinned runtime (v24.17.0),
     * refuses any read/write path outside the granted globs at the RUNTIME level, covering every fs
     * API — `readFile`, `readFileSync`, `open`, `createReadStream`, dynamic `import()` — with nothing
     * to keep in sync with Node's fs surface, unlike a spy on one API. Both globs are realpath'd
     * (`scratchInstall()` already does this), because macOS resolves `/tmp` through a symlink the
     * permission model's own `realpathSync` would otherwise reject at module load with
     * `ERR_ACCESS_DENIED` before this code ever runs.
     *
     * What this proves, stated so it is not read as more than it is: no read or write in this
     * run reaches outside the consumer's own project directory (which forbids `$HOME`, `/etc`,
     * the monorepo, and every absolute path elsewhere — including this issue's own
     * `readFile('/etc/hosts')` mutation, which a run under this fence would refuse). It does
     * NOT prove no read reaches an unnamed file INSIDE the project subtree; the achievable bound
     * is the subtree, not the exact path list R9 enumerates.
     */
    it('build and validate both complete under a real fs permission fence scoped to the scratch project subtree alone, on the pinned Node runtime', () => {
      const { binPath, projectDir } = scratchInstall()
      const outDir = path.join(projectDir, 'permission-out')
      const permissionArgs = [
        '--permission',
        `--allow-fs-read=${projectDir}/*`,
        `--allow-fs-write=${outDir}/*`,
      ]

      const buildResult = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outDir],
        projectDir,
        permissionArgs,
      )
      expect(buildResult.stderr).not.toMatch(
        /ERR_ACCESS_DENIED|Access to this API has been restricted/,
      )
      expect(buildResult.status).toBe(0)

      const validateResult = runNode(
        binPath,
        ['validate', '--source', path.join(outDir, 'tokens.css')],
        projectDir,
        [
          '--permission',
          `--allow-fs-read=${projectDir}/*`,
          // validate writes nothing; an empty write glob keeps the fence as narrow as the
          // subcommand's own contract (R23-adjacent: validate never writes).
        ],
      )
      expect(validateResult.stderr).not.toMatch(
        /ERR_ACCESS_DENIED|Access to this API has been restricted/,
      )
      expect(validateResult.status).toBe(0)
    })

    it('a real permission fence refuses a read outside the granted subtree at the runtime level, on a bare control script (proves the instrument itself refuses, independent of this package)', () => {
      const prefix = path.join(tmpdir(), 'navecss-tokens-perm-')
      const scratch = realpathSync(mkdtempSync(prefix))
      const controlScript = path.join(scratch, 'read-etc-hosts.mjs')
      writeFileSync(
        controlScript,
        "await import('node:fs/promises').then(m => m.readFile('/etc/hosts'))",
      )
      const result = runNode(controlScript, [], scratch, [
        '--permission',
        `--allow-fs-read=${scratch}/*`,
      ])
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/ERR_ACCESS_DENIED|Access to this API has been restricted/)
    })
  },
)

/**
 * `validate()`'s own real, out-of-process `installedCoreVersion` route,
 * driven in BOTH directions this scratch install can produce — no core installed at all, and
 * an OLDER core installed but unresolvable via R14's mandated `"./package.json"` export
 * (the population R14 exists for: an older `@navecss/core`, from before that export was
 * added). A resolvable, matching-version core is already exercised by every other test in
 * this file that calls `validate` after `build`.
 */
/**
 * Simulates a real, pre-#398-export `@navecss/core` install: present on disk, resolvable as
 * a package, but declaring no `"./package.json"` entry in its own `exports` map.
 */
function installOlderCoreWithNoPackageJsonExport(projectDir: string, version: string): void {
  const coreDir = path.join(projectDir, 'node_modules', '@navecss', 'core')
  mkdirSync(coreDir, { recursive: true })
  writeFileSync(path.join(coreDir, 'index.js'), 'export default {}\n')
  writeFileSync(
    path.join(coreDir, 'package.json'),
    JSON.stringify({
      name: '@navecss/core',
      type: 'module',
      version,
      exports: { '.': './index.js' }, // deliberately no "./package.json" entry
    }),
  )
}

/**
 * A review round 2 (the quality reviewer's note F1): a core that IS installed and IS BROKEN. Node's
 * resolver throws a DIFFERENT code for each of these, and `resolveInstalledCoreVersion` used
 * to sniff exactly one code (`ERR_PACKAGE_PATH_NOT_EXPORTED`) and drop everything else into
 * `not-installed` — the one state R14 precision 1 sends to exit `0` with the printed sentence
 * "No installed @navecss/core was found". Both of these populations therefore got a GREEN run
 * plus a false statement about the consumer's own machine.
 */
function installCoreWithUnparseablePackageJson(projectDir: string): void {
  const coreDir = path.join(projectDir, 'node_modules', '@navecss', 'core')
  mkdirSync(coreDir, { recursive: true })
  writeFileSync(path.join(coreDir, 'index.js'), 'export default {}\n')
  // Node's resolver: ERR_INVALID_PACKAGE_CONFIG, and its message names this exact file.
  writeFileSync(path.join(coreDir, 'package.json'), '{ "name": "@navecss/core", ')
}

function installCoreWithOutOfPackageExportTarget(projectDir: string): void {
  const coreDir = path.join(projectDir, 'node_modules', '@navecss', 'core')
  mkdirSync(coreDir, { recursive: true })
  writeFileSync(path.join(coreDir, 'index.js'), 'export default {}\n')
  writeFileSync(
    path.join(coreDir, 'package.json'),
    JSON.stringify({
      name: '@navecss/core',
      type: 'module',
      version: '0.1.0',
      // Node's resolver: ERR_INVALID_PACKAGE_TARGET — a target outside its own package.
      exports: { '.': './index.js', './package.json': '../../outside.json' },
    }),
  )
}

describe(
  'AC-token-build-14 covers: R14 (installedCoreVersion, real resolution, both failure directions)',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    it("no installed @navecss/core at all: success line states the manifest's own RECORDED version and that no skew check ran, never a version nobody compared against", () => {
      const { binPath, projectDir } = scratchInstall()
      const outDir = path.join(projectDir, 'out')
      const build = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outDir],
        projectDir,
      )
      expect(build.status).toBe(0)

      const validate = runNode(
        binPath,
        ['validate', '--source', path.join(outDir, 'tokens.css')],
        projectDir, // no node_modules/@navecss/core exists in this scratch project
      )
      expect(validate.status).toBe(0)
      expect(validate.stdout).toMatch(
        /no installed @navecss\/core was found, so no version-skew check ran/i,
      )
    })

    it('an older installed @navecss/core with no "./package.json" export: reported as a named failure at exit 1, not silently treated as absent', () => {
      const { binPath, projectDir } = scratchInstall()
      const outDir = path.join(projectDir, 'out')
      const build = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outDir],
        projectDir,
      )
      expect(build.status).toBe(0)

      installOlderCoreWithNoPackageJsonExport(projectDir, '0.0.9')

      const validate = runNode(
        binPath,
        ['validate', '--source', path.join(outDir, 'tokens.css')],
        projectDir,
      )
      // Before this fix this printed "0 missing ... from @navecss/core@0.1.0"
      // and exited 0 — the manifest's RECORDED version, presented as though it had been
      // compared against the (unreachable) installed one.
      expect(validate.status).toBe(1)
      expect(validate.stdout).not.toMatch(/^0 missing\. Checked/m)
      expect(validate.stdout).toMatch(/could not determine the installed @navecss\/core's version/i)
    })

    /**
     * Rows F1a / F1b from a quality-review pass (Phase 3 round 2). These exercise the PROBE,
     * out of process through the shipped bin, on a FOURTH population R14's three states never
     * named: `@navecss/core` installed and broken. R14 precision 3 sends a broken installation
     * to `2` ("the installation is broken, which is what R4's `2` means") and R4's precision 4
     * states the dividing rule — "wherever the run can TELL that the installation is what
     * failed, it exits `2`". Here the run CAN tell: the resolver's own error names the file.
     *
     * Every pre-existing `unreadable` test hands `formatValidateReport` a synthetic
     * `{ status: 'unreadable' }` and so exercises the RENDERER; nothing exercised the probe's
     * CLASSIFICATION of a broken install, which is why this shipped green.
     */
    it.each([
      [
        'an unparseable package.json (ERR_INVALID_PACKAGE_CONFIG)',
        installCoreWithUnparseablePackageJson,
      ],
      [
        'an out-of-package "./package.json" export target (ERR_INVALID_PACKAGE_TARGET)',
        installCoreWithOutOfPackageExportTarget,
      ],
    ] as const)(
      'a quality-review finding (F1): an installed but BROKEN @navecss/core — %s — is not classified as absent: exit 2, and the report never says no installed core was found',
      (_label, breakCore) => {
        const { binPath, projectDir } = scratchInstall()
        const outDir = path.join(projectDir, 'out')
        const build = runNode(
          binPath,
          ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outDir],
          projectDir,
        )
        expect(build.status).toBe(0)

        breakCore(projectDir)

        // The source declares every contract name (it is this build's own artifact), so the
        // name-set half cannot be what drives the exit code: only the probe can.
        const validate = runNode(
          binPath,
          ['validate', '--source', path.join(outDir, 'tokens.css')],
          projectDir,
        )

        const printed = `${validate.stdout}\n${validate.stderr}`
        expect(validate.status).not.toBe(0)
        expect(printed).not.toMatch(/no installed @navecss\/core was found/i)
        // R14 precision 3's own answer for a broken installation, stated positively.
        expect(validate.status).toBe(2)
        expect(printed).toMatch(/could not read the installed @navecss\/core's package\.json/i)
      },
    )
  },
)

describe(
  'AC-token-build-17 covers: R17 (property 3, second dated precision — provenance on the FAILURE line)',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    /**
     * ROW F2 from a quality-review pass (Phase 3 round 2). R17 property 3 has read "on SUCCESS as
     * well as on failure" since it was written, and its second dated precision (product,
     * 2026-09-14) extends R14 precision 1's constraint to every outcome of the run: in R14's
     * state 1, the provenance states the manifest's RECORDED producer as recorded AND states
     * that no installed `@navecss/core` was found and that no version-skew check ran.
     *
     * At `e0695b5` the success line carried both halves and the failure line seventeen lines
     * below it printed a bare `Checked against @navecss/core@0.1.0 (manifest format 1).` — the
     * stronger claim of the two, in the active voice, beside a list its reader is about to act
     * on. The exit code does not move: this stays `1`.
     */
    it('a quality-review finding (F2): with no @navecss/core installed, the FAILURE line does not present the recorded producer version without the no-skew-check disclaimer', () => {
      const { binPath, projectDir } = scratchInstall()
      const source = path.join(projectDir, 'incomplete.css')
      // Declares one contract name and omits the rest: a real failure on the merits.
      writeFileSync(source, ':root { --nave-color-surface-base: white; }')

      const validate = runNode(binPath, ['validate', '--source', source], projectDir)

      expect(validate.status).toBe(1) // unchanged: a merits failure is still `1`
      expect(validate.stdout).toMatch(/missing name\(s\):/)
      expect(validate.stdout).toMatch(/@navecss\/core@/) // the recorded producer is still named
      expect(validate.stdout).toMatch(/no installed @navecss\/core was found/i)
      expect(validate.stdout).toMatch(/no version-skew check ran/i)
    })
  },
)

describe(
  'AC-token-build-15 covers: R15 (dated precision — a --source whose JSON ROOT is not an object)',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    /**
     * ROW F4 from a quality-review pass (Phase 3 round 2). Product's R15 precision (2026-09-14): a
     * `--source` file that parses as JSON but whose ROOT is not a JSON object is a USAGE error
     * — exit `2`, the file named. Extension, parseability and root shape are three answers to
     * one question, and the two siblings (`AC-token-build-15`'s extension clause, the malformed-JSON
     * case one test-block up) already answer `2`.
     *
     * At `e0695b5` this exited `1` with `DTCG reader: expected an object at "", got []` and the
     * file unnamed — "failed on its merits" is what a CI script branches on, and here it meant
     * "your file is the wrong shape".
     */
    it.each([['[]'], ['42'], ['"a string"'], ['null']])(
      'a quality-review finding (F4): a --source whose entire content is %s is a usage error at exit 2, naming the file',
      (content) => {
        const { binPath, projectDir } = scratchInstall()
        const source = path.join(projectDir, 'arr.json')
        writeFileSync(source, content)
        const result = runNode(binPath, ['validate', '--source', source], projectDir)
        expect(result.status).toBe(2)
        expect(result.stderr).toContain(source) // the file is NAMED
        expect(result.stderr).not.toMatch(/^DTCG reader:/m)
      },
    )

    /**
     * The load-bearing NEGATIVE half, written as a row of its own so the next reader does not
     * widen the rule to the whole reader: product drew the line AT THE ROOT. A document accepted
     * as a DTCG object and FAULTY INSIDE is the entry point judging a token source on its
     * merits, and stays at `1`.
     */
    it('a quality-review finding, negative half: a --source accepted at the ROOT and faulty INSIDE still exits 1, not 2', () => {
      const { binPath, projectDir } = scratchInstall()
      const source = path.join(projectDir, 'legacy.json')
      // A legacy `value`/`type` node: the root IS an object, the fault is one level in.
      writeFileSync(
        source,
        JSON.stringify({ color: { surface: { base: { value: '#fff', type: 'color' } } } }),
      )
      const result = runNode(binPath, ['validate', '--source', source], projectDir)
      expect(result.status).toBe(1)
      expect(result.stderr).toMatch(/legacy token shape/)
    })
  },
)

/**
 * Every occurrence of `filePath` in `text` is delimited by double quotes. Asserted as "every
 * mention", not "one quoted mention", because the quoted form CONTAINS the bare form as a
 * substring — a `toContain('"…"')` alone would pass a message that also printed the path
 * undelimited somewhere else in the same refusal.
 */
function isEveryMentionQuoted(text: string, filePath: string): boolean {
  let index = text.indexOf(filePath)
  if (index === -1) return false
  while (index !== -1) {
    if (text[index - 1] !== '"' || text[index + filePath.length] !== '"') return false
    index = text.indexOf(filePath, index + filePath.length)
  }
  return true
}

/**
 * PINNING ROW R3-03, from a quality-review pass (Phase 3 verifier-gated tail; free in any
 * round). The developer-relations reviewer's bytes, transcribed: `validate` passed its source label
 * to `namesFromSource` BARE while `build` passed it pre-quoted, so one guard function printed two
 * spellings of its own file label — and an unquoted absolute path with a space in it is unreadable,
 * which is the harm rather than the inconsistency. Eight sibling refusals in this package already
 * quote; this was the sole outlier.
 *
 * The developer-relations reviewer measured that the one label feeds TWO messages, not one — the
 * root-shape refusal (R15's 2026-09-14 precision) and the malformed-JSON refusal — so both doors
 * are pinned, plus the `build` door that was already correct, so a later change cannot fix one
 * spelling by breaking the other. The path carries a directory segment with a SPACE in it, which
 * is what makes the undelimited form genuinely ambiguous rather than merely untidy.
 */
/**
 * A source file under a directory whose name contains a SPACE — the developer-relations reviewer's
 * "cheapest strengthening" for the row below: it is what makes an undelimited path genuinely
 * ambiguous to a reader rather than merely untidy.
 */
function sourceWithASpaceInItsPath(projectDir: string, name: string, content: string): string {
  const dir = path.join(projectDir, 'My Project')
  mkdirSync(dir, { recursive: true })
  const source = path.join(dir, name)
  writeFileSync(source, content)
  return source
}

describe(
  'R3-03 covers: R15/R21 (the file label is delimited at every door)',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    it.each([
      ['a root that is not an object', '[]'],
      ['malformed JSON', 'not json at all'],
    ] as const)('validate --source names the file QUOTED when it refuses %s', (_label, content) => {
      const { binPath, projectDir } = scratchInstall()
      const source = sourceWithASpaceInItsPath(projectDir, 'arr.json', content)
      const result = runNode(binPath, ['validate', '--source', source], projectDir)
      expect(result.status).toBe(2)
      expect(result.stderr).toContain(`"${source}"`)
      expect(isEveryMentionQuoted(result.stderr, source)).toBe(true)
    })

    it('build --source names the file QUOTED on the same refusal — the door that was already correct, pinned so a later change cannot fix one spelling by breaking the other', () => {
      const { binPath, projectDir } = scratchInstall()
      const source = sourceWithASpaceInItsPath(projectDir, 'arr.json', '[]')
      const result = runNode(
        binPath,
        [
          'build',
          '--seed',
          'oklch(0.55 0.18 250)',
          '--out',
          path.join(projectDir, 'out'),
          '--source',
          source,
        ],
        projectDir,
      )
      expect(result.status).toBe(2)
      expect(result.stderr).toContain(`"${source}"`)
      expect(isEveryMentionQuoted(result.stderr, source)).toBe(true)
    })
  },
)

/**
 * Simulates a real, RESOLVABLE `@navecss/core` install — declares `"./package.json"` in its
 * own `exports` map, the mandated core-version resolution route, at the given `version`. The population
 * `checkManifestVersionSkew` exists for: a consumer whose installed `@navecss/core` does not
 * match this manifest's recorded producer version (whatever `dist/core-contract.json` records
 * at the time this test runs, which follows `@navecss/core`'s own version).
 */
function installResolvableCore(projectDir: string, version: string): void {
  const coreDir = path.join(projectDir, 'node_modules', '@navecss', 'core')
  mkdirSync(coreDir, { recursive: true })
  writeFileSync(path.join(coreDir, 'index.js'), 'export default {}\n')
  writeFileSync(
    path.join(coreDir, 'package.json'),
    JSON.stringify({
      exports: { '.': './index.js', './package.json': './package.json' },
      name: '@navecss/core',
      type: 'module',
      version,
    }),
  )
}

/**
 * `build` gains the SAME version-skew check `validate` already runs
 * (`resolveInstalledCoreVersion`/`checkManifestVersionSkew`) — previously `build` only guarded
 * `MissingContractTokensError`, a self-consistency check against this package's OWN manifest
 * that cannot see a skewed `@navecss/core`, so a consumer with a skewed installed core got a
 * silently-incomplete build with no warning. Real, out-of-process, both directions: a
 * genuinely skewed resolvable core (the fixture that matters most — `build` must still exit
 * `0`, explicitly asserted, not just "didn't throw"), and each `coreProbe.status !== 'resolved'`
 * population (no core at all, and an older core `validate`'s own R14 route cannot read),
 * which must print NOTHING about skew at all.
 */
describe(
  'build() surfaces a version-skew advisory to stderr, never changing its exit code',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    it("a resolvable @navecss/core at a version different from the manifest's recorded producer version: build prints the skew to stderr, alongside (not replacing) the R35 stdout line, and STILL exits 0", () => {
      const { binPath, projectDir } = scratchInstall()
      installResolvableCore(projectDir, '9.9.9')
      // Read, not hardcoded: the recorded version follows @navecss/core's own, so a literal here
      // goes stale on every release.
      const manifest = JSON.parse(
        readFileSync(path.join(DIST_DIR, 'core-contract.json'), 'utf8'),
      ) as {
        producer: { version: string }
      }
      expect(manifest.producer.version).not.toBe('9.9.9')
      const outDir = path.join(projectDir, 'out')

      const result = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outDir],
        projectDir,
      )

      // The one assertion that matters most: an advisory print must never touch the exit code.
      expect(result.status).toBe(0)
      expect(result.stdout).toMatch(/^Built from seed/)
      expect(result.stderr).toMatch(/version skew/i)
      expect(result.stderr).toMatch(/core contract this @navecss\/tokens ships/)
      expect(result.stderr).toContain(`@navecss/core@${manifest.producer.version}`)
      expect(result.stderr).toMatch(/@9\.9\.9/)
      expect(result.stderr).toMatch(/may not carry every custom-property name/i)
      expect(result.stderr).toMatch(/Reinstall matching versions/)
    })

    it('no installed @navecss/core at all (not-installed): build prints no skew advisory and exits 0', () => {
      const { binPath, projectDir } = scratchInstall()
      const outDir = path.join(projectDir, 'out')

      const result = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outDir],
        projectDir, // no node_modules/@navecss/core exists in this scratch project
      )

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
    })

    it('an older installed @navecss/core with no "./package.json" export (unresolvable, not "skewed"): build prints no skew advisory and exits 0', () => {
      const { binPath, projectDir } = scratchInstall()
      installOlderCoreWithNoPackageJsonExport(projectDir, '9.9.9')
      const outDir = path.join(projectDir, 'out')

      const result = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outDir],
        projectDir,
      )

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
    })
  },
)

/**
 * `detectVersionSkew`'s comparison is the first read of `manifest.producer` in `build()`'s
 * call graph. Run after `writeOutputs`, a malformed shipped manifest (valid JSON, no `producer`
 * field) would throw a bare `TypeError` once artifacts were already on disk, so a caller
 * reading the exit code would see a merits failure for a build whose files had in fact been
 * written, the shape R23 forbids. The check runs before `writeOutputs`, so the same manifest
 * fails loud and writes nothing.
 */
describe(
  'build() and a malformed shipped manifest (the skew check fails BEFORE writing, never after)',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    it('a dist/core-contract.json with no producer field: build rejects, and no tokens.css is ever written', () => {
      const { binPath, projectDir } = scratchInstall()
      installResolvableCore(projectDir, '9.9.9')
      const manifestPath = path.join(
        projectDir,
        'node_modules',
        '@navecss',
        'tokens',
        'dist',
        'core-contract.json',
      )
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
      delete manifest.producer
      writeFileSync(manifestPath, JSON.stringify(manifest))
      const outDir = path.join(projectDir, 'out')

      const result = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outDir],
        projectDir,
      )

      expect(result.status).not.toBe(0)
      expect(existsSync(path.join(outDir, 'tokens.css'))).toBe(false)
    })
  },
)

describe(
  'build() and the two remaining core-probe populations (unreadable, and resolved at a matching version)',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    it('an installed but unreadable @navecss/core (unparseable package.json): build prints nothing to stderr and exits 0', () => {
      const { binPath, projectDir } = scratchInstall()
      installCoreWithUnparseablePackageJson(projectDir)
      const outDir = path.join(projectDir, 'out')

      const result = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outDir],
        projectDir,
      )

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
    })

    it("a resolvable @navecss/core at the manifest's own recorded producer version: build prints nothing to stderr and exits 0", () => {
      const { binPath, projectDir } = scratchInstall()
      const manifestPath = path.join(
        projectDir,
        'node_modules',
        '@navecss',
        'tokens',
        'dist',
        'core-contract.json',
      )
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        producer: { version: string }
      }
      installResolvableCore(projectDir, manifest.producer.version)
      const outDir = path.join(projectDir, 'out')

      const result = runNode(
        binPath,
        ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outDir],
        projectDir,
      )

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
    })
  },
)

describe(
  'AC-token-build-07 covers: R8 (the compiled bin locates its own root by NAME)',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    // The review probed exactly this on a real scratch install and measured exit 1 with a raw
    // `Error: ENOENT ... /dist/tokens.json` plus a Node stack: `findPackageRoot` stopped at the
    // nearest ancestor CARRYING a package.json, and a `dist/package.json` (the standard
    // dual-publish `{"type":"module"}` marker) is nearer than the real root. It fires at module
    // load, so it is outside the `try` that owns R4's exit-code mapping and no message the bin
    // owns ever reaches the consumer. Asserted out of process because the failure was a
    // property of where the SHIPPED files sit, not of the helper in isolation.
    it.each([['dist'], ['dist/lib']])(
      'a %s/package.json marker planted inside the installed package does not relocate the package root',
      (markerDir) => {
        const { binPath, projectDir } = scratchInstall()
        const pkgDir = path.join(projectDir, 'node_modules', '@navecss', 'tokens')
        writeFileSync(
          path.join(pkgDir, ...markerDir.split('/'), 'package.json'),
          JSON.stringify({ type: 'module' }),
        )

        const outDir = path.join(projectDir, 'out')
        const result = runNode(
          binPath,
          ['build', '--seed', 'oklch(0.55 0.18 250)', '--out', outDir],
          projectDir,
        )

        expect(result.stderr).not.toMatch(/ENOENT/)
        expect(result.status).toBe(0)
        expect(existsSync(path.join(outDir, 'tokens.css'))).toBe(true)
      },
    )
  },
)

// The guard above, pinned: each case must refuse before any process is spawned, and name a fix
// that applies to it.
describe('runNode refuses to spawn outside a sequential test carrying the spawn timeout', () => {
  const refusal = /runNode needs a sequential test.*spawn only from a non-concurrent `it`/
  let hookError: unknown
  beforeAll(() => {
    try {
      runNode(process.execPath, [], PACKAGE_ROOT)
    } catch (error) {
      hookError = error
    }
  })

  it('in a test still on the default timeout', () => {
    expect(() => runNode(process.execPath, [], PACKAGE_ROOT)).toThrow(refusal)
  })

  it('in a hook', () => {
    expect(String(hookError)).toMatch(refusal)
  })

  it.concurrent(
    'in a concurrent test, whatever its own timeout',
    { timeout: SPAWN_TEST_TIMEOUT_MS },
    ({ expect }) => {
      expect(() => runNode(process.execPath, [], PACKAGE_ROOT)).toThrow(refusal)
    },
  )
})

describe(
  'a spawned child that ends with no exit code throws',
  { timeout: SPAWN_TEST_TIMEOUT_MS },
  () => {
    it('a child still running at the kill budget is killed and throws, even one that traps SIGTERM', () => {
      const prefix = path.join(tmpdir(), 'navecss-tokens-bin-')
      const script = path.join(realpathSync(mkdtempSync(prefix)), 'outlive.mjs')
      writeFileSync(script, "process.on('SIGTERM', () => {})\nsetTimeout(() => {}, 30_000)\n")
      expect(() => spawnNode([script], PACKAGE_ROOT, 500)).toThrow(
        /ended with no exit code \(.*ETIMEDOUT\)/,
      )
    })

    // POSIX signals only: on Windows `process.kill` terminates without a signal to report.
    it.skipIf(process.platform === 'win32')(
      'a child killed by a signal throws instead of reading as exit 1',
      () => {
        const prefix = path.join(tmpdir(), 'navecss-tokens-bin-')
        const script = path.join(realpathSync(mkdtempSync(prefix)), 'kill-self.mjs')
        writeFileSync(script, "process.kill(process.pid, 'SIGKILL')\n")
        expect(() => runNode(script, [], PACKAGE_ROOT)).toThrow(
          /ended with no exit code \(signal SIGKILL\)/,
        )
      },
    )
  },
)
