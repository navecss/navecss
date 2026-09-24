/**
 * Collision detection between the consumer's DTCG source and
 * the generated theming layer, and the refusal that now follows a non-empty result. Split out
 * of `facade.ts` (which composes the two halves and calls this) to keep that file within this
 * package's lint budget after this behavior changed from "detect and warn" into a real refusal.
 */
import type { OutputFile } from './builder.ts'
import type { FlatToken } from './reader.ts'

import { DuplicateTokenNameRefusal, TokenCollisionRefusal } from './errors.ts'
import { scanDeclaredCustomProperties } from './validate.ts'

/**
 * Names declared in BOTH the DTCG-reader half's `tokens.css` output and the theming half's
 * generated CSS, sorted (see `TokensBuildResult.collidingNames`).
 */
export function detectCollidingNames(
  dtcgOutputs: readonly OutputFile[],
  cssDestination: string,
  themingCss: string,
): string[] {
  const dtcgCssFile = dtcgOutputs.find((file) => file.destination === cssDestination)
  const dtcgNames = dtcgCssFile
    ? scanDeclaredCustomProperties(dtcgCssFile.content)
    : new Set<string>()
  const themingNames = scanDeclaredCustomProperties(themingCss)
  return [...dtcgNames]
    .filter((name) => themingNames.has(name))
    .toSorted((a, b) => a.localeCompare(b))
}

/**
 * Throws `TokenCollisionRefusal` when `collidingNames` is
 * non-empty, naming the collision and the ACT available instead (declare an override in the
 * consumer's own `@layer overrides`, which beats both halves regardless of order) — never the
 * "rename the source token(s)" advice this replaces: once an override in `@layer overrides`
 * is guaranteed to win regardless of cascade order, renaming a source token to dodge a
 * generated name is no longer the right fix. A no-op when the set is empty, so callers can
 * call this unconditionally before writing anything.
 */
export function refuseOnCollision(collidingNames: readonly string[]): void {
  if (collidingNames.length === 0) return
  const plural = collidingNames.length === 1 ? '' : 's'
  throw new TokenCollisionRefusal(
    `Your token source and the generated theming layer both declare ${collidingNames.length} ` +
      `name${plural} (${collidingNames.join(', ')}). Nothing was written. Declare an override ` +
      `for ${plural ? 'them' : 'it'} in your own \`@layer overrides\` instead: it wins over ` +
      `both halves regardless of order, and nothing here needs renaming.`,
  )
}

/**
 * Names duplicated WITHIN one token source's own emitted set, after name
 * computation (an unconditional `nave`-prefix strip during name computation is one way to
 * reach this; an ordinary camelCase pair reaches it with no `nave` involved). Grouped by emitted
 * name, sorted; a name reached by only one path is not returned. Deliberately reads `token.name`
 * (the computed emitted name), never `token.path` — this checks the RESULT of name computation, not
 * how the name was computed.
 */
export function detectDuplicateEmittedNames(
  tokens: readonly FlatToken[],
): { name: string; paths: string[] }[] {
  const pathsByName = new Map<string, string[]>()
  for (const token of tokens) {
    const paths = pathsByName.get(token.name) ?? []
    paths.push(token.path.join('.'))
    pathsByName.set(token.name, paths)
  }
  return pathsByName
    .entries()
    .filter(([, paths]) => paths.length > 1)
    .map(([name, paths]) => ({ name, paths: paths.toSorted((a, b) => a.localeCompare(b)) }))
    .toArray()
    .toSorted((a, b) => a.name.localeCompare(b.name))
}

/**
 * Throws `DuplicateTokenNameRefusal` when `duplicates` is
 * non-empty, naming every duplicated name, its `--nave-` custom-property spelling, and the
 * paths that produced it — renaming one of the colliding paths IS the remedy here, unlike
 * `refuseOnCollision`'s cross-half case, because both names are the consumer's own. A no-op
 * when the set is empty, so callers can call this unconditionally before writing anything.
 */
export function refuseOnDuplicateNames(
  duplicates: readonly { name: string; paths: string[] }[],
): void {
  if (duplicates.length === 0) return
  const plural = duplicates.length === 1 ? '' : 's'
  const detail = duplicates
    .map((d) => `--nave-${d.name} (from ${d.paths.join(' and ')})`)
    .join('; ')
  throw new DuplicateTokenNameRefusal(
    `Your token source has ${duplicates.length} name${plural} that resolve${plural ? '' : 's'} ` +
      `to the same emitted custom property after name computation: ${detail}. Nothing was ` +
      `written. Rename one of the colliding paths in your token source.`,
  )
}
