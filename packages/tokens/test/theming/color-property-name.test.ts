/**
 * AC-theming-56 covers: R26a. The semantic colour layer reaches the typed JS/TS surface as
 * NAMES ONLY: a type-only union of the emitted `--nave-color-*` custom-property names,
 * `ColorPropertyName`, exported from `dist/tokens.d.ts` beside (never inside) `TokenName`. No
 * colour VALUE enters `tokens`, `dist/tokens.js`, or any other JS artifact.
 *
 * Reads the SHIPPED files on both sides, never the emitter's own in-memory structures (the
 * round-16 note under `AC-theming-31`'s coverage entry records why a union checked against the
 * same emitter that generated it proves nothing): `dist/tokens.css` for the names actually
 * declared, `dist/tokens.d.ts`/`dist/tokens.js` for what the typed/runtime surfaces actually
 * carry, for both Nave's own build (`../../dist`, built by `pnpm run build`) and the
 * consumer-invocable build (`facade.ts`'s `build`, run here with a seed other than the shipped
 * default, per R26a property 4's seed-invariance claim).
 */
import type { CompilerOptions } from 'typescript'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  createCompilerHost,
  createProgram,
  createSourceFile,
  flattenDiagnosticMessageText,
  ModuleKind,
  ModuleResolutionKind,
  ScriptTarget,
  sys,
} from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

import { build } from '../../src/facade.ts'
import { scratchDir as makeScratchDir, registerScratchCleanup } from '../helpers/scratch-dir.ts'

registerScratchCleanup()

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..')
const NAVE_DIST = path.join(PACKAGE_ROOT, 'dist')

/**
 * A seed distinct from `SHIPPED_SEEDS.primary` (`oklch(0.7859 0.1316 186.17)`) — the same
 * literal `facade.test.ts` already uses for "a seed other than the default".
 */
const CONSUMER_SEED = 'oklch(0.55 0.18 250)'

function scratchDir(): string {
  return makeScratchDir('navecss-tokens-color-property-name-')
}

/**
 * Custom-property names DECLARED in a built stylesheet (comments stripped, anchored to
 * line-start-plus-indent — same shape as `remaining-ac.test.ts`'s helper of the same name,
 * duplicated rather than shared because this file's compile-diagnostics setup already pulls in
 * enough machinery of its own that a cross-file import would cost more than it saves).
 */
function declaredCustomProperties(css: string): string[] {
  return css
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/^[ \t]*(--[\w-]+)\s*:/gm)
    .map((m) => m[1]!)
    .toArray()
}

/**
 * Custom-property names REGISTERED by an `@property` rule in a built stylesheet (comments
 * stripped). R26a property 1 counts a name as defined when it is declared OR registered, so
 * the membership comparison reads both.
 */
function registeredCustomProperties(css: string): string[] {
  return css
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/@property\s+(--[\w-]+)/g)
    .map((m) => m[1]!)
    .toArray()
}

/**
Every `--nave-color-*` name a built stylesheet defines, declared or registered.
 */
function definedColorProperties(css: string): string[] {
  return [...declaredCustomProperties(css), ...registeredCustomProperties(css)].filter((n) =>
    n.startsWith('--nave-color-'),
  )
}

/**
 * The custom-property keys of a generated object literal (`tokens.js`, `tokens.d.ts`'s
 * `tokens` declaration) — same shape as `remaining-ac.test.ts`'s `typedKeys`.
 */
function tokensObjectKeys(source: string): string[] {
  return source
    .matchAll(/^[ \t]*'(--[\w-]+)'\s*:/gm)
    .map((m) => m[1]!)
    .toArray()
}

/**
The member literals of a `ColorPropertyName` union declared in a `.d.ts` source.
 */
function colorPropertyNameMembers(dts: string): string[] {
  const match = /export declare type ColorPropertyName =\n((?:\s*\|\s*'[^']+'\n?)+)/.exec(dts)
  if (!match) return []
  return match[1]!
    .matchAll(/'([^']+)'/g)
    .map((m) => m[1]!)
    .toArray()
}

