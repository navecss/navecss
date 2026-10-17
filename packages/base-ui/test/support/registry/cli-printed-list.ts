/**
 * Reading what `shadcn add` prints about the files it handled: a heading (`Created 5 files:`,
 * `Updated 1 file:`, `Skipped 1 file: (...)`) followed by one `  - <path>` line per file.
 */
export interface PrintedLists {
  readonly created: string[]
  readonly skipped: string[]
  readonly updated: string[]
}

const HEADING = /^[^\w\n]*\s*(Created|Updated|Skipped) (\d+) files?:/
const ENTRY = /^ {2}- (.+)$/

const section = (word: string): keyof PrintedLists => {
  if (word === 'Created') return 'created'
  return word === 'Updated' ? 'updated' : 'skipped'
}

/**
 * Parses the CLI's output. A heading whose count disagrees with the lines under it is an error:
 * the lines are what a reader of the README is told to read.
 */
export const parsePrintedLists = (output: string): PrintedLists => {
  const lists: PrintedLists = { created: [], skipped: [], updated: [] }
  let current: string[] | undefined
  let announced = 0
  const close = (): void => {
    if (current !== undefined && current.length !== announced) {
      throw new Error(`the CLI announced ${announced} files and printed ${current.length}`)
    }
    current = undefined
  }
  for (const line of output.split('\n')) {
    const heading = HEADING.exec(line)
    if (heading !== null) {
      close()
      current = lists[section(heading[1] ?? '')]
      announced = Number(heading[2])
      continue
    }
    const entry = ENTRY.exec(line)
    if (entry !== null && current !== undefined) current.push(entry[1] ?? '')
    else if (entry === null) close()
  }
  close()
  return lists
}
