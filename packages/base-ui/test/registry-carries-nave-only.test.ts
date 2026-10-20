import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  baseUiFiles,
  baseUiReachProblems,
  baseUiRunProblems,
  navePackageFiles,
  navePackageProblems,
} from './support/registry/files-carry.ts'
import { problemsAt, problemTexts } from './support/registry/files-problem.ts'
import { foldWhitespace, type NamedText, WINDOW } from './support/registry/files-run-length.ts'
import { cloneRegistry, type LoadedRegistry, loadRegistry } from './support/registry/load.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'

// A run-length scan reads 3,000 files, and a full test run shares its machine with other packages' tests.
const HEAVY_MS = 120_000
const PARTS = 'components/nave/nave-dialog.parts.ts'
const WRAP = 'components/nave/nave-dialog.wrap.ts'
const BASE_UI_FILE = 'dialog/popup/DialogPopup.mjs'

const withFile = (
  registry: LoadedRegistry,
  target: string,
  change: (content: string) => string,
): LoadedRegistry => {
  const clone = cloneRegistry(registry)
  const file = clone.items.get('base-ui-dialog')?.files.find((entry) => entry.target === target)
  if (file?.content === undefined) throw new Error(`base-ui-dialog has no ${target}`)
  file.content = change(file.content)
  return clone
}

// Marks keep the pasted run from joining the text around it, so its length is the run's length.
const pasted = (run: string): ((content: string) => string) => {
  return (content) => `${content}\n// §${run}§\n`
}

const functionBody = (baseUi: readonly NamedText[], length: number): string => {
  const file = baseUi.find((candidate) => candidate.name === BASE_UI_FILE)
  const start = file?.text.indexOf('function ') ?? -1
  if (file === undefined || start === -1) throw new Error(`no function in ${BASE_UI_FILE}`)
  return file.text.slice(start, start + length)
}

describe("AC-base-ui-registry-15: The copies carry Nave's code only", () => {
  const registry = loadRegistry()
  let baseUi: NamedText[] = []
  let vendored: NamedText[] = []

  beforeAll(() => {
    baseUi = baseUiFiles()
    vendored = navePackageFiles()
  }, HEAVY_MS)

  it('reads non-empty sources: the installed Base UI and the built tokens and core', () => {
    expect(baseUi.length).toBeGreaterThan(0)
    expect(vendored.some((file) => file.name.startsWith('tokens/'))).toBe(true)
    expect(vendored.some((file) => file.name.startsWith('core/'))).toBe(true)
    expect(baseUi.some((file) => file.name === BASE_UI_FILE)).toBe(true)
  })

  it(
    'has no item file that is, contains or is named for a tokens or core file',
    () => {
      expect(problemTexts(navePackageProblems(registry, vendored))).toEqual([])
    },
    HEAVY_MS,
  )

  it(
    'has no copied file sharing a run of 120 characters with a Base UI file',
    () => {
      expect(problemTexts(baseUiRunProblems(registry, baseUi))).toEqual([])
    },
    HEAVY_MS,
  )

  it('reaches Base UI only through import from, and export type * from, its public subpaths', () => {
    expect(problemTexts(baseUiReachProblems(registry))).toEqual([])
  })

  it("leaves the licence out of the run-length check because it shares MIT text with Base UI's", () => {
    const own = foldWhitespace(readFileSync(path.join(PACKAGE_DIR, 'LICENSE'), 'utf8'))
    const theirs = baseUi.find((file) => file.name === 'LICENSE')
    const clause = own.slice(own.indexOf('Permission'), own.indexOf('Permission') + WINDOW)
    expect(clause).toHaveLength(WINDOW)
    expect(theirs?.text).toContain(clause)
  })

  describe('controls: the same checks over a planted clone', () => {
    it(
      "reds a 200-character function body of Base UI's dialog pasted into the parts file, naming both files",
      () => {
        const planted = withFile(registry, PARTS, pasted(functionBody(baseUi, 200)))
        const problems = baseUiRunProblems(planted, baseUi)
        const messages = problemsAt(problems, 'base-ui-dialog', PARTS)
        expect(messages.join('\n')).toContain(BASE_UI_FILE)
      },
      HEAVY_MS,
    )

    it(
      'puts the line at 120 characters: 119 pass, 120 fail',
      () => {
        const short = withFile(registry, PARTS, pasted(functionBody(baseUi, WINDOW - 1)))
        expect(problemsAt(baseUiRunProblems(short, baseUi), 'base-ui-dialog', PARTS)).toEqual([])
        const exact = withFile(registry, PARTS, pasted(functionBody(baseUi, WINDOW)))
        expect(problemsAt(baseUiRunProblems(exact, baseUi), 'base-ui-dialog', PARTS)).not.toEqual(
          [],
        )
      },
      HEAVY_MS,
    )

    it(
      "reds a core or tokens file's bytes inside an item file, and a target named for one",
      () => {
        const file = vendored.find((candidate) => {
          const length = candidate.text.trim().length
          return length >= 100 && length <= 4000
        })
        if (file === undefined) throw new Error('no small tokens or core file to plant')
        const planted = withFile(registry, WRAP, (content) => `${content}\n${file.text}\n`)
        const messages = problemsAt(navePackageProblems(planted, vendored), 'base-ui-dialog', WRAP)
        expect(messages.join('\n')).toContain(file.name)
        const renamed = cloneRegistry(registry)
        const target = renamed.items
          .get('base-ui-dialog')
          ?.files.find((entry) => entry.target === WRAP)
        if (target === undefined) throw new Error('no wrap file')
        target.target = `components/nave/${path.posix.basename(file.name)}`
        const named = problemsAt(
          navePackageProblems(renamed, vendored),
          'base-ui-dialog',
          target.target,
        )
        expect(named.join('\n')).toContain('has the name of a tokens or core file')
      },
      HEAVY_MS,
    )

    it('reds a value re-export, a deep import and a dynamic import of Base UI', () => {
      const forms = [
        "export { Dialog } from '@base-ui/react/dialog'",
        "import { Dialog } from '@base-ui/react/esm/dialog'",
        "const lazy = import('@base-ui/react/dialog')",
        "import type { Dialog } from '@base-ui/react'",
      ]
      for (const form of forms) {
        const planted = withFile(registry, PARTS, (content) => `${content}\n${form}\n`)
        expect(problemsAt(baseUiReachProblems(planted), 'base-ui-dialog', PARTS), form).not.toEqual(
          [],
        )
      }
    })
  })
})
