/**
 * @fileoverview Extended Hamming(8,4) Error Correction Service
 *
 * Implements two generations of Hamming coding:
 *
 * **Legacy Hamming(7,4):** Original single-error-correcting code, kept for
 * backward compatibility with the Classic Mode (/api/process endpoint).
 *   - Rate: 4/7 ≈ 0.571
 *   - Capability: Corrects 1-bit errors per 7-bit block
 *
 * **Extended Hamming(8,4):** Upgraded code with double-error detection,
 * used in the HARQ simulation system.
 *   - Rate: 4/8 = 0.5
 *   - Capability: Corrects 1-bit errors, DETECTS 2-bit errors
 *   - Minimum distance: d_min = 4
 *
 * Also provides Incremental Redundancy (IR) functions:
 *   - Punctured encoding: splits 8-bit blocks into IR stages
 *   - Stage-based decoding: reconstructs from partial data
 *   - Majority-vote combining: improves reliability across retransmissions
 *
 * Block format: [d1, d2, d3, d4, p1, p2, p3, p4]
 *   d1-d4: Data bits
 *   p1-p3: Hamming parity bits
 *   p4:    Overall parity bit (XOR of all 7 other bits)
 *
 * @module services/hammingService
 * @see Chapter 17 — Combined error detection and correction
 */

// ============================================================
// SECTION 1: Legacy Hamming(7,4) — Backward Compatibility
// These functions support the original /api/process endpoint.
// ============================================================

/**
 * Calculate the three Hamming(7,4) parity bits for a 4-bit data block.
 * Uses even parity: each parity bit is the XOR of specific data bits.
 *
 * Parity coverage:
 *   p1 = d1 ⊕ d2 ⊕ d4  (covers positions 1, 2, 4)
 *   p2 = d1 ⊕ d3 ⊕ d4  (covers positions 1, 3, 4)
 *   p3 = d2 ⊕ d3 ⊕ d4  (covers positions 2, 3, 4)
 *
 * @param {string|number} d1 - First data bit
 * @param {string|number} d2 - Second data bit
 * @param {string|number} d3 - Third data bit
 * @param {string|number} d4 - Fourth data bit
 * @returns {{p1: number, p2: number, p3: number}} The three parity bits
 */
function calculateParity(d1, d2, d3, d4) {
    const p1 = parseInt(d1) ^ parseInt(d2) ^ parseInt(d4);
    const p2 = parseInt(d1) ^ parseInt(d3) ^ parseInt(d4);
    const p3 = parseInt(d2) ^ parseInt(d3) ^ parseInt(d4);
    return { p1, p2, p3 };
}

/**
 * Encode a binary string using legacy Hamming(7,4) code.
 * Pads input to a multiple of 4, then generates 7-bit blocks: [d1,d2,d3,d4,p1,p2,p3].
 *
 * @param {string} binaryString - Input binary string of '0' and '1' characters
 * @returns {string} Encoded binary string (length = ceil(input/4) * 7)
 *
 * @example
 * encode("1011") → "1011010" (4 data bits + 3 parity bits)
 */
exports.encode = (binaryString) => {
    let encodedData = "";
    let paddedBinary = binaryString;

    // Pad input to make length a multiple of 4
    const remainder = binaryString.length % 4;
    if (remainder !== 0) {
        const paddingNeeded = 4 - remainder;
        paddedBinary += "0".repeat(paddingNeeded);
    }

    // Process every 4 data bits into a 7-bit Hamming block
    for (let i = 0; i < paddedBinary.length; i += 4) {
        const d1 = paddedBinary[i];
        const d2 = paddedBinary[i + 1];
        const d3 = paddedBinary[i + 2];
        const d4 = paddedBinary[i + 3];

        const { p1, p2, p3 } = calculateParity(d1, d2, d3, d4);

        // Output 7-bit block: data bits followed by parity bits
        encodedData += `${d1}${d2}${d3}${d4}${p1}${p2}${p3}`;
    }

    return encodedData;
};

