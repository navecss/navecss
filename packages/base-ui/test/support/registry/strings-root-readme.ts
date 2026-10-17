/**
 * The root README's checks for the registry: the "What Nave does not promise" list gains a ninth
 * item, and the "Headless components" bullet gains a pointer. Each check takes the README text
 * (and the base's) and returns its problems, so a control can run it over a README with one thing
 * changed; `rootReadmeBuiltFrom` makes the README the cleared bytes describe.
 */
import { cleared } from './cleared.ts'

export interface RootContext {
  readonly base: string
  readonly readme: string
}

const PROMISE_HEADING = '### What Nave does not promise'
const POINTER_ANCHOR = 'Radix has no Nave package yet.'
const REGISTRY_NAME_SLOT = 'the registry'

/**
 * The items of the numbered list under "What Nave does not promise": a line starting `N. ` opens
 * an item and the lines after it that do not start another belong to it. The list ends at the
 * first blank line.
 */
export const promiseItems = (readme: string): string[] => {
  const lines = readme.split('\n')
  const heading = lines.indexOf(PROMISE_HEADING)
  if (heading === -1) return []
  const rest = lines.slice(heading + 1)
  const start = rest.findIndex((line) => line.startsWith('1. '))
  if (start === -1) return []
  const items: string[] = []
  for (const line of rest.slice(start)) {
    if (line === '') break
    if (/^\d+\. /.test(line)) items.push(line)
    else items[items.length - 1] = `${items.at(-1) ?? ''}\n${line}`
  }
  return items
}

/**
 * Whether an item is `S-a`, or `S-a` with "the registry" replaced once by a name on one line and
 * nothing else changed.
 */
export const isItemNine = (item: string): boolean => {
  const itemNine = cleared('S-a')
  if (item === itemNine) return true
  const parts = itemNine.split(REGISTRY_NAME_SLOT)
  if (parts.length !== 2) throw new Error('S-a has no single "the registry" to replace')
  const [prefix = '', suffix = ''] = parts
  if (!item.startsWith(prefix) || !item.endsWith(suffix)) return false
  if (item.length < prefix.length + suffix.length) return false
  const name = item.slice(prefix.length, item.length - suffix.length)
  return name.length > 0 && !name.includes('\n')
}

export const promiseListProblems = ({ base, readme }: RootContext): string[] => {
  const head = promiseItems(readme)
  const before = promiseItems(base)
  if (before.length === 0) return ['the base README has no promise list to compare with']
  const problems = before
    .map((item, index) => (head[index] === item ? '' : `item ${index + 1} differs from the base's`))
    .filter((problem) => problem !== '')
  if (head.length !== before.length + 1) {
    problems.push(`the list has ${head.length} items, expected ${before.length + 1}`)
  } else if (!isItemNine(head.at(-1) ?? '')) {
    problems.push('the ninth item is not S-a')
  }
  return problems
}

const OLD_REGISTRY_SENTENCE =
  'Anything about the component registry, until components exist and have\n   been reviewed one by one.'

export const oldSentenceProblems = ({ readme }: RootContext): string[] =>
  readme.includes(OLD_REGISTRY_SENTENCE) ? ['the old registry sentence is back'] : []

const headlessBullet = (readme: string): string => {
  const lines = readme.split('\n')
  const start = lines.findIndex((line) => line.startsWith('- **Headless components**'))
  if (start === -1) return ''
  const rest = lines.slice(start + 1)
  const stop = rest.findIndex((line) => line.startsWith('- '))
  return [lines[start], ...(stop === -1 ? rest : rest.slice(0, stop))].join('\n')
}

export const pointerProblems = ({ readme }: RootContext): string[] => {
  const pointer = cleared('P')
  const count = readme.split(pointer).length - 1
  const problems: string[] = count === 1 ? [] : [`P is present ${count} times, expected 1`]
  if (!readme.includes(`${POINTER_ANCHOR}\n${pointer}`)) {
    problems.push(`P does not directly follow the line ending "${POINTER_ANCHOR}"`)
  }
  if (!headlessBullet(readme).includes(pointer)) {
    problems.push('P is not inside the "Headless components" bullet')
  }
  return problems
}

/**
 * The README the cleared bytes describe: the base's with `S-a` appended to the promise list and
 * `P` on the lines after the one ending "Radix has no Nave package yet.".
 */
export const rootReadmeBuiltFrom = (base: string): string => {
  const last = promiseItems(base).at(-1)
  if (last === undefined) throw new Error('the base README has no promise list')
  if (!base.includes(`${last}\n`)) throw new Error('the base README list does not end in a line')
  return base
    .replace(`${last}\n`, () => `${last}\n${cleared('S-a')}\n`)
    .replace(`${POINTER_ANCHOR}\n`, () => `${POINTER_ANCHOR}\n${cleared('P')}\n`)
}

export const ROOT_CHECKS: Readonly<Record<string, (context: RootContext) => string[]>> = {
  "items 1 to 8 are the base's and the ninth is S-a": promiseListProblems,
  'the old registry sentence stays absent': oldSentenceProblems,
  'P is present once, directly after the Radix line': pointerProblems,
}
