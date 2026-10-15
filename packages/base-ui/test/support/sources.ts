/**
 * The two sources a scene renders from: Base UI's own components, and the wrapped ones in `src/`.
 * Written as literal import specifiers so the run's aliases (the Base UI floor, React 18) apply to
 * both, and so a wrapper's own `@base-ui/react` imports resolve to the same Base UI as the bare ones.
 */
import type { Source, Ui } from './scenes.ts'

import { topName } from './subpaths.ts'

type Loaders = Readonly<Record<string, () => Promise<Record<string, unknown>>>>

const bareLoaders: Loaders = {
  dialog: () => import('@base-ui/react/dialog'),
  popover: () => import('@base-ui/react/popover'),
  menu: () => import('@base-ui/react/menu'),
  select: () => import('@base-ui/react/select'),
  tooltip: () => import('@base-ui/react/tooltip'),
  accordion: () => import('@base-ui/react/accordion'),
  collapsible: () => import('@base-ui/react/collapsible'),
  tabs: () => import('@base-ui/react/tabs'),
  button: () => import('@base-ui/react/button'),
  input: () => import('@base-ui/react/input'),
  'number-field': () => import('@base-ui/react/number-field'),
  field: () => import('@base-ui/react/field'),
  fieldset: () => import('@base-ui/react/fieldset'),
  form: () => import('@base-ui/react/form'),
  checkbox: () => import('@base-ui/react/checkbox'),
  'checkbox-group': () => import('@base-ui/react/checkbox-group'),
  radio: () => import('@base-ui/react/radio'),
  'radio-group': () => import('@base-ui/react/radio-group'),
  switch: () => import('@base-ui/react/switch'),
  slider: () => import('@base-ui/react/slider'),
  toggle: () => import('@base-ui/react/toggle'),
  'toggle-group': () => import('@base-ui/react/toggle-group'),
  toolbar: () => import('@base-ui/react/toolbar'),
  'alert-dialog': () => import('@base-ui/react/alert-dialog'),
  'context-menu': () => import('@base-ui/react/context-menu'),
  menubar: () => import('@base-ui/react/menubar'),
  'preview-card': () => import('@base-ui/react/preview-card'),
  combobox: () => import('@base-ui/react/combobox'),
  autocomplete: () => import('@base-ui/react/autocomplete'),
  toast: () => import('@base-ui/react/toast'),
  'navigation-menu': () => import('@base-ui/react/navigation-menu'),
  'scroll-area': () => import('@base-ui/react/scroll-area'),
  meter: () => import('@base-ui/react/meter'),
  progress: () => import('@base-ui/react/progress'),
  avatar: () => import('@base-ui/react/avatar'),
  separator: () => import('@base-ui/react/separator'),
}

const naveLoaders: Loaders = {
  dialog: () => import('../../src/dialog/index.ts'),
  popover: () => import('../../src/popover/index.ts'),
  menu: () => import('../../src/menu/index.ts'),
  select: () => import('../../src/select/index.ts'),
  tooltip: () => import('../../src/tooltip/index.ts'),
  accordion: () => import('../../src/accordion/index.ts'),
  collapsible: () => import('../../src/collapsible/index.ts'),
  tabs: () => import('../../src/tabs/index.ts'),
  button: () => import('../../src/button/index.ts'),
  input: () => import('../../src/input/index.ts'),
  'number-field': () => import('../../src/number-field/index.ts'),
  field: () => import('../../src/field/index.ts'),
  fieldset: () => import('../../src/fieldset/index.ts'),
  form: () => import('../../src/form/index.ts'),
  checkbox: () => import('../../src/checkbox/index.ts'),
  'checkbox-group': () => import('../../src/checkbox-group/index.ts'),
  radio: () => import('../../src/radio/index.ts'),
  'radio-group': () => import('../../src/radio-group/index.ts'),
  switch: () => import('../../src/switch/index.ts'),
  slider: () => import('../../src/slider/index.ts'),
  toggle: () => import('../../src/toggle/index.ts'),
  'toggle-group': () => import('../../src/toggle-group/index.ts'),
  toolbar: () => import('../../src/toolbar/index.ts'),
  'alert-dialog': () => import('../../src/alert-dialog/index.ts'),
  'context-menu': () => import('../../src/context-menu/index.ts'),
  menubar: () => import('../../src/menubar/index.ts'),
  'preview-card': () => import('../../src/preview-card/index.ts'),
  combobox: () => import('../../src/combobox/index.ts'),
  autocomplete: () => import('../../src/autocomplete/index.ts'),
}

/**
The seven wrapper subpaths of the feedback and navigation spec. Loaded apart from the rest: a
subpath that is not built yet must fail the test that asks for it, naming the import error, and
not every scene of the other 29. The specifier is computed, because a transform that cannot resolve
a literal one fails the whole file; the module runner resolves it relative to this file at run time
and applies the run's aliases to everything the module imports, as it does for a literal one.
 */
const feedbackModule = (subpath: string): (() => Promise<Record<string, unknown>>) => {
  return () => import(/* @vite-ignore */ `../../src/${subpath}/index.ts`)
}

const naveFeedbackLoaders: Loaders = Object.fromEntries(
  ['toast', 'navigation-menu', 'scroll-area', 'meter', 'progress', 'avatar', 'separator'].map(
    (subpath) => [subpath, feedbackModule(subpath)],
  ),
)

const loadEach = async (loaders: Loaders): Promise<Map<string, Ui>> =>
  new Map(
    await Promise.all(
      Object.entries(loaders).map(async ([subpath, loader]) => {
        const module = await loader()
        return [subpath, module[topName(subpath)] as Ui] as const
      }),
    ),
  )

/**
 * The loaders that may fail without failing the load: each failure is kept by subpath and thrown,
 * with its own message, by the lookup of that subpath.
 */
const loadEachOrKeepError = async (
  loaders: Loaders,
): Promise<{ failures: Map<string, unknown>; found: Map<string, Ui> }> => {
  const failures = new Map<string, unknown>()
  const found = new Map<string, Ui>()
  await Promise.all(
    Object.entries(loaders).map(async ([subpath, loader]) => {
      try {
        const module = await loader()
        found.set(subpath, module[topName(subpath)] as Ui)
      } catch (error) {
        failures.set(subpath, error)
      }
    }),
  )
  return { failures, found }
}

const load = async (loaders: Loaders, optional: Loaders = {}): Promise<Source> => {
  const byName = await loadEach(loaders)
  const { failures, found } = await loadEachOrKeepError(optional)
  return (subpath) => {
    const ui = byName.get(subpath) ?? found.get(subpath)
    if (ui === undefined) {
      const reason = failures.get(subpath)
      throw new Error(
        `no component for the subpath ${subpath}${reason instanceof Error ? `: ${reason.message}` : ''}`,
      )
    }
    return ui
  }
}

/**
Base UI's components, from the Base UI the run installed.
 */
export const loadBare = (): Promise<Source> => load(bareLoaders)

/**
The wrapped components of this package's source.
 */
export const loadNave = (): Promise<Source> => load(naveLoaders, naveFeedbackLoaders)
