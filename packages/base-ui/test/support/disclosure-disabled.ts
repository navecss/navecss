/**
 * What a disabled Accordion or Collapsible trigger carries when it is a native button, at the run's
 * Base UI. Up to 1.8.0 it is `aria-disabled="true"`, and the button stays in the tab order; from
 * 1.9.0 it is the native `disabled` attribute instead, which takes the button out of the tab order.
 * A trigger rendered as another element carries `aria-disabled` at every minor.
 */
import { atoms } from '../../styles/atoms.ts'
import { FLOOR_MINOR, runMinor } from './w6-minors.ts'

export const disclosureTriggerDisabled = (): {
  readonly aria: boolean
  readonly native: boolean
} =>
  runMinor().version === FLOOR_MINOR.version
    ? { aria: true, native: false }
    : { aria: false, native: true }

/**
 * The `tabindex` of a disabled Accordion or Collapsible trigger rendered as another element
 * (`nativeButton={false}`): `0` up to 1.8.0, and `-1` from 1.9.0, which takes it out of the tab
 * order. A native button keeps `0` at every minor; the native `disabled` attribute is what takes
 * it out of the tab order there.
 */
export const disclosureDivTabindex = (): string =>
  runMinor().version === FLOOR_MINOR.version ? '0' : '-1'

const branchesOf = (selectorList: string): string[] => {
  const branches: string[] = []
  let depth = 0
  let start = 0
  for (const [index, char] of [...selectorList].entries()) {
    if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1
    else if (char === ',' && depth === 0) {
      branches.push(selectorList.slice(start, index))
      start = index + 1
    }
  }
  return [...branches, selectorList.slice(start)].map((branch) => branch.trim())
}

/**
 * The selectors of the disclosure trigger's disabled rule, read from the atom the stylesheet is
 * built from. Each is the trigger itself with a condition, so `element.matches` answers whether
 * the rule reaches an element: a key's `&` stands for the trigger and is taken out, and a branch
 * with no `&` is the trigger with that condition, as the build reads it.
 */
export const disclosureTriggerDisabledSelectors = (): string[] =>
  Object.keys(atoms.baseUiDisclosureTrigger?.pseudos ?? {})
    .flatMap((selectorList) => branchesOf(selectorList))
    .filter((branch) => branch.includes('disabled'))
    .map((branch) => branch.replaceAll('&', ''))
