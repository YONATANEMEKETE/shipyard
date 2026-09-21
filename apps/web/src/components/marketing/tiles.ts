/**
 * The tile field: the faint square pattern the hero's side columns and the
 * workflows panel are painted with.
 *
 * Reference (Ledger): margins tiled with square cells, no gaps and no padding,
 * where only *some* cells carry a low-opacity grey and the rest are exactly the
 * surface behind them. Ours: 92px cells at 15% of `--ds-border-strong`, with the
 * grey set a deliberate scatter, `GREY_CELLS` below, two per row in a 6×6 tile,
 * none orthogonally adjacent to another (including across the tile seam), so
 * nothing about it reads as a grid or a checkerboard.
 *
 * Painted as a translucent *background colour* masked by an SVG tile, so the
 * pattern carries no colour of its own and works on any surface in either theme:
 * the element sets `backgroundColor` + `maskImage` from here.
 */
export const TILE = 92;
export const TILE_COLUMNS = 6;

/** [row, column] of each grey cell inside one 6×6 tile of the mask. */
const GREY_CELLS: Array<[number, number]> = [
  [0, 1],
  [0, 4],
  [1, 0],
  [1, 3],
  [2, 1],
  [2, 5],
  [3, 2],
  [3, 4],
  [4, 1],
  [4, 3],
  [5, 0],
];

const tileMask = (cells: Array<[number, number]>) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE * TILE_COLUMNS}" height="${TILE * TILE_COLUMNS}"><g fill="#fff">${cells
      .map(
        ([row, col]) =>
          `<rect x="${col * TILE}" y="${row * TILE}" width="${TILE}" height="${TILE}"/>`,
      )
      .join('')}</g></svg>`,
  )}")`;

export const TILE_MASK = tileMask(GREY_CELLS);
export const TILE_MASK_MIRRORED = tileMask(
  GREY_CELLS.map(([row, col]) => [row, TILE_COLUMNS - 1 - col]),
);

/** The grey itself: a theme token, so both palettes stay in step. */
export const TILE_FILL =
  'color-mix(in oklab, var(--ds-border-strong) 15%, transparent)';
