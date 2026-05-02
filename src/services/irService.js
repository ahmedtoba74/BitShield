/**
 * @fileoverview Incremental Redundancy (IR) Service — Core HARQ Simulation Controller
 *
 * This is the heart of the BitShield HARQ system. It orchestrates the full
 * Chapter 17 pipeline from text input to final decoded output, managing the
 * complete Incremental Redundancy feedback loop.
 *
 * Three main functions:
 *   - createIRSession():          Single HARQ simulation with IR loop
 *   - runComparativeSimulation(): Same data through 4 protection systems
 *   - runMonteCarlo():            Sweep error rates for Chart.js plotting
 *
 * Pipeline per frame:
 *   Text → Huffman → CRC-16 append → Extended Hamming(8,4) → Puncture → BSC → Decode → Check → ACK/NACK
 *
 * IR Stage progression:
 *   Stage 1: Punctured code (6 bits/block, rate 4/6 ≈ 0.67)
 *   Stage 2: Remaining parity (2 bits/block, combined rate 4/8 = 0.50)
 *   Stage 3+: Full retransmission with majority-vote combining
 *
 * @module services/irService
 * @requires services/huffmanService
 * @requires services/crcService
 * @requires services/hammingService
 * @requires services/noiseService
 * @requires services/reliabilityService
 * @see Chapter 17 — Combined error detection and correction with Incremental Redundancy
 */

const huffmanService = require("./huffmanService");
const crcService = require("./crcService");
const hammingService = require("./hammingService");
const noiseService = require("./noiseService");
const reliabilityService = require("./reliabilityService");

/**
 * Run a single HARQ simulation for one frame (one file).
 * This is the master function implementing the full IR loop.
 *
 * Flow:
 *   1. TRANSMITTER: Huffman encode → CRC-16 append → Hamming(8,4) encode → Puncture
 *   2. CHANNEL: Send Stage 1 bits through BSC
 *   3. RECEIVER: Decode → CRC check → Reliability check → ACK/NACK decision
 *   4. LOOP: If NACK, transmitter sends next stage; receiver combines and re-decodes
 *   5. OUTPUT: Final text, per-stage timeline, and performance metrics
 *
 * @param {string} originalText - The original text content to transmit
 * @param {object} [options] - Simulation configuration
 * @param {number} [options.errorRate=0.01] - BSC crossover probability (range: 0 to ~0.15)
 * @param {number} [options.maxStages=4] - Maximum IR stages before declaring failure
 * @param {number} [options.kappa=1.0] - Reliability threshold multiplier (0.5=strict, 2.0=lenient)
 * @param {number|null} [options.seed=null] - PRNG seed for deterministic noise (null = random)
 * @returns {{success: boolean, finalText: string, stages: object[], metrics: object, compressionStats: object}}
 *   - success: Whether ACK was received within maxStages
 *   - finalText: The decoded/restored text
 *   - stages: Array of per-stage results (bits sent, errors, CRC, reliability, decision)
 *   - metrics: {ber, frameError, undetectedError, throughput, totalRetransmissions, ...}
 *   - compressionStats: {originalBits, compressedBits, compressionRatio}
 */
