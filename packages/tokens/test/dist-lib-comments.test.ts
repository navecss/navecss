/**
 * `packages/tokens/tsconfig.build.json`'s `"removeComments": true` is the
 * ENTIRE mechanism that keeps this package's compiled `dist/lib` surface free of the internal
 * identifiers (a requirement number, a tracker reference, a record id) that JSDoc prose in
 * this package regularly carries and that a consumer of the published package cannot resolve.
 * Until this file, nothing asserted the EFFECT, only the config line's presence, which
 * nothing else read: deleting it (a plausible future edit — `dist/lib/facade.d.ts` shipping
 * zero lines of documentation for a brand-new public export is a real, separately-raised
 * defect with a written, sanctioned motive to "fix" it) took the packed-identifier leak the
 * same change fixed from 23 matches to 233, with `TURBO_FORCE=1 pnpm run ci:check` staying
 * green throughout, because the one instrument that could see the leak across the packed set
 * was report-only by design and has since been retired from this repository altogether.
 *
 * This pins the mechanism DIRECTLY — compiling a synthetic source file through the REAL
 * `typescript` compiler with the EXACT compiler options `tsconfig.build.json` declares — and
 * deliberately does NOT scan the real, already-built `dist/lib` tree. Two reasons: (1) real
 * `dist/lib` files legitimately EMIT `/**` as literal runtime string content (`formats.js`
 * writes doc comments into a consumer's generated `tokens.d.ts`, e.g. "The DTCG token set as
 * a typed const object"), which a blanket dist-tree scan cannot distinguish from a real
 * source comment surviving compilation; (2) `dist/lib` ALSO carries pre-existing,
 * separately-tracked runtime-string-literal brain-id residuals still awaiting the project's
 * licensing steward's review (e.g. `adjacency.ts`'s `SHIPPED_SURFACE_PROVENANCE`),
 * which are a DIFFERENT vector `removeComments` was never meant to close and would make this
 * test permanently red for a reason unrelated to what it exists to pin. A synthetic,
 * self-contained probe has neither confound.
 */
import type { CompilerOptions, ParseConfigHost } from 'typescript'

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createCompilerHost,
  createProgram,
  createSourceFile,
  parseJsonConfigFileContent,
  readConfigFile,
  sys,
} from 'typescript'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TSCONFIG_BUILD_PATH = path.resolve(HERE, '../tsconfig.build.json')

/**
 * The probe compiles as a file INSIDE `src/`, which is both what `rootDir: "src"` expects and
 * what makes `moduleResolution: NodeNext` resolve its module format from this package's own
 * `package.json` (`"type": "module"`) rather than defaulting it to CommonJS. Nothing is written
 * to this path; it exists only for the in-memory compiler host below.
 */
const SOURCE_FILE_NAME = path.resolve(HERE, '../src/__probe__.ts')
/**
 * A representative slice of this package's own real doc-comment shape: a module header naming a
 * spec requirement, a finding id, an `AC-` id and an issue reference, which is every id-shaped
 * string this package's tooling looks for, all inside JSDoc.
 *
 * The ids are SYNTHETIC, and deliberately so. What this probe pins is that `removeComments`
 * strips a doc comment out of every emitted artifact, and that property is about the comment,
 * never about which ids the comment happens to contain. Real ids were used here originally and
 * were the reason this fixture was read as unsweepable: rewording it "would defeat the test" is
 * true of the SHAPE and false of the VALUES for the finding id, the file path and the issue
 * reference, which have no real referents. `R8` and `AC-token-build-08` are different on
 * purpose: both are live ids that several other tests in this package cite in their own
 * describe strings, and they are kept here verbatim because what this probe compiles has to
 * look like the real doc comments this package writes.
 *
 * The finding id and the file path below both carry the date `20000101`, and they are the only
 * two literals here that do: it is a date no real identifier or file in this project's history
 * could ever carry, which makes both recognizable as synthetic by their shape alone rather than
 * by a claim in this comment that could drift out of sync with the literal. `R8` and
 * `AC-token-build-08` are deliberately NOT given that reserved-date treatment, and a later sweep
 * should not "finish the job" by normalizing them: they are real ids elsewhere in this suite, so
 * rewriting them here would make this fixture disagree with the tests that share them.
 */
const PROBE_SOURCE = `/**
 * R8 (\`specs/probe-20000101.md\`): a synthetic probe. See F-20000101-probe-0000,
 * AC-token-build-08, and probe-tracker#4010.
 */
export const PROBE_VALUE: number = 1
`

