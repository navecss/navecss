/**
 * Whether two declaration values of the SAME property are the same value to the browser's
 * reader, judged on their token sequences (`tokenize`) after three normalisations: comments
 * are dropped, a run of whitespace is one separator (and leading or trailing whitespace is
 * ignored), and function names are ASCII-lowercased, a dashed one (`--x(`, a custom function)
 * excepted because its name is case-sensitive. The case of an ident is never folded, a
 * keyword's included: `Foo` and `foo` name two keyframes or two grid areas, a custom property's
 * value is an arbitrary token stream, and `RED` against `red` costs only an extra warning, the
 * direction this check errs in. Every other token (a number, a dimension and its unit, a hash,
 * a string, a url) compares exactly as written. Anything this does not prove equal is unequal.
 */
import { type Token, tokenize } from './tokenizer.ts'

/**
 * The name with its ASCII letters lowercased and nothing else changed.
 */
function foldAscii(name: string): string {
  return name.replaceAll(/[A-Z]+/g, (letters) => letters.toLowerCase())
}

/**
 * The comparison key of one token: its type and its text, with a function name lowercased unless
 * it is dashed.
 */
function tokenKey(token: Token): string {
  if (token.type === 'whitespace-token') return 'ws'
  const isFoldable = token.type === 'function-token' && !token.raw.startsWith('--')
  return `${token.type}:${isFoldable ? foldAscii(token.raw) : token.raw}`
}

/**
 * The keys of `value`'s tokens with comments removed and whitespace collapsed to a single
 * separator, trimmed at both ends.
 */
function normalizedKeys(value: string): string[] {
  const keys: string[] = []
  for (const token of tokenize(value)) {
    if (token.type === 'comment') continue
    const key = tokenKey(token)
    if (key === 'ws' && (keys.length === 0 || keys.at(-1) === 'ws')) continue
    keys.push(key)
  }
  if (keys.at(-1) === 'ws') keys.pop()
  return keys
}

/**
 * A string that is identical for two values exactly when `declarationValuesEqual` holds for
 * them: the normalised token keys, serialised unambiguously.
 */
export function normalizeValueForCompare(value: string): string {
  return JSON.stringify(normalizedKeys(value))
}

/**
 * True when `a` and `b`, the values of one property, are equal token for token after
 * comments, whitespace runs and the case of non-dashed function names are normalised away.
 */
// eslint-disable-next-line unicorn/consistent-boolean-name -- the name states the proposition the caller asks
export function declarationValuesEqual(a: string, b: string): boolean {
  return normalizeValueForCompare(a) === normalizeValueForCompare(b)
}
