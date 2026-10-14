/**
 * Where a link's underline is inked, found the way the spec's measurements found it: the glyphs
 * and the focus ring are made transparent, the underline is given a colour of its own, the popup is
 * photographed, and the pixels around the link's border box are read.
 */
import { page } from 'vitest/browser'

import { useSheets } from './page.ts'

/**
 * The reader's rules for the scan, in the overrides layer: nothing but the current link's
 * underline has an ink.
 */
const INK = `@layer overrides {
  [data-testid="popup"] a, [data-testid="top-link"] {
    color: transparent;
    text-decoration-color: transparent;
    outline-color: transparent;
    background: none;
    box-shadow: none;
  }
  [data-testid="popup"] a[aria-current="page"] {
    text-decoration-color: rgb(255, 0, 0);
  }
}`

export interface InkRows {
  /**
  How many rows of the scan hold ink.
   */
  readonly rows: number
  /**
  The lowest edge of the ink, in CSS px below the link's border-box edge (negative: inside it).
   */
  readonly depth: number
}

const decode = async (base64: string): Promise<ImageData> => {
  const response = await fetch(`data:image/png;base64,${base64}`)
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('no 2d canvas to read the photograph with')
  }
  context.drawImage(bitmap, 0, 0)
  return context.getImageData(0, 0, bitmap.width, bitmap.height)
}

const colourAt = (image: ImageData, x: number, y: number): readonly number[] => {
  const offset = (y * image.width + x) * 4
  return [image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!]
}

const key = (colour: readonly number[]): string => colour.join(',')

/**
The most frequent colour among the pixels, which is the surface the ink lies on.
 */
const surfaceOf = (colours: readonly (readonly number[])[]): readonly number[] => {
  const counts = new Map<string, number>()
  for (const colour of colours) {
    counts.set(key(colour), (counts.get(key(colour)) ?? 0) + 1)
  }
  const [mostFrequent] = [...counts].toSorted((a, b) => b[1] - a[1])
  return (mostFrequent?.[0] ?? '0,0,0').split(',').map(Number)
}

const isInk = (colour: readonly number[], surface: readonly number[]): boolean =>
  colour.reduce((sum, channel, index) => sum + Math.abs(channel - surface[index]!), 0) > 150

/**
 * Photographs the popup with only the current link's underline inked, and reads the rows of ink
 * under the link's columns, from the top of its border box to a few pixels below it.
 */
export const underlineInk = async (
  popup: HTMLElement,
  link: HTMLElement,
  below = 8,
): Promise<InkRows> => {
  const removeInk = useSheets(INK)
  try {
    const photograph = await page.screenshot({ element: popup, save: false })
    const image = await decode(photograph)
    const scale = image.width / popup.getBoundingClientRect().width
    const popupBox = popup.getBoundingClientRect()
    const box = link.getBoundingClientRect()
    const toRow = (cssY: number): number => Math.round((cssY - popupBox.top) * scale)
    const toColumn = (cssX: number): number => Math.round((cssX - popupBox.left) * scale)
    const first = toColumn(box.left) + 2
    const last = toColumn(box.right) - 2
    const top = toRow(box.top)
    const bottom = toRow(box.bottom + below)
    const surface = surfaceOf(
      Array.from({ length: last - first }, (_, column) =>
        colourAt(image, first + column, bottom - 1),
      ),
    )
    let lowest: number | undefined
    let rows = 0
    for (let row = top; row < bottom; row += 1) {
      let hasInk = false
      for (let column = first; column < last; column += 1) {
        hasInk ||= isInk(colourAt(image, column, row), surface)
      }
      if (hasInk) {
        rows += 1
        lowest = row
      }
    }
    return {
      depth: lowest === undefined ? -Infinity : (lowest + 1) / scale - (box.bottom - popupBox.top),
      rows,
    }
  } finally {
    removeInk()
  }
}
