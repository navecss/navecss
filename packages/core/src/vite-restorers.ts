/**
 * `atoms` with the atoms added that restore what an atom in it removes: `srOnlyFocusable` shows
 * again on focus what `srOnly` hides, so a set that holds `srOnly` holds it too. This adds to the
 * emitted set only, not to `keep` or to what `cx.dynamic()` accepts.
 */
export function withRestorers(atoms: Set<string>): Set<string> {
  if (atoms.has('srOnly')) atoms.add('srOnlyFocusable')
  return atoms
}
