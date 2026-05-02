/**
 * @fileoverview Simulation Controller — HARQ System Endpoints
 *
 * Handles the three new API endpoints for the HARQ simulation system:
 *   - POST /api/simulate         — Single HARQ simulation with full IR loop
 *   - POST /api/simulate/compare — Comparative simulation across 4 protection strategies
 *   - POST /api/simulate/montecarlo — Monte Carlo sweep for performance analysis charts
 *
 * All endpoints accept a .txt file upload (via multer memory storage) and
 * simulation parameters as form fields. Results are returned as JSON.
 *
 * @module controllers/simulationController
 * @requires services/irService
 * @requires fs
 * @requires path
 */

const irService = require("../services/irService");
const fs = require("fs");
const path = require("path");

/**
 * Run a single HARQ simulation with Incremental Redundancy loop.
 *
 * Processes the uploaded text file through the full Chapter 17 pipeline:
 * Huffman → CRC-16 → Extended Hamming(8,4) → BSC → IR loop (up to M stages).
 *
 * Saves the restored text to outputs/harq_restored.txt for download.
 *
 * @param {import('express').Request} req - Express request
 * @param {Buffer} req.file.buffer - Uploaded .txt file content
 * @param {string} req.body.errorRate - BSC crossover probability (default: 0.01)
 * @param {string} req.body.maxStages - Maximum IR stages (default: 4)
 * @param {string} req.body.kappa - Reliability threshold multiplier (default: 1.0)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON response with {success, stages[], metrics, compressionStats, finalText, originalText}
 */
exports.runSimulation = (req, res) => {
    try {
        if (!req.file) {
            return res
                .status(400)
                .json({
                    error: "No file uploaded. Please upload a .txt file.",
                });
        }

        /** @type {string} Original text from uploaded file */
        const originalText = req.file.buffer.toString("utf8");

        if (!originalText || originalText.trim().length === 0) {
            return res.status(400).json({ error: "File is empty." });
        }

        /** @type {number} BSC error probability */
        const errorRate = parseFloat(req.body.errorRate) || 0.01;
        /** @type {number} Maximum IR retransmission stages */
        const maxStages = parseInt(req.body.maxStages) || 4;
        /** @type {number} Reliability threshold multiplier (κ) */
        const kappa = parseFloat(req.body.kappa) || 1.0;

        /** @type {object} Complete simulation result from IR service */
        const result = irService.createIRSession(originalText, {
            errorRate,
            maxStages,
            kappa,
        });

        // Save restored text to file for download
        const outputDir = path.join(__dirname, "../../outputs");
        if (!fs.existsSync(outputDir))
            fs.mkdirSync(outputDir, { recursive: true });

        const restoredPath = path.join(outputDir, "harq_restored.txt");
        fs.writeFileSync(restoredPath, result.finalText || "", "utf-8");

        res.json({
            success: result.success,
            stages: result.stages,
            metrics: result.metrics,
            compressionStats: result.compressionStats,
            finalText: result.finalText,
            originalText: originalText,
            download_links: {
                restored_text: "/outputs/harq_restored.txt",
            },
        });
    } catch (error) {
        console.error("Simulation error:", error);
        res.status(500).json({ error: "Simulation failed: " + error.message });
    }
};

/**
 * Run a comparative simulation across all 4 protection systems.
 *
 * Uses the same seeded noise pattern for all 4 systems to ensure fair comparison:
 *   System A: No protection (raw Huffman through BSC)
 *   System B: CRC-16 only (pure ARQ — full retransmission)
 *   System C: Extended Hamming only (FEC — no retransmission)
 *   System D: Combined CRC + Hamming + IR (full HARQ)
 *
 * @param {import('express').Request} req - Express request
 * @param {Buffer} req.file.buffer - Uploaded .txt file content
 * @param {string} req.body.errorRate - BSC crossover probability (default: 0.01)
 * @param {string} req.body.maxStages - Maximum IR stages (default: 4)
 * @param {string} req.body.kappa - Reliability threshold multiplier (default: 1.0)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with {systems: {noProtection, crcOnly, hammingOnly, combinedIR}, compressionStats}
 */
