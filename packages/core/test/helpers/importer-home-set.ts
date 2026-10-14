/**
 * Importers of a listed module that reach both remedy sentences naming the place the options are
 * written: an application file with a specifier that is not relative, so the `cxModules` array
 * line prints, and a file in a dependency with no `keepFor` line above it.
 */
import type { ListedImporter } from '../../src/vite-cx-module-importers.ts'

export const IMPORTERS: readonly ListedImporter[] = [
  {
    importer: '/app/src/page.ts',
    label: 'src/page.ts',
    entry: './src/cx.ts',
    specifiers: ['@/cx'],
    replacement: './cx.ts',
    pkg: undefined,
  },
  {
    importer: '/app/node_modules/acme-ui/dist/button.js',
    label: 'node_modules/acme-ui/dist/button.js',
    entry: './src/cx.ts',
    specifiers: ['../cx.js'],
    replacement: '',
    pkg: 'acme-ui',
  },
]

export const CONFIGURED_IMPORTER_MODULES: readonly string[] = ['./src/cx.ts']
