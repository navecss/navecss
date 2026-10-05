import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { attributeReads } from './support/selector.ts'
import { flatten, PACKAGE_DIR, readStylesheet } from './support/stylesheet.ts'

const FLOOR = path.join(PACKAGE_DIR, 'node_modules/base-ui-react-floor/esm')

/**
 * An item a Base UI file declares through a shared enum: the file assigns the enum's member
 * (`X["side"] = CommonPopupDataAttributes.side`), and the enum's own file maps that member to the
 * item (`CommonPopupDataAttributes["side"] = "data-side"`).
 */
interface SharedItem {
  readonly enumFile: string
  readonly item: string
  readonly member: string
}

const POPUP: Pick<SharedItem, 'enumFile'> = { enumFile: 'utils/popupStateMapping.js' }
const TRANSITION: Pick<SharedItem, 'enumFile'> = { enumFile: 'utils/stateAttributesMapping.js' }

const DATA_SIDE: SharedItem = { ...POPUP, item: 'data-side', member: 'side' }
const STARTING_STYLE: SharedItem = {
  ...TRANSITION,
  item: 'data-starting-style',
  member: 'startingStyle',
}
const ENDING_STYLE: SharedItem = {
  ...TRANSITION,
  item: 'data-ending-style',
  member: 'endingStyle',
}

/**
 * Table T1, extended with the form rows: the data attributes and variables the stylesheet keys on,
 * each with the declaration file of the floor package (`@base-ui/react@1.3.0`) that declares it,
 * either by writing the item out or through a shared enum.
 */
const rows: readonly {
  files: readonly string[]
  items: readonly string[]
  shared?: readonly SharedItem[]
}[] = [
  {
    files: [
      'menu/positioner/MenuPositionerCssVars.js',
      'select/positioner/SelectPositionerCssVars.js',
    ],
    items: ['--anchor-width', '--available-height'],
  },
  { files: ['popover/positioner/PopoverPositionerCssVars.js'], items: ['--available-height'] },
  {
    files: [
      'popover/arrow/PopoverArrowDataAttributes.js',
      'menu/arrow/MenuArrowDataAttributes.js',
      'select/arrow/SelectArrowDataAttributes.js',
      'tooltip/arrow/TooltipArrowDataAttributes.js',
    ],
    items: [],
    shared: [DATA_SIDE],
  },
  { files: ['accordion/panel/AccordionPanelCssVars.js'], items: ['--accordion-panel-height'] },
  {
    files: ['collapsible/panel/CollapsiblePanelCssVars.js'],
    items: ['--collapsible-panel-height'],
  },
  {
    files: [
      'accordion/panel/AccordionPanelDataAttributes.js',
      'collapsible/panel/CollapsiblePanelDataAttributes.js',
    ],
    items: [],
    shared: [STARTING_STYLE, ENDING_STYLE],
  },
  {
    files: ['tabs/list/TabsListDataAttributes.js', 'tabs/indicator/TabsIndicatorDataAttributes.js'],
    items: ['data-orientation'],
  },
  {
    files: ['tabs/indicator/TabsIndicatorCssVars.js'],
    items: ['--active-tab-left', '--active-tab-top', '--active-tab-width', '--active-tab-height'],
  },
  { files: ['select/value/SelectValueDataAttributes.js'], items: ['data-placeholder'] },
  {
    files: [
      'number-field/group/NumberFieldGroupDataAttributes.js',
      'slider/thumb/SliderThumbDataAttributes.js',
    ],
    items: ['data-disabled'],
  },
  {
    files: [
      'toggle-group/ToggleGroupDataAttributes.js',
      'toolbar/group/ToolbarGroupDataAttributes.js',
      'slider/control/SliderControlDataAttributes.js',
      'slider/track/SliderTrackDataAttributes.js',
      'slider/thumb/SliderThumbDataAttributes.js',
    ],
    items: ['data-orientation'],
  },
]

const isMissingFrom = (file: string, item: string, root: string = FLOOR): boolean =>
  !readFileSync(path.join(root, file), 'utf8').includes(item)

const escapeRegExp = (value: string): string =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

