/**
 * Runs the registry build's own entry point as a process on a set with one bad file planted in
 * `base-ui-dialog`, through the `mutate` seam that receives the items before they are validated.
 *
 *   node struct-plant.ts <retype | retarget | none> <output directory>
 *
 * `retype` types one file `registry:ui`; `retarget` points another at `@components/nave/x.ts`;
 * `none` plants nothing. The output goes to the given directory, never to `dist/registry/`.
 */
import { main } from '../../../scripts/generate-registry.ts'

interface PlantedFile {
  path: string
  target: string
  type: string
}

interface PlantedItem {
  files: PlantedFile[]
  name: string
}

const PLANTED_NOTHING = 'PLANT-FAILED'

const fileOf = (item: PlantedItem, base: string): PlantedFile => {
  const file = item.files.find((candidate) => candidate.path.endsWith(base))
  if (file === undefined) throw new Error(`${PLANTED_NOTHING}: the item has no file ${base}`)
  return file
}

const plant = (mode: string, items: PlantedItem[]): void => {
  if (mode === 'none') return
  const dialog = items.find((item) => item.name === 'base-ui-dialog')
  if (dialog === undefined) throw new Error(`${PLANTED_NOTHING}: no dialog item`)
  if (mode === 'retype') fileOf(dialog, 'nave-dialog.wrap.ts').type = 'registry:ui'
  else if (mode === 'retarget') {
    fileOf(dialog, 'nave-dialog.module.css').target = '@components/nave/x.ts'
  } else throw new Error(`${PLANTED_NOTHING}: unknown mode ${mode}`)
}

const [mode = '', out = ''] = process.argv.slice(2)
if (out === '') throw new Error(`${PLANTED_NOTHING}: no output directory`)
process.argv.push('--out', out)

try {
  const result: unknown = await main({
    mutate: (items: PlantedItem[]) => {
      plant(mode, items)
      return items
    },
    out,
  })
  if (typeof result === 'number') process.exitCode = result
} catch (error) {
  // eslint-disable-next-line no-console -- the runner is a child process, and its failure goes to stderr for the test that reads it
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
