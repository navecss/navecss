/**
 * Co-located ambient declaration for `check-license-allowlist.mjs` (plain JS, no types),
 * so a `.ts` test that imports its exported pure classification functions type-checks — the
 * standard TypeScript convention for a same-named `.d.ts` sitting beside an untyped `.mjs`
 * (rather than a `declare module '<relative path>'` block at each import site, which is
 * fragile: it has to be re-written correctly at every distinct relative path an importer
 * happens to use). Kept minimal: only the exports a test currently imports.
 */
export function classifyBucketB(
  license: string,
  policy: unknown,
): { allowed: boolean; reason: string }

export function classifyBucketC(
  license: string,
  policy: unknown,
): { allowed: boolean; reason: string }

export function parseLicensesJson(rawOutput: string): Record<string, unknown>

export function flattenLicenseGroups(
  licensesJson: Record<string, unknown>,
): { name: string; version: string; license: string }[]

export function findPolicyShapeViolation(policy: unknown): string | null

export function isAlwaysBlocked(license: string, policy: unknown): boolean
