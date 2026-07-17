const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const controller = require("../controllers/aiChatController");
const generateController = require("../controllers/aiGenerateController");
const jdController = require("../controllers/jdResumeController");

// Create a new chat message
router.post("/chats", auth, controller.createChat);

// Get all chats for a session
router.get("/sessions/:session_id/chats", auth, controller.getAllChats);

// Start a chat session
router.post("/sessions/:session_id/start", auth, controller.startChat);

// Get all resume data for the authenticated user in one request
router.get("/resume-data", auth, controller.getUserResumeData);

// Generate AI-enhanced resume content (technical summary, project & experience descriptions)
// Body: { chat_answers: { about_yourself, additional_projects, additional_experience, additional_education } }
router.post("/generate-resume", auth, generateController.generateResume);

// Generate JD-tailored resume content from the user's saved resume data (not persisted yet)
// Body: { session_id?, jd_text }
router.post("/resume-data/jd", auth, jdController.generateJdResume);

// Persist the (user-reviewed/edited) JD-tailored resume content into the session's infoJson
// Body: { session_id, data }
router.post("/resume-data/jd/save", auth, jdController.saveJdResume);

module.exports = router;