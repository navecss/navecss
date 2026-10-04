/**
 * AC-directive-core-20: the focus rules (`focusRing`, `srOnlyFocusable`)
 * survive every leg with their REAL pseudo-rule content intact, not merely
 * equivalent between adapters (AC-19's own corpus includes these rows, but
 * equivalence alone would still pass a leg that dropped the same pseudo
 * block from both outputs). A host that silently drops the pseudo block
 * ships `outline: none` with nothing in its place: the element loses its
 * keyboard focus indicator, and the survival check cannot catch it either,
 * since the directive itself was already consumed by the time the check
 * runs.
 */
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { atoms } from '../../src/atoms.ts'
import { expandText } from '../../src/directive/expand-text.ts'
import { navePlugin as lightningAdapter } from '../../src/lightningcss.ts'
import { navePlugin } from '../../src/postcss.ts'
import { LIGHTNING_RELEASES } from '../helpers/lightningcss-releases.ts'
import { runHook } from '../helpers/vite-hook.ts'

const FOCUS_VISIBLE = atoms.focusRing.pseudos![':focus-visible']!
const SR_ONLY_HIDDEN = atoms.srOnlyFocusable.declarations
const SR_ONLY_REVEALED = atoms.srOnlyFocusable.pseudos![':focus-within']!

interface Row {
  readonly atom: 'focusRing' | 'srOnlyFocusable'
  readonly css: string
  readonly pseudo: string
  readonly revealed: Record<string, string>
  readonly base: Record<string, string>
}

const ROWS: readonly Row[] = [
  {
    atom: 'focusRing',
    css: '.btn { @nave focusRing; }',
    pseudo: ':focus-visible',
    revealed: FOCUS_VISIBLE,
    base: atoms.focusRing.declarations,
  },
  {
    atom: 'focusRing',
    css: '.btn { &:hover { color: red } @nave focusRing; }',
    pseudo: ':focus-visible',
    revealed: FOCUS_VISIBLE,
    base: atoms.focusRing.declarations,
  },
  {
    atom: 'focusRing',
    css: '@media (width >= 1px) { .btn { @nave focusRing; } }',
    pseudo: ':focus-visible',
    revealed: FOCUS_VISIBLE,
    base: atoms.focusRing.declarations,
  },
  {
    atom: 'srOnlyFocusable',
    css: '.btn { @nave srOnlyFocusable; }',
    pseudo: ':focus-within',
    revealed: SR_ONLY_REVEALED,
    base: SR_ONLY_HIDDEN,
  },
  {
    atom: 'srOnlyFocusable',
    css: '.btn { &:hover { color: red } @nave srOnlyFocusable; }',
    pseudo: ':focus-within',
    revealed: SR_ONLY_REVEALED,
    base: SR_ONLY_HIDDEN,
  },
  {
    atom: 'srOnlyFocusable',
    css: '@media (width >= 1px) { .btn { @nave srOnlyFocusable; } }',
    pseudo: ':focus-within',
    revealed: SR_ONLY_REVEALED,
    base: SR_ONLY_HIDDEN,
  },
]

/**
 * Finds `&<pseudo> { ... }`'s own declaration block in rendered CSS text —
 * native nesting, `&` standing for `.btn` per this project's shipped shape
 * (ADR 0001) — and asserts every one of `declarations` is in it. Throws (via
 * `expect`) when the rule is missing, which is what the drop-control below
 * exercises.
 */
function assertPseudoRuleSurvives(
  output: string,
  pseudo: string,
  declarations: Record<string, string>,
): void {
  const marker = `&${pseudo}`
  const match = /\{([^}]*)\}/.exec(output.slice(output.indexOf(marker) + marker.length))
  expect(match, `expected a "${marker}" rule with declarations in:\n${output}`).not.toBeNull()
  const body = match![1]!.replaceAll(/\s+/g, ' ')
  for (const [prop, value] of Object.entries(declarations)) {
    expect(body).toContain(`${prop}: ${value}`)
  }
}

function assertBaseDeclarationsSurvive(output: string, declarations: Record<string, string>): void {
  for (const [prop, value] of Object.entries(declarations)) {
    expect(output.replaceAll(/\s+/g, ' ')).toContain(`${prop}: ${value}`)
  }
}

describe('AC-directive-core-20 — the focus rules survive every leg', () => {
  it.each(ROWS)('$atom: $css', async ({ css, pseudo, revealed, base }) => {
    const postcssOutput = (await postcss([navePlugin()]).process(css, { from: undefined })).css
    const expandTextOutput = expandText(css, {}).css
    const viteRun = await runHook({ code: css })
    const viteOutput = viteRun.code

    expect(viteRun.error, 'the Vite leg failed on a directive row').toBeUndefined()
    expect(viteOutput, 'the Vite leg left a directive row untouched').toBeDefined()
    const lightningOutputs = LIGHTNING_RELEASES.map(({ lib }) => {
      const expanded = lightningAdapter().expand(css, '/proj/app.css')
      return lib.transform({ filename: '/proj/app.css', code: expanded.code }).code.toString()
    })
    for (const output of [postcssOutput, expandTextOutput, viteOutput!, ...lightningOutputs]) {
      assertPseudoRuleSurvives(output, pseudo, revealed)
      assertBaseDeclarationsSurvive(output, base)
    }
  })

  it('control: a scratch leg that drops the pseudo block reds the assertion', () => {
    const droppedOutput = '.btn { outline: none; }'

    expect(() => assertPseudoRuleSurvives(droppedOutput, ':focus-visible', FOCUS_VISIBLE)).toThrow()
  })

  it('control: a declaration-only row (no pseudo expected) is not exercised by this check', () => {
    const output = postcss.parse('.btn { outline: none; }').toString()

    assertBaseDeclarationsSurvive(output, { outline: 'none' })
  })
})
