/**
 * AC-consumer-constraints 14, 15, 16: the strict-value rule's (a') semantics — a var(), a
 * function consuming one, or an admitted keyword passes; everything else is reported — and the
 * exact admitted-keyword set, read back from the shipped config rather than retyped here.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import stylelint from 'stylelint'
import { describe, expect, it } from 'vitest'

import config from '../index.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../..')

async function warningsFor(declarations: string[]): Promise<string[][]> {
  const code = declarations.map((d, i) => `.sel${i} { ${d}; }`).join('\n')
  const result = await stylelint.lint({ code, config })
  // group by selector index using the line number (one declaration per line)
  const byLine = new Map<number, string[]>()
  const warnings = result.results[0]!.warnings
  for (const w of warnings) {
    byLine.set(w.line, [...(byLine.get(w.line) ?? []), w.rule])
  }
  return declarations.map((_, i) => byLine.get(i + 1) ?? [])
}

const SYSTEM_COLOR_KEYWORDS = [
  'AccentColor',
  'AccentColorText',
  'ActiveText',
  'ButtonBorder',
  'ButtonFace',
  'ButtonText',
  'Canvas',
  'CanvasText',
  'Field',
  'FieldText',
  'GrayText',
  'Highlight',
  'HighlightText',
  'LinkText',
  'Mark',
  'MarkText',
  'SelectedItem',
  'SelectedItemText',
  'VisitedText',
]

// CSS Color 4 Appendix A: deprecated system-colour keywords, transcribed from the specification.
const DEPRECATED_SYSTEM_COLOR_KEYWORDS = [
  'ActiveBorder',
  'ActiveCaption',
  'AppWorkspace',
  'Background',
  'ButtonHighlight',
  'ButtonShadow',
  'CaptionText',
  'InactiveBorder',
  'InactiveCaption',
  'InactiveCaptionText',
  'InfoBackground',
  'InfoText',
  'Menu',
  'MenuText',
  'Scrollbar',
  'ThreeDDarkShadow',
  'ThreeDFace',
  'ThreeDHighlight',
  'ThreeDLightShadow',
  'ThreeDShadow',
  'Window',
  'WindowFrame',
  'WindowText',
]

function readmeQuickStartColorSchemeFence(): string {
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')
  const match = /color-scheme:\s*([^;]+);/.exec(readme)
  if (!match) throw new Error('root README no longer contains a color-scheme declaration')
  return `color-scheme: ${match[1]};`
}

describe('AC-consumer-constraints-14 covers: R11b, R18 (none of these is reported)', () => {
  it('the root README color-scheme fence, extracted at test time', async () => {
    const [warnings] = await warningsFor([readmeQuickStartColorSchemeFence().replace(/;$/, '')])
    expect(warnings).toEqual([])
  })

  it.each([
    'color-scheme: light dark',
    'forced-color-adjust: none',
    'print-color-adjust: exact',
    'color-interpolation-filters: linearRGB',
    'padding: calc(var(--x) * 3)',
    'padding: var(--a) var(--b)',
    'background-color: color-mix(in oklch, var(--x) 50%, transparent)',
    'color: light-dark(var(--a), var(--b))',
    'color: currentcolor',
    'color: currentColor',
    'fill: CURRENTCOLOR',
    'color: var(--i)',
    'color: var(--nave-not-declared)',
    'color: light-dark(#fff, var(--x))',
    'width: 13px',
    'accent-color: auto',
    'caret-color: auto',
    'scrollbar-color: auto',
    'font-weight: normal',
    'gap: normal',
    'background: url(x.png)',
    'background: image-set("x.png" 1x)',
    'box-shadow: 0 0 0 var(--nave-border-width-focus) var(--nave-color-border-focus)',
    'box-shadow: inset 0 0 0 var(--a) var(--b)',
    'box-shadow: none',
  ])('%s', async (declaration) => {
    const [warnings] = await warningsFor([declaration])
    expect(warnings).toEqual([])
  })

  it.each(SYSTEM_COLOR_KEYWORDS)('color: %s (top level and inside forced-colors)', async (kw) => {
    const [top] = await warningsFor([`color: ${kw}`])
    expect(top).toEqual([])
    const code = `@media (forced-colors: active) { .a { color: ${kw}; } }`
    const result = await stylelint.lint({ code, config })
    expect(result.results[0]!.warnings).toEqual([])
  })

  it.each([
    ['color', 'CanvasText'],
    ['border-color', 'canvastext'],
    ['fill', 'ButtonText'],
    ['stroke', 'highlighttext'],
    ['outline-color', 'Highlight'],
  ])('%s: %s', async (property, value) => {
    const [warnings] = await warningsFor([`${property}: ${value}`])
    expect(warnings).toEqual([])
  })
})

describe('AC-consumer-constraints-15 covers: R11b, R14 (each is reported)', () => {
  it.each([
    'color: rgb(255 0 0)',
    'color: #fff',
    'color: red',
    'color: light-dark(#fff, #000)',
    'text-decoration-color: red',
    'accent-color: rgb(0 0 0)',
    'accent-color: red',
    'padding: calc(13px)',
    'padding: 13px',
    'padding: var(--a) 13px',
    'z-index: max(999)',
    'z-index: 999',
    'color: auto',
    'background-color: auto',
    'color: none',
    'background-color: none',
    'border-color: none',
    'color: Canvas2',
    'background: url(x.png) red',
    'box-shadow: 0 1px 2px red',
    'line-height: 1em',
  ])('%s', async (declaration) => {
    const [warnings] = await warningsFor([declaration])
    expect(warnings!.length).toBeGreaterThan(0)
  })

  it.each(DEPRECATED_SYSTEM_COLOR_KEYWORDS)('color: %s (deprecated system colour)', async (kw) => {
    const [warnings] = await warningsFor([`color: ${kw}`])
    expect(warnings!.length).toBeGreaterThan(0)
  })

  it('a literal colour inside forced-colors is still reported (admission is by keyword, not block)', async () => {
    for (const declaration of ['color: #fff', 'color: red']) {
      const code = `@media (forced-colors: active) { .a { ${declaration}; } }`
      const result = await stylelint.lint({ code, config })
      expect(result.results[0]!.warnings.length).toBeGreaterThan(0)
    }
  })
})

describe('AC-consumer-constraints-16 covers: R11b', () => {
  const properties = (
    config.rules!['scale-unlimited/declaration-strict-value'] as unknown[]
  )[0] as string[]
  const colorFamilyEntry = properties.find((p) => p.includes('color'))!

  it('CSS-wide keywords are admitted on every checked property/family, lower and upper case', async () => {
    const exemplars = [
      'color',
      'accent-color',
      'fill',
      'stroke',
      'font-size',
      'padding',
      'margin',
      'z-index',
      'opacity',
      'box-shadow',
      'gap',
      'border-radius',
    ]
    const keywords = ['inherit', 'initial', 'unset', 'revert', 'revert-layer']
    for (const property of exemplars) {
      for (const keyword of keywords) {
        const [lower] = await warningsFor([`${property}: ${keyword}`])
        const [upper] = await warningsFor([`${property}: ${keyword.toUpperCase()}`])
        expect(lower, `${property}: ${keyword}`).toEqual([])
        expect(upper, `${property}: ${keyword.toUpperCase()}`).toEqual([])
      }
    }
  })

  it('the colour family entry exists and admits transparent/currentColor in every case', async () => {
    expect(colorFamilyEntry).toBeDefined()
    for (const value of [
      'transparent',
      'TRANSPARENT',
      'currentColor',
      'CURRENTCOLOR',
      'currentcolor',
    ]) {
      const [warnings] = await warningsFor([`color: ${value}`])
      expect(warnings, `color: ${value}`).toEqual([])
    }
  })

  it('none stays admitted on fill, stroke and box-shadow, which are not colour-valued', async () => {
    for (const declaration of ['fill: none', 'stroke: none', 'box-shadow: none']) {
      const [warnings] = await warningsFor([declaration])
      expect(warnings).toEqual([])
    }
  })

  it('the shipped options carry the allowlist under ignoreValues and have no ignoreKeywords key', () => {
    const options = (
      config.rules!['scale-unlimited/declaration-strict-value'] as unknown[]
    )[1] as Record<string, unknown>
    expect(options).toHaveProperty('ignoreValues')
    expect(options).not.toHaveProperty('ignoreKeywords')
  })
})
