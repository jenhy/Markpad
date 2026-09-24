import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	findBlockForLine,
	parseSourcepos,
	resolveScrollTop,
	type BlockGeometry,
} from '../src/lib/utils/scrollAnchor.js';

test('parseSourcepos reads start and end line', () => {
	assert.deepEqual(parseSourcepos('253:1-253:21'), { startLine: 253, endLine: 253 });
	assert.deepEqual(parseSourcepos('208:1-233:3'), { startLine: 208, endLine: 233 });
});

test('parseSourcepos rejects malformed input', () => {
	assert.equal(parseSourcepos(null), null);
	assert.equal(parseSourcepos(undefined), null);
	assert.equal(parseSourcepos(''), null);
	assert.equal(parseSourcepos('not-a-range'), null);
	assert.equal(parseSourcepos('1:1-'), null);
});

test('findBlockForLine prefers the tightest containing span', () => {
	// Mirrors the real nesting: a section wrapper containing an h2, where the
	// line sits inside both. The h2 must win.
	const blocks: BlockGeometry[] = [
		{ startLine: 237, endLine: 341, offsetTop: 5000, offsetHeight: 900 },
		{ startLine: 253, endLine: 253, offsetTop: 5609, offsetHeight: 38 },
	];

	const hit = findBlockForLine(blocks, 253);
	assert.equal(hit?.startLine, 253);
	assert.equal(hit?.offsetHeight, 38);
});

test('findBlockForLine returns null when no block covers the line', () => {
	const blocks: BlockGeometry[] = [{ startLine: 10, endLine: 20, offsetTop: 0, offsetHeight: 100 }];
	assert.equal(findBlockForLine(blocks, 253), null);
});

test('findBlockForLine ignores blocks with unparseable bounds', () => {
	const blocks: BlockGeometry[] = [{ startLine: null, endLine: null, offsetTop: 0, offsetHeight: 100 }];
	assert.equal(findBlockForLine(blocks, 5), null);
});

test('resolveScrollTop places a single-line block at the anchor offset', () => {
	// A one-line block has no interior to interpolate, so its own top is used.
	const blocks: BlockGeometry[] = [
		{ startLine: 253, endLine: 253, offsetTop: 5609, offsetHeight: 38 },
	];
	assert.equal(resolveScrollTop(blocks, 253, 60), 5549);
});

test('resolveScrollTop interpolates within a multi-line block', () => {
	// Line 7 of 10 in a 1000px-tall block starting at 0, anchored 60px down.
	const blocks: BlockGeometry[] = [
		{ startLine: 0, endLine: 9, offsetTop: 0, offsetHeight: 1000 },
	];
	// ratio = 7/9, elementTop = 777.78, minus the 60px anchor offset.
	assert.equal(resolveScrollTop(blocks, 7, 60), Math.max(0, 0 + 1000 * (7 / 9) - 60));
});

test('resolveScrollTop clamps to the top of the document', () => {
	const blocks: BlockGeometry[] = [
		{ startLine: 1, endLine: 1, offsetTop: 10, offsetHeight: 20 },
	];
	assert.equal(resolveScrollTop(blocks, 1, 60), 0);
});

test('resolveScrollTop returns null when the anchor cannot be located', () => {
	assert.equal(resolveScrollTop([], 253, 60), null);
});

/**
 * Mirrors the overlap test used when *recording* an anchor, kept here so the
 * fractional-scrollTop edge case stays pinned. `scrollTop` is fractional in
 * browsers while block bounds are whole pixels, so a block whose top sits
 * exactly on the anchor line must still count as covering it.
 */
const ANCHOR_EPSILON = 1;

function covers(block: BlockGeometry, anchorOffset: number, epsilon = ANCHOR_EPSILON): boolean {
	return (
		block.offsetTop <= anchorOffset + epsilon &&
		block.offsetTop + block.offsetHeight > anchorOffset
	);
}

test('edge: a block whose top sits on a fractional anchor still covers it', () => {
	// Regression: scrollTop was 9068.5, so anchorOffset was 9128.5, and the
	// heading starting at exactly 9129 failed a bare `9129 <= 9128.5` test —
	// the *next* heading won and the anchor was recorded one section too low.
	const heading = { startLine: 253, endLine: 253, offsetTop: 9129, offsetHeight: 38 };
	assert.equal(covers(heading, 9128.5), true, 'heading on the anchor line must be matched');
	assert.equal(covers(heading, 9128.5, 0), false, 'without tolerance the boundary case fails');
});

test('edge: a block entirely above the anchor is not matched', () => {
	const above = { startLine: 241, endLine: 241, offsetTop: 8771, offsetHeight: 38 };
	assert.equal(covers(above, 9129), false);
});

test('edge: a block entirely below the anchor is not matched', () => {
	const below = { startLine: 269, endLine: 269, offsetTop: 9657, offsetHeight: 38 };
	assert.equal(covers(below, 9129), false);
});

test('regression: nested anchor is found where a top-level scan fails', () => {
	// The bug: `processMarkdownHtml` nests heading bodies inside
	// `div.foldable-content-wrapper > div.content-inner`, so a finder that only
	// walked `body.children` saw nothing but h1 headers and every h2 anchor
	// resolved to null, falling through to a low-precision percentage restore.
	//
	// Flat view of what a top-level scan would see:
	const topLevelOnly: BlockGeometry[] = [
		{ startLine: 1, endLine: 1, offsetTop: 74, offsetHeight: 51 },
		{ startLine: 9, endLine: 9, offsetTop: 314, offsetHeight: 51 },
		{ startLine: 237, endLine: 237, offsetTop: 8627, offsetHeight: 51 },
		{ startLine: 342, endLine: 342, offsetTop: 12000, offsetHeight: 51 },
	];
	assert.equal(findBlockForLine(topLevelOnly, 253), null, 'line 253 falls between section headers');

	// Same document, scanned to full depth — the h2 for line 253 is present.
	const withDescendants: BlockGeometry[] = [
		...topLevelOnly,
		{ startLine: 253, endLine: 253, offsetTop: 9152, offsetHeight: 38 },
	];
	const hit = findBlockForLine(withDescendants, 253);
	assert.equal(hit?.startLine, 253);
	assert.equal(resolveScrollTop(withDescendants, 253, 60), 9152 - 60);
});
