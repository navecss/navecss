/**
 * When the dev server judges the markup warning. It is said when the first stylesheet holding the
 * atomic layer is served, which is a response: by then the page that asked has been read. A
 * server that warms its files up transforms a stylesheet at start, before any page is read and
 * with nobody asking, so there a transform is not a response; the warning waits for the request
 * for a stylesheet, which a middleware notes.
 */
import type { DevEnvironmentLike, DevServerLike, RequestLike } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { filePathOf, isStylesheetId } from './vite-css-id.ts'
import { judgeMarkup } from './vite-markup.ts'

/**
 * Whether the stylesheet `id` is one the dev server filters: not a `?inline` import, whose text
 * is part of the JavaScript, as in a build.
 */
export function isServedAsStylesheet(id: string): boolean {
  return isStylesheetId(id) && !/[?&]inline\b/.test(id)
}

/**
 * Judges the markup case, saying so through the dev server's logger.
 */
function judge(context: UsedContext): void {
  judgeMarkup(context, (message) => context.logger?.warn(message))
}

/**
 * Judges when the transform of the stylesheet `id` is a response: always, except under a warm-up,
 * where it is one only if a request for the stylesheet has come.
 */
export function judgeWhenServed(context: UsedContext, id: string): void {
  const { state } = context
  if (!state.warmedUp || state.requested.has(filePathOf(id))) judge(context)
}

/**
 * The URL of a request for a stylesheet the dev server filters, without the server's base.
 */
function stylesheetUrl(request: RequestLike, base: string): string | undefined {
  const url = request.url
  if (url === undefined || !isServedAsStylesheet(url)) return undefined
  return base !== '/' && url.startsWith(base) ? `/${url.slice(base.length)}` : url
}

/**
 * Notes that the stylesheet at `url` was asked for. One that was transformed already is being
 * answered from the module graph, so the judgement is made now. The URL is decoded first, as
 * Vite's own transform middleware does, so `/src/my%20app.css` names `src/my app.css`; a URL that
 * does not decode is one Vite refuses, and is not noted.
 */
async function noteRequest(
  context: UsedContext,
  environment: DevEnvironmentLike,
  url: string,
): Promise<void> {
  const { state } = context
  try {
    const resolved = await environment.pluginContainer.resolveId(decodeURI(url))
    if (resolved === null) return
    const file = filePathOf(resolved.id)
    state.requested.add(file)
    if (state.served.keys().some((id) => filePathOf(id) === file)) judge(context)
  } catch {
    // The request is answered, or refused, by Vite.
  }
}

/**
 * Puts the middleware that notes requests for stylesheets on the dev server, when it warms files
 * up. It stands ahead of Vite's own, so a request is noted before the transform that answers it.
 */
export function noteStylesheetRequests(context: UsedContext, server: DevServerLike): void {
  const { state } = context
  const environment = server.environments.client
  state.warmedUp = environment.config.dev.warmup.length > 0
  if (!state.warmedUp) return
  server.middlewares.use(async (request, _response, next) => {
    const url = stylesheetUrl(request, server.config.base)
    if (url !== undefined && !state.markupJudged) await noteRequest(context, environment, url)
    next()
  })
}
