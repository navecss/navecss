/**
 * R4 (this package's usage/config-error requirements): the usage/config-error class, in its
 * own module so both `facade.ts` and `validate.ts` can throw it without a circular import
 * between them — `facade.ts` imports from `validate.ts`, and `validate.ts`'s own JSON-parse
 * failure (a malformed `--source`) needs to raise the same error type `facade.ts`'s
 * own malformed-`--overrides` path already does, rather than leaking a raw `SyntaxError` at
 * the wrong exit code. `facade.ts` re-exports this unchanged, so every existing import site
 * (`bin.ts`, the test suite) is unaffected.
 */
export class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

/**
 * One node the reader refused, and the edit that brings it to DTCG 2025.10. Carried
 * structurally on the refusal (not only inside its message) so a caller can report the set
 * without re-parsing prose, and so a test can ask about one node's own conversion instruction
 * rather than about the whole message.
 */
export interface DtcgRefusedNode {
  /**
  The per-`$type` conversion, stated as an act on this file's own bytes.
   */
  readonly conversion: string
  /**
  Dotted node path, as authored.
   */
  readonly path: string
  /**
  The resolved `$type` of the refused node.
   */
  readonly type: string
  /**
  The `$value` exactly as the file carries it.
   */
  readonly value: unknown
}

/**
 * The reader refuses a source whose shape it can read but does not accept: the pre-stable
 * draft shape of the same format, or a `$type` outside the set this package reads. Carries
 * every offending node found in one pass, never the first one only.
 *
 * A plain `Error` subclass on purpose. `bin.ts` maps `UsageError` and `SeedIngestRefusal` to
 * exit `2` and everything else to exit `1`, and exit `1` is the code already described for a
 * document accepted as a DTCG object and faulty inside it.
 */
export class DtcgShapeRefusal extends Error {
  readonly nodes: readonly DtcgRefusedNode[]

  constructor(message: string, nodes: readonly DtcgRefusedNode[]) {
    super(message)
    this.name = 'DtcgShapeRefusal'
    this.nodes = nodes
  }
}

/**
 * `build` REFUSES when a name is declared by BOTH the
 * consumer's token source and the generated theming layer in one run. Exit `1` under R4's
 * existing three-member set (the input failed on its merits; nothing about the invocation is
 * wrong) — never `UsageError`'s `2`. R23 governs the refusal's shape (thrown before anything
 * is written); R21's one-error-shape provision governs its contents (name the colliding
 * names and the ACT to take instead, never a restatement of the rule).
 */
export class TokenCollisionRefusal extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TokenCollisionRefusal'
  }
}

/**
 * `build` REFUSES when two or
 * more paths in ONE token source resolve to the same emitted custom-property name after
 * name computation. `kebabName` has always been many-to-one (a pre-existing class,
 * not created by this refusal — a plain camelCase pair collides the same way with no `nave`
 * involved); this is a check on the RESULT, never a change to how names are made. Exit `1`, same
 * class as `TokenCollisionRefusal`: the input failed on its merits, nothing about the invocation is
 * wrong. Unlike the cross-half case, renaming genuinely is the remedy here, because both colliding
 * paths are the consumer's own.
 */
export class DuplicateTokenNameRefusal extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DuplicateTokenNameRefusal'
  }
}

/**
 * R16: thrown when the UNION of
 * both halves' emitted names — the DTCG half's, from the consumer's own source, and the
 * theming half's, the shipped-property constant — does not satisfy the manifest. Lives here
 * (not in `theming/consumer-build.ts`, where it used to be thrown) because `facade.ts`'s
 * `build` is now the site that validates: the only function holding both halves at once, per
 * R16's own corrected subject. Carries every missing name in one shot, never a partial list.
 */
export class MissingContractTokensError extends Error {
  readonly missing: readonly string[]

  constructor(missing: readonly string[]) {
    super(
      `Consumer build is missing ${missing.length} core contract token(s): ${missing.join(', ')}`,
    )
    this.name = 'MissingContractTokensError'
    this.missing = missing
  }
}
