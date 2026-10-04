/**
 * AC-directive-core-44 and AC-directive-core-45's last two clauses: a page with no bundler,
 * served as the files are, in a real engine. The directory is built from the root README's own
 * fences by `scripts/generate-no-bundler-fixture.ts` (the README's `build` script has run), and
 * served untouched by the browser config's fixture middleware.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

const BASE = '/__fixtures__/no-bundler/'
const NAVE_LINK = /href="node_modules\/@navecss\/core\/dist\/standalone\.css"/

const frames: HTMLIFrameElement[] = []

afterEach(() => {
  for (const frame of frames.splice(0)) frame.remove()
})

function mount(attributes: Partial<HTMLIFrameElement>): Promise<HTMLIFrameElement> {
  const frame = document.createElement('iframe')
  Object.assign(frame, attributes)
  frame.style.cssText = 'width: 600px; height: 300px'
  frames.push(frame)
  const loaded = new Promise<HTMLIFrameElement>((resolve) => {
    frame.addEventListener('load', () => {
      resolve(frame)
    })
  })
  document.body.append(frame)
  return loaded
}

/** The page as served. */
function open(name: string): Promise<HTMLIFrameElement> {
  return mount({ src: `${BASE}${name}` })
}

/** The same page with the self-contained stylesheet's request made to fail. */
async function openWithoutNaveStylesheet(): Promise<HTMLIFrameElement> {
  const html = await (await fetch(`${BASE}index.html`)).text()
  expect(html).toMatch(NAVE_LINK)
  const broken = html.replace(NAVE_LINK, 'href="no-such-stylesheet.css"')
  return mount({ srcdoc: `<base href="${location.origin}${BASE}">${broken}` })
}

/**
 * The HTTP status each stylesheet the page linked was answered with, by file name. A stylesheet
 * request that fails is told apart this way and not by `link.sheet`, which Chromium sets for a
 * response that is not a stylesheet too.
 */
function stylesheetStatuses(frame: HTMLIFrameElement): Record<string, number> {
  const entries = frame.contentWindow!.performance.getEntriesByType(
    'resource',
  ) as PerformanceResourceTiming[]
  return Object.fromEntries(
    entries
      .filter((entry) => entry.initiatorType === 'link')
      .map((entry) => [new URL(entry.name).pathname.split('/').pop()!, entry.responseStatus]),
  )
}

/**
 * The files a stylesheet of the page imported that were not answered with 200 (Resource Timing
 * records an `@import` request with the initiator `css`, apart from the `link` one).
 */
function failedImports(frame: HTMLIFrameElement): string[] {
  const entries = frame.contentWindow!.performance.getEntriesByType(
    'resource',
  ) as PerformanceResourceTiming[]
  return entries
    .filter((entry) => entry.initiatorType === 'css' && entry.responseStatus !== 200)
    .map((entry) => new URL(entry.name).pathname.split('/').pop()!)
}

async function tabTo(frame: HTMLIFrameElement, target: Element): Promise<void> {
  for (let press = 0; press < 4 && frame.contentDocument!.activeElement !== target; press++) {
    await userEvent.tab()
  }
  expect(frame.contentDocument!.activeElement).toBe(target)
}

describe('AC-directive-core-44 — a no-bundler page renders in a real browser', () => {
  it('no stylesheet request fails', async () => {
    const frame = await open('index.html')

    expect(stylesheetStatuses(frame)).toEqual({ 'standalone.css': 200, 'app.css': 200 })
    expect(failedImports(frame)).toEqual([])
  })

  it('the button has its token colour, the same as a probe styled with the token', async () => {
    const frame = await open('index.html')
    const doc = frame.contentDocument!
    const button = doc.querySelector<HTMLElement>('.btn')!
    const probe = doc.createElement('div')
    probe.style.background = 'var(--nave-color-action-primary)'
    doc.body.append(probe)

    const colour = frame.contentWindow!.getComputedStyle(button).backgroundColor
    expect(colour).not.toBe('rgba(0, 0, 0, 0)')
    expect(colour).toBe(frame.contentWindow!.getComputedStyle(probe).backgroundColor)
  })

  it('on keyboard focus the button matches :focus-visible and draws a solid outline', async () => {
    const frame = await open('index.html')
    const button = frame.contentDocument!.querySelector<HTMLElement>('.btn')!

    await tabTo(frame, button)

    expect(button.matches(':focus-visible')).toBe(true)
    const ring = frame.contentWindow!.getComputedStyle(button)
    expect(ring.outlineStyle).toBe('solid')
    expect(Number.parseFloat(ring.outlineWidth)).toBeGreaterThan(0)
  })

  it('with the self-contained stylesheet’s request failing, no --nave-* property is defined, and a ring is still drawn', async () => {
    const frame = await openWithoutNaveStylesheet()
    const doc = frame.contentDocument!
    expect(stylesheetStatuses(frame)).toEqual({ 'no-such-stylesheet.css': 404, 'app.css': 200 })

    const button = doc.querySelector<HTMLElement>('.btn')!
    expect(
      frame
        .contentWindow!.getComputedStyle(doc.documentElement)
        .getPropertyValue('--nave-border-width-focus'),
    ).toBe('')

    await tabTo(frame, button)

    expect(button.matches(':focus-visible')).toBe(true)
    const ring = frame.contentWindow!.getComputedStyle(button)
    expect(ring.outlineStyle).toBe('solid')
    expect(Number.parseFloat(ring.outlineWidth)).toBeGreaterThan(0)
  })
})

describe('AC-directive-core-45 — a page linking only the self-contained stylesheet', () => {
  it('renders class="nave-flex" as display: flex', async () => {
    const frame = await open('standalone-only.html')
    const flex = frame.contentDocument!.querySelector<HTMLElement>('.nave-flex')!

    expect(stylesheetStatuses(frame)).toEqual({ 'standalone.css': 200 })
    expect(frame.contentWindow!.getComputedStyle(flex).display).toBe('flex')
  })

  it('shows outline-style: solid on a class="nave-focus-ring" button under keyboard focus', async () => {
    const frame = await open('standalone-only.html')
    const button = frame.contentDocument!.querySelector<HTMLElement>('.nave-focus-ring')!

    await tabTo(frame, button)

    expect(frame.contentWindow!.getComputedStyle(button).outlineStyle).toBe('solid')
  })
})