/**
 * Decode a Hamming(7,4) encoded binary string with single-error correction.
 * Computes syndromes for each 7-bit block and corrects identified errors.
 *
 * Syndrome interpretation (s1, s2, s3):
 *   (1,1,0) → d1 error  |  (1,0,1) → d2 error
 *   (0,1,1) → d3 error  |  (1,1,1) → d4 error
 *   Single parity syndrome → parity bit error (data safe)
 *
 * @param {string} noisyBinaryString - Noisy Hamming(7,4) encoded binary string
 * @returns {{correctedBinary: string, correctionReport: {correctedErrors: number, efficiency: string}}}
 *   - correctedBinary: Decoded 4-bit data blocks concatenated
 *   - correctionReport: Statistics about error correction
 */
exports.decode = (noisyBinaryString) => {
    let correctedBinary = "";
    let totalErrorsCorrected = 0;

    // Process every 7-bit block
    for (let i = 0; i < noisyBinaryString.length; i += 7) {
        let d1 = parseInt(noisyBinaryString[i]);
        let d2 = parseInt(noisyBinaryString[i + 1]);
        let d3 = parseInt(noisyBinaryString[i + 2]);
        let d4 = parseInt(noisyBinaryString[i + 3]);
        let p1 = parseInt(noisyBinaryString[i + 4]);
        let p2 = parseInt(noisyBinaryString[i + 5]);
        let p3 = parseInt(noisyBinaryString[i + 6]);

        // Syndrome calculation: compare received parity with expected
        const s1 = p1 ^ (d1 ^ d2 ^ d4);
        const s2 = p2 ^ (d1 ^ d3 ^ d4);
        const s3 = p3 ^ (d2 ^ d3 ^ d4);

        if (s1 === 0 && s2 === 0 && s3 === 0) {
            // No error detected
            correctedBinary += `${d1}${d2}${d3}${d4}`;
        } else {
            let errorFound = true;

            // Identify and correct the flipped bit based on syndrome pattern
            if (s1 && s2 && !s3)
                d1 ^= 1; // d1 error: (1,1,0)
            else if (s1 && !s2 && s3)
                d2 ^= 1; // d2 error: (1,0,1)
            else if (!s1 && s2 && s3)
                d3 ^= 1; // d3 error: (0,1,1)
            else if (s1 && s2 && s3)
                d4 ^= 1; // d4 error: (1,1,1)
            else if (s1 || s2 || s3) {
                // Error is in a parity bit — data bits are unaffected
            } else {
                errorFound = false;
            }

            if (errorFound) totalErrorsCorrected++;
            correctedBinary += `${d1}${d2}${d3}${d4}`;
        }
    }

    return {
        correctedBinary,
        correctionReport: {
            correctedErrors: totalErrorsCorrected,
            efficiency: "Calculated based on total noise",
        },
    };
};

// ============================================================
// SECTION 2: Extended Hamming(8,4) — HARQ System
// These functions add double-error detection via an overall parity bit.
// ============================================================

/**
 * Compute all four parity bits for Extended Hamming(8,4).
 * p1-p3 are standard Hamming parity; p4 is the overall parity (XOR of all 7 bits).
 *
 * @param {string|number} d1 - First data bit
 * @param {string|number} d2 - Second data bit
 * @param {string|number} d3 - Third data bit
 * @param {string|number} d4 - Fourth data bit
 * @returns {{p1: number, p2: number, p3: number, p4: number}} All four parity bits
 */
function calculateExtendedParity(d1, d2, d3, d4) {
    const b1 = parseInt(d1);
    const b2 = parseInt(d2);
    const b3 = parseInt(d3);
    const b4 = parseInt(d4);

    const p1 = b1 ^ b2 ^ b4; // covers d1, d2, d4
    const p2 = b1 ^ b3 ^ b4; // covers d1, d3, d4
    const p3 = b2 ^ b3 ^ b4; // covers d2, d3, d4
    const p4 = b1 ^ b2 ^ b3 ^ b4 ^ p1 ^ p2 ^ p3; // overall parity

    return { p1, p2, p3, p4 };
}

