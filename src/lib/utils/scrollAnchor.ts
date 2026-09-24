/**
 * Scroll-anchor resolution for the markdown preview pane.
 *
 * The preview pane restores the reader's position when switching tabs. The
 * stored value is `anchorLine` — the source line the reader was looking at —
 * and we turn that back into a `scrollTop` by finding the DOM block whose
 * `data-sourcepos` range contains the line.
 *
 * Two things this module exists to get right:
 *
 * 1. **Search depth.** Blocks nest: comrak emits flat siblings, but
 *    `processMarkdownHtml` re-wraps every heading's body in
 *    `div.foldable-content-wrapper > div.content-inner`. A finder that only
 *    scans top-level children therefore sees nothing but the `h1` headers and
 *    misses every `h2`/`h3` and every body block. We search all descendants.
 *
 * 2. **Match precision.** A line can sit inside several overlapping ranges
 *    (a `div` wrapping a `p` wrapping a `code`). We want the *tightest* —
 *    smallest line span — so the offset within the block is computed against
 *    the most specific element available.
 */

export interface BlockGeometry {
	/** Inclusive start line from `data-sourcepos`, or null if unparseable. */
	startLine: number | null;
	/** Inclusive end line from `data-sourcepos`, or null if unparseable. */
	endLine: number | null;
	/** `offsetTop` relative to the scroll container. */
	offsetTop: number;
	/** `offsetHeight` of the element. */
	offsetHeight: number;
}

/** Parse a `data-sourcepos` value like `"253:1-253:21"` into line bounds. */
export function parseSourcepos(value: string | null | undefined): { startLine: number; endLine: number } | null {
	if (!value) return null;
	const [start, end] = value.split('-');
	if (!start || !end) return null;
	const startLine = parseInt(start.split(':')[0], 10);
	const endLine = parseInt(end.split(':')[0], 10);
	if (Number.isNaN(startLine) || Number.isNaN(endLine)) return null;
	return { startLine, endLine };
}

/**
 * Pick the block that contains `line`, preferring the tightest span.
 * Returns null when no block covers the line.
 */
export function findBlockForLine(blocks: BlockGeometry[], line: number): BlockGeometry | null {
	let best: BlockGeometry | null = null;
	let bestSpan = Infinity;
	for (const block of blocks) {
		if (block.startLine === null || block.endLine === null) continue;
		if (line < block.startLine || line > block.endLine) continue;
		const span = block.endLine - block.startLine;
		if (span < bestSpan) {
			bestSpan = span;
			best = block;
		}
	}
	return best;
}

/**
 * Resolve the scroll offset that places `line` at `anchorOffset` px from the
 * top of the viewport.
 *
 * Inside a block, the line is interpolated across the block's height. A
 * single-line block has no interior to interpolate, so its own top is used.
 */
export function resolveScrollTop(
	blocks: BlockGeometry[],
	line: number,
	anchorOffset: number,
): number | null {
	const block = findBlockForLine(blocks, line);
	if (!block) return null;

	const totalLines = (block.endLine ?? block.startLine ?? 0) - (block.startLine ?? 0);
	const ratio = totalLines > 0 ? (line - (block.startLine ?? 0)) / totalLines : 0;
	const clamped = Math.max(0, Math.min(1, ratio));

	return Math.max(0, block.offsetTop + block.offsetHeight * clamped - anchorOffset);
}
