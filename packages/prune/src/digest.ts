import { createHash } from 'node:crypto'

/**
 * A short content digest.
 */
export function digestOf(text: string | Uint8Array): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 24)
}
