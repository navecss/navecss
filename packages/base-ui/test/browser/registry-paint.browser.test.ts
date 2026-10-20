/**
 * AC-base-ui-registry-24: each styled part paints the same through the registry's copy as through
 * the package. Both are rendered in the same scene, one after the other, with the tokens, the
 * package stylesheet and the copy's module in the document; `getComputedStyle` is read on every
 * property, at rest, in each state the part's atoms select by attribute, under keyboard
 * `:focus-visible`, and with reduced motion emulated. The copies are the registry's files, written
 * by `support/registry-consumer-app.global-setup.ts` and imported through the dev server.
 */
import { describe, expect, it } from 'vitest'

import type { PaintSubpath } from '../support/registry/browser-paths.ts'

import { copiesProvided, requiredCopies } from '../support/registry/browser-injected.ts'
import {
  bareComponents,
  loadCopy,
  packageComponents,
  withCopy,
} from '../support/registry/browser-load.ts'
import { measure } from '../support/registry/browser-measure.ts'
import {
  compare,
  differences,
  type Measured,
  withSheets,
} from '../support/registry/browser-paint.ts'
import { VARIANTS } from '../support/registry/browser-paths.ts'
import { stylesheet, tokens } from './support/page.ts'

const MOST_MILLISECONDS = 120_000

/**
The parts Base UI renders only once Nave has sized what they depend on: the Scroll Area's corner
exists where both scrollbars have a size, and bare scrollbars have none.
 */
const RENDERS_ONLY_STYLED = ['ScrollArea.Corner']

interface Runs {
  readonly bare: Measured
  readonly copy: Measured
  readonly packaged: Measured
}

const runsOf = async (subpath: PaintSubpath): Promise<Runs> => {
  if (subpath.copyFolder === undefined) {
    throw new Error(`the registry has no item for ${subpath.subpath}`)
  }
  const packaged = await packageComponents()
  const copy = await loadCopy(subpath.copyFolder, subpath.subpath)
  return withSheets([tokens, stylesheet, copy.css], async () => ({
    bare: await measure(subpath, await bareComponents()),
    copy: await measure(subpath, withCopy(packaged, subpath.subpath, copy)),
    packaged: await measure(subpath, packaged),
  }))
}

const once = <Value>(make: () => Promise<Value>): (() => Promise<Value>) => {
  let started: Promise<Value> | undefined
  return () => (started ??= make())
}

const failing = (found: Map<string, string[]>): string[] =>
  [...found]
    .filter(([, properties]) => properties.length > 0)
    .map(([key, properties]) => `${key}: ${properties.join('; ')}`)

const isRenderedOnlyStyled = (line: string): boolean =>
  RENDERS_ONLY_STYLED.some((key) => line.startsWith(`${key}:`))

describe('AC-base-ui-registry-24: Each styled part paints the same through the copy as through the package', () => {
  it('AC-base-ui-registry-24: every styled subpath has a copy and parts to measure', () => {
    const { paint } = requiredCopies()
    const withoutCopy = paint.filter(({ copyFolder }) => copyFolder === undefined)
    const withoutParts = paint.filter(({ parts }) => parts.length === 0)
    expect(paint.length, 'the styled subpaths').toBeGreaterThan(0)
    expect(withoutCopy.map(({ subpath }) => subpath)).toEqual([])
    expect(withoutParts.map(({ subpath }) => subpath)).toEqual([])
  })

  describe.each(copiesProvided()?.paint ?? [])('$subpath', (subpath) => {
    const runs = once(() => runsOf(subpath))

    it(
      'AC-base-ui-registry-24: every part in every state: the copy equals the package',
      async () => {
        const { copy, packaged } = await runs()
        expect(packaged.notMeasured, 'what the package run could not measure').toEqual([])
        expect(copy.notMeasured, 'what the copy run could not measure').toEqual([])
        expect(copy.unfocusable, 'the focusable parts that cannot take focus').toEqual(
          packaged.unfocusable,
        )
        expect(packaged.snapshots.size, 'the states measured').toBeGreaterThan(0)
        for (const part of subpath.parts) {
          expect(packaged.snapshots.has(`${part.key} rest`), `${part.key} at rest`).toBe(true)
        }
        expect(failing(compare(packaged, copy))).toEqual([])
      },
      MOST_MILLISECONDS,
    )

    it(
      'AC-base-ui-registry-24: non-vacuity: bare Base UI differs from the package in every state',
      async () => {
        const { bare, packaged } = await runs()
        const vacuous = [...packaged.snapshots]
          .filter(([key, snapshot]) => {
            const unstyled = bare.snapshots.get(key)
            return unstyled !== undefined && differences(unstyled, snapshot).length === 0
          })
          .map(([key]) => key)
        expect(vacuous).toEqual([])
        const absent = bare.notMeasured.filter((line) => !isRenderedOnlyStyled(line))
        expect(absent, 'a part Base UI does not render without Nave').toEqual([])
      },
      MOST_MILLISECONDS,
    )
  })

  it(
    'AC-base-ui-registry-24: control: one edited declaration in the Dialog copy reds its part',
    async () => {
      const { paint } = requiredCopies()
      const dialog = paint.find(({ subpath }) => subpath === 'dialog')
      if (dialog === undefined) throw new Error('dialog is not among the styled subpaths')
      const packaged = await packageComponents()
      const edited = await loadCopy(VARIANTS.editedPopup, 'dialog')
      const runs = await withSheets([tokens, stylesheet, edited.css], async () => ({
        copy: await measure(dialog, withCopy(packaged, 'dialog', edited)),
        packaged: await measure(dialog, packaged),
      }))
      const found = compare(runs.packaged, runs.copy)
      const red = failing(found)
      expect(red.length, 'the states that differ').toBeGreaterThan(0)
      expect(
        red.filter((line) => !line.startsWith('Dialog.Popup ')),
        'a part that does not use the edited rule',
      ).toEqual([])
      const rest = found.get('Dialog.Popup rest') ?? []
      expect(rest.some((line) => line.startsWith('background-color: '))).toBe(true)
    },
    MOST_MILLISECONDS,
  )
})
