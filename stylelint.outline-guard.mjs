import stylelintConfig from '@navecss/stylelint-config'

/**
 * The single exception to "the shipped rules leave the root config in the same change" (this
 * repository's own stylelint config consumes `@navecss/stylelint-config` rather than
 * transcribing it): the outline focus guard's MESSAGE, which stays this repository's own
 * house wording rather than the package's consumer-facing one. The package's message tells a
 * consumer to disable the rule for a deliberate exception; on this tree that instruction is
 * backwards; a focus-ring exception here is a defect, not a choice, so the rule must fail loud
 * with THIS repository's own guidance instead.
 *
 * This module reads the guard's PATTERN from the package rather than copying it, so the two
 * stay identical by construction. If the package ever stops shipping the guard, this module
 * throws rather than silently reverting to CSS with no outline guard at all.
 */
const RULE_NAME = 'declaration-property-value-disallowed-list'

const guardEntry = stylelintConfig.rules?.[RULE_NAME]

if (!guardEntry) {
  throw new Error(
    `stylelint.outline-guard.mjs: @navecss/stylelint-config no longer ships the '${RULE_NAME}' ` +
      "rule (the outline focus guard). This repository's own tree still needs it: restore the " +
      'rule in the package, or replace this module and its root .stylelintrc.json extends entry ' +
      'with a rule declared here directly.',
  )
}

const [pattern] = guardEntry

const HOUSE_MESSAGE =
  "'outline: none'/'0' removes the focus indicator Nave's reset deliberately leaves to the " +
  'user agent, with nothing shipped to replace it. Change the rule you are writing, not this ' +
  'guard. No selector carve-out is needed, and the ground is what this check can see rather ' +
  'than what the codebase contains: stylelint here reads only hand-authored CSS under src, so ' +
  "the focus-ring utility's own outline base, authored in TypeScript and reaching CSS only as " +
  'generated output under dist, sits outside this guard by construction and is asserted from ' +
  'built output by packages/core/test/focus-ring-forced-colors.test.ts instead. Do not add an ' +
  'exemption for it, and do not widen this rule to reach it. If you think the guard itself is ' +
  'wrong, open an issue rather than changing it here. (A parallel text-decoration:none guard ' +
  'was probed here too and removed: probed red-first against a real violation, it caught ' +
  'nothing the built-output test packages/core/test/reset-link-decoration.test.ts did not, and ' +
  'that test alone stays.)'

export default {
  rules: {
    [RULE_NAME]: [pattern, { message: HOUSE_MESSAGE }],
  },
}
