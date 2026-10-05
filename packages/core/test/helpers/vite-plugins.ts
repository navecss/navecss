/**
 * The framework plugins the coverage fixture runs beside the Nave plugin, in the order a
 * project lists them: Vue and Svelte first, then the plugin under test, so each framework has
 * compiled its own style blocks by the time Nave's transform reads them.
 */
import type { PluginOption } from 'vite'

import { svelte } from '@sveltejs/vite-plugin-svelte'
import vuePlugin from '@vitejs/plugin-vue'

/**
 * `[vue(), svelte(), ...rest]`. Named for the first because the helper that wires it in is the
 * place that decides plugin order for every fixture.
 */
export function vue(...rest: PluginOption[]): PluginOption[] {
  return [vuePlugin(), ...svelte(), ...rest]
}
