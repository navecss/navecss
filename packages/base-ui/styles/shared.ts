/**
 * Pieces the role atoms share. Not an atom, and not shipped: `styles/` is build input.
 */
export type Declarations = Record<string, string>

export const V = (name: string): string => `var(--nave-${name})`

/**
A boundary between surfaces: the quiet default border.
 */
export const borderSm = `${V('border-width-sm')} solid ${V('color-border-default')}`

/**
A painted control's boundary.
 */
export const borderControl = `${V('border-width-sm')} solid ${V('color-border-control')}`

export const reducedMotion = '(prefers-reduced-motion: reduce)'

/**
Reduced motion collapses a transition by its duration, never by dropping the property.
 */
export const motionOff = { 'transition-duration': `calc(0 * ${V('motion-duration-fast')})` }

export const placeholder: Declarations = { color: V('color-content-tertiary'), opacity: '1' }

export const invalidBoundary: Declarations = {
  'border-color': V('color-feedback-danger'),
  'border-width': V('border-width-mark'),
}

export const disabledControl: Declarations = {
  'border-color': V('color-border-disabled'),
  color: V('color-content-disabled'),
  cursor: 'not-allowed',
}
