# @navecss/tokens

> DTCG 2025.10 design tokens for Nave, built by a first-party DTCG 2025.10 reader.

## Installation

```bash
pnpm add @navecss/tokens
```

## Requirements

- **Browsers: Chrome and Edge 125, Firefox 128, Safari 18 (Baseline 2024).** Every semantic colour in the stylesheet is a `light-dark()` pair, and most of them are also derived with relative colour syntax. An older browser drops whichever of them it does not support, without an error: surfaces and text lose their colours. Your CSS build has to target the same floor, or it rewrites `light-dark()` into an emulation that a `color-scheme` set from script, or on part of the page, does not switch. [Why this floor, and how to set your build's target](https://github.com/navecss/navecss/blob/main/docs/04-adr/0005-browser-floor.md).
- **A resolver that reads `exports` maps.** Every entry point, `@navecss/tokens/css` included, is reachable only through the package's `exports` map: there is no `main` field to fall back on.
- **ES modules, with no CommonJS build.** The JavaScript entry points load through `import`, and also through `require()`, which Node 22.18 supports for ES modules. In TypeScript, set `moduleResolution` to `bundler`, `node16` or `nodenext`; under `node10` the types are not found.
- **Node 22.18 or later.**

## Setup

```css
/* app.css */
@import url('@navecss/tokens/css');
```

This emits the token layer's custom properties (`--nave-*`) inside `@layer tokens.defaults`. Keep the `/css`: unlike `@navecss/core`, whose bare package name is its stylesheet, the bare `@navecss/tokens` is the JavaScript entry point. `@navecss/core` imports this automatically; install `@navecss/tokens` on its own only if you are building without `@navecss/core` (for example, on top of Base UI or Radix UI directly).

## What ships

- **Colour** — the semantic colours consumers use (`action`, `content`, `surface`, `border`, `feedback`, and foregrounds for the primary action and the feedback roles), each with a light and a dark value through `light-dark()`. The `neutral`, `primary` and `danger` scales they are derived from stay inside the build: no step of them is emitted as a custom property. The neutral colours re-hue live from one custom property, under Theming below.
- **Typography, spacing, size, shape, shadow, motion, z-index, opacity** — the rest of the token taxonomy, authored once in `tokens.json` and compiled by the first-party DTCG 2025.10 reader.
- **Breakpoints** — a JS-only export (`@navecss/tokens/breakpoints`): custom properties cannot hold media-query ranges, so these ship as typed constants and prebuilt Level 4 media-query strings instead.

Every custom property the stylesheet declares is listed in [TOKENS.md](./TOKENS.md).

## The format this reads

`tokens.json` is written to the Design Tokens Format Module 2025.10, a Final Community Group Report published on 28 October 2025. It is a community specification rather than a standards-track one, and this package implements it without claiming conformance, certification or endorsement.

**The reader reads that one revision.** The format had a pre-stable draft for years, which wrote a dimension as `"16px"`, a font weight as `"400"` and a shadow layer's offsets as CSS strings, and that is still what most token tooling exports. A file in the draft shape is refused rather than guessed at: the refusal names every node in one run, says what the file is, and gives the edit each node needs for its own type. There is no second accepted shape, because a value that could be read either way is a value that can be read wrongly in silence.

**One stated deviation, and it is in the source too.** 90 of this package's 93 tokens conform to that revision. `letterSpacing.tight`, `.normal` and `.wide` carry the unit `em`, which the format's `dimension` unit set (`px` and `rem`) does not include. `em` is lawful CSS and is the right unit for tracking, since it resolves against the element's own font size; converting the three would change what renders, so the deviation is stated rather than the value changed. The cost is real: a strict third-party reader will reject those three.

## Exports

| Export                          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@navecss/tokens`               | JS entry point — the typed constants described under `@navecss/tokens/js` below. Not a CSS entry: `@import url('@navecss/tokens/css')` is the stylesheet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@navecss/tokens/css`           | The generated stylesheet — `@import url('@navecss/tokens/css')`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `@navecss/tokens/js`            | Typed ESM token constants — the DTCG 2025.10 token set; every `--nave-color-*` custom property ships in the stylesheet above and not through this export, the `--nave-color-tint` seed included                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `@navecss/tokens/breakpoints`   | Breakpoint values, em conversions, media strings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@navecss/tokens/core-contract` | The shipped core-contract manifest, as JSON, for a token layer you generate yourself and load through `@navecss/core/no-tokens`: the `--nave-*` custom-property names `@navecss/core` reads, generated from that package's own source rather than listed by hand, and not the colour namespace alone. Import it with `with { type: 'json' }`. A clean check against it means those names are present rather than that your token set is complete; for what else it does and does not establish, read the header comment in `@navecss/core/no-tokens`. A validator reading the manifest directly should refuse a `formatVersion` higher than it understands, rather than mis-reading it. |
| `@navecss/tokens/build`         | The token build as a JavaScript API: `build` and `validate`, the two operations the `navecss-tokens` binary wraps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@navecss/tokens/tokens.json`   | The DTCG 2025.10 token source this package ships, the one `build` reads when given no `--source` — a starting point for writing your own (`--source`, below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Theming

Re-hue the neutral colours with one custom property, no build step required:

```css
@layer overrides {
  :root {
    --nave-color-tint: oklch(0.6 0.2 250);
  }
}
```

Changing this changes everything Nave derives from it. The contrast of the resulting palette follows from what you set, and checking it is yours.

The neutral surface re-hues live, and so does the text set on the primary action and on danger (`--nave-color-on-action-primary` and `--nave-color-on-feedback-danger`), which is neutral too. The accent does not move: the primary action, links, the focus ring and the danger colours stay exactly as shipped. [TOKENS.md](./TOKENS.md) marks every colour that follows the tint. Moving the accent is a re-seed, which runs through the build below.

Re-seeding, per-step overrides and bringing your own token source all run through the build below.

## Building your own tokens

This package ships a build you run yourself. Give it a seed colour and it
regenerates the whole token layer from that colour, into a directory you commit.

```json
{
  "scripts": {
    "tokens": "navecss-tokens build --seed=#2f6feb --out=src/styles/nave"
  }
}
```

Changing this changes everything Nave derives from it. The contrast of the resulting palette follows from what you set, and checking it is yours.

Two subcommands, four flags, and no configuration file: the build discovers no
configuration — it searches no directory and reads no config file.

| flag          | subcommand          | what it takes                                                                                                                                                |
| ------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--seed`      | `build`             | **Required.** The colour everything is derived from, as `#rrggbb`, `rgb()`, `hsl()`, `oklch()`, `lab()`, `lch()` or `color()` (`srgb` or `display-p3`)       |
| `--out`       | `build`             | **Required.** The directory the generated files are written to                                                                                               |
| `--source`    | `build`, `validate` | A DTCG 2025.10 `.json` token source. `build` defaults to the one this package ships; `validate` requires it, and also accepts a stylesheet you already built |
| `--overrides` | `build`             | A JSON file pinning individual ramp steps, keyed by scale (`primary`, `danger` or `neutral`) then step number, to a chroma: `{ "primary": { "500": 0.11 } }` |

Write `--flag=value` and not `--flag value`. A `#rrggbb` seed passed as a
separate word begins a shell comment, so the rest of the command is discarded
and you get a usage error rather than a wrong colour.

0.1.0 ships no consumer contrast-threshold input. No flag of this entry point sets one, and the build reads none. This is the absence of an input, not a limit on the consumer: a consumer may hold whatever contrast target they choose and check their palette against it with their own tooling. Where a check Nave ships runs in a consumer's build over the consumer's values, it reports and does not fail. A consumer-settable target is deliberately out of 0.1.0 rather than overlooked.

```bash
navecss-tokens validate --source=src/styles/nave/tokens.css
```

`validate` checks a token source, or a stylesheet you built yourself, against
the core contract: the `--nave-*` custom-property names `@navecss/core` reads,
not the colour ones alone. It reports the names in that contract your source
does not declare, and it checks nothing else, so a clean run means those names
are present rather than that your token set is complete.

Both operations are also a JavaScript API, exported as `@navecss/tokens/build`,
for a build system that would rather call a function than spawn a process.

The exit code is `0` when the run succeeded and `1` when the work failed on its
merits. `2` is not a verdict on your tokens at all: a run that exits `2`
reports none, so read `2` as no answer rather than as a bad one. `1` is also
where a failure the tool has no more specific code for ends up, so a `1` always
means the run failed and does not always mean your tokens did. Either way the
message says what happened, and the code is what a script branches on.
