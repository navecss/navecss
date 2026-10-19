/**
 * Offsets in a source text as 1-based lines and columns.
 */
export interface Place {
  readonly line: number
  readonly column: number
}

/**
 * A function from an offset into `code` to its line and column.
 */
export function placerFor(code: string): (offset: number) => Place {
  const starts = [0]
  for (const match of code.matchAll(/\n/g)) starts.push(match.index + 1)
  return (offset) => {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (starts[middle]! <= offset) low = middle
      else high = middle - 1
    }
    return { line: low + 1, column: offset - starts[low]! + 1 }
  }
}
