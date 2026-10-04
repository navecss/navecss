/**
 * A byte order mark is not part of a stylesheet's text: a host counts positions after it and puts
 * it back first, so what it writes starts as the file did.
 */
const BYTE_ORDER_MARK = '\u{FEFF}'

/**
 * `raw` without a leading byte order mark, and the mark itself (empty when there was none).
 */
export function splitByteOrderMark(raw: string): { readonly bom: string; readonly text: string } {
  return raw.startsWith(BYTE_ORDER_MARK)
    ? { bom: BYTE_ORDER_MARK, text: raw.slice(BYTE_ORDER_MARK.length) }
    : { bom: '', text: raw }
}
