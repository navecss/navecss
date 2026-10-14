import { describe, expect, it } from 'vitest'

import { fencesOf, FIXED_SENTENCES, proseOf, readReadme, sha256 } from './support/readme.ts'
import { notPaintedIn, sentencesOf } from './support/w9-readme-items.ts'
import { SENTENCE_4_FORMS } from './support/w9-sentences.ts'
import {
  ALL_LITERALS_789,
  FORBIDDEN,
  ITEM_RULES,
  type ItemRule,
  itemsPresent,
  NON_LIVE_REDUCED_MOTION,
  problems789,
  readmeInState,
  WITHDRAWN_reader,
  WITHDRAWN_cleared,
} from './support/w12-feedback-rules.ts'
import * as S from './support/w12-feedback-sentences.ts'
import { phrasesFor, phrasesIn } from './support/w12-not-painted.ts'
import {
  composeReducedMotion,
  reducedMotionCodeFor,
  RM_TABLE,
  signedOfCode,
} from './support/w12-reduced-motion.ts'
import { allStates789, SHIPPING_789, type State789, stateKey789 } from './support/w12-states.ts'

const readme = readReadme()
const prose = proseOf(readme)

const UNPLACED: State789 = { unsigned: ['toast-placement'] }
const UNPLACED_WITH_REMEDY: State789 = { remedyRowPosted: true, unsigned: ['toast-placement'] }

/**
A README written from the literals of a state alone: the control for every check of a README.
 */
const syntheticReadme = (state: State789): string =>
  itemsPresent(state)
    .map(({ literal }) => literal.text)
    .join('\n\n')

const hasItem = (text: string, rule: ItemRule): boolean =>
  problems789(text, SHIPPING_789).every((problem) => problem !== `missing: ${rule.literal.name}`)

const readerItems = ITEM_RULES.filter(({ author }) => author === 'reader')
const clearedItems = ITEM_RULES.filter(({ author }) => author === 'cleared')

const bytesAndHash = ({
  bytes,
  prefix,
  text,
}: {
  bytes: number
  prefix: string
  text: string
}): { bytes: number; hashed: boolean; wanted: number } => ({
  bytes: Buffer.byteLength(text, 'utf8'),
  hashed: sha256(text).startsWith(prefix),
  wanted: bytes,
})

