/**
 * AC-base-ui-registry-26: Vite's build keeps, for the Dialog copy, the layer order, every
 * `:focus-visible` rule, every `outline` declaration and every reduced-motion guard. The consumer
 * app was built by `vite build` (minified, no configuration of its own) with the copy's files beside
 * its entry and the package imported next to them (`support/registry-consumer-app.global-setup.ts`);
 * its stylesheet is read here by the engine, which reads a lowered or merged rule the way it reads a
 * nested one.
 */
import { describe, expect, it } from 'vitest'

import type { BuiltApp, RegistryApps } from '../support/registry/browser-paths.ts'

import {
  type Fact,
  factsOf,
  hashedClasses,
  layersInOrder,
  localized,
} from '../support/registry/browser-built-css.ts'
import { requiredApps } from '../support/registry/browser-injected.ts'
import { isReachedWithin, MAX_FRAMES } from './support/frames.ts'

const builtOf = (app: BuiltApp | undefined, label: string): BuiltApp => {
  if (app === undefined) throw new Error(`the ${label} build did not run`)
  expect(app.exitCode, `${label} vite build: ${app.output}`).toBe(0)
  expect(app.cssFiles.length, `the stylesheets the ${label} build wrote`).toBeGreaterThan(0)
  return app
}

const textOf = async (file: string): Promise<string> => {
  const response = await fetch(file)
  return response.text()
}

const builtCss = async (app: BuiltApp): Promise<string> => {
  const texts = await Promise.all(app.cssFiles.map((file) => textOf(file)))
  return texts.join('\n')
}

const REDUCED_MOTION = 'prefers-reduced-motion'

const isFocusRule = (fact: Fact): boolean => fact.selector.includes(':focus-visible')
const isGuard = (fact: Fact): boolean => fact.media.some((query) => query.includes(REDUCED_MOTION))
const isOutline = (fact: Fact): boolean => fact.declarations.has('outline-style')
const isKept = (fact: Fact): boolean => isFocusRule(fact) || isGuard(fact) || isOutline(fact)

/**
The local names of the classes a module styles.
 */
const localsOf = (facts: readonly Fact[]): string[] => [
  ...new Set(
    facts.flatMap(({ selector }) =>
      selector
        .matchAll(/\.([A-Za-z][A-Za-z0-9-]*)/g)
        .map((match) => match[1]!)
        .toArray(),
    ),
  ),
]

const keyOf = ({ layers, media, selector }: Fact): string =>
  JSON.stringify([layers, media, selector])

const layersOfKey = (key: string): string[] => (JSON.parse(key) as string[][])[0]!
const mediaOfKey = (key: string): string[] => (JSON.parse(key) as string[][])[1]!

/**
Each rule of the copy's classes in the built sheet, under the local name, its declarations gathered
across the rules the minifier may have merged or split.
 */
const copyRulesOf = (css: string, locals: readonly string[]): Map<string, Map<string, string>> => {
  const gathered = new Map<string, Map<string, string>>()
  for (const fact of factsOf(css)) {
    const selector = localized(fact.selector, locals)
    if (selector === fact.selector) continue
    const key = keyOf({ ...fact, selector })
    gathered.set(key, new Map([...(gathered.get(key) ?? []), ...fact.declarations]))
  }
  return gathered
}

/**
What the module carries of the four things that the build did not keep, each as a line naming the
rule and the declaration.
 */
const lostFrom = (moduleCss: string, built: string): string[] => {
  const facts = factsOf(moduleCss)
  const rules = copyRulesOf(built, localsOf(facts))
  return facts
    .filter((fact) => isKept(fact))
    .flatMap((fact) => {
      const kept = rules.get(keyOf(fact))
      const where = `${fact.layers.join(' ')} ${fact.media.join(' ')} ${fact.selector}`.trim()
      if (kept === undefined) return [`${where}: no such rule in the build`]
      return [...fact.declarations]
        .filter(([name, value]) => kept.get(name) !== value)
        .map(([name, value]) => `${where}: ${name} is ${kept.get(name) ?? 'absent'}, not ${value}`)
    })
}

const loadApp = async (url: string): Promise<{ frame: HTMLIFrameElement; window: Window }> => {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'width: 800px; height: 600px; border: 0'
  document.body.append(frame)
  await new Promise<void>((resolve, reject) => {
    frame.addEventListener('load', () => {
      resolve()
    })
    frame.addEventListener('error', () => {
      reject(new Error(`${url} did not load`))
    })
    frame.src = url
  })
  return { frame, window: frame.contentWindow! }
}

