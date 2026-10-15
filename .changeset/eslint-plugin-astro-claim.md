---
'@navecss/eslint-plugin': patch
---

Correct what the README says about Astro. It listed Astro as outside every rule, but an `.astro`
file linted through `eslint-plugin-astro` is read: its parser gives the rules the template as JSX,
so `class` and a `style` object are checked as in JSX, and a class your `<style>` block styles is
reported unless `allow` declares it. Astro's `class:list` and a `style` written as a string are not
read. No rule changed.
