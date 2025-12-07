const express = require("express");
const cors = require("cors");
const path = require("path");
const apiRoutes = require("./src/routes/api.js");
const fs = require("fs");

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// التأكد من وجود مجلد outputs
const outputsDir = path.join(__dirname, "outputs");
if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir);
}

// جعل مجلد outputs عام عشان نقدر نحمل الملفات منه
app.use("/outputs", express.static(path.join(__dirname, "outputs")));

app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/api", apiRoutes);

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Upload API available at http://localhost:${PORT}/api/process`);
});
