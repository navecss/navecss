/**
 * The logical property groups: for each group, the flow-relative (`logical`) and the physical
 * longhands the element's writing mode pairs up. Written from the specifications named in
 * `property-table-corrections.ts` (`SPECIFICATION_TITLES`): CSS Logical Properties and Values
 * Module Level 1 defines the groups and gives the box-model ones, and the other four give the
 * groups of their own properties (each states "Logical property group:" in its property
 * definitions).
 *
 * Shorthands are left out on purpose: the specification groups longhands only, and a shorthand
 * reaches its group through the longhands it sets.
 */

export interface LogicalPropertyGroup {
  readonly logical: readonly string[]
  readonly physical: readonly string[]
}

/**
 * The group of the four per-side properties `<prefix>-<side><suffix>`: the block-start,
 * block-end, inline-start and inline-end ones are the logical members, the top, right, bottom and
 * left ones the physical members.
 */
function perSide(prefix: string, suffix = ''): LogicalPropertyGroup {
  return {
    logical: ['block-start', 'block-end', 'inline-start', 'inline-end'].map(
      (side) => `${prefix}-${side}${suffix}`,
    ),
    physical: ['top', 'right', 'bottom', 'left'].map((side) => `${prefix}-${side}${suffix}`),
  }
}

export const LOGICAL_PROPERTY_GROUPS: Readonly<Record<string, LogicalPropertyGroup>> = {
  // CSS Logical Properties and Values Module Level 1: width and height, with their min- and max-.
  size: { logical: ['block-size', 'inline-size'], physical: ['height', 'width'] },
  'min-size': {
    logical: ['min-block-size', 'min-inline-size'],
    physical: ['min-height', 'min-width'],
  },
  'max-size': {
    logical: ['max-block-size', 'max-inline-size'],
    physical: ['max-height', 'max-width'],
  },
  // The same specification: margin, padding and the offsets top, right, bottom and left.
  margin: perSide('margin'),
  padding: perSide('padding'),
  inset: {
    logical: ['inset-block-start', 'inset-block-end', 'inset-inline-start', 'inset-inline-end'],
    physical: ['top', 'right', 'bottom', 'left'],
  },
  // The same specification: border width, style and colour per side, and the corner radii.
  'border-width': perSide('border', '-width'),
  'border-style': perSide('border', '-style'),
  'border-color': perSide('border', '-color'),
  'border-radius': {
    logical: [
      'border-start-start-radius',
      'border-start-end-radius',
      'border-end-start-radius',
      'border-end-end-radius',
    ],
    physical: [
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-left-radius',
      'border-bottom-right-radius',
    ],
  },
  // CSS Overflow Module Level 3.
  overflow: {
    logical: ['overflow-block', 'overflow-inline'],
    physical: ['overflow-x', 'overflow-y'],
  },
  // CSS Overscroll Behavior Module Level 1.
  'overscroll-behavior': {
    logical: ['overscroll-behavior-block', 'overscroll-behavior-inline'],
    physical: ['overscroll-behavior-x', 'overscroll-behavior-y'],
  },
  // CSS Scroll Snap Module Level 1.
  'scroll-padding': perSide('scroll-padding'),
  'scroll-margin': perSide('scroll-margin'),
  // CSS Box Sizing Module Level 4.
  'contain-intrinsic-size': {
    logical: ['contain-intrinsic-block-size', 'contain-intrinsic-inline-size'],
    physical: ['contain-intrinsic-height', 'contain-intrinsic-width'],
  },
}
