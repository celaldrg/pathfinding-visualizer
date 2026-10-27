/**
 * Seeded pseudo-random number generator (mulberry32).
 * The same seed always produces the same sequence, so mazes, the demo
 * state and the tests are reproducible.
 */

/**
 * @typedef {object} Rng
 * @property {() => number} next Float in [0, 1).
 * @property {(n: number) => number} int Integer in [0, n) for a positive integer n.
 */

/**
 * Creates a seeded random number generator.
 * @param {number} seed Any number; it is reduced to an unsigned 32-bit integer.
 * @returns {Rng}
 */
export function createRng(seed) {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return { next, int: (n) => Math.floor(next() * n) };
}
