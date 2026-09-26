/**
 * Co-located ambient declaration for `check-publishable-set.mjs` (plain JS, no types), so a
 * `.ts` test that imports its exports type-checks. Same convention as the sibling
 * `check-license-allowlist.d.mts`. Kept minimal: only the export a test currently imports.
 */
export const PUBLISHABLE_SET: Set<string>
