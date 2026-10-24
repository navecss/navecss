/**
 * The two passages of the README whose every sentence about focus, screen readers or accessibility
 * is fixed text, kept here byte for byte. A test compares the README against them and against
 * their sizes and digests, so neither the README nor this file can drift alone.
 */

/**
 * The production check, with the link to the section on what the package cannot see left as the
 * placeholders the text was cleared with.
 */
export const PRODUCTION_CHECK = `This package serves only the atoms it can read a use for, in \`next dev\` as in \`next build\`. A \`nave-*\` class it cannot see, such as one in CMS text or one a package listed in \`keepFor\` applies at run time, has no rule unless its atom is listed in \`keep\` or in a \`keepFor\` entry. Run your checks, keyboard, screen-reader and automated accessibility checks included, against a production build as well as in dev, because the two can still differ: \`next build\`, then \`next start\`, or, for a static export (\`output: 'export'\`), the web server you deploy its output folder to. [<SECTION>](#<ANCHOR>) says what the package reads and where dev differs.`

export const PRODUCTION_CHECK_BYTES = 645
export const PRODUCTION_CHECK_SHA256 = '3bb2e259d9581f2b'

/**
 * The paragraph that closes the section on what the package cannot see: the cleared 1,691-byte
 * text with the two items for a class a CSS Module composes from global and a module reached only
 * through an alias set in `next.config`, inserted where the cleared wording allows.
 */
export const RESIDUAL_PARAGRAPH = `A class this package does not read has no rule in the production stylesheet unless its atom is listed in \`keep\` or in a \`keepFor\` entry (\`nave-sr-only-focusable\` also has its rule whenever \`nave-sr-only\` has one). It reads your code by following imports from Next.js's route files, so it does not read text from a CMS or a rich-text field, HTML inserted with \`dangerouslySetInnerHTML\`, HTML files in \`public/\`, a class taken at run time from \`@navecss/core/atoms\`, Markdown or MDX files and the modules only they import, a module loaded through \`import()\` or \`require()\` with a specifier built at run time, a class a CSS Module composes \`from global\`, a module Next.js reaches only through an alias set in \`next.config\` and not in \`paths\`, or a class a package listed in \`keepFor\` applies at run time. An element carrying such a class renders as if the class were absent: a \`nave-sr-only\` or \`nave-sr-only-focusable\` element is shown, a \`nave-hidden\` or \`nave-hide-*\` element is displayed, and a \`nave-focus-ring\` element falls back to the browser's default focus indicator. A \`nave-hidden\` or \`nave-hide-*\` element that other styles also keep out of sight (moved off-screen, made transparent or clipped) stays out of sight but can take keyboard focus and is exposed to screen readers. \`next dev\` serves the atoms \`next build\` would ship for the code this package reads, so a class it does not read has no rule in dev either. Next.js can still order, merge and minify CSS differently in the build than in dev, so a page can still look and behave differently there. Before you ship, run your checks, keyboard, screen-reader and automated accessibility checks included, against the production build: \`next build\`, then \`next start\`, or, for a static export (\`output: 'export'\`), the web server you deploy its output folder to.`

export const RESIDUAL_PARAGRAPH_BYTES = 1824
export const RESIDUAL_PARAGRAPH_SHA256 = '42549c686c53d4ce'