exports.createIRSession = (originalText, options = {}) => {
    const {
        errorRate = 0.01,
        maxStages = 4,
        kappa = 1.0,
        seed = null,
    } = options;

    // ========== TRANSMITTER SIDE ==========

    // Step 1: Huffman encoding (source coding)
    const { frequencyMap } = huffmanService.analyzeProbabilities(originalText);
    const { encodedBinary, huffmanTree, codesMap } = huffmanService.encode(
        originalText,
        frequencyMap,
    );
    const huffmanLength = encodedBinary.length;

    // Step 2: CRC-16 append (error detection on compressed payload)
    const { protected: crcProtected, payloadLength: crcPayloadLength } =
        crcService.appendCRC(encodedBinary);

    // Step 3: Extended Hamming(8,4) encode with puncturing for IR
    const {
        stage1Bits: cleanStage1,
        stage2Bits: cleanStage2,
        fullEncoded: cleanFull,
        paddingBits,
        totalBlocks,
    } = hammingService.encodePunctured(crcProtected);

    // Compute reliability threshold
    const threshold = reliabilityService.computeThreshold(kappa, errorRate);

    // ========== CHANNEL + RECEIVER SIDE (IR LOOP) ==========

    const stages = [];
    let currentSeed =
        seed !== null ? seed : Math.floor(Math.random() * 1000000);
    let success = false;
    let finalText = "";
    let totalBitsTransmitted = 0;

    // Store received copies for majority combining in Stage 3+
    const fullCopies = [];

    // Stage 1: Transmit punctured code (6 bits/block)
    let receivedStage1 = null;
    let receivedStage2 = null;

    for (let stageNum = 1; stageNum <= maxStages; stageNum++) {
        let stageBitsSent = 0;
        let stageNoisyBits = "";
        let noiseReport;

        if (stageNum === 1) {
            // Send punctured code: d1 d2 d3 d4 p1 p2 per block
            const result = noiseService.injectNoiseSeeded(
                cleanStage1,
                errorRate,
                currentSeed++,
            );
            receivedStage1 = result.noisyData;
            noiseReport = result.noiseReport;
            stageBitsSent = cleanStage1.length;
        } else if (stageNum === 2) {
            // Send remaining parity: p3 p4 per block
            const result = noiseService.injectNoiseSeeded(
                cleanStage2,
                errorRate,
                currentSeed++,
            );
            receivedStage2 = result.noisyData;
            noiseReport = result.noiseReport;
            stageBitsSent = cleanStage2.length;
        } else {
            // Stage 3+: Retransmit full codeword for majority combining
            const result = noiseService.injectNoiseSeeded(
                cleanFull,
                errorRate,
                currentSeed++,
            );
            fullCopies.push(result.noisyData);
            noiseReport = result.noiseReport;
            stageBitsSent = cleanFull.length;
        }

        totalBitsTransmitted += stageBitsSent;

        // ---- Receiver: Decode ----
        let decodeResult;

        if (stageNum <= 2) {
            // Use stage-based decoding (possibly partial)
            decodeResult = hammingService.decodeFromStages(
                receivedStage1,
                receivedStage2,
                paddingBits,
                totalBlocks,
            );
        } else {
            // Stage 3+: Combine all received data and decode
            // Reconstruct the Stage 1+2 version as one "copy"
            let stage12reconstructed = "";
            for (let b = 0; b < totalBlocks; b++) {
                stage12reconstructed += receivedStage1.substring(
                    b * 6,
                    b * 6 + 6,
                );
                if (receivedStage2) {
                    stage12reconstructed += receivedStage2.substring(
                        b * 2,
                        b * 2 + 2,
                    );
                } else {
                    stage12reconstructed += "00";
                }
            }

            const allCopies = [stage12reconstructed, ...fullCopies];

            if (allCopies.length === 2) {
                // SPECIAL CASE: 2 copies — majority vote degenerates (ties → first copy).
                // Instead, decode BOTH independently and pick the one with better reliability.
                const decode1 = hammingService.decodeExtended(
                    allCopies[0],
                    paddingBits,
                );
                const decode2 = hammingService.decodeExtended(
                    allCopies[1],
                    paddingBits,
                );

                const rel1 = reliabilityService.computeReliability(
                    decode1.report,
                );
                const rel2 = reliabilityService.computeReliability(
                    decode2.report,
                );

                // Pick the decode with higher reliability (fewer uncorrectable blocks)
                decodeResult = rel2 > rel1 ? decode2 : decode1;
            } else {
                // 3+ copies: true majority vote is effective
                const combined = hammingService.majorityVoteCombine(allCopies);
                decodeResult = hammingService.decodeExtended(
                    combined,
                    paddingBits,
                );
            }
        }

        // ---- Receiver: CRC Check ----
        const crcResult = crcService.checkCRC(
            decodeResult.decoded,
            crcPayloadLength,
        );

        // ---- Receiver: Reliability Check ----
        const reliability = reliabilityService.computeReliability(
            decodeResult.report,
        );
        const decision = reliabilityService.makeDecision(
            crcResult.isValid,
            reliability,
            threshold,
        );

        // Record stage info
        stages.push({
            stageNumber: stageNum,
            bitsSent: stageBitsSent,
            totalBitsAccumulated: totalBitsTransmitted,
            noiseReport: {
                totalErrors: noiseReport.totalErrors,
            },
            decodingReport: decodeResult.report,
            crcPassed: crcResult.isValid,
            reliabilityScore: reliability,
            threshold: threshold,
            decision: decision.decision,
            decisionReason: decision.reason,
        });

        // If ACK, we're done
        if (decision.decision === "ACK") {
            success = true;
            // Huffman decode the CRC payload
            try {
                finalText = huffmanService.decode(
                    crcResult.payload,
                    huffmanTree,
                );
            } catch (e) {
                // Huffman decode failed — undetected error caused desync
                finalText = "[DECODE ERROR: Huffman synchronization lost]";
                success = false;
            }
            break;
        }
    }

    // If all stages exhausted without ACK, attempt final decode anyway
    if (!success) {
        const lastStage = stages[stages.length - 1];
        // Try to decode with whatever we have
        let finalDecodeResult;
        if (fullCopies.length > 0) {
            let stage12reconstructed = "";
            for (let b = 0; b < totalBlocks; b++) {
                stage12reconstructed += receivedStage1.substring(
                    b * 6,
                    b * 6 + 6,
                );
                if (receivedStage2) {
                    stage12reconstructed += receivedStage2.substring(
                        b * 2,
                        b * 2 + 2,
                    );
                } else {
                    stage12reconstructed += "00";
                }
            }
            const allCopies = [stage12reconstructed, ...fullCopies];
            if (allCopies.length === 2) {
                const d1 = hammingService.decodeExtended(
                    allCopies[0],
                    paddingBits,
                );
                const d2 = hammingService.decodeExtended(
                    allCopies[1],
                    paddingBits,
                );
                const r1 = reliabilityService.computeReliability(d1.report);
                const r2 = reliabilityService.computeReliability(d2.report);
                finalDecodeResult = r2 > r1 ? d2 : d1;
            } else {
                const combined = hammingService.majorityVoteCombine(allCopies);
                finalDecodeResult = hammingService.decodeExtended(
                    combined,
                    paddingBits,
                );
            }
        } else if (receivedStage2) {
            finalDecodeResult = hammingService.decodeFromStages(
                receivedStage1,
                receivedStage2,
                paddingBits,
                totalBlocks,
            );
        } else {
            finalDecodeResult = hammingService.decodeFromStages(
                receivedStage1,
                null,
                paddingBits,
                totalBlocks,
            );
        }

        const crcResult = crcService.checkCRC(
            finalDecodeResult.decoded,
            crcPayloadLength,
        );
        try {
            finalText = huffmanService.decode(
                crcResult.payload ||
                    finalDecodeResult.decoded.substring(0, crcPayloadLength),
                huffmanTree,
            );
        } catch (e) {
            finalText =
                "[DECODE ERROR: Could not recover text after max retransmissions]";
        }
    }

    // ========== METRICS ==========

    // Compute BER (bit error rate on the decoded payload vs original)
    let bitErrors = 0;
    const originalBinary = encodedBinary; // Huffman encoded binary (the source data)
    let decodedPayload = "";
    try {
        // Re-encode the final text to compare at bit level
        if (finalText && !finalText.startsWith("[DECODE ERROR")) {
            const reEncoded = huffmanService.encode(finalText, frequencyMap);
            decodedPayload = reEncoded.encodedBinary;
        }
    } catch (e) {
        decodedPayload = "";
    }

    const compareLength = Math.min(
        originalBinary.length,
        decodedPayload.length,
    );
    for (let i = 0; i < compareLength; i++) {
        if (originalBinary[i] !== decodedPayload[i]) bitErrors++;
    }
    // Count length mismatch as errors too
    bitErrors += Math.abs(originalBinary.length - decodedPayload.length);

    const ber =
        originalBinary.length > 0 ? bitErrors / originalBinary.length : 1;
    const frameError = finalText !== originalText;
    const undetectedError = success && frameError; // CRC passed but data wrong

    // Throughput = useful bits / total transmitted bits
    const throughput =
        totalBitsTransmitted > 0 ? huffmanLength / totalBitsTransmitted : 0;

    return {
        success,
        finalText,
        stages,
        metrics: {
            originalTextLength: originalText.length,
            huffmanBits: huffmanLength,
            crcBits: 16,
            totalHammingBlocks: totalBlocks,
            paddingBits,
            totalBitsTransmitted,
            totalRetransmissions: stages.length - 1,
            ber,
            frameError,
            undetectedError,
            throughput,
        },
        compressionStats: {
            originalBits: originalText.length * 8,
            compressedBits: huffmanLength,
            compressionRatio: (
                (1 - huffmanLength / (originalText.length * 8)) *
                100
            ).toFixed(2),
        },
    };
};

