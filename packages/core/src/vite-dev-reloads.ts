/**
 * What the dev server keeps of the reloads of its served stylesheets: which wait to be sent, which
 * were sent and are not yet answered, and which went to no page.
 */

export interface ReloadState {
  /**
   * The served stylesheets whose set has grown since, waiting for the batched reload.
   */
  readonly stale: Set<string>
  /**
   * The stylesheets a reload was asked for and the page has not asked for again, by when.
   */
  readonly reloading: Map<string, number>
  /**
   * How many pages are connected to the client environment's channel, and the stylesheets a
   * reload was sent for while it was none: Vite drops a module reload sent then (a page reload
   * it keeps for the next page that connects), so the next connection sends them again if they
   * are still outgrown.
   */
  listening: number
  readonly unheard: Set<string>
  reloadTimer: ReturnType<typeof setTimeout> | undefined
  /**
   * How many file changes are being read ahead of their update, which send the stylesheets they
   * outgrew in that update themselves, so the timer waits.
   */
  readAhead: number
}

/**
 * The reloads of a dev server that has sent none.
 */
export function freshReloads(): ReloadState {
  return {
    stale: new Set(),
    reloading: new Map(),
    listening: 0,
    unheard: new Set(),
    reloadTimer: undefined,
    readAhead: 0,
  }
}

/**
 * Notes that a reload of the served stylesheet `id` was sent now. With no page listening Vite
 * drops a module reload, so the stylesheet is kept to be sent again when a page connects. A page
 * reload Vite keeps for that page as well, so the page is sent it twice and reloads once.
 */
export function noteReloadSent(state: ReloadState, id: string): void {
  state.reloading.set(id, Date.now())
  if (state.listening === 0) state.unheard.add(id)
}