exports.runComparison = (req, res) => {
    try {
        if (!req.file) {
            return res
                .status(400)
                .json({
                    error: "No file uploaded. Please upload a .txt file.",
                });
        }

        /** @type {string} Original text from uploaded file */
        const originalText = req.file.buffer.toString("utf8");

        if (!originalText || originalText.trim().length === 0) {
            return res.status(400).json({ error: "File is empty." });
        }

        /** @type {number} BSC error probability */
        const errorRate = parseFloat(req.body.errorRate) || 0.01;
        /** @type {number} Maximum IR stages */
        const maxStages = parseInt(req.body.maxStages) || 4;
        /** @type {number} Threshold multiplier */
        const kappa = parseFloat(req.body.kappa) || 1.0;

        /** @type {object} Comparative results for all 4 systems */
        const result = irService.runComparativeSimulation(originalText, {
            errorRate,
            maxStages,
            kappa,
        });

        res.json(result);
    } catch (error) {
        console.error("Comparison error:", error);
        res.status(500).json({ error: "Comparison failed: " + error.message });
    }
};

/**
 * Run a Monte Carlo simulation for performance analysis chart generation.
 *
 * Sweeps across a range of error rates, running multiple trials at each point.
 * Returns arrays formatted for Chart.js plotting: BER, FER, throughput,
 * and average retransmissions for all 4 protection systems.
 *
 * This is computationally intensive — for 15 points × 200 trials × 4 systems,
 * it runs 12,000 simulation passes. Use small test files for faster execution.
 *
 * @param {import('express').Request} req - Express request
 * @param {Buffer} req.file.buffer - Uploaded .txt file content
 * @param {string} req.body.errorRateMin - Minimum sweep error rate (default: 0.001)
 * @param {string} req.body.errorRateMax - Maximum sweep error rate (default: 0.1)
 * @param {string} req.body.numPoints - Number of test points in sweep (default: 15)
 * @param {string} req.body.trialsPerPoint - Trials per noise level (default: 200)
 * @param {string} req.body.maxStages - Maximum IR stages (default: 4)
 * @param {string} req.body.kappa - Threshold multiplier (default: 1.0)
 * @param {import('express').Response} res - Express response
 * @returns {void} JSON with {errorRates[], systems: {noProtection, crcOnly, hammingOnly, combinedIR}}
 */
exports.runMonteCarlo = (req, res) => {
    try {
        if (!req.file) {
            return res
                .status(400)
                .json({
                    error: "No file uploaded. Please upload a .txt file.",
                });
        }

        /** @type {string} Original text from uploaded file */
        const originalText = req.file.buffer.toString("utf8");

        if (!originalText || originalText.trim().length === 0) {
            return res.status(400).json({ error: "File is empty." });
        }

        /** @type {number} Minimum error rate for sweep */
        const errorRateMin = parseFloat(req.body.errorRateMin) || 0.001;
        /** @type {number} Maximum error rate for sweep */
        const errorRateMax = parseFloat(req.body.errorRateMax) || 0.1;
        /** @type {number} Number of sweep points */
        const numPoints = parseInt(req.body.numPoints) || 15;
        /** @type {number} Trials per point */
        const trialsPerPoint = parseInt(req.body.trialsPerPoint) || 200;
        /** @type {number} Maximum IR stages */
        const maxStages = parseInt(req.body.maxStages) || 4;
        /** @type {number} Threshold multiplier */
        const kappa = parseFloat(req.body.kappa) || 1.0;

        /** @type {object} Monte Carlo results formatted for Chart.js */
        const result = irService.runMonteCarlo(originalText, {
            errorRateMin,
            errorRateMax,
            numPoints,
            trialsPerPoint,
            maxStages,
            kappa,
        });

        res.json(result);
    } catch (error) {
        console.error("Monte Carlo error:", error);
        res.status(500).json({
            error: "Monte Carlo simulation failed: " + error.message,
        });
    }
};
