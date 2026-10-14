/**
 * Waiting by animation frames, which is how the browser tests wait for a page to do something: how
 * long a frame takes is the machine's, how many go by is the page's, so a count of frames holds on a
 * machine that is busy and a number of milliseconds does not.
 */

export const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })

/**
Lets the given number of animation frames pass.
 */
export const framesLater = async (count: number): Promise<void> => {
  for (let frame = 0; frame < count; frame += 1) {
    await nextFrame()
  }
}

/**
With nothing to wait for, a popup is gone within this many frames of its close starting, or of the
transition it waited for finishing.
 */
export const FEW_FRAMES = 4

/**
The most frames waited for something that should happen, which only something that does not happen
runs out.
 */
export const MAX_FRAMES = 300

/**
 * Waits frame by frame until `isDone` holds, for at most `limit` frames, and says whether it held.
 * The limit is a count of frames and not a time, so a machine that is slow to draw is waited for
 * as long as it takes to draw that many frames.
 */
export const isReachedWithin = async (isDone: () => boolean, limit: number): Promise<boolean> => {
  for (let frame = 0; frame < limit && !isDone(); frame += 1) {
    await nextFrame()
  }
  return isDone()
}
