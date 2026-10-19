import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  createProgram,
  flattenDiagnosticMessageText,
  getPreEmitDiagnostics,
  ModuleKind,
  ModuleResolutionKind,
  ScriptTarget,
} from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'

const SOURCE = path.resolve(import.meta.dirname, '../src/index.ts')
const OPTIONS_SOURCE = path.resolve(import.meta.dirname, '../src/options.ts')
const IMPORT = `import { withNave } from ${JSON.stringify(SOURCE)}\n`

/**
 * The consumer files the type rows check, by name. They are checked together in one TypeScript
 * program: a program for each re-reads the standard library every time.
 */
const SNIPPETS = {
  unknownAtom: `${IMPORT}withNave({}, { keep: ['nope'] })\n`,
  knownAtoms: `${IMPORT}withNave({}, { keep: ['flex', 'srOnly'] })\n`,
  constLists: `${IMPORT}const k = ['flex', 'grid'] as const\nwithNave({}, { keep: k, keepFor: { '@acme/ui': k } })\n`,
  atomicOption: `${IMPORT}withNave({}, { atomic: 'all' })\n`,
  brokenControl: `const n: number = 'not a number'\nexport { n }\n`,
  mutableControl: `
import type { NaveOptions } from ${JSON.stringify(OPTIONS_SOURCE)}
type AtomName = NonNullable<NaveOptions['keep']>[number]
declare function scratch(options: { keep?: AtomName[] }): void
const k = ['flex', 'grid'] as const
scratch({ keep: k })
`,
} as const

type SnippetName = keyof typeof SNIPPETS

const scratchDir = mkdtempSync(path.join(tmpdir(), 'prune-types-'))
let checked: Map<SnippetName, string[]> | undefined

/**
 * The diagnostics of every snippet, by name, from one program on the installed TypeScript with
 * `strict` and `NodeNext`, against the package source.
 */
function checkSnippets(): Map<SnippetName, string[]> {
  const names = Object.keys(SNIPPETS) as SnippetName[]
  const files = new Map(names.map((name) => [name, path.join(scratchDir, `${name}.mts`)]))
  for (const [name, file] of files) writeFileSync(file, SNIPPETS[name])
  const program = createProgram(files.values().toArray(), {
    allowImportingTsExtensions: true,
    lib: ['lib.esnext.d.ts'],
    module: ModuleKind.NodeNext,
    moduleResolution: ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ScriptTarget.ESNext,
    types: [],
  })
  const result = new Map<SnippetName, string[]>()
  for (const [name, file] of files) {
    const diagnostics = getPreEmitDiagnostics(program, program.getSourceFile(file))
    const texts = diagnostics.map(
      (item) => `TS${item.code}: ${flattenDiagnosticMessageText(item.messageText, '\n')}`,
    )
    result.set(name, texts)
  }
  return result
}

/**
 * The diagnostics for one snippet.
 */
function diagnosticsFor(name: SnippetName): string[] {
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- a lazy memo: the first call checks every snippet and later calls reuse the result
  checked ??= checkSnippets()
  return checked.get(name) ?? []
}

afterAll(() => {
  rmSync(scratchDir, { force: true, recursive: true })
})

// Each check builds a TypeScript program over the standard library, which a loaded runner takes
// well past the default timeout to do. Run on the installed TypeScript only; the 5.6 run is
// not covered here.
describe(
  'AC-nextjs-used-atoms-20: withNave() options are typed against AtomName',
  { timeout: 120_000 },
  () => {
    it('control: the program reaches the snippets, a wrong line is reported', () => {
      expect(diagnosticsFor('brokenControl').join('\n')).toContain('not assignable')
    })

    it('fails keep: ["nope"], naming the atom', () => {
      const diagnostics = diagnosticsFor('unknownAtom')
      expect(diagnostics.length).toBeGreaterThan(0)
      expect(diagnostics.join('\n')).toContain('nope')
    })

    it('compiles keep: ["flex", "srOnly"]', () => {
      expect(diagnosticsFor('knownAtoms').join('\n')).toBe('')
    })

    it('compiles readonly as-const lists in keep and keepFor', () => {
      expect(diagnosticsFor('constLists').join('\n')).toBe('')
    })

    it('fails the atomic option, which does not exist', () => {
      const diagnostics = diagnosticsFor('atomicOption')
      expect(diagnostics.length).toBeGreaterThan(0)
      expect(diagnostics.join('\n')).toContain('atomic')
    })

    it('control: a mutable AtomName[] for keep makes the as-const line fail with TS4104', () => {
      expect(diagnosticsFor('mutableControl').some((text) => text.startsWith('TS4104'))).toBe(true)
    })
  },
)
