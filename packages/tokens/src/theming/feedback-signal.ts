/**
 * R20: wherever a feedback token carries meaning, a non-colour signal is REQUIRED and is
 * the PRIMARY differentiator, not a backup to colour. Operational form (a check, not an
 * author judgement): an artifact renders (i) a text label naming the state and (ii) a
 * non-colour element whose FORM differs per state. An icon alone does not satisfy it.
 */

export interface FeedbackArtifact {
  /**
  The example/recipe/README source file this sample came from.
   */
  file: string
  usesFeedbackToken: boolean
  /**
  True when a text label naming the state (e.g. "Error", "Warning") is present.
   */
  hasStateLabel: boolean
  /**
  The non-colour form used, if any — undefined if colour is the only signal.
   */
  nonColourForm: string | undefined
}

export interface FeedbackViolation {
  file: string
  reason: string
}

/**
 * Checks R20's enumerated 0.1.0 binding surface (README/example/recipe/docs code
 * samples). Two artifacts using the SAME non-colour form for two different states is
 * flagged too (the form must differ per state), when both are supplied.
 */
export function checkFeedbackSignal(artifacts: readonly FeedbackArtifact[]): FeedbackViolation[] {
  const violations: FeedbackViolation[] = []
  const forms = new Map<string, Set<string>>()

  for (const artifact of artifacts) {
    if (!artifact.usesFeedbackToken) continue
    if (!artifact.nonColourForm) {
      violations.push({ file: artifact.file, reason: 'conveys a feedback state by colour alone' })
      continue
    }
    if (!artifact.hasStateLabel) {
      violations.push({
        file: artifact.file,
        reason: 'has a non-colour element but no text label naming the state',
      })
      continue
    }
    const seen = forms.get(artifact.nonColourForm) ?? new Set()
    seen.add(artifact.file)
    forms.set(artifact.nonColourForm, seen)
  }

  return violations
}
