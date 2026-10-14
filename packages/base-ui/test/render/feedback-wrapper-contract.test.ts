/**
 * AC-base-ui-feedback-navigation-46, the row of AC-base-ui-bridge-11: the composed className
 * function is memoized on the consumer function, for every part module of the seven. Each wrapper
 * module is loaded over stand-ins for Base UI's parts (a `React.memo` double that counts its renders
 * and records the className it is given), so the check reads the module as shipped, whichever helper
 * it builds a part with, and does not depend on the parts rendering inside their providers.
 */
import { createElement, forwardRef, memo, type ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { loadWrapperOver } from '../support/feedback-minors.ts'
import {
  FEEDBACK_KEYS,
  FEEDBACK_PASS_THROUGHS,
  FEEDBACK_SUBPATHS,
  FEEDBACK_TABLE_P,
  FEEDBACK_TOP,
  type FeedbackSubpath,
} from '../support/feedback-subpaths.ts'
import { cleanup, render } from '../support/react.ts'

afterEach(cleanup)

const byCodeUnit = (a: string, b: string): number => a.localeCompare(b)

interface Log {
  classNames: unknown[]
  count: number
}

const logs = new Map<string, Log>()

const logOf = (key: string): Log => {
  const existing = logs.get(key)
  if (existing !== undefined) {
    return existing
  }
  const created: Log = { classNames: [], count: 0 }
  logs.set(key, created)
  return created
}

/**
A double for one Base UI part: counts its renders and records the className it is given.
 */
const doubles = new Map<string, unknown>()

const double = (key: string): unknown => {
  const existing = doubles.get(key)
  if (existing !== undefined) {
    return existing
  }
  const created = memo(
    forwardRef<HTMLDivElement, { className?: unknown }>((props, ref) => {
      const log = logOf(key)
      log.count += 1
      log.classNames.push(props.className)
      return createElement('div', { ref })
    }),
  )
  doubles.set(key, created)
  return created
}

/**
The module `@base-ui/react/<subpath>` is replaced with: the namespace of the doubles, or, for the
single component, the double itself.
 */
const standIn = (subpath: FeedbackSubpath): (() => Record<string, unknown>) => {
  const top = FEEDBACK_TOP[subpath] ?? ''
  return () =>
    subpath === 'separator'
      ? { [top]: double('Separator') }
      : {
          [top]: Object.fromEntries(
            (FEEDBACK_KEYS[subpath] ?? []).map((key) => [key, double(`${top}.${key}`)]),
          ),
        }
}

const loaded = new Map<string, Promise<Record<string, unknown>>>()

const wrapperModule = (subpath: FeedbackSubpath): Promise<Record<string, unknown>> => {
  const cached = loaded.get(subpath)
  if (cached !== undefined) {
    return cached
  }
  const module = loadWrapperOver(subpath, standIn(subpath))
  loaded.set(subpath, module)
  return module
}

const subpathOf = (part: string): FeedbackSubpath =>
  FEEDBACK_SUBPATHS.find((subpath) => FEEDBACK_TOP[subpath] === part.split('.', 1)[0]) ??
  FEEDBACK_SUBPATHS[0]

/**
The wrapped part named `Namespace.Part` (or `Separator`) of its module, and the double behind it.
 */
const partOf = async (part: string): Promise<unknown> => {
  const module = await wrapperModule(subpathOf(part))
  const [top = '', name] = part.split('.', 2)
  const found = name === undefined ? module[top] : (module[top] as Record<string, unknown>)[name]
  if (found === undefined) {
    throw new Error(`${part} is not exported`)
  }
  return found
}

const own = (part: string): string =>
  (FEEDBACK_TABLE_P[part] ?? []).map((name) => `nave-base-ui-${name}`).join(' ')

const consumer = (): string => 'mine'

/**
Re-renders a parent twice with the same consumer function and once with a new one, and reports
whether the double was rendered once for the first two and the className it was given stayed the
same function until the consumer function changed.
 */
const isMemoized = async (Wrapped: unknown, key: string): Promise<boolean> => {
  logs.delete(key)
  const element = (fn: () => string): ReactElement =>
    createElement(Wrapped as never, { className: fn })
  const mounted = await render(element(consumer))
  await mounted.rerender(element(consumer))
  await mounted.rerender(element(consumer))
  const log = logOf(key)
  const isSameWhileUnchanged =
    log.count === 1 && Object.is(log.classNames[0], log.classNames.at(-1))
  await mounted.rerender(element(() => 'other'))
  const isNewAfterChange = log.count === 2 && !Object.is(log.classNames[0], log.classNames.at(-1))
  return isSameWhileUnchanged && isNewAfterChange
}

// A wrapper that composes a new className function on every render.
const naive = (Part: unknown, className: string): unknown =>
  forwardRef<unknown, { className?: unknown }>((props, ref) =>
    createElement(Part as never, {
      ...props,
      className:
        typeof props.className === 'function'
          ? (state: unknown) => `${className} ${(props.className as (s: unknown) => string)(state)}`
          : className,
      ref,
    }),
  )

describe('AC-base-ui-feedback-navigation-46 (extends AC-base-ui-bridge-11): every wrapped part of the seven hands its part the same className function until the consumer function changes', () => {
  it.each(Object.keys(FEEDBACK_TABLE_P))('%s: memoized on the consumer function', async (part) => {
    expect(await isMemoized(await partOf(part), part)).toBe(true)
  })

  it.each(Object.entries(FEEDBACK_TABLE_P))(
    '%s: the function composes Nave classes %j with the consumer className, and a string className is joined after them',
    async (part, classes) => {
      const Wrapped = await partOf(part)
      expect(Wrapped).not.toBe(double(part))
      logs.delete(part)
      await render(createElement(Wrapped as never, { className: consumer }))
      const composed = logOf(part).classNames.at(-1) as (state: unknown) => string
      expect(typeof composed).toBe('function')
      expect(composed({})).toBe(`${own(part)} mine`)
      await render(createElement(Wrapped as never, { className: 'mine' }))
      expect(logOf(part).classNames.at(-1)).toBe(`${own(part)} mine`)
      await render(createElement(Wrapped as never))
      expect(logOf(part).classNames.at(-1)).toBe(own(part))
      expect(classes.length).toBeGreaterThan(0)
    },
  )

  it.each(FEEDBACK_PASS_THROUGHS)(
    '%s: a part Nave styles nothing for is exported as Base UI part itself, not wrapped',
    async (part) => {
      expect(await partOf(part)).toBe(double(part))
    },
  )

  it('control: a wrapper that composes a new function on every render is reported', async () => {
    const Wrapped = naive(double('naive'), 'nave-x')
    expect(await isMemoized(Wrapped, 'naive')).toBe(false)
  })

  it('places every key of the seven in exactly one of Table P and Table T0, and the two tables name nothing else', () => {
    const everyKey = Object.entries(FEEDBACK_KEYS).flatMap(([subpath, keys]) =>
      keys.map((key) => `${FEEDBACK_TOP[subpath] ?? ''}.${key}`),
    )
    const placed = [...Object.keys(FEEDBACK_TABLE_P), ...FEEDBACK_PASS_THROUGHS].filter(
      (part) => part !== 'Separator',
    )
    expect(placed.toSorted(byCodeUnit)).toEqual(everyKey.toSorted(byCodeUnit))
    expect(new Set(placed).size).toBe(placed.length)
    expect(Object.keys(FEEDBACK_TABLE_P)).toContain('Separator')
  })
})
