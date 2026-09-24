/**
 * Traceability: C7 (cx() silently remaps any string equal to an atom name, and
 * had no atom typing at all). C7 splits into four rows: C7a pins that cx()
 * refuses a name that is not a built-in atom, C7b and C7d pin that cx.raw()
 * never consults the atom map, and C7c pins the untyped (JavaScript) caller
 * the narrowing leaves unchecked.
 *
 * The typecheck half is asserted by `pnpm typecheck`, not by vitest: an UNUSED
 * @ts-expect-error is itself a tsc error, so every directive below goes red if
 * cx() ever widens back to accepting arbitrary strings.
 */
import { describe, expect, it } from 'vitest'

import type { AtomName } from '../src/cx.ts'

import { atomClassMap } from '../src/atoms.ts'
import { cx } from '../src/cx.ts'

describe('cx', () => {
  it('maps atom names to their global class names', () => {
    expect(cx('interactive', 'focusRing')).toBe('nave-interactive nave-focus-ring')
  })

  it('drops falsy arguments', () => {
    expect(cx('flex', undefined, null, false)).toBe('nave-flex')
  })

  it('C7a — refuses a name that is not a built-in atom (typecheck assertion)', () => {
    const moduleHash: string = 'button_a1b2c3'

    // @ts-expect-error a typo'd atom name is not an AtomName
    cx('interactve')
    // @ts-expect-error kebab-case is neither the atom key (srOnly) nor the emitted class (nave-sr-only)
    cx('sr-only')
    // @ts-expect-error kebab-case is neither the atom key (focusRing) nor the emitted class (nave-focus-ring)
    cx('focus-ring')
    // @ts-expect-error a class from outside the system goes through cx.raw()
    cx('legacy-card')
    // @ts-expect-error a CSS Module hash is a string: compose it, do not pass it
    cx(moduleHash)

    // Runtime half of this case: a class from outside any system Nave can see
    // has a sanctioned home on the other channel. (A CSS Module hash composes
    // in the template literal instead — cx.raw() would work, but the docblock
    // reserves it for classes no build step owns.)
    expect(cx.raw('legacy-card')).toBe('legacy-card')
    expect(`${cx('flex')} ${moduleHash}`).toBe('nave-flex button_a1b2c3')
  })

  it('C7c — an unchecked (JavaScript) caller still gets a non-atom string back unmapped', () => {
    // cx() is AtomName-only in TypeScript, so this call is unreachable from a
    // typed consumer and the `?? arg` fallback in src/cx.ts reads as dead to tsc.
    // It is not dead at run time: JS consumers are unchecked, and without the
    // fallback the map lookup yields undefined, which join() renders as an
    // empty token — a lone non-atom argument comes back as '', and a mixed
    // call as 'nave-flex ' rather than carrying the string they passed.
    const untyped = cx as unknown as (...args: unknown[]) => string
    expect(untyped('button_a1b2c3')).toBe('button_a1b2c3')
    expect(untyped('flex', 'button_a1b2c3')).toBe('nave-flex button_a1b2c3')
  })

  // atomClassMap is a plain object, so an unchecked caller passing an
  // inherited Object.prototype name (`toString`, `constructor`) resolved the
  // inherited member instead of falling through to the `?? arg` literal.
  // `__proto__` rides the same row but fails a different way on bracket
  // access: `atomClassMap['__proto__']` resolves to the live Object.prototype
  // object itself, which is truthy, so a plain `?? arg` fallback never fires
  // and `.join(' ')` stringifies it to `"[object Object]"`. Object.hasOwn
  // closes all three at once, since none of them is an own key of the map.
  it('C7f — an unchecked caller passing an inherited prototype name gets the literal back, not the inherited member', () => {
    const untyped = cx as unknown as (...args: unknown[]) => string
    expect(untyped('toString')).toBe('toString')
    expect(untyped('constructor')).toBe('constructor')
    expect(untyped('__proto__')).toBe('__proto__')
  })
})

describe('cx.raw', () => {
  it('passes arbitrary class names through', () => {
    expect(cx.raw('button_a1b2c3')).toBe('button_a1b2c3')
  })

  it('drops falsy arguments', () => {
    expect(cx.raw('legacy-card', undefined, null, false)).toBe('legacy-card')
  })

  it('C7b — never consults the atom map, so it cannot shadow a consumer class', () => {
    // The other half of the C7 split. cx() maps an atom name to its global
    // class; cx.raw() returns the literal string it was given, for every one of
    // the atom names that read like ordinary class names. This is what makes
    // shadowing structurally impossible rather than documented.
    expect(cx.raw('container')).toBe('container')
    expect(cx('container')).toBe('nave-container')

    const collide: AtomName[] = [
      'container',
      'hidden',
      'grid',
      'flex',
      'block',
      'border',
      'rounded',
      'transition',
      'relative',
      'absolute',
      'gap',
      'truncate',
      'interactive',
    ]
    expect(cx.raw(...collide)).toBe(collide.join(' '))
  })

  it('C7d — returns the literal for EVERY built-in atom name, not just the ordinary-sounding ones', () => {
    const names = Object.keys(atomClassMap) as AtomName[]
    expect(names.length).toBeGreaterThan(0) // the quantifier is not vacuous
    for (const name of names) expect(cx.raw(name)).toBe(name)
  })
})
