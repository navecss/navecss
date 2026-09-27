/**
 * DTCG 2025.10 `$`-prefixed keys this reader recognises by name, and by specification section,
 * but does not read yet. `reader.ts`'s generic `$`-prefixed refusal says a key "is not a valid
 * token or group name", which is true of a typo or an attempt to name something "$something"
 * but false of these two: DTCG 2025.10 defines both. Checked before the generic refusal, so a
 * source using one gets a refusal naming the syntax and its conversion instead.
 */

interface UnsupportedReservedKey {
  readonly key: string
  readonly reason: string
}

const UNSUPPORTED_RESERVED_KEYS: readonly UnsupportedReservedKey[] = [
  {
    key: '$root',
    reason:
      'DTCG 2025.10 §6.2 "Root Tokens in Groups". Move its $value to a sibling token with an ' +
      'ordinary name (for example "base") and alias that instead: {group.base}.',
  },
  {
    key: '$extends',
    reason:
      'DTCG 2025.10 §6.4 "Extending Groups". Copy the extended group\'s tokens into this group, ' +
      'or alias them individually with {group.token}.',
  },
]

/**
 * Throws naming `key` (recognised at path `at`) as not yet supported by this reader, with its
 * own conversion instruction, when `key` is one of `UNSUPPORTED_RESERVED_KEYS`; a no-op for
 * every other `$`-prefixed key, which `reader.ts`'s own generic refusal covers.
 */
export function refuseUnsupportedReservedKey(key: string, at: string): void {
  const found = UNSUPPORTED_RESERVED_KEYS.find((entry) => entry.key === key)
  if (found === undefined) return
  throw new TypeError(
    `DTCG 2025.10 reader: "${at}" uses "${key}", which this reader does not support yet (${found.reason})`,
  )
}
