/**
 * The first-party DTCG 2025.10 reader. Replaces a third-party parse, alias resolution and name
 * computation for Nave's own build, so the tool has no detector to trip and a node written in
 * an earlier revision of the format is a loud, named failure rather than a silent vanish.
 *
 * Scope: a node carrying `$value` or `$ref` is a token; `$`-prefixed keys are metadata and are
 * never traversed as groups; `$type` resolves to its own value, else the nearest ancestor
 * group's. References come in the format's two forms, whole-value `{a.b.c}` aliases and
 * `$ref` JSON Pointers (`json-pointer.ts`), both resolved transitively with cycle detection; a
 * reference embedded inside a larger string is a hard error rather than a partial substitution.
 *
 * **One accepted shape, and the refusal is collected.** Which shapes this reader reads, and
 * what it refuses, live in `dtcg-shape.ts`; every value it does read renders to its CSS string
 * in `composite-value.ts`, at parse time, so every downstream reader of `FlatToken.value` sees
 * a plain string or a number exactly as it always has. The shape pass runs over the WHOLE
 * document before any value is resolved, so a source holding seventy-four draft-shaped nodes
 * meets one refusal naming all of them rather than seventy-four build cycles.
 *
 * **`color` is the one type whose accepted set is wider than the format's own**, and it is
 * stated here rather than left to be discovered: the shape rule refuses a draft-shaped value
 * per `$type` and names `dimension`, `duration`, `number`, `fontWeight`, `shadow` and
 * `fontFamily`; it does not reach `color`, so a CSS colour string under `$type: color` is
 * read as the CSS value it is, beside the 2025.10 colour object. That is what lets this
 * package's own relative-colour-syntax slots be expressed at all, and it is the single place
 * where a reading was required rather than transcribed.
 */

import type { MalformedNode } from './dtcg-malformed.ts'
import type { DraftShapedNode } from './dtcg-shape.ts'

import { renderTokenValue } from './composite-value.ts'
import { classifyMalformed, formatUnreadableNodesRefusal } from './dtcg-malformed.ts'
import { classifyDraftShape, refuseTypeReason } from './dtcg-shape.ts'
import { DtcgShapeRefusal } from './errors.ts'
import { refuseBothReferenceForms, resolveTokenPointer } from './json-pointer.ts'
import { nameFromPath } from './token-name.ts'

// `kebabName` moved to `token-name.ts` with the rest of the name computation; re-exported
// here because this module is its only public door and every existing import path reads it
// from the reader.
export { kebabName } from './token-name.ts'

export interface FlatToken {
  readonly path: readonly string[]
  readonly name: string
  readonly type: string
  readonly value: string | number
}

type TokenTree = Record<string, unknown>

interface RawToken {
  path: string[]
  ref?: string
  type: string
  rawValue: unknown
}

const REF_RE = /^\{([^{}]+)\}$/

// ---------------------------------------------------------------------------
// Parse — walk the tree, collect raw tokens with their unresolved value.
// ---------------------------------------------------------------------------

/**
 * Whether `value` is a non-array object node (a token or a group), as opposed to a
 * primitive DTCG source has no other shape for.
 */
function isPlainObject(value: unknown): value is TokenTree {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The token `node` declares, or `undefined` when it is a group. A `$ref` node is a token even
 * though it carries no `$value`: reading it as a group is what used to make it vanish.
 */
function readTokenNode(
  node: TokenTree,
  path: string[],
  inheritedType: string | undefined,
): RawToken | undefined {
  const hasValue = '$value' in node
  const hasRef = typeof node.$ref === 'string'
  if (!hasValue && !hasRef) return undefined

  const at = path.join('.')
  if (hasValue && hasRef) refuseBothReferenceForms(at)

  const type = typeof node.$type === 'string' ? node.$type : inheritedType
  if (type === undefined) {
    throw new TypeError(`DTCG 2025.10 reader: no resolvable $type for token "${at}"`)
  }
  const token: RawToken = { path, rawValue: node.$value, type }
  if (hasRef) token.ref = node.$ref as string
  return token
}

/**
 * Walks the tree depth-first, appending one `RawToken` per token node.
 * `$`-prefixed keys are metadata and are never descended into as a group.
 */
function collectRawTokens(
  node: unknown,
  path: string[],
  inheritedType: string | undefined,
  out: RawToken[],
): void {
  if (!isPlainObject(node)) {
    throw new TypeError(
      `DTCG 2025.10 reader: expected an object at "${path.join('.')}", got ${JSON.stringify(node)}`,
    )
  }

  if ('value' in node && !('$value' in node)) {
    throw new TypeError(
      `DTCG 2025.10 reader: legacy token shape at "${path.join('.')}" — carries "value"/"type" ` +
        `instead of "$value"/"$type"`,
    )
  }

  const token = readTokenNode(node, path, inheritedType)
  if (token !== undefined) {
    out.push(token)
    return
  }

  // A group. Its own $type, if any, becomes the inherited type for its children.
  const groupType = typeof node.$type === 'string' ? node.$type : inheritedType
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue // metadata, never traversed as a group
    collectRawTokens(child, [...path, key], groupType, out)
  }
}

// ---------------------------------------------------------------------------
// The input contract — every unreadable node found in ONE pass, reported together.
// ---------------------------------------------------------------------------

/**
 * One `RawToken`'s finding, or `undefined` when it is one this reader reads outright (a `$ref`
 * token included: its target is checked in its own right, as its own token). Split out of
 * `refuseUnreadableNodes` so that function's own branch count stays within this repo's
 * complexity budget; the three checks below run in a fixed order because each is only
 * meaningful once the one before it has said no — a type this package does not read at all is
 * neither draft-shaped nor malformed FOR that type, and a value already named as the draft
 * shape is never also reported as merely malformed.
 */
