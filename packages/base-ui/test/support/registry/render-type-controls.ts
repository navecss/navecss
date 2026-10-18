/**
 * The plants the types criterion's controls make in a copy: a read of Combobox's younger-than-floor
 * part, a required property added to the Dialog close button's props, and a line appended to the
 * parts file.
 */
import type { RegistryItem } from './load.ts'

const CLOSE_PROPS = 'export type Props = Base.Close.Props & VariantProps'

const plantInParts = (item: RegistryItem, find: string, replacement: string): RegistryItem => {
  const planted = structuredClone(item)
  const parts = planted.files.find((file) => file.target.endsWith('.parts.ts'))
  const content = parts?.content
  if (parts === undefined || !content?.includes(find)) {
    throw new Error(`${item.name}: the parts file has no ${find} to plant in`)
  }
  parts.content = content.replace(find, () => replacement)
  return planted
}

/**
 * The Dialog close button's props with a property the package's props do not require.
 */
export const withRequiredCloseProp = (item: RegistryItem): RegistryItem =>
  plantInParts(item, CLOSE_PROPS, `${CLOSE_PROPS} & { 'data-planted': number }`)

/**
 * The parts file with a line appended, for a flag of the consumer's tsconfig to find.
 */
export const withAppendedLine = (item: RegistryItem, line: string): RegistryItem => {
  const planted = structuredClone(item)
  const parts = planted.files.find((file) => file.target.endsWith('.parts.ts'))
  if (parts?.content === undefined) throw new Error(`${item.name}: the item has no parts file`)
  parts.content = `${parts.content}\n${line}\n`
  return planted
}

const DIRECT_CREATE_ITEMS =
  'export const createItems: typeof Base.createItems = /*#__PURE__*/ (() => Base.createItems)()'

/**
 * Combobox's `createItems` read as a property of the namespace, which the floor's types reject.
 */
export const withDirectCreateItems = (item: RegistryItem): RegistryItem =>
  withAppendedLine(item, DIRECT_CREATE_ITEMS)
