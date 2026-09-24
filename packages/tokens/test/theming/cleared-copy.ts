/**
 * The round-12 TRANSCRIPTION VARIANT of R34's re-theming notice, hand-transcribed.
 *
 * `RETHEMING_NOTICE` is IMPORTED from `src/theming/copy-lint.ts`, so a drift in the canonical
 * line fails at its source. This text has no such home: `copy-lint.ts` deliberately carries no
 * constant for it (this package never emits it), and its only authoritative homes are R34 of
 * the source spec and the review that cleared it, both outside this
 * repository. So NOTHING in this package compares these bytes to the cleared text: if one
 * character of this literal drifts, every assertion using it still passes and reports a clean
 * bill about a string that is no longer the cleared one. Declared once for the whole file so
 * that the drift surface is one hand transcription rather than several;
 * `test/theming/copy-lint.test.ts` imports this same constant rather than carrying its own.
 */
export const TRANSCRIPTION_VARIANT =
  'These values are ours, not yours: pasting them pins the three action slots to fixed greys, so they stop following your seed and your tint. Anything else on your page is still yours to check.'
