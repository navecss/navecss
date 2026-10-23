/**
 * Everything that exists only to tell a project upgrading from the last release what changed:
 * the release the order moved in, and the sentences that say what the result was before. It is
 * removed with the release after this one, and the order check keeps working without it.
 */

/**
 * The release that moves `@nave` to native order.
 */
export const MIGRATION_VERSION = '0.5.0'

/**
 * What a warning says about the old result when the overrider is not itself an atom's block: the
 * atom's blocks used to be placed last in the rule, so the atom won.
 */
export function overriderSentence(atom: string): string {
  return `Before @navecss/core ${MIGRATION_VERSION} "${atom}" won, because an atom's blocks were placed last in the rule.`
}

/**
 * What a warning about a run wrapped in `& { }` says about the previous release when it left the
 * run outside, under a selector list whose selectors differ in specificity.
 */
export function wrappedSpecificitySentence(): string {
  return `Before @navecss/core ${MIGRATION_VERSION} they were left outside \`& { }\`, so they matched with each selector's own specificity.`
}

/**
 * What a warning about a run wrapped in `& { }` says about the previous release when it left the
 * run outside, under a selector list that holds a pseudo-element selector.
 */
export function wrappedPseudoElementSentence(): string {
  return `Before @navecss/core ${MIGRATION_VERSION} they did, because they were left outside \`& { }\`.`
}
