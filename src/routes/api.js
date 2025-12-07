const express = require("express");
const router = express.Router();
const multer = require("multer");
const projectController = require("../controllers/projectController");

// إعداد Multer لتخزين الملف في الذاكرة (Buffer) مؤقتاً
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// الرابط: POST /api/process
router.post(
    "/process",
    upload.single("textFile"),
    projectController.processFile
);

module.exports = router;
