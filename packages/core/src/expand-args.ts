/**
 * The arguments of `navecss-core expand`: repeated `--source=` and `--out=` pairs matched by
 * order, an optional `--extend=<module>`, and `--watch`. Everything wrong with them is one
 * usage message, so the command can print it and exit 2 before it reads a file.
 */
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

export interface ExpandPair {
  readonly out: string
  readonly source: string
}

export interface ExpandJob {
  readonly extend: string | undefined
  readonly pairs: readonly ExpandPair[]
  readonly watch: boolean
}

export type ParsedExpand =
  | { readonly job: ExpandJob; readonly kind: 'job' }
  | { readonly kind: 'usageError'; readonly message: string }

/**
 * What `parseArgs` read, before the values are judged as a set of pairs.
 */
interface RawValues {
  readonly extend: string | undefined
  readonly out: string[]
  readonly source: string[]
  readonly watch: boolean
}

/**
 * The values of `args`, or the one-line reason they could not be read.
 */
function readValues(args: readonly string[]): RawValues | string {
  try {
    const { values, positionals } = parseArgs({
      args: [...args],
      options: {
        extend: { type: 'string', multiple: true },
        out: { type: 'string', multiple: true },
        source: { type: 'string', multiple: true },
        watch: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: true,
    })
    if (positionals.length > 0) {
      return `expand does not take a positional argument: ${positionals[0]}`
    }
    if ((values.extend?.length ?? 0) > 1) return 'expand takes one --extend.'
    return {
      extend: values.extend?.[0],
      out: values.out ?? [],
      source: values.source ?? [],
      watch: values.watch === true,
    }
  } catch (error) {
    return `expand: ${(error as Error).message.split('\n', 1)[0]}`
  }
}

/**
 * Whether two paths are one file: the same path, or (when both exist) the same file on disk, so a
 * symlink or a hard link to a source is caught as well as its own name.
 */
function isSameFile(first: string, second: string): boolean {
  if (path.resolve(first) === path.resolve(second)) return true
  if (!existsSync(first) || !existsSync(second)) return false
  const a = statSync(first)
  const b = statSync(second)
  return a.dev === b.dev && a.ino === b.ino
}

/**
 * The first thing wrong with the values as a set of file pairs, or `undefined`.
 */
function problemWith(raw: RawValues): string | undefined {
  if (raw.source.length === 0) return 'expand requires at least one --source=<file>.'
  if (raw.out.length === 0) return 'expand requires --out=<file> for each --source.'
  if (raw.source.length !== raw.out.length) {
    return `expand takes one --out for each --source, matched by order: got ${raw.source.length} --source and ${raw.out.length} --out.`
  }
  if ([...raw.source, ...raw.out, raw.extend ?? '.'].includes('')) {
    return 'expand: a --source, --out or --extend value is empty.'
  }
  const outs = raw.out.map((file) => path.resolve(file))
  const inputs = [
    ...raw.source.map((file) => ({ file, name: 'a --source' })),
    ...(raw.extend === undefined ? [] : [{ file: raw.extend, name: 'the --extend module' }]),
  ]
  for (const out of outs) {
    const input = inputs.find(({ file }) => isSameFile(file, out))
    if (input !== undefined) {
      return `expand: --out ${out} is also ${input.name}; it would overwrite its own input.`
    }
  }
  if (new Set(outs).size !== outs.length)
    return 'expand: two files would be written to the same --out.'
  return undefined
}

/**
 * The job `navecss-core expand`'s arguments describe, or the one usage message that says what is
 * wrong with them.
 */
export function parseExpandArgs(args: readonly string[]): ParsedExpand {
  const raw = readValues(args)
  if (typeof raw === 'string') return { kind: 'usageError', message: raw }
  const problem = problemWith(raw)
  if (problem !== undefined) return { kind: 'usageError', message: problem }
  return {
    kind: 'job',
    job: {
      extend: raw.extend,
      pairs: raw.source.map((source, index) => ({ source, out: raw.out[index]! })),
      watch: raw.watch,
    },
  }
}
