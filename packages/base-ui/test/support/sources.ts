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
}

const load = async (loaders: Loaders): Promise<Source> => {
  const entries = await Promise.all(
    Object.entries(loaders).map(async ([subpath, loader]) => {
      const module = await loader()
      return [subpath, module[topName(subpath)] as Ui] as const
    }),
  )
  const byName = new Map(entries)
  return (subpath) => {
    const ui = byName.get(subpath)
    if (ui === undefined) {
      throw new Error(`no component for the subpath ${subpath}`)
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
export const loadNave = (): Promise<Source> => load(naveLoaders)
