/**
 * @fileoverview API Route Definitions
 *
 * Defines all HTTP routes for the BitShield application:
 *
 * Legacy (Classic Mode):
 *   POST /api/process          — Single-pass Huffman + Hamming(7,4) pipeline
 *
 * HARQ Simulation (New System):
 *   POST /api/simulate         — Single HARQ simulation with IR loop
 *   POST /api/simulate/compare — 4-system comparative simulation
 *   POST /api/simulate/montecarlo — Monte Carlo sweep for chart data
 *
 * All routes use multer with memory storage for file upload handling.
 * The uploaded file is available as req.file.buffer (Buffer).
 *
 * @module routes/api
 * @requires express
 * @requires multer
 * @requires controllers/projectController
 * @requires controllers/simulationController
 */

const express = require("express");

/** @type {import('express').Router} Express router instance */
const router = express.Router();

const multer = require("multer");
const projectController = require("../controllers/projectController");
const simulationController = require("../controllers/simulationController");

/**
 * Multer configuration — uses memory storage (file kept in RAM as Buffer).
 * This avoids writing temp files to disk and is consistent with the
 * original project design.
 * @type {import('multer').StorageEngine}
 */
const storage = multer.memoryStorage();

/** @type {import('multer').Multer} Configured multer middleware instance */
const upload = multer({ storage: storage });

/**
 * @route POST /api/process
 * @description Legacy Classic Mode — single-pass Huffman + Hamming(7,4) pipeline
 * @access Public
 * @param {File} textFile - .txt file upload (multipart/form-data)
 */
router.post(
    "/process",
    upload.single("textFile"),
    projectController.processFile,
);

/**
 * @route POST /api/simulate
 * @description Run a single HARQ simulation with full IR loop
 * @access Public
 * @param {File} textFile - .txt file upload
 * @param {number} errorRate - BSC crossover probability (form field)
 * @param {number} maxStages - Maximum IR stages (form field)
 * @param {number} kappa - Reliability threshold multiplier (form field)
 */
router.post(
    "/simulate",
    upload.single("textFile"),
    simulationController.runSimulation,
);

/**
 * @route POST /api/simulate/compare
 * @description Compare 4 protection systems with identical noise
 * @access Public
 * @param {File} textFile - .txt file upload
 * @param {number} errorRate - BSC crossover probability
 * @param {number} maxStages - Maximum IR stages
 * @param {number} kappa - Threshold multiplier
 */
router.post(
    "/simulate/compare",
    upload.single("textFile"),
    simulationController.runComparison,
);

/**
 * @route POST /api/simulate/montecarlo
 * @description Monte Carlo sweep — generates Chart.js-ready performance data
 * @access Public
 * @param {File} textFile - .txt file upload
 * @param {number} errorRateMin - Sweep start
 * @param {number} errorRateMax - Sweep end
 * @param {number} numPoints - Number of test points
 * @param {number} trialsPerPoint - Trials per noise level
 * @param {number} maxStages - Maximum IR stages
 * @param {number} kappa - Threshold multiplier
 */
router.post(
    "/simulate/montecarlo",
    upload.single("textFile"),
    simulationController.runMonteCarlo,
);

module.exports = router;
