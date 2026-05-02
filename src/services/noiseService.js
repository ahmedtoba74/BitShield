/**
 * @fileoverview Noise Injection Service — Binary Symmetric Channel (BSC) Simulator
 *
 * Simulates a noisy communication channel by randomly flipping bits in a binary string.
 * Each bit is independently flipped with probability p (the crossover probability).
 *
 * Two modes of operation:
 * - **Random (legacy):** Uses Math.random() — non-deterministic, for single simulations
 * - **Seeded (new):** Uses Mulberry32 PRNG — deterministic, for fair comparative simulations
 *
 * The seeded mode ensures that when comparing four protection systems (No Protection,
 * CRC-only, Hamming-only, Combined IR), all four face the exact same noise pattern.
 *
 * @module services/noiseService
 * @see {@link https://en.wikipedia.org/wiki/Binary_symmetric_channel}
 */

/**
 * Mulberry32 — A fast, seedable 32-bit PRNG (Pseudo-Random Number Generator).
 *
 * Given the same seed, it always produces the same sequence of numbers.
 * This is critical for fair comparative simulations where all 4 protection
 * systems must face identical channel conditions.
 *
 * Algorithm: Based on the Mulberry32 hash function. Produces uniformly
 * distributed floats in [0, 1) with a period of 2^32.
 *
 * @param {number} seed - Integer seed value for the PRNG
 * @returns {function(): number} A function that returns the next pseudo-random
 *   float in the range [0, 1) on each call
 *
 * @example
 * const rng = mulberry32(42);
 * console.log(rng()); // always 0.6011... for seed 42
 * console.log(rng()); // always 0.4433... (next in sequence)
 */
function mulberry32(seed) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Inject noise into a binary string using Math.random() (non-deterministic).
 *
 * Each bit is independently flipped with probability `errorRate`.
 * This models a memoryless Binary Symmetric Channel (BSC).
 *
 * Kept for backward compatibility with the legacy `/api/process` endpoint.
 * For new simulation code, use `injectNoiseSeeded()` instead.
 *
 * @param {string} binaryString - Input binary string of '0' and '1' characters
 * @param {number} [errorRate=0.05] - Probability of flipping each bit (0.0 to 1.0)
 * @returns {{noisyData: string, noiseReport: {totalErrors: number}}}
 *   - noisyData: The binary string after noise injection
 *   - noiseReport.totalErrors: Count of bits that were flipped
 *
 * @example
 * const result = injectNoise("11001100", 0.1);
 * // result.noisyData might be "11011100" (1 bit flipped)
 * // result.noiseReport.totalErrors = 1
 */
exports.injectNoise = (binaryString, errorRate = 0.05) => {
    /** @type {string} Output binary string with noise applied */
    let noisyData = "";
    /** @type {number} Running count of flipped bits */
    let totalErrors = 0;

    for (let char of binaryString) {
        if (Math.random() < errorRate) {
            // Flip the bit: 0→1 or 1→0
            noisyData += char === "0" ? "1" : "0";
            totalErrors++;
        } else {
            noisyData += char;
        }
    }

    return {
        noisyData,
        noiseReport: { totalErrors },
    };
};

/**
 * Inject noise using a seedable PRNG for deterministic, reproducible results.
 *
 * Identical to `injectNoise()` but uses the Mulberry32 PRNG instead of Math.random().
 * This guarantees that given the same seed, the same bits are always flipped.
 *
 * Used in comparative simulations so all 4 protection systems face identical
 * channel conditions, making the comparison scientifically valid.
 *
 * Also records the exact positions of flipped bits (useful for debugging and analysis).
 *
 * @param {string} binaryString - Input binary string of '0' and '1' characters
 * @param {number} errorRate - Probability of flipping each bit (0.0 to 1.0)
 * @param {number} seed - Integer seed for the Mulberry32 PRNG
 * @returns {{noisyData: string, noiseReport: {totalErrors: number, errorPositions: number[]}}}
 *   - noisyData: The binary string after deterministic noise injection
 *   - noiseReport.totalErrors: Count of bits that were flipped
 *   - noiseReport.errorPositions: Array of 0-indexed positions where bits were flipped
 *
 * @example
 * // Same seed always produces the same noise pattern
 * const r1 = injectNoiseSeeded("11001100", 0.1, 42);
 * const r2 = injectNoiseSeeded("11001100", 0.1, 42);
 * console.log(r1.noisyData === r2.noisyData); // true
 */
exports.injectNoiseSeeded = (binaryString, errorRate, seed) => {
    /** @type {function(): number} Seeded PRNG instance */
    const rng = mulberry32(seed);
    /** @type {string} Output binary string with noise applied */
    let noisyData = "";
    /** @type {number} Running count of flipped bits */
    let totalErrors = 0;
    /** @type {number[]} Indices of flipped bit positions */
    const errorPositions = [];

    for (let i = 0; i < binaryString.length; i++) {
        if (rng() < errorRate) {
            // Flip the bit: 0→1 or 1→0
            noisyData += binaryString[i] === "0" ? "1" : "0";
            totalErrors++;
            errorPositions.push(i);
        } else {
            noisyData += binaryString[i];
        }
    }

    return {
        noisyData,
        noiseReport: { totalErrors, errorPositions },
    };
};