/**
 * Run the same text through all 4 systems for comparison.
 * Uses the same seeded noise for fair comparison.
 *
 * Systems:
 *   A: No protection (raw binary through BSC)
 *   B: CRC-16 only (pure ARQ — retransmit everything on CRC failure)
 *   C: Extended Hamming only (FEC, no retransmission)
 *   D: Combined CRC + Hamming + IR (the full Chapter 17 system)
 *
 * @param {string} originalText
 * @param {object} options - {errorRate, maxStages, kappa, seed}
 * @returns {object} Results for all 4 systems
 */
exports.runComparativeSimulation = (originalText, options = {}) => {
    const {
        errorRate = 0.01,
        maxStages = 4,
        kappa = 1.0,
        seed = null,
    } = options;

    const baseSeed = seed !== null ? seed : Math.floor(Math.random() * 1000000);

    // Pre-compute Huffman encoding (shared across all systems)
    const { frequencyMap } = huffmanService.analyzeProbabilities(originalText);
    const { encodedBinary, huffmanTree } = huffmanService.encode(
        originalText,
        frequencyMap,
    );

    // ========== System A: No Protection ==========
    const sysA_noise = noiseService.injectNoiseSeeded(
        encodedBinary,
        errorRate,
        baseSeed,
    );
    let sysA_text;
    try {
        sysA_text = huffmanService.decode(sysA_noise.noisyData, huffmanTree);
    } catch (e) {
        sysA_text = "";
    }
    const sysA_ber = computeBER(encodedBinary, sysA_noise.noisyData);

    // ========== System B: CRC-16 Only (Pure ARQ) ==========
    const { protected: crcData, payloadLength } =
        crcService.appendCRC(encodedBinary);
    let sysB_totalBits = 0;
    let sysB_retransmissions = 0;
    let sysB_success = false;
    let sysB_text = "";
    let sysB_seed = baseSeed + 100;

    for (let attempt = 0; attempt < maxStages; attempt++) {
        const noise = noiseService.injectNoiseSeeded(
            crcData,
            errorRate,
            sysB_seed++,
        );
        sysB_totalBits += crcData.length;

        const check = crcService.checkCRC(noise.noisyData, payloadLength);
        if (check.isValid) {
            sysB_success = true;
            try {
                sysB_text = huffmanService.decode(check.payload, huffmanTree);
            } catch (e) {
                sysB_text = "";
            }
            break;
        }
        sysB_retransmissions++;
    }

    // If all attempts failed, decode last received anyway
    if (!sysB_success) {
        const lastNoise = noiseService.injectNoiseSeeded(
            crcData,
            errorRate,
            sysB_seed - 1,
        );
        try {
            sysB_text = huffmanService.decode(
                lastNoise.noisyData.substring(0, payloadLength),
                huffmanTree,
            );
        } catch (e) {
            sysB_text = "";
        }
    }

    const sysB_ber =
        encodedBinary.length > 0 ? computeTextBER(originalText, sysB_text) : 1;

    // ========== System C: Extended Hamming Only (No retransmission) ==========
    const { encoded: hammingEncoded, paddingBits } =
        hammingService.encodeExtended(encodedBinary);
    const sysC_noise = noiseService.injectNoiseSeeded(
        hammingEncoded,
        errorRate,
        baseSeed + 200,
    );
    const sysC_decoded = hammingService.decodeExtended(
        sysC_noise.noisyData,
        paddingBits,
    );
    let sysC_text;
    try {
        sysC_text = huffmanService.decode(sysC_decoded.decoded, huffmanTree);
    } catch (e) {
        sysC_text = "";
    }

    // ========== System D: Combined IR (Full Chapter 17) ==========
    const sysD = exports.createIRSession(originalText, {
        errorRate,
        maxStages,
        kappa,
        seed: baseSeed + 300,
    });

    return {
        errorRate,
        originalText,
        systems: {
            noProtection: {
                label: "No Protection",
                ber: sysA_ber,
                frameError: sysA_text !== originalText,
                throughput: 1.0, // All bits are useful, no redundancy
                totalBitsTransmitted: encodedBinary.length,
                retransmissions: 0,
                restoredText: sysA_text,
            },
            crcOnly: {
                label: "CRC-16 Only (ARQ)",
                ber: sysB_ber,
                frameError: sysB_text !== originalText,
                throughput:
                    sysB_totalBits > 0
                        ? encodedBinary.length / sysB_totalBits
                        : 0,
                totalBitsTransmitted: sysB_totalBits,
                retransmissions: sysB_retransmissions,
                restoredText: sysB_text,
            },
            hammingOnly: {
                label: "Extended Hamming Only",
                ber: computeTextBER(originalText, sysC_text),
                frameError: sysC_text !== originalText,
                throughput:
                    hammingEncoded.length > 0
                        ? encodedBinary.length / hammingEncoded.length
                        : 0,
                totalBitsTransmitted: hammingEncoded.length,
                retransmissions: 0,
                restoredText: sysC_text,
            },
            combinedIR: {
                label: "Combined CRC + Hamming + IR",
                ber: sysD.metrics.ber,
                frameError: sysD.metrics.frameError,
                throughput: sysD.metrics.throughput,
                totalBitsTransmitted: sysD.metrics.totalBitsTransmitted,
                retransmissions: sysD.metrics.totalRetransmissions,
                restoredText: sysD.finalText,
                stages: sysD.stages,
                undetectedError: sysD.metrics.undetectedError,
            },
        },
        compressionStats: {
            originalBits: originalText.length * 8,
            compressedBits: encodedBinary.length,
            compressionRatio: (
                (1 - encodedBinary.length / (originalText.length * 8)) *
                100
            ).toFixed(2),
        },
    };
};

