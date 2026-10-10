/**
 * How far a pointer can hit an element, measured the way a pointer does: with
 * `document.elementFromPoint`, along the element's centre row and its centre column. An element
 * is hit at a point when the topmost element there is the element or one of its descendants, so a
 * pseudo-element's area counts (a press on one targets its element) and an area another element
 * covers, or `pointer-events: none` turns away, does not.
 */
export interface HitExtent {
  /**
  The hittable height in CSS px, along the centre column.
   */
  readonly height: number
  /**
  The hittable width in CSS px, along the centre row.
   */
  readonly width: number
}

type Axis = 'x' | 'y'

/**
The resolution the edges are found to, in CSS px.
 */
const RESOLUTION = 0.001
const SCAN_STEP = 1
const SCAN_LIMIT = 400

const isHit = (element: Element, x: number, y: number): boolean => {
  const topmost = document.elementFromPoint(x, y)
  return topmost !== null && element.contains(topmost)
}

/**
 * The edge of the hit area on one side of the centre: scans outward in whole pixels to the first
 * miss, then halves the bracket between the last hit and the first miss until it is
 * `RESOLUTION` wide.
 */
const edge = (isHitAt: (offset: number) => boolean, direction: 1 | -1): number => {
  let hit = 0
  let miss = direction * SCAN_STEP
  while (isHitAt(miss)) {
    hit = miss
    miss += direction * SCAN_STEP
    if (Math.abs(miss) > SCAN_LIMIT) {
      throw new Error(`the hit area runs more than ${String(SCAN_LIMIT)}px from the centre`)
    }
  }
  while (Math.abs(miss - hit) > RESOLUTION) {
    const middle = (hit + miss) / 2
    if (isHitAt(middle)) {
      hit = middle
    } else {
      miss = middle
    }
  }
  return (hit + miss) / 2
}

const extentAlong = (element: Element, axis: Axis): number => {
  const box = element.getBoundingClientRect()
  const centreX = box.left + box.width / 2
  const centreY = box.top + box.height / 2
  const isHitAt = (offset: number): boolean =>
    axis === 'x'
      ? isHit(element, centreX + offset, centreY)
      : isHit(element, centreX, centreY + offset)
  if (!isHitAt(0)) {
    return 0
  }
  return edge(isHitAt, 1) - edge(isHitAt, -1)
}

const rawExtent = (element: Element): HitExtent => {
  element.scrollIntoView({ block: 'center', inline: 'center' })
  return { height: extentAlong(element, 'y'), width: extentAlong(element, 'x') }
}

/**
 * The engine's hit test is not exact: a point hits an element when a pixel-sized probe starting at
 * the point reaches it, so the hit area reads almost one pixel larger on its leading edges than
 * the element's box. The excess is measured, not assumed, on a plain box of a known size in the
 * same page, and taken off every reading.
 */
const REFERENCE_SIZE = 40

const excess = (): number => {
  const reference = document.createElement('div')
  reference.style.cssText = `position: fixed; inset-block-start: 100px; inset-inline-start: 100px; inline-size: ${String(REFERENCE_SIZE)}px; block-size: ${String(REFERENCE_SIZE)}px`
  document.body.append(reference)
  const { height, width } = rawExtent(reference)
  reference.remove()
  if (Math.abs(height - width) > RESOLUTION) {
    throw new Error(`a square reference box reads ${String(width)} wide and ${String(height)} high`)
  }
  return width - REFERENCE_SIZE
}

/**
Measures an element where it is: it is scrolled to the middle of the viewport first, since
`elementFromPoint` sees only what the viewport shows.
 */
export const hitExtent = (element: Element): HitExtent => {
  const bias = excess()
  const { height, width } = rawExtent(element)
  return { height: height - bias, width: width - bias }
}
