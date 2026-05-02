/**
 * @fileoverview Reliability Estimation and ACK/NACK Decision Logic
 *
 * Implements the threshold-based reliability metric from Chapter 17, Section 17.2.
 *
 * The chapter's key innovation: CRC alone is insufficient for reliable communication.
 * A frame may pass CRC despite containing residual errors (silent miscorrection).
 * This module adds a second layer of verification — a reliability score derived from
 * the Hamming decoder's syndrome output — to catch such cases.
 *
 * Decision flow:
 *   1. CRC must pass (necessary condition for data integrity)
 *   2. Reliability must exceed an adaptive threshold (sufficiency condition)
 *   3. Both conditions must hold for the system to ACK the frame
 *
 * The threshold adapts to channel conditions using κ (kappa), allowing the
 * user to tune the tradeoff between false acceptance rate and throughput.
 *
 * @module services/reliabilityService
 * @see Chapter 17, Section 17.2 — Reliability-based soft-decision HARQ
 * @see Chapter 17, Eq. 17.13 — Adaptive threshold formula
 */

/**
 * Compute a reliability score from the Hamming decoder's correction report.
 *
 * The score reflects how "confident" the decoder is about the result:
 *   - Clean blocks (no errors detected) contribute positively
 *   - Uncorrectable blocks (double errors detected) contribute negatively
 *     with double weight, because they indicate severe corruption
 *
 * Formula: score = (cleanBlocks - 2 × uncorrectableBlocks) / totalBlocks
 *
 * Score interpretation:
 *   +1.0: Perfect — all blocks decoded without any error
 *    0.0: Mixed — roughly balanced errors and clean blocks
 *   -1.0: Severe — almost all blocks had uncorrectable errors
 *
 * @param {object} decodingReport - From hammingService.decodeExtended().report
 * @param {number} decodingReport.totalBlocks - Total Hamming blocks processed
 * @param {number} decodingReport.cleanBlocks - Blocks with zero syndrome
 * @param {number} decodingReport.detectedUncorrectable - Blocks with detected double errors
 * @returns {number} Reliability score clamped to range [-1, 1]
 *
 * @example
 * // 100 blocks: 90 clean, 5 corrected, 5 uncorrectable
 * computeReliability({ totalBlocks: 100, cleanBlocks: 90, detectedUncorrectable: 5 })
 * // returns (90 - 10) / 100 = 0.80
 */
exports.computeReliability = (decodingReport) => {
    const { totalBlocks, cleanBlocks, detectedUncorrectable } = decodingReport;

    if (totalBlocks === 0) return 0;

    // Clean blocks contribute +1, uncorrectable blocks contribute -2
    const score = (cleanBlocks - 2 * detectedUncorrectable) / totalBlocks;

    // Clamp to [-1, 1] range
    return Math.max(-1, Math.min(1, score));
};

/**
 * Compute the adaptive reliability threshold based on channel conditions.
 *
 * Inspired by Chapter 17, Eq. 17.13. The threshold decreases as noise increases,
 * making the system more tolerant at high noise levels (accepting slightly less
 * reliable decodings to avoid excessive retransmissions that would kill throughput).
 *
 * Formula:
 *   expectedErrorBlockFraction = 1 - (1 - p)^8   [P(1+ errors in 8-bit block)]
 *   threshold = 1 - κ × expectedErrorBlockFraction × d_min
 *
 * Parameters:
 *   - d_min = 4 (Extended Hamming(8,4) minimum distance)
 *   - Block size = 8 bits
 *
 * @param {number} kappa - Multiplicative constant, user-configurable (typically 0.5–2.0)
 *   - Low κ (0.5): More strict — requires higher confidence, causes more retransmissions
 *   - High κ (2.0): More lenient — accepts lower confidence, higher throughput
 * @param {number} errorRate - Estimated channel error probability (BSC crossover probability)
 * @returns {number} Threshold value clamped to [0, 1]
 *
 * @example
 * computeThreshold(1.0, 0.01) // returns ~0.969 at 1% error rate
 * computeThreshold(1.0, 0.05) // returns ~0.676 at 5% error rate
 */
exports.computeThreshold = (kappa, errorRate) => {
    /** @type {number} Minimum Hamming distance of Extended Hamming(8,4) */
    const dmin = 4;
    /** @type {number} Block size in bits */
    const blockSize = 8;

    // P(at least 1 error in an 8-bit block) = 1 - P(no errors)
    const expectedErrorBlockFraction = 1 - Math.pow(1 - errorRate, blockSize);

    // Threshold: expected reliability of a correctly-decoded frame minus margin
    const threshold = 1 - kappa * expectedErrorBlockFraction * dmin;

    // Clamp to valid range [0, 1]
    return Math.max(0, Math.min(1, threshold));
};

/**
 * Make the ACK/NACK decision based on CRC verification and reliability score.
 *
 * Implements the dual-check from Chapter 17, Fig 17.4:
 *   - CRC must pass (necessary condition — data structure integrity)
 *   - Reliability must exceed threshold (sufficiency condition — decoder confidence)
 *
 * This dual-check prevents two types of failures:
 *   1. CRC failure: obvious corruption → NACK immediately
 *   2. CRC pass but low reliability: possible silent miscorrection → NACK
 *      (e.g., Hamming "corrected" 3-bit errors into wrong data that happens to pass CRC)
 *
 * @param {boolean} crcPassed - Whether the CRC-16 verification passed
 * @param {number} reliabilityScore - From computeReliability() [-1, 1]
 * @param {number} threshold - From computeThreshold() [0, 1]
 * @returns {{decision: string, reason: string}}
 *   - decision: 'ACK' (accept frame) or 'NACK' (request retransmission)
 *   - reason: Human-readable explanation of the decision
 *
 * @example
 * makeDecision(true, 0.95, 0.85)  // → { decision: 'ACK', reason: '...' }
 * makeDecision(false, 0.95, 0.85) // → { decision: 'NACK', reason: 'CRC failed...' }
 * makeDecision(true, 0.50, 0.85)  // → { decision: 'NACK', reason: 'CRC passed but...' }
 */
exports.makeDecision = (crcPassed, reliabilityScore, threshold) => {
    if (!crcPassed) {
        return {
            decision: "NACK",
            reason: "CRC check failed — data integrity not verified",
        };
    }

    if (reliabilityScore < threshold) {
        return {
            decision: "NACK",
            reason: `CRC passed but reliability (${reliabilityScore.toFixed(4)}) below threshold (${threshold.toFixed(4)}) — insufficient confidence`,
        };
    }

    return {
        decision: "ACK",
        reason: `CRC passed and reliability (${reliabilityScore.toFixed(4)}) meets threshold (${threshold.toFixed(4)})`,
    };
};
