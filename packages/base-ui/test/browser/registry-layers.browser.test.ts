/**
 * AC-base-ui-registry-25: the copy beats the reset whichever stylesheet loads first, and an edit to
 * one copy reaches no other. The Dialog copy's module is the registry's file, imported through the
 * dev server; its stylesheet is taken out of the head and put back in the order each scenario is
 * about, with the tokens, the package stylesheet and a sentinel rule in the `reset` layer.
 */
/* eslint-disable unicorn/max-nested-calls -- a scene is a tree, written as the nested calls it renders */
import type { ReactNode } from 'react'

import { afterEach, describe, expect, it } from 'vitest'

import type { Ui } from '../support/scenes.ts'

import { requiredCopies } from '../support/registry/browser-injected.ts'
import { loadCopy, type LoadedCopy, packageComponents } from '../support/registry/browser-load.ts'
import { differences, type Snapshot, snapshotOf } from '../support/registry/browser-paint.ts'
import { VARIANTS } from '../support/registry/browser-paths.ts'
import {
  el as h,
  mount,
  type Page,
  settled,
  stylesheet,
  tokens,
  useSheets,
} from './support/page.ts'

const SENTINEL_COLOUR = 'rgb(1, 2, 3)'
const EDITED_COLOUR = 'rgb(4, 5, 6)'

interface Loaded {
  readonly buttonCopy: LoadedCopy
  readonly dialogCopy: LoadedCopy
  readonly editedButton: LoadedCopy
  readonly noOrderStatement: LoadedCopy
  readonly packaged: (subpath: string) => Ui
}

const loadAll = async (): Promise<Loaded> => {
  requiredCopies()
  return {
    buttonCopy: await loadCopy('base-ui-button', 'button'),
    dialogCopy: await loadCopy('base-ui-dialog', 'dialog'),
    editedButton: await loadCopy(VARIANTS.editedButton, 'dialog'),
    noOrderStatement: await loadCopy(VARIANTS.noOrderStatement, 'dialog'),
    packaged: await packageComponents(),
  }
}

const once = <Value>(make: () => Promise<Value>): (() => Promise<Value>) => {
  let started: Promise<Value> | undefined
  return () => (started ??= make())
}

const load = once(loadAll)

/**
What a scenario has put in the page: the scene mounted and the sheets added, taken out together.
 */
const createStage = (): {
  finish: () => void
  show: (scene: ReactNode, sheets: readonly string[]) => Promise<void>
} => {
  let page: Page | undefined
  let removeSheets: (() => void) | undefined
  const finish = (): void => {
    page?.dispose()
    removeSheets?.()
    page = undefined
    removeSheets = undefined
  }
  return {
    finish,
    show: async (scene, sheets) => {
      finish()
      removeSheets = useSheets(...sheets)
      page = mount(scene)
      await settled(() => document.querySelector('[data-testid="popup"]') ?? undefined)
    },
  }
}

const stage = createStage()

afterEach(stage.finish)

const dialogScene = (dialog: Ui): ReactNode => {
  const parts = dialog as Record<string, never>
  return h(
    parts.Root,
    { defaultOpen: true },
    h(parts.Trigger, { 'data-testid': 'trigger' }, 'Open'),
    h(
      parts.Portal,
      {},
      h(
        parts.Popup,
        { 'data-testid': 'popup' },
        h(parts.Title, {}, 'Title'),
        h(parts.Close, { 'data-testid': 'close' }, 'Close'),
      ),
    ),
  )
}

const elementOf = (id: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(id)}"]`)
  if (found === null) throw new Error(`the scene has no ${id}`)
  return found
}

/**
The selector of the copy's popup: both of its classes, so it outweighs the copy's own rule by
specificity as well, and only the layer order can decide.
 */
const popupSelector = async (copy: LoadedCopy): Promise<string> => {
  await stage.show(dialogScene(copy.ui), [tokens, stylesheet, copy.css])
  const classes = [...elementOf('popup').classList]
  stage.finish()
  expect(classes.length, 'the copy popup carries its module classes').toBeGreaterThan(0)
  return classes.map((name) => `.${CSS.escape(name)}`).join('')
}

const sentinelFor = (selector: string): string =>
  `@layer reset { ${selector} { background-color: ${SENTINEL_COLOUR} } }`

/**
The colour the overlay surface token resolves to, in the form a background reads it.
 */
const overlaySurface = (): string => {
  const probe = document.createElement('div')
  probe.style.backgroundColor = 'var(--nave-color-surface-overlay)'
  document.body.append(probe)
  const colour = getComputedStyle(probe).backgroundColor
  probe.remove()
  return colour
}

const backgroundOf = async (dialog: Ui, sheets: readonly string[]): Promise<string> => {
  await stage.show(dialogScene(dialog), sheets)
  const colour = getComputedStyle(elementOf('popup')).backgroundColor
  stage.finish()
  return colour
}

interface Backgrounds {
  readonly copy: string
  readonly packaged: string
  readonly token: string
}

