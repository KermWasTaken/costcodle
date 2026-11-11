/* Printer pixel art: [x, y, w, h, color] on a 48×24 grid. */
export const PRINTER_BACK = [
  [3, 0, 42, 1, "#a3a3a3"],
  [2, 1, 44, 3, "#7d7d7d"],
  [1, 2, 46, 2, "#7d7d7d"],
  [3, 2, 42, 1, "#262626"],
];

export const PRINTER_FRONT = [
  [2, 4, 44, 1, "#b0b0b0"],
  [1, 5, 46, 17, "#575757"],
  [0, 6, 48, 15, "#575757"],
  ...Array.from({ length: 21 }, (_, i) => [3 + i * 2, 5, 1, 1, "#8a8a8a"]),
  [1, 6, 46, 1, "#666666"],
  [4, 7, 28, 12, "#262626"],
  [5, 8, 26, 10, "#a7bd8f"],
  [5, 8, 26, 1, "#93aa7c"],
  [35, 8, 8, 7, "#262626"],
  [36, 9, 6, 5, "rgb(227, 42, 54)"],
  [36, 9, 6, 1, "#f2838a"],
  [4, 20, 20, 1, "rgb(227, 42, 54)"],
  [24, 20, 20, 1, "rgb(0, 96, 169)"],
  [1, 21, 46, 2, "#3a3a3a"],
  [3, 23, 7, 1, "#262626"],
  [38, 23, 7, 1, "#262626"],
];

const SPEAKER = [
  [1, 4, 2, 4],
  [3, 3, 1, 6],
  [4, 2, 1, 8],
  [5, 1, 1, 10],
];
const WAVES = [
  [7, 4, 1, 4],
  [9, 2, 1, 8],
];
const MUTED_X = [
  [7, 4],
  [10, 4],
  [8, 5],
  [9, 5],
  [8, 6],
  [9, 6],
  [7, 7],
  [10, 7],
].map(([x, y]) => [x, y, 1, 1]);

export function rectsSvg(rects, viewBox) {
  const body = rects
    .map(
      ([x, y, w, h, fill]) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}"${
          fill ? ` fill="${fill}"` : ""
        }/>`
    )
    .join("");
  return `<svg viewBox="${viewBox}" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${body}</svg>`;
}

export function muteIconSvg(muted) {
  const rects = muted ? [...SPEAKER, ...MUTED_X] : [...SPEAKER, ...WAVES];
  return rectsSvg(rects, "0 0 12 12");
}
