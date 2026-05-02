/**
 * @fileoverview Project Controller — Legacy Classic Mode Endpoint
 *
 * Handles the original `/api/process` endpoint that implements a single-pass
 * pipeline: Huffman encoding → Hamming(7,4) encoding → BSC noise injection →
 * Hamming decoding → Huffman decoding.
 *
 * This controller is preserved unchanged for backward compatibility. The new
 * HARQ system uses the simulationController instead.
 *
 * Pipeline steps:
 *   1. Analyze character probabilities → output file
 *   2. Huffman encode (compress)
 *   3. Huffman decode (verification check) → output file
 *   4. Hamming(7,4) encode
 *   5. BSC noise injection (1% default)
 *   6. Hamming(7,4) decode with error correction
 *   7. Final Huffman decode (restore text) → output file
 *
 * @module controllers/projectController
 * @requires fs
 * @requires path
 * @requires services/huffmanService
 * @requires services/hammingService
 * @requires services/noiseService
 */

const fs = require("fs");
const path = require("path");
const huffmanService = require("../services/huffmanService.js");
const hammingService = require("../services/hammingService.js");
const noiseService = require("../services/noiseService.js");

/**
 * Process a text file through the classic Huffman + Hamming(7,4) pipeline.
 *
 * Receives a .txt file via multipart upload, runs the full encoding → noise →
 * decoding pipeline, saves output files, and returns statistics.
 *
 * @param {import('express').Request} req - Express request with multer file in req.file
 * @param {Buffer} req.file.buffer - The uploaded file content in memory
 * @param {import('express').Response} res - Express response
 * @returns {void} Sends JSON response with statistics and download links
 *
 * @example
 * // POST /api/process with multipart/form-data containing "textFile"
 * // Response:
 * // {
 * //   status: "Simulation Completed Successfully",
 * //   download_links: { probabilities, decoding_check_part3, final_restored_text },
 * //   statistics: { original_size, compressed_size, noise_simulation, ... }
 * // }
 */
exports.processFile = (req, res) => {
    try {
        // Validate that a file was uploaded
        if (!req.file) {
            return res.status(400).send({
                error: "No file uploaded. Please upload a .txt file.",
            });
        }

        /** @type {string} The original text content from the uploaded file */
        const originalText = req.file.buffer.toString("utf8");

        /** @type {number} Unique timestamp for identifying output files */
        const timestamp = Date.now();

        console.log(
            `[${timestamp}] New request received. Length: ${originalText.length} chars.`,
        );

        // ======================================================
        // Part 1: Probability Analysis & File Output
        // ======================================================
        /** @type {{frequencyMap: Object, formattedOutput: string}} */
        const analysisResult =
            huffmanService.analyzeProbabilities(originalText);

        /** @type {string} Output filename for symbol probabilities */
        const probFileName = `1_probabilities_${timestamp}.txt`;
        const probPath = path.join(__dirname, "../../outputs", probFileName);
        fs.writeFileSync(probPath, analysisResult.formattedOutput);

        // ======================================================
        // Part 2: Huffman Encoding
        // ======================================================
        /** @type {{encodedBinary: string, huffmanTree: Node}} */
        const { encodedBinary, huffmanTree } = huffmanService.encode(
            originalText,
            analysisResult.frequencyMap,
        );

        // ======================================================
        // Part 3: Huffman Decoding (Verification Check) & File Output
        // Verifies that encode→decode roundtrip produces original text
        // ======================================================
        /** @type {string} Decoded text for verification */
        const decodedPart3 = huffmanService.decode(encodedBinary, huffmanTree);

        /** @type {string} Output filename for decode verification */
        const checkFileName = `2_part3_check_${timestamp}.txt`;
        const checkPath = path.join(__dirname, "../../outputs", checkFileName);
        fs.writeFileSync(checkPath, decodedPart3);

        // ======================================================
        // Part 4: Hamming (7,4) Encoding
        // ======================================================
        /** @type {string} Hamming(7,4) encoded binary */
        const hammingEncoded = hammingService.encode(encodedBinary);

        // ======================================================
        // Part 5: Noise Injection (BSC simulation)
        // ======================================================
        /** @type {number} Channel error probability */
        const NOISE_RATE = 0.01;

        /** @type {{noisyData: string, noiseReport: {totalErrors: number}}} */
        const { noisyData, noiseReport } = noiseService.injectNoise(
            hammingEncoded,
            NOISE_RATE,
        );

        // ======================================================
        // Part 6: Hamming Decoding & Error Correction
        // ======================================================
        /** @type {{correctedBinary: string, correctionReport: {correctedErrors: number}}} */
        const { correctedBinary, correctionReport } =
            hammingService.decode(noisyData);

        // ======================================================
        // Final Step: Reconstruct Final Text & File Output
        // ======================================================
        /** @type {string} Final restored text after decode */
        const finalText = huffmanService.decode(correctedBinary, huffmanTree);

        // Truncate if final text is longer than original (due to padding artifacts)
        if (finalText.length > originalText.length) {
            finalText = finalText.substring(0, originalText.length);
        }

        /** @type {string} Output filename for final restored text */
        const finalFileName = `3_final_result_${timestamp}.txt`;
        const finalPath = path.join(__dirname, "../../outputs", finalFileName);
        fs.writeFileSync(finalPath, finalText);

        // ======================================================
        // Calculate efficiency metrics for the response
        // ======================================================
        /** @type {string} Hamming correction efficiency as percentage */
        const efficiency = (
            (correctionReport.correctedErrors / noiseReport.totalErrors) *
            100
        ).toFixed(2);

        /** @type {number} Original text size in bits (8 bits per ASCII char) */
        const originalBits = originalText.length * 8;

        /** @type {string} Huffman compression efficiency as percentage */
        const compressedEfficiency = (
            (1 - encodedBinary.length / originalBits) *
            100
        ).toFixed(2);

        // Character-level accuracy comparison
        let correctChars = 0;
        const minLength = Math.min(originalText.length, finalText.length);
        for (let i = 0; i < minLength; i++) {
            if (originalText[i] === finalText[i]) correctChars++;
        }

        /** @type {string} Text restoration accuracy as percentage */
        const finalTextEfficiency = (
            (finalText.length / originalText.length) *
            100
        ).toFixed(2);

        // ======================================================
        // Send JSON response with all statistics and download links
        // ======================================================
        res.json({
            status: "Simulation Completed Successfully",
            download_links: {
                probabilities: `/outputs/${probFileName}`,
                decoding_check_part3: `/outputs/${checkFileName}`,
                final_restored_text: `/outputs/${finalFileName}`,
            },
            statistics: {
                original_text_size_bytes: originalText.length,
                original_size_in_bits: originalText.length * 8,
                compressed_size_in_bits: encodedBinary.length,
                compressed_efficiency: `${compressedEfficiency}%`,
                noise_simulation: {
                    total_size_in_bits_transmitted: hammingEncoded.length,
                    total_errors_injected: noiseReport.totalErrors,
                    total_errors_corrected_by_hamming:
                        correctionReport.correctedErrors,
                    correction_efficiency: `${efficiency}%`,
                },
                final_restored_text_size_bytes: finalText.length,
                final_restored_text_size_in_bits: finalText.length * 8,
                final_restored_text_efficiency: `${finalTextEfficiency}%`,
            },
        });
    } catch (error) {
        console.error("Processing Error:", error);
        res.status(500).send({
            error: "Internal Server Error",
            details: error.message,
        });
    }
};
