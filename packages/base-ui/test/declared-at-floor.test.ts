import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it, type TestContext } from 'vitest'

import { attributeReads } from './support/selector.ts'
import { flatten, PACKAGE_DIR, readStylesheet } from './support/stylesheet.ts'
import { declaredTokens, workspaceTokensCss } from './support/tokens.ts'
import {
  baseUiRootAt,
  installHint,
  isDeclared,
  itemsMissingFrom,
} from './support/w3-base-ui-versions.ts'
import {
  firstTokensVersionWithTheHighlight,
  namedTokens,
  publishedTokens,
  undeclaredIn,
} from './support/w3-tokens-floor.ts'

const FLOOR = path.join(PACKAGE_DIR, 'node_modules/base-ui-react-floor/esm')

/**
 * An item a Base UI file declares through a shared enum: the file assigns the member from the
 * enum the row names (`X["side"] = CommonPopupDataAttributes.side`), and that enum's own file maps
 * the member to the item (`CommonPopupDataAttributes["side"] = "data-side"`).
 */
interface SharedItem {
  readonly enumFile: string
  readonly enumName: string
  readonly item: string
  readonly member: string
}

const POPUP: Pick<SharedItem, 'enumFile' | 'enumName'> = {
  enumFile: 'utils/popupStateMapping.js',
  enumName: 'CommonPopupDataAttributes',
}
const TRANSITION: Pick<SharedItem, 'enumFile' | 'enumName'> = {
  enumFile: 'utils/stateAttributesMapping.js',
  enumName: 'TransitionStatusDataAttributes',
}

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

/**
 * The rows for the parts and attributes the overlay components add, each read as text from the
 * declaration files (`.d.ts`) of the minor the row names: the part's first minor, not the floor.
 */
interface VersionedRow {
  readonly files: readonly string[]
  readonly items: readonly string[]
  readonly version: string
}

const POPUP_FILES = [
  'menu/popup/MenuPopupDataAttributes.d.ts',
  'popover/popup/PopoverPopupDataAttributes.d.ts',
  'tooltip/popup/TooltipPopupDataAttributes.d.ts',
  'select/popup/SelectPopupDataAttributes.d.ts',
  'dialog/popup/DialogPopupDataAttributes.d.ts',
  'preview-card/popup/PreviewCardPopupDataAttributes.d.ts',
  'combobox/popup/ComboboxPopupDataAttributes.d.ts',
]

const versionedRows: readonly VersionedRow[] = [
  {
    files: ['combobox/item/ComboboxtemDataAttributes.d.ts'],
    items: ['data-highlighted'],
    version: '1.0.0',
  },
  {
    files: [
      'menu/item/MenuItemDataAttributes.d.ts',
      'menu/checkbox-item/MenuCheckboxItemDataAttributes.d.ts',
      'menu/radio-item/MenuRadioItemDataAttributes.d.ts',
      'menu/submenu-trigger/MenuSubmenuTriggerDataAttributes.d.ts',
    ],
    items: ['data-highlighted'],
    version: '1.0.0',
  },
  {
    files: ['menu/link-item/MenuLinkItemDataAttributes.d.ts'],
    items: ['data-highlighted'],
    version: '1.2.0',
  },
  {
    files: ['select/item/SelectItemDataAttributes.d.ts'],
    items: ['data-highlighted'],
    version: '1.0.0',
  },
  {
    files: [
      'menu/popup/MenuPopupDataAttributes.d.ts',
      'popover/popup/PopoverPopupDataAttributes.d.ts',
      'tooltip/popup/TooltipPopupDataAttributes.d.ts',
    ],
    items: ['data-instant'],
    version: '1.0.0',
  },
  {
    files: [...POPUP_FILES, 'dialog/backdrop/DialogBackdropDataAttributes.d.ts'],
    items: ['data-starting-style', 'data-ending-style'],
    version: '1.0.0',
  },
  {
    files: [
      'menu/arrow/MenuArrowDataAttributes.d.ts',
      'popover/arrow/PopoverArrowDataAttributes.d.ts',
      'select/arrow/SelectArrowDataAttributes.d.ts',
      'tooltip/arrow/TooltipArrowDataAttributes.d.ts',
      'preview-card/arrow/PreviewCardArrowDataAttributes.d.ts',
      'combobox/arrow/ComboboxArrowDataAttributes.d.ts',
    ],
    items: ['data-side', 'inline-start', 'inline-end'],
    version: '1.0.0',
  },
  {
    files: ['combobox/popup/ComboboxPopupDataAttributes.d.ts'],
    items: ['data-empty'],
    version: '1.0.0',
  },
  {
    files: ['combobox/input-group/ComboboxInputGroupDataAttributes.d.ts'],
    items: ['data-invalid', 'data-disabled'],
    version: '1.3.0',
  },
]