const backgrounds = async (
  sheets: readonly string[],
  dialog: LoadedCopy,
  packaged: Ui,
): Promise<Backgrounds> => {
  const remove = useSheets(...sheets)
  const token = overlaySurface()
  remove()
  return {
    copy: await backgroundOf(dialog.ui, sheets),
    packaged: await backgroundOf(packaged, sheets),
    token,
  }
}

const TRIGGERS = ['trigger', 'close']
const OTHERS = ['button-copy', 'button-package', 'menu-trigger']

/**
The Dialog copy's triggers, the Button copy, the package's Button and the package's Menu trigger in
one page, each read for its computed style.
 */
const readTriggers = async (loaded: Loaded, dialog: LoadedCopy): Promise<Map<string, Snapshot>> => {
  const menu = loaded.packaged('menu') as Record<string, never>
  await stage.show(
    h(
      'div',
      {},
      dialogScene(dialog.ui),
      h(loaded.buttonCopy.ui, { 'data-testid': 'button-copy' }, 'Button copy'),
      h(loaded.packaged('button'), { 'data-testid': 'button-package' }, 'Button package'),
      h(menu.Root, {}, h(menu.Trigger, { 'data-testid': 'menu-trigger' }, 'Menu')),
    ),
    [tokens, stylesheet, dialog.css, loaded.buttonCopy.css],
  )
  const snapshots = new Map(
    [...TRIGGERS, ...OTHERS].map((id) => [id, snapshotOf(elementOf(id))] as const),
  )
  stage.finish()
  return snapshots
}

const readOf = (side: Map<string, Snapshot>, id: string): Snapshot => side.get(id) ?? new Map()

describe('AC-base-ui-registry-25: The copy beats the reset whichever stylesheet loads first, and an edit to one copy reaches no other', () => {
  it('AC-base-ui-registry-25: the Dialog and Button copies each register the layers themselves', async () => {
    const loaded = await load()
    expect(loaded.dialogCopy.css).toContain('@layer components.consumer')
    expect(loaded.buttonCopy.css).toContain('@layer components.consumer')
  })

  it("AC-base-ui-registry-25: module before the package stylesheet: the copy's popup keeps its own value", async () => {
    const loaded = await load()
    const sentinel = sentinelFor(await popupSelector(loaded.dialogCopy))
    const sheets = [loaded.dialogCopy.css, tokens, stylesheet, sentinel]
    const found = await backgrounds(sheets, loaded.dialogCopy, loaded.packaged('dialog'))
    expect(found.token, 'the token resolves').not.toBe('')
    expect(found.copy).not.toBe(SENTINEL_COLOUR)
    expect(found.copy).toBe(found.token)
    expect(found.packaged, "the package's popup is the package's").toBe(found.token)
  })

  it("AC-base-ui-registry-25: module after the package stylesheet: the copy's popup keeps its own value", async () => {
    const loaded = await load()
    const sentinel = sentinelFor(await popupSelector(loaded.dialogCopy))
    const sheets = [tokens, stylesheet, loaded.dialogCopy.css, sentinel]
    const found = await backgrounds(sheets, loaded.dialogCopy, loaded.packaged('dialog'))
    expect(found.copy).not.toBe(SENTINEL_COLOUR)
    expect(found.copy).toBe(found.token)
    expect(found.packaged, "the package's popup is the package's").toBe(found.token)
  })

  it('AC-base-ui-registry-25: control: without its order statement and loaded first, the module loses to the sentinel', async () => {
    const loaded = await load()
    const sentinel = sentinelFor(await popupSelector(loaded.noOrderStatement))
    const sheets = [loaded.noOrderStatement.css, tokens, stylesheet, sentinel]
    const found = await backgrounds(sheets, loaded.noOrderStatement, loaded.packaged('dialog'))
    expect(loaded.noOrderStatement.css, 'the order statement is gone').not.toMatch(
      /@layer\s[^{;]*,[^{;]*;/,
    )
    expect(found.copy, 'the sentinel wins on the copy').toBe(SENTINEL_COLOUR)
    expect(found.packaged, "the package's popup is not the sentinel's").toBe(found.token)
  })

  it("AC-base-ui-registry-25: editing the Dialog copy's .button rule changes only the Dialog copy's triggers", async () => {
    const loaded = await load()
    const before = await readTriggers(loaded, loaded.dialogCopy)
    const after = await readTriggers(loaded, loaded.editedButton)
    for (const id of TRIGGERS) {
      expect(readOf(after, id).get('background-color'), `${id} is edited`).toBe(EDITED_COLOUR)
      expect(readOf(before, id).get('background-color'), `${id} was not`).not.toBe(EDITED_COLOUR)
      expect(readOf(before, id).get('border-top-style'), `${id} had its border`).toBe('solid')
      expect(readOf(after, id).get('border-top-style'), `${id} lost its border`).not.toBe('solid')
    }
    for (const id of OTHERS) {
      expect(
        differences(readOf(before, id), readOf(after, id)),
        `${id} keeps its computed style`,
      ).toEqual([])
    }
  }, 60_000)
})