/**
 * Encode a binary string using Extended Hamming(8,4).
 * Each 4 data bits produce an 8-bit coded block: [d1, d2, d3, d4, p1, p2, p3, p4].
 * Input is padded to a multiple of 4; padding count is returned for stripping after decode.
 *
 * @param {string} binaryString - Input binary string of '0' and '1' characters
 * @returns {{encoded: string, paddingBits: number}}
 *   - encoded: Hamming-encoded binary (length = ceil(input/4) * 8)
 *   - paddingBits: Number of padding bits added (0-3), must be stripped after decode
 *
 * @example
 * const result = encodeExtended("10110100");
 * // result.encoded = "10110100xxxxxxxx" (2 blocks of 8 bits)
 * // result.paddingBits = 0
 */
exports.encodeExtended = (binaryString) => {
    let encoded = "";
    let paddedBinary = binaryString;
    /** @type {number} Count of padding bits added to make input multiple of 4 */
    let paddingBits = 0;

    const remainder = binaryString.length % 4;
    if (remainder !== 0) {
        paddingBits = 4 - remainder;
        paddedBinary += "0".repeat(paddingBits);
    }

    // Process every 4 data bits into an 8-bit Extended Hamming block
    for (let i = 0; i < paddedBinary.length; i += 4) {
        const d1 = paddedBinary[i];
        const d2 = paddedBinary[i + 1];
        const d3 = paddedBinary[i + 2];
        const d4 = paddedBinary[i + 3];

        const { p1, p2, p3, p4 } = calculateExtendedParity(d1, d2, d3, d4);
        encoded += `${d1}${d2}${d3}${d4}${p1}${p2}${p3}${p4}`;
    }

    return { encoded, paddingBits };
};

/**
 * Decode an Extended Hamming(8,4) encoded binary string.
 *
 * For each 8-bit block, computes the syndrome (s1, s2, s3) and overall parity check.
 * Decision matrix:
 *   - syndrome=000, parity OK  → No error (clean block)
 *   - syndrome≠000, parity FAIL → Single error → CORRECT it
 *   - syndrome≠000, parity OK  → Double error → DETECT only (uncorrectable)
 *   - syndrome=000, parity FAIL → p4 error only → Data is safe
 *
 * @param {string} encodedString - Binary string of 8-bit Extended Hamming blocks
 * @param {number} [paddingBits=0] - Number of padding bits to strip from final output
 * @returns {{decoded: string, report: {totalBlocks: number, cleanBlocks: number, correctedErrors: number, detectedUncorrectable: number, blockErrorRate: number}}}
 *   - decoded: Corrected data bits with padding stripped
 *   - report: Detailed statistics about error correction/detection
 */