describe("AC-base-ui-feedback-navigation-49: the README carries the reader items, each in its state's form", () => {
  it.each(readerItems.map(({ literal }) => literal))(
    'holds $name at its length and hash',
    (literal) => {
      const measured = bytesAndHash(literal)
      expect(measured.bytes).toBe(measured.wanted)
      expect(measured.hashed).toBe(true)
      expect(literal.prefix).toMatch(/^[\da-f]{16}$/)
    },
  )

  it.each(readerItems.filter(({ present }) => present(SHIPPING_789)))(
    'contains $literal.name in the shipping state',
    (rule) => {
      expect(hasItem(readme, rule)).toBe(true)
    },
  )

  it('contains no reader item the shipping state does not call for, and none of the withdrawn texts', () => {
    expect(problems789(readme, SHIPPING_789, 'reader')).toEqual([])
  })

  it.each([...WITHDRAWN_reader])('does not contain the withdrawn text $name', ({ text }) => {
    expect(readme).not.toContain(text)
  })

  it('holds the three rows of D13b cell by cell, whatever Prettier pads them to', () => {
    const rule = readerItems.find(({ literal }) => literal.text === S.D13B_WHAT_IS_STYLED_ROWS.text)
    expect(rule?.holds?.(readme, S.D13B_WHAT_IS_STYLED_ROWS.text)).toBe(true)
    expect(
      rule?.holds?.(
        S.D13B_WHAT_IS_STYLED_ROWS.text.replaceAll('|  ', '| ').replaceAll('  |', ' |'),
        S.D13B_WHAT_IS_STYLED_ROWS.text,
      ),
    ).toBe(true)
  })

  it.each(['toast', 'navigation-menu', 'scroll-area', 'meter', 'progress', 'avatar', 'separator'])(
    'names the subpath @navecss/base-ui/%s in prose, as the same prefix swap',
    (name) => {
      expect(prose).toContain(`\`@navecss/base-ui/${name}\``)
    },
  )

  it('shows the D1 and D7 examples importing the new subpaths from this package, as the prefix swap', () => {
    const imports = fencesOf(readme)
      .filter(({ language }) => language === 'tsx')
      .flatMap(({ body }) => body.matchAll(/from '@navecss\/base-ui\/([\w-]+)'/g).toArray())
      .map((match) => match[1])
    expect(imports).toContain('toast')
    expect(imports).toContain('navigation-menu')
  })

  describe('the stylesheet sentence: D3 exactly when the placement is signed, the shipped one exactly when not', () => {
    it('has D3 and not the shipped sentence in the shipping state', () => {
      expect(readme).toContain(S.D3_STYLESHEET_SENTENCE.text)
      expect(readme).not.toContain(S.SHIPPED_STYLESHEET_SENTENCE.text)
    })

    it('has the shipped sentence and not D3 in a README written for the unsigned placement', () => {
      const unplaced = readmeInState(readme, UNPLACED)
      expect(unplaced).toContain(S.SHIPPED_STYLESHEET_SENTENCE.text)
      expect(unplaced).not.toContain(S.D3_STYLESHEET_SENTENCE.text)
    })

    it('reads D3 in the paragraph that opens "Both files begin with Nave\'s @layer order statement"', () => {
      const paragraph = prose
        .split(/\n{2,}/)
        .find((candidate) => candidate.startsWith('Both files begin'))
      expect(paragraph).toContain(S.D3_STYLESHEET_SENTENCE.text)
    })
  })

  describe("the not-painted list gains exactly D13c's phrases whose condition holds", () => {
    const paragraph = prose
      .split(/\n{2,}/)
      .find((candidate) => notPaintedIn(candidate).length > 0 || /\bnot paint\b/i.test(candidate))

    it("carries, in the overlay release's paragraph, exactly the phrases of the shipping state", () => {
      expect(paragraph).toBeDefined()
      expect(phrasesIn(paragraph ?? '')).toEqual(phrasesFor(SHIPPING_789))
      expect(phrasesFor(SHIPPING_789)).toEqual([
        'toasts form a plain list',
        'no motion when the Navigation Menu panel closes',
      ])
    })

    it('carries them nowhere else in the prose, and carries no draft id', () => {
      expect(phrasesIn(prose)).toEqual(phrasesFor(SHIPPING_789))
      // A draft label (a backticked word followed by signed or unsigned) is never reader copy.
      expect(readme).not.toMatch(/`[\w-]+` (?:un)?signed\b/)
    })

    it('control: a paragraph composed for each of the sixteen states lists exactly its phrases', () => {
      for (const state of allStates789()) {
        const composed = `What this package does not paint: ${phrasesFor(state).join('; ')}.`
        expect(phrasesIn(composed), stateKey789(state)).toEqual(phrasesFor(state))
      }
    })

    it('control: exactly one of the two Navigation Menu phrases, in every state', () => {
      for (const state of allStates789()) {
        const both = phrasesFor(state).filter((phrase) => phrase.includes('Navigation Menu panel'))
        expect(both, stateKey789(state)).toHaveLength(1)
      }
    })

    it('control: a paragraph carrying both Navigation Menu phrases is not the shipping state', () => {
      const planted =
        'No paint: no motion when the Navigation Menu panel closes; no motion on the Navigation Menu panel.'
      expect(phrasesIn(planted)).toHaveLength(2)
      expect(phrasesIn(planted)).not.toEqual(phrasesFor(SHIPPING_789))
    })
  })

  describe('each of the sixteen states, written from the shipped README by the substitutions the criteria describe', () => {
    it.each(allStates789().map((state) => ({ key: stateKey789(state), state })))(
      'is clean for its own state: $key',
      ({ state }) => {
        expect(problems789(readmeInState(readme, state), state, 'reader')).toEqual([])
      },
    )
  })

  describe('controls, on a README written from the literals of a state', () => {
    it('is clean for its own state in each of the sixteen, and reds for another whose items differ', () => {
      const states = allStates789()
      for (const state of states) {
        expect(problems789(syntheticReadme(state), state), stateKey789(state)).toEqual([])
        const names = itemsPresent(state).map(({ literal }) => literal.name)
        for (const other of states) {
          const otherNames = itemsPresent(other).map(({ literal }) => literal.name)
          const isDiffers = names.join('|') !== otherNames.join('|')
          expect(
            problems789(syntheticReadme(state), other).length > 0,
            `${stateKey789(state)} against ${stateKey789(other)}`,
          ).toBe(isDiffers)
        }
      }
    })

    it('control: a README carrying both D3 and the shipped sentence reds', () => {
      const both = `${syntheticReadme(SHIPPING_789)}\n\n${S.SHIPPED_STYLESHEET_SENTENCE.text}`
      expect(problems789(both, SHIPPING_789)).toEqual([
        'unexpected: the shipped stylesheet sentence',
      ])
      const bothUnplaced = `${syntheticReadme(UNPLACED)}\n\n${S.D3_STYLESHEET_SENTENCE.text}`
      expect(problems789(bothUnplaced, UNPLACED)).toEqual([
        'unexpected: D3, the stylesheet sentence',
      ])
    })

    it('control: a README carrying D5 reds', () => {
      expect(
        problems789(`${syntheticReadme(SHIPPING_789)}\n\n${S.D5_SWIPE.text}`, SHIPPING_789),
      ).toEqual(['unexpected: D5'])
    })

    it('control: replacing one word of D8 reds containment', () => {
      const edited = syntheticReadme(SHIPPING_789).replace(S.D8_NAVIGATION_MENU_SIZE.text, () =>
        S.D8_NAVIGATION_MENU_SIZE.text.replace('animate', 'move'),
      )
      expect(edited).not.toContain(S.D8_NAVIGATION_MENU_SIZE.text)
      expect(problems789(edited, SHIPPING_789)).toEqual(['missing: D8, panel size'])
    })

    it('control: editing a literal reds its hash', () => {
      for (const literal of ALL_LITERALS_789) {
        const edited = { ...literal, text: `${literal.text.slice(0, -1)}!` }
        expect(bytesAndHash(edited).hashed, literal.name).toBe(false)
      }
    })

    it('control: a table with one cell changed is not D13b', () => {
      const rule = readerItems.find(
        ({ literal }) => literal.text === S.D13B_WHAT_IS_STYLED_ROWS.text,
      )
      const edited = syntheticReadme(SHIPPING_789).replace(
        '@navecss/base-ui/avatar',
        '@navecss/base-ui/avatars',
      )
      expect(rule?.holds?.(edited, S.D13B_WHAT_IS_STYLED_ROWS.text)).toBe(false)
    })
  })
})

