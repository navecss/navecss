/**
 * AC-nextjs-used-atoms-17 for the type test of AC-used-atoms-45: `keepFor` and `keep` take readonly
 * atom lists, so a list written `as const satisfies readonly AtomName[]` compiles where a mutable
 * list type would not. Checked with the TypeScript the package installs (6.0); 5.6 is not
 * installed here.
 */
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

const SOURCE = path.resolve(import.meta.dirname, '../../src/index.ts')
const OPTIONS_SOURCE = path.resolve(import.meta.dirname, '../../src/options.ts')
const IMPORT = `import { withNave } from ${JSON.stringify(SOURCE)}\nimport type { NaveOptions } from ${JSON.stringify(OPTIONS_SOURCE)}\ntype AtomName = NonNullable<NaveOptions['keep']>[number]\n`
const LIST = "const naveAtoms = ['flex', 'inlineFlex'] as const satisfies readonly AtomName[]\n"

const SNIPPETS = {
  keepFor: `${IMPORT}${LIST}withNave({}, { keepFor: { '@acme/ui': naveAtoms } })\n`,
  keep: `${IMPORT}${LIST}withNave({}, { keep: naveAtoms })\n`,
  unknown: `${IMPORT}withNave({}, { keepFor: { '@acme/ui': ['nope'] } })\n`,
  mutableControl: `${IMPORT}${LIST}declare function scratch(options: { keepFor?: Record<string, AtomName[]> }): void\nscratch({ keepFor: { '@acme/ui': naveAtoms } })\n`,
  brokenControl: `const n: number = 'not a number'\nexport { n }\n`,
} as const

type SnippetName = keyof typeof SNIPPETS

const scratchDir = mkdtempSync(path.join(tmpdir(), 'prune-keepfor-types-'))
afterAll(() => rmSync(scratchDir, { recursive: true, force: true }))
let checked: Map<SnippetName, string[]> | undefined

/**
 * The diagnostics of every snippet, by name, from one program with `strict` and `NodeNext`.
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
    result.set(
      name,
      diagnostics.map(
        (item) => `TS${item.code}: ${flattenDiagnosticMessageText(item.messageText, '\n')}`,
      ),
    )
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

describe('AC-nextjs-used-atoms-17: AC-used-atoms-45, keepFor entries are typed readonly', () => {
  it('a list written as const satisfies readonly AtomName[] compiles for keepFor and for keep', () => {
    expect(diagnosticsFor('keepFor')).toEqual([])
    expect(diagnosticsFor('keep')).toEqual([])
  })

  it('a keepFor list naming an unknown atom fails tsc', () => {
    expect(diagnosticsFor('unknown')).not.toEqual([])
  })

  it('control: a scratch declaration typing keepFor as a mutable list makes the same line fail with TS4104', () => {
    expect(diagnosticsFor('mutableControl').join('\n')).toContain('TS4104')
  })

  it('control: the check reports an ordinary error', () => {
    expect(diagnosticsFor('brokenControl')).not.toEqual([])
  })
})
