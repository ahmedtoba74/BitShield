/**
 * @fileoverview BitShield — Express Server Entry Point
 *
 * Initializes the Express application, configures middleware (CORS, JSON parsing),
 * sets up static file serving for the frontend and output files, and mounts
 * the API router on the /api prefix.
 *
 * @module app
 * @requires dotenv
 * @requires express
 * @requires cors
 * @requires path
 * @requires fs
 * @requires ./src/routes/api
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const apiRoutes = require("./src/routes/api.js");
const fs = require("fs");

/** @type {import('express').Application} Express application instance */
const app = express();

/** @type {number} Server port — reads from .env or defaults to 3000 */
const PORT = process.env.PORT || 3000;

// Middleware — enable CORS for cross-origin requests and JSON body parsing
app.use(cors());
app.use(express.json());

// Ensure the outputs directory exists for generated result files
const outputsDir = path.join(__dirname, "outputs");
if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir);
}

// Serve generated output files (probabilities, restored text, etc.)
app.use("/outputs", express.static(path.join(__dirname, "outputs")));

// Serve the frontend static files (index.html, styles.css, app.js)
app.use(express.static(path.join(__dirname, "public")));

// Mount all API routes under the /api prefix
app.use("/api", apiRoutes);

/**
 * Root route — serves the main frontend HTML page.
 * @name GET /
 * @function
 */
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start the HTTP server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
