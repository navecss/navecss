/**
 * Comment stripping for source-text guards: the ONE copy of this logic in the package, and
 * the one the row in `consumer-build.test.ts` enforces rather than merely asserts.
 *
 * A source-text guard inspects CODE, so it has to remove commentary first — a doc comment
 * naming the thing a module deliberately does NOT do (e.g. "never calls
 * scanCoreContractFromDisk") would otherwise make the guard fail on its own explanation.
 *
 * THE BLOCK HALF IS ANCHORED TO THE START OF A LINE, and the reason is written down so the
 * unanchored form is not reintroduced as a simplification. Unanchored, it treats a `/*`
 * opened inside a STRING LITERAL as a comment opener and deletes everything up to the next
 * closer, code included — and `formats.ts`'s generated-artifact header is exactly that, a CSS
 * comment held in a template literal. A quality reviewer's measured mutation (a `new
 * Date().toISOString()` interpolated into that header) was deleted by this function before the R7
 * scan ever saw it, so widening the scan's roots alone would have left it green on the one mutation
 * it was widened for. The premise the anchor rests on was measured across the 38 files of the
 * scanned set: 15 mid-line `/*` occurrences, all 15 inside an open string or template literal, ZERO
 * trailing code comments. A `/*` with code before it on the same line is content, not commentary.
 *
 * THIS MODULE EXISTS BECAUSE THE PACKAGE FIXED THAT BUG TWICE. The stripper had two identical
 * copies — one here in `consumer-build.test.ts`, one inline in `seed-ingest.test.ts`'s purity
 * guard — so round 2 anchored the first and the verifier-gated tail, a round later, had to
 * anchor the second. Both were correct afterwards and there were still two of
 * them, which stayed tracked as still open until a later decision sent it
 * back to be fixed. It is not a test file and registers no tests, the same shape as
 * `cleared-copy.ts` and `markdown-headings.ts` beside it — the latter being this package's
 * first consolidation of exactly this class.
 */
export function codeOnly(source: string): string {
  return source.replaceAll(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replaceAll(/\/\/.*$/gm, '')
}
