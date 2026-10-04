/**
 * The arguments of `navecss-core expand`: repeated `--source=` and `--out=` pairs matched by
 * order, an optional `--extend=<module>`, and `--watch`. Everything wrong with them is one
 * usage message, so the command can print it and exit 2 before it reads a file.
 */
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
        extend: { type: 'string' },
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
    return {
      extend: values.extend,
      out: values.out ?? [],
      source: values.source ?? [],
      watch: values.watch === true,
    }
  } catch (error) {
    return `expand: ${(error as Error).message.split('\n', 1)[0]}`
  }
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
  const sources = new Set(raw.source.map((file) => path.resolve(file)))
  const outs = raw.out.map((file) => path.resolve(file))
  const overwritten = outs.find((out) => sources.has(out))
  if (overwritten !== undefined) {
    return `expand: --out ${overwritten} is also a --source; it would overwrite its own input.`
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
