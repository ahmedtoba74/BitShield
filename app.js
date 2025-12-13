require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const apiRoutes = require("./src/routes/api.js");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// create outputs directory if it doesn't exist
const outputsDir = path.join(__dirname, "outputs");
if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir);
}

// static files
app.use("/outputs", express.static(path.join(__dirname, "outputs")));

app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/api", apiRoutes);

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
