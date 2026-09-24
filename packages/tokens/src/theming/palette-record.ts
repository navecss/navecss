/**
 * The resolved palette record (`palette-record.json`), composed ONCE for both build paths:
 * Nave's own (`build-step.ts`) and the consumer-invocable one (`consumer-build.ts`, R6).
 *
 * **What this file is, and what it stopped claiming.** It used to be called
 * `tokens.resolved.json` and to be described, here and in the token source, as a token
 * document any conforming tool could consume. It is not one and never was: its root keys are
 * flat dotted names, which the format forbids in names, and most of its values are
 * relative-colour-syntax strings reading a custom property, which no colour object in the
 * format can express. It is a record of what THIS build produced, for a human reading the
 * output directory and for Nave's own tooling, and it says so in its own bytes.
 *
 * **The name.** It pairs with `build-record.json`, the only other artifact the theming half
 * emits, so the two read as what was built and what it produced. It contains neither "tokens"
 * nor the format's name, because a file called `tokens.*.json` in a token output directory
 * gets handed to a token tool eventually whatever the documentation says, the filename being
 * the last claim standing once everything else is stripped. And it drops "resolved", which is
 * the word to drop: *resolver* is a term of art in this format's own Resolver Module, which
 * has no stable release and which this project declines to adopt on that ground.
 *
 * R18a/R35/R18b (`AC-theming-19`/`-41`/`-46`): `SLOT_DESCRIPTIONS` is
 * validated by the build's source guards but has to reach a SHIPPED artifact too — the
 * built-output half of "the token source and the built artifact carry this text".
 *
 * Scope, stated precisely: a `$description` rides every entry whose
 * BASE slot `SLOT_DESCRIPTIONS` names, which is 13 of the 33 slots, so 26 of the 66 resolved
 * entries carry one. It is NOT "every resolved entry" — `surface.*`, `action.*`,
 * `content.primary`/`secondary`, `border.strong`/`focus`/`disabled` and `on-action.*` have
 * no description to carry. The lookup is keyed on the BASE slot, so both branches share one
 * string rather than the map holding a per-branch copy.
 *
 * **R9: this module is CONTEXT-FREE and must stay so.** It reads no path at module
 * load and none at call time; `SLOT_DESCRIPTIONS` is a static in-memory map. That is what
 * makes it importable from the consumer path, which is why the artifact is composed here
 * once instead of being duplicated per path — a duplicate is how the consumer's copy came to
 * drop every `$description` while Nave's own carried them.
 */

import type { PipelineResult } from './pipeline.ts'

import { SLOT_DESCRIPTIONS } from './descriptions.ts'

/**
 * The file's own account of itself, on a non-`$` root key: a `$description` is the wrong
 * vehicle for a file whose whole point is that it does not carry this format's keys.
 *
 * It says what the file IS before what it is not, gives the reason in one clause, and points
 * at the artifact that IS a token document, so it does not read as a lesser one. And it says
 * the file is not MEANT to be read by a conforming tool rather than that no tool reads it: the
 * second is a claim about every tool and it is measurably false, since at least one mainstream
 * build tool ingests the pre-rename artifact by treating each dotted key as one opaque name.
 * Shipping a false claim in the act of withdrawing a false claim is the one outcome this
 * sentence cannot have.
 */
const PALETTE_RECORD_NOTE =
  'This file is a resolved palette record: what this build produced for every semantic colour slot, in both schemes. It is not a DTCG 2025.10 document, and it is not meant to be read by a DTCG 2025.10 tool, because its keys are flat dotted names and most of its values are relative-colour-syntax strings, neither of which that format expresses. The token document is tokens.json, shipped beside it.'

/**
The root key carrying `PALETTE_RECORD_NOTE`. Non-`$`, deliberately.
 */
const PALETTE_RECORD_NOTE_KEY = 'aboutThisFile'

/**
 * Every resolved slot as a colour entry, with `$description` attached from
 * `SLOT_DESCRIPTIONS` wherever the base slot names one, under the file's own note.
 */
export function composePaletteRecord(result: PipelineResult): Record<string, unknown> {
  const record: Record<string, unknown> = { [PALETTE_RECORD_NOTE_KEY]: PALETTE_RECORD_NOTE }
  for (const slot of result.slots) {
    const description = SLOT_DESCRIPTIONS.get(slot.slot)
    record[`color.${slot.slot}.${slot.branch}`] = {
      $type: 'color',
      $value: slot.css,
      ...(description !== undefined && { $description: description }),
    }
  }
  return record
}