exports.decodeExtended = (encodedString, paddingBits = 0) => {
    let decoded = "";
    /** @type {number} Blocks where single error was corrected */
    let correctedCount = 0;
    /** @type {number} Blocks where double error was detected but not correctable */
    let detectedUncorrectableCount = 0;
    /** @type {number} Blocks with no errors */
    let cleanBlockCount = 0;
    /** @type {number} Total number of 8-bit blocks processed */
    const totalBlocks = Math.floor(encodedString.length / 8);

    for (let i = 0; i < encodedString.length; i += 8) {
        if (i + 8 > encodedString.length) break; // skip incomplete trailing block

        // Extract all 8 bits of the block
        let d1 = parseInt(encodedString[i]);
        let d2 = parseInt(encodedString[i + 1]);
        let d3 = parseInt(encodedString[i + 2]);
        let d4 = parseInt(encodedString[i + 3]);
        let p1 = parseInt(encodedString[i + 4]);
        let p2 = parseInt(encodedString[i + 5]);
        let p3 = parseInt(encodedString[i + 6]);
        let p4 = parseInt(encodedString[i + 7]);

        // Compute syndrome: compare received parity with recalculated parity
        const s1 = p1 ^ (d1 ^ d2 ^ d4);
        const s2 = p2 ^ (d1 ^ d3 ^ d4);
        const s3 = p3 ^ (d2 ^ d3 ^ d4);

        // Overall parity check: XOR of all 8 bits should be 0 if no errors
        const overallParity = d1 ^ d2 ^ d3 ^ d4 ^ p1 ^ p2 ^ p3 ^ p4;
        const syndromeNonZero = s1 !== 0 || s2 !== 0 || s3 !== 0;

        if (!syndromeNonZero && overallParity === 0) {
            // Case 1: No error — all checks pass
            cleanBlockCount++;
        } else if (syndromeNonZero && overallParity === 1) {
            // Case 2: Single error — syndrome points to the bad bit, correct it
            if (s1 && s2 && !s3)
                d1 ^= 1; // d1 error: syndrome (1,1,0)
            else if (s1 && !s2 && s3)
                d2 ^= 1; // d2 error: syndrome (1,0,1)
            else if (!s1 && s2 && s3)
                d3 ^= 1; // d3 error: syndrome (0,1,1)
            else if (s1 && s2 && s3) d4 ^= 1; // d4 error: syndrome (1,1,1)
            // If syndrome matches a single parity bit (e.g., s1=1 only), the error
            // is in p1 itself — data bits are unaffected
            correctedCount++;
        } else if (syndromeNonZero && overallParity === 0) {
            // Case 3: Double error — detected but NOT correctable
            // The syndrome is non-zero but overall parity passes, indicating
            // an even number of errors. This is the key advantage of Extended Hamming.
            detectedUncorrectableCount++;
        } else if (!syndromeNonZero && overallParity === 1) {
            // Case 4: Error in p4 only — data bits are safe
            correctedCount++;
        }

        // Emit the (possibly corrected) 4 data bits
        decoded += `${d1}${d2}${d3}${d4}`;
    }

    // Strip padding bits that were added during encoding
    if (paddingBits > 0 && decoded.length >= paddingBits) {
        decoded = decoded.substring(0, decoded.length - paddingBits);
    }

    return {
        decoded,
        report: {
            totalBlocks,
            cleanBlocks: cleanBlockCount,
            correctedErrors: correctedCount,
            detectedUncorrectable: detectedUncorrectableCount,
            blockErrorRate:
                totalBlocks > 0
                    ? (correctedCount + detectedUncorrectableCount) /
                      totalBlocks
                    : 0,
        },
    };
};

// ============================================================
// SECTION 3: Punctured Encoding for Incremental Redundancy (IR)
// Splits the Extended Hamming(8,4) output into stages for the HARQ loop.
// ============================================================

/**
 * Encode with Extended Hamming(8,4) and split into IR stages.
 *
 * Puncturing strategy per block:
 *   Stage 1: bits [0-5] = d1, d2, d3, d4, p1, p2 → 6 bits/block (rate 4/6 ≈ 0.67)
 *   Stage 2: bits [6-7] = p3, p4              → 2 bits/block (combined rate 4/8 = 0.5)
 *   Stage 3+: Full 8-bit retransmission for majority combining
 *
 * @param {string} binaryString - Input binary data (e.g., Huffman output + CRC)
 * @returns {{stage1Bits: string, stage2Bits: string, fullEncoded: string, paddingBits: number, totalBlocks: number}}
 *   - stage1Bits: Concatenated 6-bit punctured blocks for Stage 1
 *   - stage2Bits: Concatenated 2-bit remaining parity for Stage 2
 *   - fullEncoded: Complete 8-bit encoded string for Stage 3+ retransmissions
 *   - paddingBits: Padding count for stripping after decode
 *   - totalBlocks: Number of 8-bit Hamming blocks
 */
