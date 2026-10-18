/**
 * The routes of the Server Component check and the reading of its builds: what each page renders,
 * the errors a failed build prints, and what a prerendered page must hold. Pure, so a test can read
 * them without a network.
 */

export interface Route {
  /**
  The directory under `app/`, and the name of the prerendered file.
   */
  readonly name: string
  readonly source: string
}

const PAGE = (imports: string, body: string, directive = ''): string =>
  `${directive}${imports}\n\nexport default function Page() {\n  return (\n${body}\n  )\n}\n`

/**
 * The four routes. A page with no directive is a Server Component, the App Router's default.
 */
export const ROUTES: readonly Route[] = [
  {
    name: 'namespace',
    source: PAGE(
      `import { Accordion } from '@navecss/base-ui/accordion'\nimport { Dialog } from '@navecss/base-ui/dialog'`,
      `    <>\n      <Dialog.Root>\n        <Dialog.Trigger variant="primary">Open</Dialog.Trigger>\n      </Dialog.Root>\n      <Accordion.Root>\n        <Accordion.Item value="a">\n          <Accordion.Header>\n            <Accordion.Trigger>One</Accordion.Trigger>\n          </Accordion.Header>\n        </Accordion.Item>\n      </Accordion.Root>\n    </>`,
    ),
  },
  {
    name: 'single',
    source: PAGE(
      `import { Button } from '@navecss/base-ui/button'`,
      `    <Button variant="primary">Save</Button>`,
    ),
  },
  {
    name: 'root',
    source: PAGE(
      `import { Dialog } from '@navecss/base-ui'`,
      `    <Dialog.Root>\n      <Dialog.Trigger variant="primary">Open</Dialog.Trigger>\n    </Dialog.Root>`,
    ),
  },
  {
    name: 'client',
    source: PAGE(
      `import { Dialog } from '@navecss/base-ui/dialog'`,
      `    <Dialog.Root>\n      <Dialog.Trigger variant="primary">Open</Dialog.Trigger>\n    </Dialog.Root>`,
      `'use client'\n\n`,
    ),
  },
]

/**
 * What 0.2.0's build prints: Turbopack at prerender, webpack on the `export *` and on dotting into
 * a client module.
 */
export const KNOWN_ERRORS: readonly string[] = [
  'Element type is invalid',
  'unsupported to use "export *"',
  'Cannot access',
]

/**
 * The known errors a build log contains.
 */
export const logProblems = (log: string): string[] =>
  KNOWN_ERRORS.filter((message) => log.includes(message)).map(
    (message) => `the log contains "${message}"`,
  )

const PRIMARY_BUTTON = /<button\b[^>]*\bdata-nave-variant="primary"/

/**
 * What a route's prerendered HTML lacks: the primary Button of the page, and on the namespace route
 * an element carrying a class of the Accordion's styling as well.
 */
export const htmlProblems = (route: string, html: string): string[] => [
  ...(route === 'client' || PRIMARY_BUTTON.test(html)
    ? []
    : [`${route}: no <button> with data-nave-variant="primary"`]),
  ...(route === 'client' || route !== 'namespace' || /class="[^"]*nave-base-ui-accordion/.test(html)
    ? []
    : [`${route}: no element with a class of the Accordion`]),
]