const byVersion = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true })

const VERSIONS = [...new Set(versionedRows.map(({ version }) => version))].toSorted(byVersion)

/**
 * The package's modules at a minor, or an error that names the alias to install.
 */
const rootAtOrThrow = (version: string): string => {
  const root = baseUiRootAt(version)
  if (root === undefined) {
    throw new Error(installHint(version))
  }
  return root
}

const isMissingFrom = (file: string, item: string, root: string = FLOOR): boolean =>
  !readFileSync(path.join(root, file), 'utf8').includes(item)

const escapeRegExp = (value: string): string =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

/**
 * Whether a file declares the item through its shared enum. Both must hold: the file assigns the
 * member from the enum the row names (`["side"] = CommonPopupDataAttributes.side]`, not the same
 * member of another enum), and the enum's own file maps the member to the item. A member name that
 * only occurs elsewhere in the file (a doc comment says "side" too) does not count.
 */
const isSharedItemDeclared = (file: string, shared: SharedItem, root: string = FLOOR): boolean => {
  const { enumFile, enumName, item, member } = shared
  const isAssigned = new RegExp(String.raw`\["${member}"\]\s*=\s*${enumName}\.${member}\]`).test(
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

const COPIES = mkdtempSync(path.join(os.tmpdir(), 'nave-declared-at-floor-'))

afterAll(() => {
  rmSync(COPIES, { force: true, recursive: true })
})

/**
 * A copy of the files of the floor package a control damages, so the floor itself is never
 * touched. Returns the copy's root, inside a directory made for this run and removed after it.
 */
const copyOfFloor = (name: string, files: readonly string[]): string => {
  const root = path.join(COPIES, name)
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    cpSync(path.join(FLOOR, file), path.join(root, file))
  }
  return root
}

const ARROW = 'popover/arrow/PopoverArrowDataAttributes.js'

describe('AC-base-ui-overlay-completion-28: every attribute and variable the stylesheet keys on is declared at the floor, and at the first minor of a part younger than it', () => {
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

  it('control: a member assigned from another enum than the row names is reported', () => {
    const root = copyOfFloor('other-enum', [ARROW, DATA_SIDE.enumFile])
    const file = path.join(root, ARROW)
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        'CommonPopupDataAttributes.side]',
        'CommonTriggerDataAttributes.side]',
      ),
    )
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

  for (const version of VERSIONS) {
    it(`finds @base-ui/react@${version} installed through its alias`, () => {
      expect(baseUiRootAt(version), installHint(version)).toBeDefined()
    })
  }

  for (const { files, items, version } of versionedRows) {
    for (const file of files) {
      it(`${file} declares ${items.join(', ')} at ${version}`, () => {
        expect(itemsMissingFrom(rootAtOrThrow(version), file, items)).toEqual([])
      })
    }
  }

  it('control: a planted row (data-instant, select/popup/SelectPopupDataAttributes.d.ts, 1.0.0) is reported missing', () => {
    expect(
      itemsMissingFrom(rootAtOrThrow('1.0.0'), 'select/popup/SelectPopupDataAttributes.d.ts', [
        'data-instant',
      ]),
    ).toEqual(['data-instant'])
  })

  it('control: the same planted row is reported missing in the package at the floor alias', () => {
    expect(
      itemsMissingFrom(rootAtOrThrow('1.3.0'), 'select/popup/SelectPopupDataAttributes.d.ts', [
        'data-instant',
      ]),
    ).toEqual(['data-instant'])
  })

  it('control: an item named only in a doc comment does not count as declared', () => {
    const commentOnly = ['/**', ' * Present with data-highlighted.', ' */', 'enum E {}'].join('\n')
    expect(isDeclared(commentOnly, 'data-highlighted')).toBe(false)
    expect(isDeclared('highlighted = "data-highlighted",', 'data-highlighted')).toBe(true)
  })

  it('has a row for every Base UI attribute and variable the stylesheet uses', () => {
    const css = readStylesheet()
    const keyed = new Set([...keyedAttributes(css), ...keyedVariables(css)])
    const covered = new Set([
      ...rows.flatMap(({ items, shared = [] }) => [...items, ...shared.map(({ item }) => item)]),
      ...versionedRows.flatMap(({ items }) => items),
    ])
    expect([...keyed].filter((name) => !covered.has(name))).toEqual([])
  })
})

/**
 * The published tokens release, or a skip that says what unskips the test.
 */
const publishedOrSkip = (
  context: TestContext,
): { declared: ReadonlySet<string>; version: string } => {
  const published = publishedTokens()
  if ('reason' in published) {
    return context.skip(published.reason)
  }
  return published
}

const withdrawn = (name: string): string => `.x { color: var(${name}) }`

const tokensDeclaredByWorkspace = (): Set<string> =>
  new Set(declaredTokens(workspaceTokensCss()).keys())

const NEW_TOKENS = [
  '--nave-color-action-highlight',
  '--nave-color-backdrop-modal',
  '--nave-motion-duration-instant',
  '--nave-motion-easing-decelerate',
  '--nave-motion-easing-accelerate',
]

describe('AC-base-ui-overlay-completion-31: every Nave token the stylesheet names exists in the workspace and at the new tokens floor', () => {
  it('names 59 distinct tokens, among them the five this work adds', () => {
    const named = namedTokens(readStylesheet())
    expect(named.size).toBe(59)
    expect(NEW_TOKENS.filter((name) => !named.has(name))).toEqual([])
  })

  it('names only tokens the workspace declares', () => {
    expect(undeclaredIn(readStylesheet(), tokensDeclaredByWorkspace())).toEqual([])
  })

  it('names only tokens the published tokens release declares', (context) => {
    const published = publishedOrSkip(context)
    expect(published.version).toBe(firstTokensVersionWithTheHighlight())
    expect(undeclaredIn(readStylesheet(), published.declared)).toEqual([])
  })

  it('control: a planted var(--nave-color-surface-scrim) and var(--nave-color-surface-highlight) are each reported against the workspace', () => {
    const declared = tokensDeclaredByWorkspace()
    expect(undeclaredIn(withdrawn('--nave-color-surface-scrim'), declared)).toEqual([
      '--nave-color-surface-scrim',
    ])
    expect(undeclaredIn(withdrawn('--nave-color-surface-highlight'), declared)).toEqual([
      '--nave-color-surface-highlight',
    ])
  })

  it('control: the same two planted names are each reported against the published release', (context) => {
    const published = publishedOrSkip(context)
    expect(undeclaredIn(withdrawn('--nave-color-surface-scrim'), published.declared)).toEqual([
      '--nave-color-surface-scrim',
    ])
    expect(undeclaredIn(withdrawn('--nave-color-surface-highlight'), published.declared)).toEqual([
      '--nave-color-surface-highlight',
    ])
  })
})
