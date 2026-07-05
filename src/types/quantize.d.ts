// `quantize` ships no types and its own JS isn't meant to be type-checked
// as part of this project (allowJs+checkJs would otherwise pull its real
// source into the program). A minimal ambient declaration matching the
// slice of its API this project actually uses (see model/importRaster.js).
declare module 'quantize' {
  interface ColorMap {
    palette(): number[][];
    map(pixel: number[]): number[];
  }
  export default function quantize(pixels: number[][], maxColors: number): ColorMap;
}
