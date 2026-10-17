/**
 * Loading a copy in the page: its entry imported through the dev server (the copy is source, so the
 * server transforms it as it would a consumer's own file), and its CSS Module's stylesheet taken out
 * of the head so a test decides where in the document it goes.
 */
import type { Source, Ui } from '../scenes.ts'

import { loadBare } from '../sources.ts'
import { SUBPATHS, topName } from '../subpaths.ts'
import { COPIES_URL } from './browser-paths.ts'

export interface LoadedCopy {
  /**
  The module's stylesheet as the server transformed it (class names scoped), for a sheet.
   */
  readonly css: string
  /**
  The entry's one runtime export: the namespace of parts, or the component itself.
   */
  readonly ui: Ui
}

const copies = new Map<string, Promise<LoadedCopy>>()

const injectedStyle = (folder: string, subpath: string): HTMLStyleElement | undefined =>
  [...document.head.querySelectorAll<HTMLStyleElement>('style[data-vite-dev-id]')].find((style) =>
    style.dataset.viteDevId?.endsWith(`/${folder}/nave-${subpath}.module.css`),
  )

const importCopy = async (folder: string, subpath: string): Promise<LoadedCopy> => {
  const base = `${COPIES_URL}/${folder}`
  const module = (await import(/* @vite-ignore */ `${base}/nave-${subpath}.ts`)) as Record<
    string,
    unknown
  >
  await import(/* @vite-ignore */ `${base}/nave-${subpath}.module.css`)
  const style = injectedStyle(folder, subpath)
  if (style === undefined) {
    throw new Error(`the server injected no stylesheet for ${folder}/nave-${subpath}.module.css`)
  }
  const css = style.textContent
  style.remove()
  return { css, ui: module[topName(subpath)] as Ui }
}

/**
Imports a copy once. The stylesheet the server injected for its module is taken out of the head: the
tests put it back, in the order they are about.
 */
export const loadCopy = (folder: string, subpath: string): Promise<LoadedCopy> => {
  const key = `${folder}/${subpath}`
  const known = copies.get(key)
  if (known !== undefined) return known
  const started = importCopy(folder, subpath)
  copies.set(key, started)
  return started
}

const loadPackage = async (): Promise<Source> => {
  const entries = await Promise.all(
    SUBPATHS.map(async (subpath) => {
      const module = (await import(`../../../dist/${subpath}/index.js`)) as Record<string, unknown>
      return [subpath, module[topName(subpath)] as Ui] as const
    }),
  )
  const byName = new Map(entries)
  return (subpath) => {
    const ui = byName.get(subpath as never)
    if (ui === undefined) throw new Error(`the package has no component for ${subpath}`)
    return ui
  }
}

const once = <Value>(make: () => Promise<Value>): (() => Promise<Value>) => {
  let started: Promise<Value> | undefined
  return () => (started ??= make())
}

/**
The package's built components, as a scene's source.
 */
export const packageComponents = once(loadPackage)

/**
Base UI's own components, as a scene's source.
 */
export const bareComponents = (): Promise<Source> => loadBare()

/**
A source that takes one subpath from the copy and every other from the package.
 */
export const withCopy =
  (base: Source, subpath: string, copy: LoadedCopy): Source =>
  (name) =>
    name === subpath ? copy.ui : base(name)