/**
 * Reads a file through TypeScript's own system host, the same reader `tsc` uses.
 */
function readFile(fileName: string): string | undefined {
  return sys.readFile(fileName)
}

/**
 * Reads `tsconfig.build.json`'s compiler options by resolving its `extends` chain the same
 * way `tsc` does, rather than reading only its own top-level `compilerOptions`. A raw
 * `JSON.parse` of that file alone would silently ignore its `"extends": "../../tsconfig.base.json"`
 * and compile the probe with TypeScript's DEFAULT target/module/strict settings instead of the
 * build's own, which is not the exact compiler options the build declares.
 */
function readCompilerOptionsFromTsconfigBuild(): CompilerOptions {
  const raw = readConfigFile(TSCONFIG_BUILD_PATH, readFile)
  // Checked separately: when the config file itself is missing, `raw.error` is set and
  // `raw.config` is undefined, in which case `parsed.errors` below comes back EMPTY and would
  // pass. Without this the case is still caught, but by the `removeComments` assertion, whose
  // message does not name the missing file.
  expect(raw.error).toBeUndefined()
  const host: ParseConfigHost = {
    useCaseSensitiveFileNames: true,
    readDirectory: () => [SOURCE_FILE_NAME],
    fileExists: () => true,
    readFile,
  }
  const parsed = parseJsonConfigFileContent(raw.config, host, path.dirname(TSCONFIG_BUILD_PATH))
  expect(parsed.errors).toEqual([])
  expect(parsed.options.removeComments).toBe(true)
  return parsed.options
}

/**
 * Compiles `PROBE_SOURCE` through a real in-memory TypeScript program using
 * `tsconfig.build.json`'s OWN compiler options (read from the file, not restated by hand —
 * if that file's `removeComments` line is ever deleted, this probe stops pinning anything
 * and the effect test below reddens instead of silently passing against a stale copy),
 * returning every emitted output's text (`.js` and, since `declaration: true`, `.d.ts`).
 */
function compileProbe(): Map<string, string> {
  const options = readCompilerOptionsFromTsconfigBuild()
  const outputs = new Map<string, string>()
  const host = createCompilerHost(options)
  host.getSourceFile = (fileName, languageVersion) =>
    fileName === SOURCE_FILE_NAME
      ? createSourceFile(fileName, PROBE_SOURCE, languageVersion, true)
      : undefined
  host.writeFile = (fileName, text) => outputs.set(fileName, text)
  // Fall through to the real filesystem for everything that is NOT the probe. Under
  // `moduleResolution: NodeNext` the module format is resolved per file from the nearest
  // `package.json`, so a host that answers only for the probe cannot see this package's
  // `"type": "module"` and silently compiles the fixture as CommonJS.
  host.fileExists = (fileName) => fileName === SOURCE_FILE_NAME || sys.fileExists(fileName)
  host.readFile = (fileName) =>
    fileName === SOURCE_FILE_NAME ? PROBE_SOURCE : sys.readFile(fileName)

  const program = createProgram([SOURCE_FILE_NAME], options, host)
  expect(program.getSemanticDiagnostics()).toEqual([])
  program.emit()
  return outputs
}

describe("R8 compile step: tsconfig.build.json's removeComments strips brain-identifier-bearing JSDoc from every emitted output (pinned by effect)", () => {
  const outputs = compileProbe()

  it('emitted at least the .js and .d.ts outputs (declaration: true)', () => {
    const emittedKinds = outputs
      .keys()
      .map((name) => path.extname(name))
      .toArray()
    expect(emittedKinds).toContain('.js')
    expect(emittedKinds).toContain('.ts') // .d.ts's extname is '.ts'
  })

  it("no emitted output contains the probe's R-number, finding id, AC-id, or issue reference", () => {
    for (const [fileName, text] of outputs) {
      expect(text, `${fileName} unexpectedly carries a doc-comment identifier`).not.toMatch(/R8\b/)
      expect(text).not.toContain('F-20000101-probe-0000')
      expect(text).not.toContain('AC-token-build-08')
      expect(text).not.toContain('probe-tracker#4010')
      expect(text).not.toContain('specs/probe-20000101.md')
      expect(text).not.toContain('/**')
    }
  })

  it('the exported value itself still round-trips (the probe compiles to real, working output, not an error swallowed into an empty file)', () => {
    let js: string | undefined
    for (const [name, text] of outputs) {
      if (name.endsWith('.js')) {
        js = text
        break
      }
    }
    expect(js).toContain('PROBE_VALUE')
  })
})
