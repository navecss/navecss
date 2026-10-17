/**
 * The two plants the types criterion's controls make in a copy: Combobox's younger-than-floor part
 * read the direct way, and a required property added to the Dialog close button's props.
 */
import type { RegistryItem } from './load.ts'

const CAST_FORM = /\(Base as Record<string, unknown>\)\.createItems(?: as PartOf<[^>]*>)?/
const CLOSE_PROPS = 'export type Props = Base.Close.Props & VariantProps'

const plantInParts = (
  item: RegistryItem,
  find: string | RegExp,
  replacement: string,
): RegistryItem => {
  const planted = structuredClone(item)
  const parts = planted.files.find((file) => file.target.endsWith('.parts.ts'))
  const content = parts?.content
  const found =
    typeof find === 'string' ? content?.includes(find) : content !== undefined && find.test(content)
  if (parts === undefined || content === undefined || found !== true) {
    throw new Error(`${item.name}: the parts file has no ${String(find)} to plant in`)
  }
  parts.content = content.replace(find, () => replacement)
  return planted
}

/**
 * Combobox's `createItems` written as a property access on the namespace, which the floor's types
 * reject.
 */
export const withDirectCreateItems = (item: RegistryItem): RegistryItem =>
  plantInParts(item, CAST_FORM, 'Base.createItems')

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
