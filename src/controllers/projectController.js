const fs = require("fs");
const path = require("path");
const huffmanService = require("../services/huffmanService.js");
const hammingService = require("../services/hammingService.js");
const noiseService = require("../services/noiseService.js");

exports.processFile = (req, res) => {
    try {
        // 0. if no file uploaded
        if (!req.file) {
            return res.status(400).send({
                error: "No file uploaded. Please upload a .txt file.",
            });
        }

        const originalText = req.file.buffer.toString("utf8");
        const timestamp = Date.now(); // To identify files

        console.log(
            `[${timestamp}] New request received. Length: ${originalText.length} chars.`
        );

        // ======================================================
        // Part 1: Probability Analysis & File Output
        // ======================================================
        const analysisResult =
            huffmanService.analyzeProbabilities(originalText);

        const probFileName = `1_probabilities_${timestamp}.txt`;
        const probPath = path.join(__dirname, "../../outputs", probFileName);
        fs.writeFileSync(probPath, analysisResult.formattedOutput);

        // ======================================================
        // Part 2: Huffman Encoding
        // ======================================================
        const { encodedBinary, huffmanTree } = huffmanService.encode(
            originalText,
            analysisResult.frequencyMap
        );

        // ======================================================
        // Part 3: Huffman Decoding (Verification Check) & File Output
        // ======================================================
        //
        const decodedPart3 = huffmanService.decode(encodedBinary, huffmanTree);

        const checkFileName = `2_part3_check_${timestamp}.txt`;
        const checkPath = path.join(__dirname, "../../outputs", checkFileName);
        fs.writeFileSync(checkPath, decodedPart3);

        // ======================================================
        // Part 4: Hamming (7,4) Encoding
        // ======================================================
        const hammingEncoded = hammingService.encode(encodedBinary);

        // ======================================================
        // Part 5: Noise Injection
        // ======================================================
        // Inject noise
        // Noise rate
        const NOISE_RATE = 0.01;
        const { noisyData, noiseReport } = noiseService.injectNoise(
            hammingEncoded,
            NOISE_RATE
        );

        // ======================================================
        // Part 6: Hamming Decoding & Error Correction
        // ======================================================
        const { correctedBinary, correctionReport } =
            hammingService.decode(noisyData);

        // ======================================================
        // Final Step: Reconstruct Final Text & File Output
        // ======================================================
        // If the final text is longer than the original, truncate it
        const finalText = huffmanService.decode(correctedBinary, huffmanTree);

        if (finalText.length > originalText.length) {
            finalText = finalText.substring(0, originalText.length);
        }

        const finalFileName = `3_final_result_${timestamp}.txt`;
        const finalPath = path.join(__dirname, "../../outputs", finalFileName);
        fs.writeFileSync(finalPath, finalText);

        // Calculate efficiency for display
        const efficiency = (
            (correctionReport.correctedErrors / noiseReport.totalErrors) *
            100
        ).toFixed(2);
        const originalBits = originalText.length * 8;
        const compressedEfficiency = (
            (1 - encodedBinary.length / originalBits) *
            100
        ).toFixed(2);

        let correctChars = 0;
        const minLength = Math.min(originalText.length, finalText.length);
        for (let i = 0; i < minLength; i++) {
            if (originalText[i] === finalText[i]) correctChars++;
        }
        const finalTextEfficiency = (
            (finalText.length / originalText.length) *
            100
        ).toFixed(2);
        // ======================================================
        // Response
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
