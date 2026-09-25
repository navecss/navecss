/**
 * A `SkillGuideSources` object built from the real tree, for tests that need to pass
 * `generate()` a substituted source (one field overridden) without re-assembling every other
 * field by hand at each call site — the duplicate-assembly this replaces is exactly the shape
 * SonarCloud's new-code duplication gate caught across four test files in this slice's own
 * pull request.
 */
import type { SkillGuideSources } from '../../scripts/generate-skill-sources.ts'

import { readSections } from '../../scripts/generate-atoms-doc.ts'
import { readDeclaredPropertyNames, readTokenDescriptions } from '../../scripts/generate-skill.ts'
import { atoms } from '../../src/atoms.ts'

export const LAYER_STATEMENT =
  '@layer tokens.defaults, tokens.presets, reset, atomic, components.nave, components.consumer, overrides;'

export function baseSkillGuideSources(
  overrides: Partial<SkillGuideSources> = {},
): SkillGuideSources {
  return {
    sections: readSections(),
    atomTable: atoms,
    tokenDescriptions: readTokenDescriptions(),
    declaredPropertyNames: readDeclaredPropertyNames(),
    paletteDescriptions: new Map(),
    layerStatement: LAYER_STATEMENT,
    ...overrides,
  }
}