describe('AC-theming-56 covers: R26a (shipped artifact, both builds)', () => {
  let naveCss: string
  let naveDts: string
  let naveJs: string
  let consumerCss: string
  let consumerDts: string
  let consumerJs: string

  beforeAll(async () => {
    naveCss = readFileSync(path.join(NAVE_DIST, 'tokens.css'), 'utf8')
    naveDts = readFileSync(path.join(NAVE_DIST, 'tokens.d.ts'), 'utf8')
    naveJs = readFileSync(path.join(NAVE_DIST, 'tokens.js'), 'utf8')

    const outDir = path.join(scratchDir(), 'out')
    await build({ seed: CONSUMER_SEED, outDir })
    consumerCss = readFileSync(path.join(outDir, 'tokens.css'), 'utf8')
    consumerDts = readFileSync(path.join(outDir, 'tokens.d.ts'), 'utf8')
    consumerJs = readFileSync(path.join(outDir, 'tokens.js'), 'utf8')
  })

  it("Nave's own build: ColorPropertyName's members equal the defined (declared or @property-registered) --nave-color-* names, tint included, no ramp step", () => {
    const declared = definedColorProperties(naveCss)
    expect(declared.length).toBeGreaterThan(0)
    expect(declared).toContain('--nave-color-tint')
    const union = colorPropertyNameMembers(naveDts)
    expect(union.length).toBeGreaterThan(0)
    expect(new Set(union)).toEqual(new Set(declared))
  })

  it('consumer build (non-default seed): ColorPropertyName members equal the defined (declared or @property-registered) --nave-color-* names', () => {
    const declared = definedColorProperties(consumerCss)
    expect(declared.length).toBeGreaterThan(0)
    const union = colorPropertyNameMembers(consumerDts)
    expect(new Set(union)).toEqual(new Set(declared))
  })

  it('the union is identical, member for member, between the two builds (seed-invariant)', () => {
    const naveUnion = new Set(colorPropertyNameMembers(naveDts))
    const consumerUnion = new Set(colorPropertyNameMembers(consumerDts))
    expect(consumerUnion).toEqual(naveUnion)
  })

  it('ColorPropertyName and TokenName share no member, and TokenName is still keyof typeof tokens', () => {
    expect(naveDts).toContain('export declare type TokenName = keyof typeof tokens')
    const colorNames = new Set(colorPropertyNameMembers(naveDts))
    const tokenNameKeys = tokensObjectKeys(naveDts)
    expect(tokenNameKeys.length).toBeGreaterThan(0)
    for (const key of tokenNameKeys) expect(colorNames.has(key)).toBe(false)
  })

  it('no --nave-color-* key appears in the tokens declaration in dist/tokens.d.ts or the tokens object in dist/tokens.js', () => {
    for (const key of tokensObjectKeys(naveDts)) expect(key.startsWith('--nave-color-')).toBe(false)
    for (const key of tokensObjectKeys(naveJs)) expect(key.startsWith('--nave-color-')).toBe(false)
  })

  // "No colour name or value at all" is about DATA (an entry `tokens.js` evaluates), never
  // about prose: property 5 requires the doc comment to NAME the colour layer so it can say
  // where it lives, so a blanket substring check on '--nave-color-' would fail on the
  // required sentence itself. Checked instead: no colour KEY (tokensObjectKeys, above) and
  // no second runtime export alongside `tokens` (R26a property 3's "zero runtime bytes" —
  // `ColorPropertyName` is a `.d.ts`-only declaration, so `tokens.js` gains no new export).
  it('dist/tokens.js gains no new runtime export (zero runtime bytes, R26a property 3)', () => {
    for (const js of [naveJs, consumerJs]) {
      expect(js.match(/^export .*/gm)).toEqual(['export const tokens = {'])
    }
  })

  it('the doc copy says colour names are typed through ColorPropertyName and colour values are CSS-only', () => {
    for (const text of [naveJs, naveDts]) {
      expect(text).toContain('ColorPropertyName')
      expect(text.toLowerCase()).toMatch(/values? (is|are) reachable only through css|css only/)
      expect(text).not.toMatch(/tokens object carries colou?rs?/i)
    }
  })

  it('no ColorPropertyName member is a ramp step (R11)', () => {
    const union = colorPropertyNameMembers(naveDts)
    expect(union.length).toBeGreaterThan(0)
    for (const name of union) expect(name).not.toMatch(/-\d+$/)
  })

  it('outside its doc comments, dist/tokens.js carries no name or value of the semantic colour layer', () => {
    for (const js of [naveJs, consumerJs]) {
      const code = js.replaceAll(/\/\*[\s\S]*?\*\//g, '')
      expect(code).not.toContain('--nave-color-')
      expect(code).not.toContain('light-dark(')
    }
  })

  it("the README's JS/TS row says colour names are typed through ColorPropertyName and colour values ship in the stylesheet", () => {
    const readme = readFileSync(path.join(PACKAGE_ROOT, 'README.md'), 'utf8')
    const row = readme.split('\n').find((line) => line.startsWith('| `@navecss/tokens/js`'))
    expect(row).toBeDefined()
    expect(row).toContain('ColorPropertyName')
    expect(row).toContain('ships as a value in the stylesheet above and not through this export')
    expect(row).not.toMatch(/tokens object carries colou?rs?/i)
  })

  it("the doc copy does not say every colour value follows the tint: in Nave's own build the example slot does not", () => {
    const actionPrimary = /^[ \t]*--nave-color-action-primary\s*:\s*([^;]+);/m.exec(naveCss)?.[1]
    expect(actionPrimary).toBeDefined()
    expect(actionPrimary).not.toContain('var(--nave-color-tint)')
    expect(naveCss).toMatch(/^[ \t]*--nave-color-surface-base\s*:[^;]*var\(--nave-color-tint\)/m)
    for (const text of [naveJs, naveDts]) {
      expect(text).not.toMatch(/from the scheme\s*\*?\s*and the tint/)
      expect(text).toContain(
        'active colour scheme, and the neutral-derived ones also follow the tint.',
      )
    }
  })
})

/**
 * The compile-error half of R26a property 1/5: a TypeScript consumer compiling against the
 * SHIPPED `dist/tokens.d.ts` gets a compile error assigning a name that is not an emitted
 * colour property to `ColorPropertyName`, and gets none assigning one that is. Follows
 * `dist-lib-comments.test.ts`'s pattern (a real, in-memory `typescript` program, real
 * filesystem fallback for everything but the synthetic probe) rather than a text-pattern
 * match, because the criterion's own wording is about what `tsc` does, not about what the
 * declaration text merely says.
 */
describe('AC-theming-56: shipped dist/tokens.d.ts compile-error surface', () => {
  const COMPILER_OPTIONS: CompilerOptions = {
    target: ScriptTarget.ES2022,
    module: ModuleKind.NodeNext,
    moduleResolution: ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  }

  /**
   * Message text only — a raw `Diagnostic` carries circular AST nodes that blow up any
   * failure diff, so the probe never returns the objects themselves.
   */
  function compileProbe(source: string): string[] {
    const probeFileName = path.join(NAVE_DIST, '__probe__.ts')
    const host = createCompilerHost(COMPILER_OPTIONS)
    host.getSourceFile = (fileName, languageVersion) => {
      if (fileName === probeFileName)
        return createSourceFile(fileName, source, languageVersion, true)
      if (!sys.fileExists(fileName)) return
      return createSourceFile(fileName, sys.readFile(fileName) ?? '', languageVersion, true)
    }
    host.fileExists = (fileName) => fileName === probeFileName || sys.fileExists(fileName)
    host.readFile = (fileName) => (fileName === probeFileName ? source : sys.readFile(fileName))
    const program = createProgram([probeFileName], COMPILER_OPTIONS, host)
    const diagnostics = program.getSemanticDiagnostics(program.getSourceFile(probeFileName))
    return diagnostics.map((d) => flattenDiagnosticMessageText(d.messageText, '\n'))
  }

  it('a real emitted colour property compiles clean', () => {
    expect(
      compileProbe(
        `import type { ColorPropertyName } from './tokens.js'\n` +
          `export const ok: ColorPropertyName = '--nave-color-action-primary'\n`,
      ),
    ).toEqual([])
  })

  it('a ramp step (never emitted, R11) does not compile', () => {
    const diagnostics = compileProbe(
      `import type { ColorPropertyName } from './tokens.js'\n` +
        `export const bad: ColorPropertyName = '--nave-color-primary-500'\n`,
    )
    expect(
      diagnostics.some((m) => m.includes("is not assignable to type 'ColorPropertyName'")),
    ).toBe(true)
  })

  it('an unprefixed name does not compile', () => {
    const diagnostics = compileProbe(
      `import type { ColorPropertyName } from './tokens.js'\n` +
        `export const bad: ColorPropertyName = '--color-surface-base'\n`,
    )
    expect(
      diagnostics.some((m) => m.includes("is not assignable to type 'ColorPropertyName'")),
    ).toBe(true)
  })
})
