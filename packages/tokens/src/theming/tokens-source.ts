/**
 * The shipped `tokens.json` as BYTES: reading it, and the one integrity check that has to
 * happen before `JSON.parse` collapses it. Split from
 * `adjacency-source.ts`, which owns the parsed side, purely on file-budget grounds.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { findPackageRoot } from '../package-root.ts'

// Exported (raised during a review): the one canonical home for this path. A second
// file that wants "the shipped tokens.json's path" imports this rather than resolving its own
// copy — a second copy is exactly the duplicate-that-can-drift shape this constant exists to
// prevent.
//
// R8/R9: resolved via `findPackageRoot`, not a fixed `'../../tokens.json'` depth walk —
// this module is on the consumer-invocable path (imported transitively through
// `contrast.ts`/`adjacency.ts`, which `facade.ts`'s `build` reaches via `consumer-build.ts`),
// so it runs from BOTH `src/theming/` (test, and Nave's own `node build.ts`) and
// `dist/lib/theming/` (R8, once installed) — a fixed depth was correct for the first and
// silently wrong for the second (`dist/tokens.json`, one level short, `ENOENT`).
export const TOKENS_JSON_PATH = path.join(findPackageRoot(import.meta.url), 'tokens.json')

interface BraceScan {
  depth: number
  escaped: boolean
  inString: boolean
}

/**
 * Advances the brace scanner one character, tracking JSON string and escape state so a brace
 * inside a string literal (the `comment` value carries none today, and one arriving later
 * must not break this) is not counted. Returns true on the brace that closes the block.
 */
function didCloseBlock(char: string | undefined, state: BraceScan): boolean {
  if (state.escaped) {
    state.escaped = false
    return false
  }
  if (char === '\\') {
    state.escaped = state.inString
    return false
  }
  if (char === '"') {
    state.inString = !state.inString
    return false
  }
  if (state.inString) return false
  if (char === '{') {
    state.depth += 1
    return false
  }
  if (char === '}') {
    state.depth -= 1
    return state.depth === 0
  }
  return false
}

/**
 * The raw text of the `adjacency` object, from its opening brace to the matching close.
 * Returns `undefined` where the block is absent, which `materializeAdjacency` reports on its
 * own terms against the PARSED source.
 */
function adjacencyBlockText(rawText: string): string | undefined {
  const start = rawText.indexOf('{', rawText.indexOf('"adjacency"'))
  if (start <= 0) return undefined
  const state: BraceScan = { depth: 0, escaped: false, inString: false }
  for (let i = start; i < rawText.length; i += 1) {
    if (didCloseBlock(rawText[i], state)) return rawText.slice(start, i + 1)
  }
  return undefined
}

// A subject key inside the adjacency block: the only keys there mapping to an ARRAY (the
// sibling `comment` maps to a string, and a partner entry's own keys map to strings).
const SUBJECT_KEY_RE = /"([^"]+)"\s*:\s*\[/g

/**
 * A DUPLICATE subject key in the shipped adjacency block fails the build, naming the subject.
 * This check reads the raw BYTES, and it has to: moving a TypeScript
 * array into a hand-authored JSON object introduces a silent-loss mode neither existing
 * layer can see. `JSON.parse` keeps the LAST block under a repeated key and the first one's
 * pairs simply vanish, so `materializeAdjacency` is handed an already-collapsed object; and
 * Prettier, the only `ci:check` linter that reads `.json`, preserves both keys and reports
 * nothing. The result would be a quietly smaller pair set — the R21 harness running over
 * fewer pairs than the source declares — which is the exact failure R22 exists to prevent.
 */
export function assertNoDuplicateAdjacencySubjects(rawText: string): void {
  const block = adjacencyBlockText(rawText)
  if (block === undefined) return
  const seen = new Set<string>()
  for (const [, subject] of block.matchAll(SUBJECT_KEY_RE)) {
    if (seen.has(subject!)) {
      throw new Error(
        `Adjacency declaration: the adjacency block in @navecss/tokens' own bundled ` +
          `tokens.json declares the subject "${subject}" twice. JSON.parse keeps only the ` +
          "last block, so the first one's pairs would be dropped silently: merge the two " +
          'into one subject key.',
      )
    }
    seen.add(subject!)
  }
}

/**
 * Reads and parses the shipped `tokens.json`, the one real caller of `materializeAdjacency`.
 * The duplicate-subject check runs on the text BEFORE the parse collapses it.
 */
export function loadShippedTokensSource(): unknown {
  const rawText = readFileSync(TOKENS_JSON_PATH, 'utf8')
  assertNoDuplicateAdjacencySubjects(rawText)
  return JSON.parse(rawText)
}