function classifyUnreadableNode(
  token: RawToken,
):
  | { readonly draft: DraftShapedNode; readonly kind: 'draft' }
  | { readonly kind: 'malformed'; readonly malformed: MalformedNode }
  | { readonly kind: 'typeRefusal'; readonly typeRefusal: string }
  | undefined {
  const at = token.path.join('.')
  const typeRefusal = refuseTypeReason(token.type, at)
  if (typeRefusal !== undefined) return { kind: 'typeRefusal', typeRefusal }
  if (token.ref !== undefined) return undefined
  const draft = classifyDraftShape(at, token.type, token.rawValue)
  if (draft !== undefined) return { draft, kind: 'draft' }
  const malformed = classifyMalformed(at, token.type, token.rawValue)
  return malformed === undefined ? undefined : { kind: 'malformed', malformed }
}

/**
 * Refuses the whole document if any node is written in the pre-stable draft shape, is
 * malformed for its own `$type` (neither that shape nor the accepted one), or carries a
 * `$type` this package does not read. Runs before any value is resolved, so the report is
 * complete: a reader that threw on the first offending node would turn one migration into one
 * build cycle per token — and a source carrying both a malformed node and a draft-shaped one
 * reports both together, in the same run, rather than stopping on whichever class it meets
 * first.
 */
function refuseUnreadableNodes(raw: readonly RawToken[], sourceName: string | undefined): void {
  const drafts: DraftShapedNode[] = []
  const malformed: MalformedNode[] = []
  const typeRefusals: string[] = []

  for (const token of raw) {
    const found = classifyUnreadableNode(token)
    if (found === undefined) continue
    if (found.kind === 'typeRefusal') typeRefusals.push(found.typeRefusal)
    else if (found.kind === 'draft') drafts.push(found.draft)
    else malformed.push(found.malformed)
  }

  if (typeRefusals.length > 0) {
    throw new DtcgShapeRefusal(typeRefusals.join('\n'), [])
  }
  if (drafts.length > 0 || malformed.length > 0) {
    throw new DtcgShapeRefusal(formatUnreadableNodesRefusal(drafts, malformed, sourceName), drafts)
  }
}

// ---------------------------------------------------------------------------
// Resolve — the format's two reference forms, transitive, cycle-checked.
// ---------------------------------------------------------------------------

interface ResolveContext {
  byPath: ReadonlyMap<string, RawToken>
  resolved: Map<string, string | number>
  visiting: Set<string>
}

/**
 * Follows one reference (either form) to its target and resolves that, guarding the cycle at
 * the referring key rather than the referenced one, so the message names the node the author
 * wrote.
 */
function resolveReference(
  key: string,
  targetPath: string,
  context: ResolveContext,
): string | number {
  if (context.visiting.has(key)) {
    throw new TypeError(
      `DTCG 2025.10 reader: reference cycle detected at "${key}" -> "${targetPath}"`,
    )
  }
  const target = context.byPath.get(targetPath)
  if (!target) {
    throw new TypeError(
      `DTCG 2025.10 reader: "${key}" references unresolved target "${targetPath}"`,
    )
  }
  context.visiting.add(key)
  const value = resolveValue(target, context)
  context.visiting.delete(key)
  return value
}

/**
 * Resolves one token's value: a `$ref` pointer or a whole-value `{a.b.c}` alias resolves
 * transitively (memoized in `resolved`, cycle-checked via `visiting`); anything else renders
 * straight to its CSS value.
 */
function resolveValue(token: RawToken, context: ResolveContext): string | number {
  const key = token.path.join('.')
  const cached = context.resolved.get(key)
  if (cached !== undefined) return cached

  let value: string | number
  if (token.ref !== undefined) {
    const targetPath = resolveTokenPointer(token.ref, key, (path) => context.byPath.has(path))
    value = resolveReference(key, targetPath, context)
  } else if (typeof token.rawValue === 'string' && REF_RE.test(token.rawValue)) {
    value = resolveReference(key, REF_RE.exec(token.rawValue)![1]!, context)
  } else if (
    typeof token.rawValue === 'string' &&
    (token.rawValue.includes('{') || token.rawValue.includes('}'))
  ) {
    throw new TypeError(
      `DTCG 2025.10 reader: "${key}" embeds a reference inside a larger string ("${token.rawValue}") — ` +
        'only a whole-value alias (curly braces around one dotted path, nothing else) is supported',
    )
  } else {
    value = renderTokenValue(token.type, token.rawValue, key)
  }

  context.resolved.set(key, value)
  return value
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Parses an already-loaded DTCG 2025.10 token tree into a flat, name-computed,
 * reference-resolved token list — exactly what the five format functions read.
 *
 * `sourceName` is the file the tree came from, and is carried only so a refusal can NAME it:
 * a `--source` consumer may hold several files, and a node path alone does not say which one
 * to open.
 */
export function readTokens(source: unknown, sourceName?: string): FlatToken[] {
  const raw: RawToken[] = []
  collectRawTokens(source, [], undefined, raw)
  refuseUnreadableNodes(raw, sourceName)

  const context: ResolveContext = {
    byPath: new Map(raw.map((t) => [t.path.join('.'), t])),
    resolved: new Map<string, string | number>(),
    visiting: new Set<string>(),
  }

  return raw.map((token) => ({
    path: token.path,
    name: nameFromPath(token.path),
    type: token.type,
    value: resolveValue(token, context),
  }))
}