describe('AC-base-ui-feedback-navigation-50: the cleared final cleared sentences, byte for byte, each in exactly its signature state', () => {
  it.each(clearedItems.map(({ literal }) => literal))(
    'holds $name at its length and hash',
    (literal) => {
      const measured = bytesAndHash(literal)
      expect(measured.bytes).toBe(measured.wanted)
      expect(measured.hashed).toBe(true)
    },
  )

  it.each(clearedItems.filter(({ present }) => present(SHIPPING_789)))(
    'contains $literal.name in the shipping state',
    (rule) => {
      expect(readme).toContain(rule.literal.text)
    },
  )

  it('contains exactly the sentences the shipping state calls for and none of the others', () => {
    expect(problems789(readme, SHIPPING_789, 'cleared')).toEqual([])
  })

  it.each([...WITHDRAWN_cleared])('does not contain the withdrawn text $name', ({ text }) => {
    expect(readme).not.toContain(text)
  })

  describe("the reduced-motion sentence: exactly one of the two live forms, in the place the overlay release's form stood", () => {
    it('contains the 463 B form with the toast fade signed, and not the 445 B form', () => {
      expect(readme).toContain(S.RM_TOASTS_IN.text)
      expect(readme).not.toContain(S.RM_TOASTS_OUT.text)
    })

    it("contains none of the fourteen other forms and none of the overlay release's eight", () => {
      const carried = [
        ...NON_LIVE_REDUCED_MOTION,
        ...Object.values(SENTENCE_4_FORMS).map((form) => ({ ...form, name: 'overlay form' })),
      ].filter(({ text }) => readme.includes(text))
      expect(carried.map(({ name }) => name)).toEqual([])
    })

    it("stands after the Menu.LinkItem sentence, where the overlay release's form stood, and is the only sentence that opens as it does", () => {
      const linkItem = FIXED_SENTENCES.find(({ name }) => name === 'Menu.LinkItem')?.text ?? ''
      expect(readme.indexOf(S.RM_TOASTS_IN.text)).toBeGreaterThan(readme.indexOf(linkItem))
      expect(readme.match(/When the reader's system asks for reduced motion/g)).toHaveLength(1)
    })

    it('is composed from the template and the rule: the live forms equal the literals, in either state', () => {
      expect(composeReducedMotion(signedOfCode('SSSS'))).toBe(S.RM_TOASTS_IN.text)
      expect(composeReducedMotion(signedOfCode('SSSu'))).toBe(S.RM_TOASTS_OUT.text)
      expect(reducedMotionCodeFor(SHIPPING_789)).toBe('SSSS')
      expect(reducedMotionCodeFor({ unsigned: ['toast-fade'] })).toBe('SSSu')
    })

    it.each(RM_TABLE)(
      'composes the form $code at $bytes bytes and its hash',
      ({ bytes, code, prefix }) => {
        const text = composeReducedMotion(signedOfCode(code))
        expect(Buffer.byteLength(text, 'utf8')).toBe(bytes)
        expect(sha256(text).startsWith(prefix)).toBe(true)
      },
    )

    it("has sixteen distinct forms, none inside another or inside the overlay release's forms", () => {
      const texts = RM_TABLE.map(({ code }) => composeReducedMotion(signedOfCode(code)))
      expect(new Set(texts).size).toBe(16)
      const all = [...texts, ...Object.values(SENTENCE_4_FORMS).map(({ text }) => text)]
      const nested = all.flatMap((text, index) =>
        all.filter((other, at) => at !== index && other.includes(text)),
      )
      expect(nested).toEqual([])
    })
  })

  describe('each of the sixteen states, written from the shipped README by the substitutions the criteria describe', () => {
    it.each(allStates789().map((state) => ({ key: stateKey789(state), state })))(
      'is clean for its own state: $key',
      ({ state }) => {
        expect(problems789(readmeInState(readme, state), state, 'cleared')).toEqual([])
      },
    )
  })

  describe('controls, on a README written from the literals of a state', () => {
    it('control: replacing one word of T1 reds containment', () => {
      const edited = syntheticReadme(SHIPPING_789).replace(S.T1_F6_INTO_THE_TOASTS.text, () =>
        S.T1_F6_INTO_THE_TOASTS.text.replace('Tab', 'Shift'),
      )
      expect(edited).not.toContain(S.T1_F6_INTO_THE_TOASTS.text)
      expect(problems789(edited, SHIPPING_789)).toEqual(['missing: T1, F6 into the toasts'])
    })

    it('control: editing a literal reds its hash', () => {
      const edited = { ...S.T2_TOAST_TIMER, text: S.T2_TOAST_TIMER.text.replace('5000', '6000') }
      expect(bytesAndHash(edited).hashed).toBe(false)
    })

    it('control: a README carrying S-P3 in the unsigned-placement state reds', () => {
      const planted = `${syntheticReadme(UNPLACED)}\n\n${S.S_P3_PLACEMENT_AND_STACKING.text}`
      expect(problems789(planted, UNPLACED)).toEqual(['unexpected: S-P3, placement and stacking'])
    })

    it('control: a README carrying the withdrawn 308 B placement sentence reds', () => {
      const planted = `${syntheticReadme(SHIPPING_789)}\n\n${S.S_P_PLACEMENT_308.text}`
      expect(problems789(planted, SHIPPING_789)).toEqual([
        'unexpected: the 308 B placement sentence',
      ])
    })

    it("control: a README carrying both the 463 B form and the overlay release's 395 B form reds", () => {
      const planted = `${syntheticReadme(SHIPPING_789)}\n\n${SENTENCE_4_FORMS.SSS?.text ?? ''}`
      expect(problems789(planted, SHIPPING_789)).toEqual([
        "unexpected: the overlay release's reduced-motion form S S S",
      ])
    })

    it('control: a README carrying both reduced-motion forms of the toasts reds', () => {
      const planted = `${syntheticReadme(SHIPPING_789)}\n\n${S.RM_TOASTS_OUT.text}`
      expect(problems789(planted, SHIPPING_789)).toEqual([
        'unexpected: RM, reduced motion, toasts out',
      ])
    })

    it('control: S-U and S-A are in exactly the unsigned-placement README with the scrim return, S-A only after its remedy row', () => {
      expect(problems789(syntheticReadme(UNPLACED), UNPLACED)).toEqual([])
      expect(itemsPresent(UNPLACED).map(({ literal }) => literal.name)).toContain(
        'S-U, toast area unplaced',
      )
      expect(itemsPresent(UNPLACED).map(({ literal }) => literal.name)).not.toContain(
        'S-A, anchored not stacked',
      )
      expect(itemsPresent(UNPLACED_WITH_REMEDY).map(({ literal }) => literal.name)).toContain(
        'S-A, anchored not stacked',
      )
      expect(itemsPresent(SHIPPING_789).map(({ literal }) => literal.name)).not.toContain(
        'S-U, toast area unplaced',
      )
    })
  })
})

describe("AC-base-ui-feedback-navigation-19: the unplaced branch carries unplaced alternative's sentences (README half)", () => {
  it('carries S-U, not S-A before its remedy row, neither S-P3 nor S-Pp2, and the shipped 104 B sentence instead of D3', () => {
    const unplaced = readmeInState(readme, UNPLACED)
    expect(unplaced).toContain(S.S_U_TOAST_AREA_UNPLACED.text)
    expect(unplaced).not.toContain(S.S_A_ANCHORED_NOT_STACKED.text)
    expect(unplaced).not.toContain(S.S_P3_PLACEMENT_AND_STACKING.text)
    expect(unplaced).not.toContain(S.S_PP2_POPUP_FROM_A_TOAST.text)
    expect(unplaced).toContain(S.SHIPPED_STYLESHEET_SENTENCE.text)
    expect(unplaced).not.toContain(S.D3_STYLESHEET_SENTENCE.text)
  })

  it('carries S-A as well once its remedy row is posted', () => {
    const unplaced = readmeInState(readme, UNPLACED_WITH_REMEDY)
    expect(unplaced).toContain(S.S_U_TOAST_AREA_UNPLACED.text)
    expect(unplaced).toContain(S.S_A_ANCHORED_NOT_STACKED.text)
  })

  it('carries neither S-U nor S-A with the placement signed, unplaced alternative being null', () => {
    expect(readme).not.toContain(S.S_U_TOAST_AREA_UNPLACED.text)
    expect(readme).not.toContain(S.S_A_ANCHORED_NOT_STACKED.text)
    expect(readme).toContain(S.S_P3_PLACEMENT_AND_STACKING.text)
  })

  it('carries neither S-U nor S-A when neither the placement nor unplaced alternative is signed: the state the criterion does not ship', () => {
    const neither: State789 = {
      remedyRowPosted: true,
      unsigned: ['toast-placement'],
      unplacedAlternativeSigned: false,
    }
    const text = readmeInState(readme, neither)
    expect(text).not.toContain(S.S_U_TOAST_AREA_UNPLACED.text)
    expect(text).not.toContain(S.S_A_ANCHORED_NOT_STACKED.text)
    expect(problems789(text, neither)).toEqual([])
  })

  it('control: a README of the unsigned branch that keeps S-P3 reds, and one that keeps D3 reds', () => {
    expect(
      problems789(
        `${syntheticReadme(UNPLACED)}\n\n${S.S_P3_PLACEMENT_AND_STACKING.text}`,
        UNPLACED,
      ),
    ).toEqual(['unexpected: S-P3, placement and stacking'])
    expect(
      problems789(`${syntheticReadme(UNPLACED)}\n\n${S.D3_STYLESHEET_SENTENCE.text}`, UNPLACED),
    ).toEqual(['unexpected: D3, the stylesheet sentence'])
  })
})

const RING = /\b(?:focus )?rings?\b|focus indicator|\boutline\b/i
const KEEPS =
  /\b(?:stay|stays|remain|remains|kept|keep|keeps|visible|whole|uncut|unclipped|in view)\b/i
const SCROLLER = /\bscroll(?:s|ing|er|able)?\b/i
const FIREFOX = /\bfirefox\b/i
const SIDEWAYS = /\bsideways\b/i

/**
The sentences of a text that claim a focus ring stays visible in something that scrolls, or that
name Firefox or sideways scrolling.
 */
const ringInScrollerClaims = (text: string): string[] =>
  sentencesOf(text).filter(
    (sentence) =>
      (RING.test(sentence) && SCROLLER.test(sentence) && KEEPS.test(sentence)) ||
      (FIREFOX.test(sentence) && SCROLLER.test(sentence)) ||
      SIDEWAYS.test(sentence),
  )

describe('AC-base-ui-feedback-navigation-51: no accessibility claim beyond the cleared copy, and silence on rings in a scroller', () => {
  it('has no sentence, cleared copy included, that claims a ring stays visible in a scroller or names Firefox or sideways scrolling', () => {
    expect(ringInScrollerClaims(readme)).toEqual([])
  })

  it('control: the planted sentence "Focus rings stay visible while you scroll." is reported', () => {
    expect(ringInScrollerClaims(`${readme}\n\nFocus rings stay visible while you scroll.`)).toEqual(
      ['Focus rings stay visible while you scroll.'],
    )
  })

  it('control: a sentence naming Firefox or sideways scrolling is reported', () => {
    expect(ringInScrollerClaims('Firefox scrolls it into view.')).toHaveLength(1)
    expect(ringInScrollerClaims('Tab can scroll sideways.')).toHaveLength(1)
  })

  it('control: the cleared Scroll Area sentence, which names the ring and the scroll, is not a claim', () => {
    expect(ringInScrollerClaims(S.S_SA_SCROLL_AREA_VIEWPORT.text)).toEqual([])
    expect(ringInScrollerClaims(S.S_K_KEEP_MOUNTED_SCROLLBAR.text)).toEqual([])
  })

  it('carries the cleared sentences that hold the words the scan forbids elsewhere, so the removal has something to take out', () => {
    expect(readme).toContain(S.S_AV_AVATAR_ALT.text)
    expect(readme).toContain(S.RM_TOASTS_IN.text)
    expect(FORBIDDEN.some((pattern) => pattern.test(S.S_AV_AVATAR_ALT.text))).toBe(true)
    expect(FORBIDDEN.some((pattern) => pattern.test(S.S_S_SWIPE.text))).toBe(true)
  })

  it('has no reader item that holds a word the scan forbids', () => {
    const offending = readerItems.flatMap(({ literal }) =>
      FORBIDDEN.filter((pattern) => pattern.test(literal.text)).map(
        (pattern) => `${literal.name}: ${String(pattern)}`,
      ),
    )
    expect(offending).toEqual([])
  })
})

describe('the literals of the README, taken together', () => {
  it('holds each at its length and hash', () => {
    const wrong = ALL_LITERALS_789.filter((literal) => {
      const measured = bytesAndHash(literal)
      return measured.bytes !== measured.wanted || !measured.hashed
    }).map(({ name }) => name)
    expect(wrong).toEqual([])
  })

  it('has no text inside another, so a containment check names one item only', () => {
    const texts = ALL_LITERALS_789
    const nested = texts.flatMap(({ name, text }, index) =>
      texts
        .filter((other, at) => at !== index && other.text.includes(text))
        .map((other) => `${name} inside ${other.name}`),
    )
    expect(nested).toEqual([])
  })

  it('carries no dash', () => {
    const dashes = ALL_LITERALS_789.filter(({ text }) => /[‒-―]/.test(text)).map(({ name }) => name)
    expect(dashes).toEqual([])
  })
})
