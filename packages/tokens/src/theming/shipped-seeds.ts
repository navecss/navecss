/**
 * R1, R2: Nave's own shipped default seeds, extracted to a standalone, CONTEXT-FREE
 * module (no path read, at load or at call time) so it can be shared by both build paths
 * without either importing the other.
 *
 * `build-step.ts` (Nave's own, monorepo-context-bearing build) uses all three members.
 * `facade.ts` (the consumer-invocable build, R9: context-free) uses only `danger` and
 * `declaredTintHue` as its two non-public defaults — a consumer's own `--seed` supplies
 * `primary` (R3: the public seed input is exactly the primary tint colour; `danger` and the
 * declared tint default are not part of the public input surface at 0.1.0).
 *
 * Previously a private constant duplicated inside `build-step.ts` alone; extracted here so
 * the two build paths' non-public defaults can never drift apart, cited in `tokens.json`'s
 * `$extensions.dev.navecss.theming` block — this file is the single computation of them,
 * that JSON block is the declaration.
 */
import type { Seeds } from './pipeline.ts'

export const SHIPPED_SEEDS: Seeds = {
  primary: { l: 0.7859, c: 0.1316, h: 186.17 },
  danger: { l: 0.6357, c: 0.2072, h: 15.02 },
  declaredTintHue: 186.17,
}