/**
 * Whether a file declares the item through its shared enum. A member name that only occurs
 * elsewhere in the file (a doc comment says "side" too) does not count: the assignment from the
 * enum must be there, and the enum's own file must map the member to the item.
 */
const isSharedItemDeclared = (file: string, shared: SharedItem, root: string = FLOOR): boolean => {
  const { enumFile, item, member } = shared
  const isAssigned = new RegExp(String.raw`\["${member}"\]\s*=\s*\w+\.${member}\]`).test(
    readFileSync(path.join(root, file), 'utf8'),
  )
  const isMapped = new RegExp(String.raw`\["${member}"\]\s*=\s*"${escapeRegExp(item)}"`).test(
    readFileSync(path.join(root, enumFile), 'utf8'),
  )
  return isAssigned && isMapped
}

const keyedAttributes = (css: string): string[] =>
  flatten(css)
    .flatMap(({ selectors }) =>
      selectors.flatMap((selector) => attributeReads(selector).map(({ name }) => name)),
    )
    .filter((name) => !name.startsWith('aria-') && !name.startsWith('data-nave-'))

const keyedVariables = (css: string): string[] =>
  flatten(css)
    .flatMap(({ value }) =>
      value
        .matchAll(/var\((--[\w-]+)/g)
        .map((match) => match[1] ?? '')
        .toArray(),
    )
    .filter((name) => !name.startsWith('--nave-'))

const CACHE = path.join(PACKAGE_DIR, 'node_modules/.cache/declared-at-floor')

/**
 * A copy of the files of the floor package a control damages, so the floor itself is never
 * touched. Returns the copy's root.
 */
const copyOfFloor = (name: string, files: readonly string[]): string => {
  const root = path.join(CACHE, name)
  rmSync(root, { force: true, recursive: true })
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    cpSync(path.join(FLOOR, file), path.join(root, file))
  }
  return root
}

const ARROW = 'popover/arrow/PopoverArrowDataAttributes.js'

describe('AC-base-ui-bridge-21: every attribute and variable the stylesheet keys on is declared at the floor', () => {
  it('finds the floor package installed through its alias', () => {
    expect(existsSync(FLOOR)).toBe(true)
  })

  for (const { files, items, shared = [] } of rows) {
    for (const file of files) {
      const names = [...items, ...shared.map(({ item }) => item)]
      it(`${file} declares ${names.join(', ')}`, () => {
        expect(items.filter((item) => isMissingFrom(file, item))).toEqual([])
        expect(shared.filter((entry) => !isSharedItemDeclared(file, entry))).toEqual([])
      })
    }
  }

  it('control: an item a file does not declare is reported', () => {
    expect(isMissingFrom('menu/arrow/MenuArrowDataAttributes.js', 'data-nope')).toBe(true)
  })

  it('control: a shared-enum member whose assignment is deleted from the file is reported', () => {
    const root = copyOfFloor('no-assignment', [ARROW, DATA_SIDE.enumFile])
    const file = path.join(root, ARROW)
    writeFileSync(
      file,
      readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => !line.includes('CommonPopupDataAttributes.side'))
        .join('\n'),
    )
    expect(isSharedItemDeclared(ARROW, DATA_SIDE)).toBe(true)
    expect(isSharedItemDeclared(ARROW, DATA_SIDE, root)).toBe(false)
  })

  it('control: a shared enum whose member maps to another attribute is reported', () => {
    const root = copyOfFloor('other-value', [ARROW, DATA_SIDE.enumFile])
    const enumFile = path.join(root, DATA_SIDE.enumFile)
    writeFileSync(
      enumFile,
      readFileSync(enumFile, 'utf8').replace(
        '["side"] = "data-side"',
        '["side"] = "data-placement"',
      ),
    )
    expect(isSharedItemDeclared(ARROW, DATA_SIDE, root)).toBe(false)
  })

  it('has a row for every Base UI attribute and variable the stylesheet uses', () => {
    const css = readStylesheet()
    const keyed = new Set([...keyedAttributes(css), ...keyedVariables(css)])
    const covered = new Set(
      rows.flatMap(({ items, shared = [] }) => [...items, ...shared.map(({ item }) => item)]),
    )
    expect([...keyed].filter((name) => !covered.has(name))).toEqual([])
  })
})
