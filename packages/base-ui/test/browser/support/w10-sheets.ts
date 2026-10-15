/**
 * The built stylesheet as text, edited the way the draft-state controls edit it: a class taken
 * out of the sheet (the wrapper still adds it, nothing styles it), one rule swapped for another
 * form, a hash of the bytes swapped in so a form written out in a test is shown to be the form the
 * spec prints.
 */

const escaped = (className: string): string => className.replaceAll('-', String.raw`\-`)

/**
 * Takes a class out of the sheet the way a build without its signature has it: no selector names
 * it any more, while the element that carries it keeps carrying it. The class is checked to have
 * been there to take out.
 */
export const withoutClass = (sheet: string, className: string): string => {
  const pattern = new RegExp(String.raw`\.nave-base-ui-${escaped(className)}(?![\w-])`, 'g')
  if (!pattern.test(sheet)) {
    throw new Error(`.nave-base-ui-${className} is not in the stylesheet to take out`)
  }
  return sheet.replace(pattern, (match) => `${match}-removed`)
}

interface Bounds {
  readonly end: number
  readonly start: number
}

/**
 * Where a class's top-level rule is in the sheet: from its two leading spaces to the newline that
 * ends its closing brace, nested rules included.
 */
const boundsOf = (sheet: string, className: string): Bounds => {
  const head = `\n  .nave-base-ui-${className} {`
  const found = sheet.indexOf(head)
  if (found === -1) {
    throw new Error(`.nave-base-ui-${className} has no rule in the stylesheet`)
  }
  const start = found + 1
  let depth = 0
  for (let index = sheet.indexOf('{', start); index < sheet.length; index += 1) {
    const character = sheet[index]
    if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        const lineEnd = sheet.indexOf('\n', index)
        return { end: lineEnd === -1 ? sheet.length : lineEnd + 1, start }
      }
    }
  }
  throw new Error(`.nave-base-ui-${className} has an unclosed rule`)
}

/**
The class's rule as the sheet has it.
 */
export const ruleOf = (sheet: string, className: string): string => {
  const { end, start } = boundsOf(sheet, className)
  return sheet.slice(start, end)
}

/**
The sheet with the class's rule replaced by another form of it.
 */
export const withRule = (sheet: string, className: string, replacement: string): string => {
  const { end, start } = boundsOf(sheet, className)
  return `${sheet.slice(0, start)}${replacement}${sheet.slice(end)}`
}

/**
The first sixteen hex digits of the SHA-256 of the text's UTF-8 bytes, which is how the spec prints a rule.
 */
export const sha256Prefix = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

/**
The bytes of a rule, as the spec counts them.
 */
export const byteLength = (text: string): number => new TextEncoder().encode(text).length

/**
 * A form of a rule that the spec prints with its byte count and hash. It is checked against both
 * before it is used, so a control built from it is the control the spec names.
 */
export const printedForm = async (
  rule: string,
  printed: { readonly bytes: number; readonly hash: string },
): Promise<string> => {
  if (byteLength(rule) !== printed.bytes || (await sha256Prefix(rule)) !== printed.hash) {
    throw new Error(
      `the form written out here is ${String(byteLength(rule))} B ${await sha256Prefix(rule)}, not the printed ${String(printed.bytes)} B ${printed.hash}`,
    )
  }
  return rule
}

/**
 * The text of the guards of the motion classes: the declaration each holds, and the property form
 * a guard written the other way would hold.
 */
export const GUARD = 'transition-duration: calc(0 * var(--nave-motion-duration-fast))'
export const PROPERTY_FORM = 'transition-property: none'

/**
How many guards the stylesheet holds with every draft signed: v1's four, the overlay completion's
five and this spec's three, one `@media` each.
 */
export const GUARDS = 12

/**
The fade-both-ways form of the Navigation Menu fade (480 B, `571e1cc6666d29ab`): the exit key
changes the easing, so a fade runs on the way out too.
 */
export const FADE_BOTH_WAYS = `  .nave-base-ui-navigation-menu-fade { transition-property: opacity; transition-duration: var(--nave-motion-duration-fast); transition-timing-function: var(--nave-motion-easing-decelerate); &[data-starting-style], &[data-ending-style]{ opacity: 0;
    } &[data-ending-style]{ transition-timing-function: var(--nave-motion-easing-accelerate);
    } @media (prefers-reduced-motion: reduce){

      &{ transition-duration: calc(0 * var(--nave-motion-duration-fast));
      }
    } }
`

/**
The fade-in-only form with no exit key (364 B, `ad98077420eeff98`), the form the earlier draft admitted.
 */
export const FADE_IN_ONLY = `  .nave-base-ui-navigation-menu-fade { transition-property: opacity; transition-duration: var(--nave-motion-duration-fast); transition-timing-function: var(--nave-motion-easing-decelerate); &[data-starting-style]{ opacity: 0;
    } @media (prefers-reduced-motion: reduce){

      &{ transition-duration: calc(0 * var(--nave-motion-duration-fast));
      }
    } }
`

/**
The current link before the base `padding-block` (157 B, `89711ea1afd33b28`), an earlier form of the rule.
 */
export const CURRENT_LINK_WITHOUT_PADDING = `  .nave-base-ui-current-link {

    &[aria-current="page"]{ text-decoration-line: underline; text-decoration-thickness: var(--nave-border-width-lg);
    } }
`

/**
The current link with the padding keyed on aria-current (201 B, 1aba28783d7d6392).
 */
export const CURRENT_LINK_KEYED = `  .nave-base-ui-current-link {

    &[aria-current="page"]{ text-decoration-line: underline; text-decoration-thickness: var(--nave-border-width-lg); padding-block: var(--nave-border-width-lg);
    } }
`