/**
 * Monte Carlo simulation: run many trials across a range of error rates.
 * Returns arrays suitable for Chart.js plotting.
 *
 * @param {string} originalText
 * @param {object} options
 * @param {number} options.errorRateMin - Minimum error rate (default 0.001)
 * @param {number} options.errorRateMax - Maximum error rate (default 0.1)
 * @param {number} options.numPoints - Number of test points (default 15)
 * @param {number} options.trialsPerPoint - Trials per noise level (default 500)
 * @param {number} options.maxStages - Max IR stages (default 4)
 * @param {number} options.kappa - Threshold multiplier (default 1.0)
 * @returns {object} Formatted data for Chart.js
 */
exports.runMonteCarlo = (originalText, options = {}) => {
    const {
        errorRateMin = 0.001,
        errorRateMax = 0.1,
        numPoints = 15,
        trialsPerPoint = 500,
        maxStages = 4,
        kappa = 1.0,
    } = options;

    // Generate error rate test points (linear spacing)
    const errorRates = [];
    const step = (errorRateMax - errorRateMin) / (numPoints - 1);
    for (let i = 0; i < numPoints; i++) {
        errorRates.push(parseFloat((errorRateMin + i * step).toFixed(6)));
    }

    // Pre-compute Huffman encoding once (shared across all trials)
    const { frequencyMap } = huffmanService.analyzeProbabilities(originalText);
    const { encodedBinary, huffmanTree } = huffmanService.encode(
        originalText,
        frequencyMap,
    );
    const { protected: crcData, payloadLength: crcPayloadLen } =
        crcService.appendCRC(encodedBinary);
    const { encoded: hammingFull, paddingBits } =
        hammingService.encodeExtended(encodedBinary);
    const punctured = hammingService.encodePunctured(crcData);

    const results = {
        errorRates,
        systems: {
            noProtection: { ber: [], fer: [], throughput: [] },
            crcOnly: {
                ber: [],
                fer: [],
                throughput: [],
                avgRetransmissions: [],
            },
            hammingOnly: { ber: [], fer: [], throughput: [] },
            combinedIR: {
                ber: [],
                fer: [],
                throughput: [],
                avgRetransmissions: [],
            },
        },
    };

    for (const p of errorRates) {
        let sA_berSum = 0,
            sA_ferCount = 0;
        let sB_berSum = 0,
            sB_ferCount = 0,
            sB_retransSum = 0,
            sB_tputSum = 0;
        let sC_berSum = 0,
            sC_ferCount = 0;
        let sD_berSum = 0,
            sD_ferCount = 0,
            sD_retransSum = 0,
            sD_tputSum = 0;

        for (let trial = 0; trial < trialsPerPoint; trial++) {
            const baseSeed = trial * 10000 + Math.floor(p * 100000);

            // System A: No Protection
            const noiseA = noiseService.injectNoiseSeeded(
                encodedBinary,
                p,
                baseSeed,
            );
            const berA = computeBER(encodedBinary, noiseA.noisyData);
            sA_berSum += berA;
            if (berA > 0) sA_ferCount++;

            // System B: CRC Only (ARQ)
            let bSuccess = false;
            let bRetrans = 0;
            let bTotalBits = 0;
            let bBer = 0;
            for (let att = 0; att < maxStages; att++) {
                const noiseB = noiseService.injectNoiseSeeded(
                    crcData,
                    p,
                    baseSeed + 100 + att,
                );
                bTotalBits += crcData.length;
                const checkB = crcService.checkCRC(
                    noiseB.noisyData,
                    crcPayloadLen,
                );
                if (checkB.isValid) {
                    bSuccess = true;
                    bBer = computeBER(encodedBinary, checkB.payload);
                    break;
                }
                bRetrans++;
            }
            if (!bSuccess) {
                bBer = 1; // Frame lost
            }
            sB_berSum += bBer;
            if (bBer > 0) sB_ferCount++;
            sB_retransSum += bRetrans;
            sB_tputSum +=
                bTotalBits > 0 ? encodedBinary.length / bTotalBits : 0;

            // System C: Hamming Only
            const noiseC = noiseService.injectNoiseSeeded(
                hammingFull,
                p,
                baseSeed + 200,
            );
            const decC = hammingService.decodeExtended(
                noiseC.noisyData,
                paddingBits,
            );
            const berC = computeBER(encodedBinary, decC.decoded);
            sC_berSum += berC;
            if (berC > 0) sC_ferCount++;

            // System D: Combined IR
            const simD = exports.createIRSession(originalText, {
                errorRate: p,
                maxStages,
                kappa,
                seed: baseSeed + 300,
            });
            sD_berSum += simD.metrics.ber;
            if (simD.metrics.frameError) sD_ferCount++;
            sD_retransSum += simD.metrics.totalRetransmissions;
            sD_tputSum += simD.metrics.throughput;
        }

        const n = trialsPerPoint;

        results.systems.noProtection.ber.push(sA_berSum / n);
        results.systems.noProtection.fer.push(sA_ferCount / n);
        results.systems.noProtection.throughput.push(1.0);

        results.systems.crcOnly.ber.push(sB_berSum / n);
        results.systems.crcOnly.fer.push(sB_ferCount / n);
        results.systems.crcOnly.throughput.push(sB_tputSum / n);
        results.systems.crcOnly.avgRetransmissions.push(sB_retransSum / n);

        results.systems.hammingOnly.ber.push(sC_berSum / n);
        results.systems.hammingOnly.fer.push(sC_ferCount / n);
        results.systems.hammingOnly.throughput.push(
            hammingFull.length > 0
                ? encodedBinary.length / hammingFull.length
                : 0,
        );

        results.systems.combinedIR.ber.push(sD_berSum / n);
        results.systems.combinedIR.fer.push(sD_ferCount / n);
        results.systems.combinedIR.throughput.push(sD_tputSum / n);
        results.systems.combinedIR.avgRetransmissions.push(sD_retransSum / n);
    }

    return results;
};

