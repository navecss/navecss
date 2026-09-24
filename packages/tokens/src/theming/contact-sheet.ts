/**
 * R7 [blocking] + R8 + `AC-theming-08`: the generated CONTACT SHEET. R7 makes the sheet the
 * approval artifact for ramp quality ("the numeric envelope is not"), and A3 makes it the
 * only ramp-quality gate this design has — so a build that emits no sheet leaves that gate
 * with nothing to open it. Every step of every generated scale, both schemes, rendered on
 * the surfaces those steps actually sit on, one column per seed in R8's adversarial set
 * rather than the default alone.
 *
 * `AC-theming-08`: "a step or a seed missing from the sheet fails the run". The completeness
 * check is therefore part of the EMITTER (`assertContactSheetComplete`), and it re-reads the
 * rendered markup rather than trusting the loop that produced it: a renderer that drops a
 * step is exactly what it exists to catch, and a check that walks the same list twice
 * catches nothing.
 *
 * Cosmetic note carried into the sheet itself (R7): chroma goes to zero at L 1.000 and
 * L 0.000 for any hue, so every chromatic column ends in a white and a black swatch. That is
 * the arithmetic, not an oversight.
 *
 * The sheet renders values and asserts no contrast, conformance or quality verdict about any
 * of them; whether the ramps are worth shipping is Cédric's judgement at the approval gate
 * (`AC-theming-08`) and is not a claim this file makes.
 *
 * Emitted into `dist/`, where the build's other artifacts live and where it is easy to open,
 * but EXCLUDED from the published package by `package.json`'s `files` negation: it is an
 * approval artifact for this repo's own gate, and at ~350 kB unpacked it is an order of
 * magnitude larger than every consumer-facing artifact combined. R7 obliges the BUILD to
 * emit it, not the package to ship it.
 */

import type { Oklch } from './color-math.ts'
import type { PipelineResult } from './pipeline.ts'

import { formatOklch } from './color-math.ts'
import { resolveNeutralStep } from './neutral.ts'
import { rampStep } from './ramp.ts'
import { STEP_TABLE } from './step-table.ts'

type SheetScale = 'danger' | 'neutral' | 'primary'
const SHEET_SCALES: readonly SheetScale[] = ['primary', 'danger', 'neutral']
const SCHEMES = ['light', 'dark'] as const

/**
 * The surfaces a step actually sits on: R23's five shipped surface slots, resolved per
 * scheme, so a swatch is judged against the background it will really land on rather than
 * against the page.
 */
const SHEET_SURFACES = [
  'surface.base',
  'surface.raised',
  'surface.overlay',
  'surface.sunken',
  'surface.inverse',
] as const

export interface SheetColumn {
  /**
  The seed's own name in R8's hue-family terms ("red", "blue", ...), used as the column id.
   */
  name: string
  seed: Oklch
  result: PipelineResult
}

export interface ContactSheetCell {
  seed: string
  scheme: 'dark' | 'light'
  scale: SheetScale
  step: number
}

const cellId = (cell: ContactSheetCell): string =>
  `${cell.seed}|${cell.scheme}|${cell.scale}|${cell.step}`

/**
 * Every cell the sheet MUST carry, derived from the column set and the shared step table
 * independently of any rendering: seeds x schemes x scales x steps.
 */
export function expectedCells(columns: readonly SheetColumn[]): ContactSheetCell[] {
  const cells: ContactSheetCell[] = []
  const forScale = (seed: string, scheme: 'dark' | 'light', scale: SheetScale): void => {
    for (const { step } of STEP_TABLE) cells.push({ seed, scheme, scale, step })
  }
  for (const column of columns) {
    for (const scheme of SCHEMES) {
      for (const scale of SHEET_SCALES) forScale(column.name, scheme, scale)
    }
  }
  return cells
}

/**
 * The colour one step of one scale resolves to in this column. `neutral` is reconstructed
 * exactly for the column's own tint hue (R10), which is what makes a neutral swatch the
 * value the browser will actually render rather than an approximation of it.
 */
function stepColour(result: PipelineResult, scale: SheetScale, step: number): Oklch {
  if (scale === 'neutral') {
    return resolveNeutralStep(step, result.records.tintHue, result.neutralLiterals)
  }
  return rampStep(scale === 'primary' ? result.primaryRamp : result.dangerRamp, step)
}

/**
 * A slot's resolved literal for one scheme — the sheet's surface backgrounds and label
 * colours, taken from the same resolved slots the CSS emits.
 */
function slotColour(result: PipelineResult, slot: string, scheme: 'dark' | 'light'): Oklch {
  const found = result.slots.find((s) => s.slot === slot && s.branch === scheme)
  if (!found)
    throw new Error(`The contact sheet cannot resolve ${slot} (${scheme}). Open an issue.`)
  return found.literal
}

const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/**
 *
 */
function renderSwatch(cell: ContactSheetCell, colour: Oklch): string {
  const css = formatOklch(colour)
  return (
    `<i class="sw" data-cell="${escapeHtml(cellId(cell))}" style="background:${css}" ` +
    `title="${cell.scale} ${cell.step} — ${css}"></i>`
  )
}

/**
 * One surface block: every step of every generated scale, drawn on that surface's own
 * resolved colour for this scheme.
 */
