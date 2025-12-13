const express = require("express");
const router = express.Router();
const multer = require("multer");
const projectController = require("../controllers/projectController");

// Temporary storage for multer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// POST /api/process
router.post(
    "/process",
    upload.single("textFile"),
    projectController.processFile
);

module.exports = router;
