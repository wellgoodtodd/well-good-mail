import { describe, expect, it } from 'vitest';
import { COMPACT_BELOW, TOOL_WIDTH, toolsThatFit } from '../toolbarFit';

describe('reading pane toolbar', () => {
  it('shows everything when there is plenty of room', () => {
    expect(toolsThatFit(900, 260).room).toBeGreaterThanOrEqual(9);
  });
  it('drops one icon at a time as it narrows', () => {
    const wide = toolsThatFit(700, 260).room;
    const narrower = toolsThatFit(700 - TOOL_WIDTH, 260).room;
    expect(narrower).toBe(wide - 1);
  });
  it('never goes below none, and keeps More', () => {
    expect(toolsThatFit(200, 260).room).toBe(0);
  });
  it('drops the words on the Reply buttons when very narrow', () => {
    expect(toolsThatFit(COMPACT_BELOW - 1, 150).compact).toBe(true);
    expect(toolsThatFit(COMPACT_BELOW + 1, 260).compact).toBe(false);
  });
  it('shows everything before the pane has been measured', () => {
    expect(toolsThatFit(0, 0)).toEqual({ room: 99, compact: false });
  });
});