function renderSurfaceBlock(
  column: SheetColumn,
  scheme: 'dark' | 'light',
  surface: (typeof SHEET_SURFACES)[number],
): string {
  const background = formatOklch(slotColour(column.result, surface, scheme))
  // The label rides the surface's own declared foreground: content.inverse is the one
  // surface.inverse declares (R18d), content.primary every other surface's.
  const label = formatOklch(
    slotColour(
      column.result,
      surface === 'surface.inverse' ? 'content.inverse' : 'content.primary',
      scheme,
    ),
  )

  const rows = SHEET_SCALES.map((scale) => {
    const swatches = STEP_TABLE.map(({ step }) =>
      renderSwatch(
        { seed: column.name, scheme, scale, step },
        stepColour(column.result, scale, step),
      ),
    ).join('')
    return `<div class="row"><span class="lbl">${scale}</span><span class="ramp">${swatches}</span></div>`
  }).join('')

  return (
    `<div class="surface" style="background:${background};color:${label}">` +
    `<span class="lbl surf">${surface}</span>${rows}</div>`
  )
}

/**
 *
 */
function renderColumn(column: SheetColumn, scheme: 'dark' | 'light'): string {
  const blocks = SHEET_SURFACES.map((surface) => renderSurfaceBlock(column, scheme, surface)).join(
    '',
  )
  const seedCss = formatOklch(column.seed)
  return (
    `<div class="col"><h3>${escapeHtml(column.name)}</h3>` +
    `<code>${escapeHtml(seedCss)}</code>${blocks}</div>`
  )
}

const SHEET_STYLE = `
:root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
body { margin: 0; padding: 1.5rem; background: #f6f6f6; color: #111; }
h1 { font-size: 1.1rem; } h2 { font-size: 1rem; margin: 1.5rem 0 0.5rem; }
h3 { font-size: 0.8rem; margin: 0 0 0.15rem; } code { font-size: 0.65rem; opacity: 0.7; }
.note { max-width: 60rem; font-size: 0.75rem; line-height: 1.5; }
.cols { display: flex; gap: 0.75rem; align-items: flex-start; flex-wrap: nowrap; overflow-x: auto; }
.col { flex: 1 1 0; min-width: 16rem; }
.surface { padding: 0.4rem 0.5rem; border-radius: 4px; margin-top: 0.35rem; }
.row { display: flex; align-items: center; gap: 0.35rem; margin-top: 0.15rem; }
.lbl { font-size: 0.6rem; width: 4.5rem; flex: none; }
.lbl.surf { display: block; width: auto; opacity: 0.75; }
.ramp { display: flex; flex: 1 1 auto; }
.sw { display: block; flex: 1 1 0; height: 1.1rem; }
`

/**
 * Renders the sheet. Self-contained: one inline stylesheet, no script, no external asset,
 * so the approval artifact opens from disk with nothing installed.
 */
function renderSheet(columns: readonly SheetColumn[]): string {
  const sections = SCHEMES.map((scheme) => {
    const cols = columns.map((column) => renderColumn(column, scheme)).join('')
    return `<h2>${scheme} scheme</h2><div class="cols">${cols}</div>`
  }).join('')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Nave contact sheet — generated, do not edit</title>
<style>${SHEET_STYLE}</style></head>
<body>
<h1>Nave contact sheet</h1>
<p class="note">Generated by the token build. Every step of every
generated scale, in both schemes, drawn on the five shipped surfaces those steps sit on, with one
column per seed in the build's adversarial seed set alongside the shipped default. This is the
approval artifact for ramp quality; the numeric envelope is not. Chroma goes to zero at L&nbsp;1.000
and L&nbsp;0.000 at every hue, so every chromatic column ends in a white and a black swatch — that
is the arithmetic, not an oversight.</p>
${sections}
</body></html>
`
}

/**
 * `AC-theming-08`: a step or a seed missing from the sheet FAILS THE RUN. Reads the cells
 * back out of the rendered markup and compares them against the independently derived
 * expectation, so the check bites on what was rendered rather than on what was intended.
 */
export function assertContactSheetComplete(
  html: string,
  expected: readonly ContactSheetCell[],
): void {
  const rendered = new Set<string>()
  for (const match of html.matchAll(/data-cell="([^"]+)"/g)) rendered.add(match[1]!)

  const missing = expected.filter((cell) => !rendered.has(cellId(cell)))
  if (missing.length > 0) {
    const shown = missing
      .slice(0, 10)
      .map((cell) => cellId(cell))
      .join(', ')
    throw new Error(
      `The contact sheet is missing ${missing.length} of ${expected.length} cells ` +
        `(seed|scheme|scale|step): ${shown}${missing.length > 10 ? ', ...' : ''}. A step or a ` +
        'seed missing from the sheet fails the run: the sheet is the only ramp-quality ' +
        'approval this design has. Open an issue rather than working around this check.',
    )
  }
}

export interface ContactSheet {
  html: string
  cells: readonly ContactSheetCell[]
}

/**
 * Composes the sheet and checks its completeness before returning it, so no caller can
 * write an incomplete sheet by forgetting to run the check. Pure: composes in memory and
 * writes nothing (`build-step.ts` owns the single write phase, `AC-theming-05`).
 */
export function composeContactSheet(columns: readonly SheetColumn[]): ContactSheet {
  if (columns.length === 0) {
    throw new Error('The contact sheet carries no seed column. Open an issue.')
  }
  const html = renderSheet(columns)
  const cells = expectedCells(columns)
  assertContactSheetComplete(html, cells)
  return { html, cells }
}
