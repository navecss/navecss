/**
 * Generates what the three-engine test renders, GITIGNORED and regenerated before every
 * `test:browser:engines` run (never committed, same treatment as `dist/` and the other generated
 * fixtures beside it): for each row of `test/helpers/native-order-engine-rows.ts`, the CSS a real
 * `vite build` with the plugin emitted (default transformer, Vite's default targets) and the CSS
 * the PostCSS host printed.
 *
 * Node-only, deliberately: a browser test cannot run `vite build`. Every row is its own entry of
 * one build, so its stylesheet comes out as its own file and rows do not share a cascade. Each
 * build is written as `engines/<row index>-vite.css` and `engines/<row index>-postcss.css`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { build } from 'vite'

import { navePlugin as postcssPlugin } from '../src/postcss.ts'
import { navePlugin as vitePlugin } from '../src/vite.ts'
import { ENGINE_ROWS } from '../test/helpers/native-order-engine-rows.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.resolve(HERE, '../test/browser/fixtures')

/**
 * The stylesheet each row builds to under a real `vite build`, by row index.
 */
async function builtByVite(): Promise<string[]> {
  const root = mkdtempSync(path.join(HERE, '..', '.nave-vite-engines-'))
  try {
    mkdirSync(path.join(root, 'src'))
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>')
    const input: Record<string, string> = {}
    for (const [index, row] of ENGINE_ROWS.entries()) {
      const entry = `row${index}`
      writeFileSync(path.join(root, 'src', `${entry}.css`), `${row.rule}\n`)
      writeFileSync(path.join(root, 'src', `${entry}.js`), `import './${entry}.css'\n`)
      input[entry] = path.join(root, 'src', `${entry}.js`)
    }
    const result = await build({
      root,
      cacheDir: path.join(root, '.vite'),
      configFile: false,
      logLevel: 'silent',
      plugins: [vitePlugin()],
      build: {
        write: false,
        rollupOptions: {
          input,
          output: { assetFileNames: '[name][extname]', entryFileNames: '[name].js' },
        },
      },
    })
    const outputs = (Array.isArray(result) ? result : [result]) as unknown as {
      output: { fileName: string; source?: string }[]
    }[]
    const files = new Map(
      outputs.flatMap((o) => o.output).map((file) => [file.fileName, file.source] as const),
    )
    return ENGINE_ROWS.map((row, index) => {
      const css = files.get(`row${index}.css`)
      if (typeof css !== 'string' || css.trim() === '') {
        throw new Error(`the Vite build wrote no stylesheet for ${row.id}`)
      }
      return css
    })
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
}

/**
 * The PostCSS host's output for every row, by row index.
 */
async function builtByPostcss(): Promise<string[]> {
  return Promise.all(
    ENGINE_ROWS.map(async (row) => {
      const result = await postcss([postcssPlugin()]).process(row.rule, { from: undefined })
      return result.css
    }),
  )
}

const [vite, viaPostcss] = await Promise.all([builtByVite(), builtByPostcss()])
const engines = path.join(FIXTURES_DIR, 'engines')
rmSync(engines, { force: true, recursive: true })
mkdirSync(engines, { recursive: true })
for (const index of ENGINE_ROWS.keys()) {
  writeFileSync(path.join(engines, `${index}-vite.css`), vite[index]!, 'utf8')
  writeFileSync(path.join(engines, `${index}-postcss.css`), viaPostcss[index]!, 'utf8')
}