exports.encodePunctured = (binaryString) => {
    const { encoded, paddingBits } = exports.encodeExtended(binaryString);
    const totalBlocks = encoded.length / 8;

    /** @type {string} Concatenated first 6 bits of each block */
    let stage1Bits = "";
    /** @type {string} Concatenated last 2 bits of each block */
    let stage2Bits = "";

    for (let i = 0; i < encoded.length; i += 8) {
        // Stage 1: data bits + partial parity (d1, d2, d3, d4, p1, p2)
        stage1Bits += encoded.substring(i, i + 6);
        // Stage 2: remaining parity (p3, p4)
        stage2Bits += encoded.substring(i + 6, i + 8);
    }

    return {
        stage1Bits,
        stage2Bits,
        fullEncoded: encoded,
        paddingBits,
        totalBlocks,
    };
};

/**
 * Reconstruct full 8-bit blocks from received IR stage data and decode.
 *
 * If only Stage 1 data is available (6 bits/block), inserts zeros for the
 * missing p3 and p4 positions before attempting Hamming decode. The code
 * is weaker in this mode (effectively rate 4/6) but may still decode correctly
 * if the noise is low enough.
 *
 * @param {string} stage1Received - 6 bits per block (possibly noisy), concatenated
 * @param {string|null} stage2Received - 2 bits per block, or null if not yet received
 * @param {number} paddingBits - Padding bits to strip after decoding
 * @param {number} totalBlocks - Expected number of Hamming blocks
 * @returns {{decoded: string, report: object}} Same format as decodeExtended()
 */
exports.decodeFromStages = (
    stage1Received,
    stage2Received,
    paddingBits,
    totalBlocks,
) => {
    /** @type {string} Reconstructed full 8-bit blocks */
    let reconstructed = "";

    for (let b = 0; b < totalBlocks; b++) {
        const s1Start = b * 6;
        const blockStage1 = stage1Received.substring(s1Start, s1Start + 6);

        if (stage2Received) {
            // Full data available — reconstruct complete 8-bit block
            const s2Start = b * 2;
            const blockStage2 = stage2Received.substring(s2Start, s2Start + 2);
            reconstructed += blockStage1 + blockStage2;
        } else {
            // Missing Stage 2 — insert zeros for p3 and p4
            reconstructed += blockStage1 + "00";
        }
    }

    return exports.decodeExtended(reconstructed, paddingBits);
};

/**
 * Majority-vote combine multiple received copies of the same binary data.
 *
 * For each bit position, counts the number of '1's and '0's across all copies.
 * The majority value wins. In case of a tie (equal count), the first copy's
 * value is kept (conservative approach).
 *
 * Used in IR Stage 3+ where the receiver has multiple (noisy) copies of the
 * same codeword and combines them before Hamming decoding for improved reliability.
 *
 * @param {string[]} copies - Array of binary strings (must all be the same length)
 * @returns {string} Combined binary string using bit-level majority vote
 *
 * @example
 * majorityVoteCombine(["110", "100", "110"]) → "110" (bit 1: 1>0, bit 2: 1=0→keep first, bit 3: 0>1)
 */
exports.majorityVoteCombine = (copies) => {
    if (copies.length === 0) return "";
    if (copies.length === 1) return copies[0];

    const length = copies[0].length;
    /** @type {string} Output combined binary string */
    let combined = "";

    for (let i = 0; i < length; i++) {
        /** @type {number} Count of '1' bits at position i across all copies */
        let ones = 0;
        /** @type {number} Count of '0' bits at position i across all copies */
        let zeros = 0;

        for (const copy of copies) {
            if (i < copy.length) {
                if (copy[i] === "1") ones++;
                else zeros++;
            }
        }

        // Majority wins; on tie, keep the first copy's value (conservative)
        if (ones > zeros) {
            combined += "1";
        } else if (zeros > ones) {
            combined += "0";
        } else {
            combined += copies[0][i];
        }
    }

    return combined;
};
