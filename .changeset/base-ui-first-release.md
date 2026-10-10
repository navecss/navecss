---
'@navecss/base-ui': minor
---

First release. `@navecss/base-ui` is Base UI's own components, pre-styled with Nave's tokens: change
`@base-ui/react/<component>` to `@navecss/base-ui/<component>` in an import, import one stylesheet
after Nave's tokens, and every part keeps Base UI's props, types, refs and behaviour while gaining
Nave's styling. It covers 23 components: Dialog, Popover, Menu, Select, Tooltip, Accordion,
Collapsible, Tabs, Button, Input, Number Field, Field, Fieldset, Form, Checkbox, Checkbox Group,
Radio, Radio Group, Switch, Slider, Toggle, Toggle Group and Toolbar. Buttons, and the triggers and
close parts of the overlays, take `variant` (`secondary` or `primary`) and `size` (`md` or `sm`).

A class you pass to any part wins over the package's rules in every state, because they sit in
`components.nave` and yours go in `components.consumer`. The stylesheet needs no build plugin, and
the package adds no JavaScript that computes a style.

It needs `@base-ui/react` 1.3 or later in the 1.x line, React 18 or 19, and `@navecss/tokens` 0.3.0
or later (the release that adds `--nave-border-width-mark`, which a checked Checkbox draws its mark
with).

`@navecss/bridge`, a private placeholder that was never published, is removed.