const popupsOf = (
  window: Window,
): { copy: HTMLElement | undefined; packaged: HTMLElement | undefined } => ({
  copy: window.document.querySelector<HTMLElement>('#the-copy-dialog') ?? undefined,
  packaged: window.document.querySelector<HTMLElement>('#the-dialog') ?? undefined,
})

interface Builds {
  readonly apps: RegistryApps
  readonly guardRemoved: BuiltApp
  readonly normal: BuiltApp
}

/**
The two builds, checked to have succeeded. Called by each test, so an absent registry fails each.
 */
const builds = (): Builds => {
  const apps = requiredApps()
  return {
    apps,
    guardRemoved: builtOf(apps.guardRemoved, 'guard-removed'),
    normal: builtOf(apps.normal, 'normal'),
  }
}

describe("AC-base-ui-registry-26: Vite's build keeps the layers, the focus rules, the outlines and the motion guards of the copy", () => {
  it('AC-base-ui-registry-26: the module carries focus rules, outline declarations and guards', () => {
    const { apps } = builds()
    const facts = factsOf(apps.moduleCss)
    expect(facts.filter((fact) => isFocusRule(fact)).length, 'focus rules').toBeGreaterThan(0)
    expect(facts.filter((fact) => isOutline(fact)).length, 'outline declarations').toBeGreaterThan(
      0,
    )
    expect(facts.filter((fact) => isGuard(fact)).length, 'guards').toBeGreaterThan(0)
  })

  it("AC-base-ui-registry-26: before any other layer, the built stylesheet registers Nave's seven in Nave's order", async () => {
    const { apps, normal } = builds()
    expect(apps.layerNames.length, 'the layer order statement').toBe(7)
    const layers = layersInOrder(await builtCss(normal))
    expect(layers.slice(0, apps.layerNames.length)).toEqual(apps.layerNames)
  })

  it('AC-base-ui-registry-26: every focus rule, outline declaration and guard is kept in components.consumer', async () => {
    const { apps, normal } = builds()
    const built = await builtCss(normal)
    expect(lostFrom(apps.moduleCss, built)).toEqual([])
    const rules = copyRulesOf(built, localsOf(factsOf(apps.moduleCss)))
    expect(rules.size, "the copy's rules in the build").toBeGreaterThan(0)
    expect(
      rules
        .keys()
        .filter((key) => layersOfKey(key).join(' ') !== 'components.consumer')
        .toArray(),
      'a rule of the copy outside components.consumer',
    ).toEqual([])
  })

  it("AC-base-ui-registry-26: control: the build without the module's guard has no guard for its classes", async () => {
    const { apps, guardRemoved, normal } = builds()
    const locals = localsOf(factsOf(apps.moduleCss))
    const guardsIn = (css: string): number =>
      copyRulesOf(css, locals)
        .keys()
        .filter((key) => mediaOfKey(key).some((query) => query.includes(REDUCED_MOTION)))
        .toArray().length
    const expected = factsOf(apps.moduleCss).filter((fact) => isGuard(fact)).length
    expect(guardsIn(await builtCss(normal)), 'the guards the normal build keeps').toBe(expected)
    const without = await builtCss(guardRemoved)
    expect(guardsIn(without), 'the guards the guard-removed build keeps').toBe(0)
    expect(
      lostFrom(apps.moduleCss, without).filter((line) => line.includes(REDUCED_MOTION)).length,
      'the lines that name a lost guard',
    ).toBe(expected)
  })

  it('AC-base-ui-registry-26: the built app renders the copy with the scoped classes and paints it as the package does', async () => {
    const { apps, normal } = builds()
    const built = await builtCss(normal)
    const locals = localsOf(factsOf(apps.moduleCss))
    const { frame, window } = await loadApp(normal.url)
    try {
      await isReachedWithin(() => {
        const popups = popupsOf(window)
        return popups.copy !== undefined && popups.packaged !== undefined
      }, MAX_FRAMES)
      const { copy, packaged } = popupsOf(window)
      expect(copy, 'the copy renders').toBeDefined()
      expect(packaged, 'the package renders').toBeDefined()
      const classes = [...copy!.classList]
      expect(classes.length, "the copy popup's classes").toBeGreaterThan(0)
      for (const name of classes) {
        const owners = locals.filter((local) => hashedClasses(built, local).includes(`.${name}`))
        expect(owners.length, `${name} is a class the build scoped for the module`).toBe(1)
      }
      expect(window.getComputedStyle(copy!).backgroundColor).toBe(
        window.getComputedStyle(packaged!).backgroundColor,
      )
    } finally {
      frame.remove()
    }
  })
})
