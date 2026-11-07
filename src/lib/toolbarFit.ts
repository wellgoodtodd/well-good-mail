// How many of the small action icons fit in the reading pane's toolbar. The rest are left to the More menu,
// so the toolbar never wraps onto a second line.

/** Width taken by one icon button and its gap. */
export const TOOL_WIDTH = 36;
/** Below this width the Reply, Reply All and Forward words are dropped and only their icons stay. */
export const COMPACT_BELOW = 440;
/** Side padding of the toolbar, and a little spare. */
const MARGIN = 28;

/**
 * `width` is the toolbar's width and `fixed` the width of the Reply buttons, which always stay.
 * `room` counts the icons that fit beside them, not including More, which is always shown.
 */
export function toolsThatFit(width: number, fixed: number): { room: number; compact: boolean } {
  const compact = width > 0 && width < COMPACT_BELOW;
  if (width <= 0) return { room: 99, compact: false };
  const free = width - fixed - MARGIN - TOOL_WIDTH; // keep space for More
  return { room: Math.max(0, Math.floor(free / TOOL_WIDTH)), compact };
}
