/**
 * AC-consumer-constraints-25 covers: R16 (the `Config` type-compile clause).
 *
 * Not a vitest test: compiled by `tsc --noEmit` (this package's own `typecheck` script and
 * `test/package-shape.test.ts`'s dedicated `tsc` invocation), never executed. Its only job is
 * to fail the BUILD if the default export ever stops being assignable to stylelint's own
 * `Config` type, using the hand-written `index.d.ts`.
 */
import type { Config } from 'stylelint'

import config from '../index.js'

const typed: Config = config
void typed