// ============================================================
// Helper Functions (module-private)
// ============================================================

/**
 * Compute Bit Error Rate (BER) between two binary strings.
 *
 * Compares the strings bit-by-bit. Length mismatches are counted
 * as additional errors (missing bits = errors).
 *
 * @param {string} original - The original binary string (ground truth)
 * @param {string} received - The received/decoded binary string
 * @returns {number} BER in range [0, 1], where 0 = perfect, 1 = total failure
 *
 * @example
 * computeBER("1100", "1101") // returns 0.25 (1 error in 4 bits)
 * computeBER("1100", "11")   // returns 0.5 (2 missing bits counted as errors)
 */
function computeBER(original, received) {
    if (!original || !received || original.length === 0) return 1;
    const len = Math.min(original.length, received.length);
    let errors = 0;
    for (let i = 0; i < len; i++) {
        if (original[i] !== received[i]) errors++;
    }
    // Count length mismatch as additional errors
    errors += Math.abs(original.length - received.length);
    return errors / original.length;
}

/**
 * Compute error rate at the text level (character-by-character comparison).
 *
 * Used when we can't compare at the binary level (e.g., CRC-only system
 * where we only have the decoded text, not the intermediate binary).
 *
 * @param {string} originalText - The original text (ground truth)
 * @param {string} decodedText - The decoded/restored text
 * @returns {number} Character error rate in range [0, 1]
 *
 * @example
 * computeTextBER("Hello", "Hxllo") // returns 0.2 (1 error in 5 chars)
 */
function computeTextBER(originalText, decodedText) {
    if (!originalText || !decodedText || originalText.length === 0) return 1;
    const len = Math.min(originalText.length, decodedText.length);
    let errors = 0;
    for (let i = 0; i < len; i++) {
        if (originalText[i] !== decodedText[i]) errors++;
    }
    errors += Math.abs(originalText.length - decodedText.length);
    return errors / originalText.length;
}
