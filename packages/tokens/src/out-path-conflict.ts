/**
 * Whether a `writeOutputs` failure means `--out` (or a path inside it) already exists as
 * something other than the directory `build` expects to write into. Used by `facade.ts` to
 * narrow its own catch around that call to a usage error about `--out` (R4) — an unrelated
 * write failure (`ENOSPC`, `EACCES`, and so on) is left to surface as itself rather than being
 * misreported as a bad `--out`.
 */
const OUT_PATH_CONFLICT_CODES = new Set(['EEXIST', 'EISDIR', 'ENOTDIR'])

/**
 * Whether `error` is a tagged Node system error whose `code` is one of `OUT_PATH_CONFLICT_CODES`.
 */
export function isOutPathConflict(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    OUT_PATH_CONFLICT_CODES.has(error.code)
  )
}
