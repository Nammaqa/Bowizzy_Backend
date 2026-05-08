const AiChat = require("../models/AiChat");
const AiSession = require("../models/AiSession");

// Create a new chat message
exports.createChat = async (req, res) => {
  try {
    const { session_id, text, file_link, type } = req.body;

    // Validation
    if (!session_id) {
      return res.status(400).json({ message: "Session ID is required" });
    }

    if (!text) {
      return res.status(400).json({ message: "Chat text is required" });
    }

    if (!type || !["assistant", "user"].includes(type)) {
      return res.status(400).json({ message: "Type must be 'assistant' or 'user'" });
    }

    // Check if session exists
    const session = await AiSession.query().findById(session_id);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const chat = await AiChat.query().insert({
      session_id,
      text,
      file_link: file_link || null,
      type
    });

    return res.status(201).json({
      message: "Chat created successfully",
      data: chat
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating chat" });
  }
};

// Get all chats for a session
exports.getAllChats = async (req, res) => {
  try {
    const { session_id } = req.params;

    // Check if session exists
    const session = await AiSession.query().findById(session_id);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const chats = await AiChat.query()
      .where("session_id", session_id)
      .orderBy("created_at", "asc");

    return res.json({
      message: "Chats retrieved successfully",
      data: chats
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching chats" });
  }
};

// Start a chat session
exports.startChat = async (req, res) => {
  try {
    const { session_id } = req.params;

    // Check if session exists
    const session = await AiSession.query().findById(session_id);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    // Update session to mark as started
    const updatedSession = await AiSession.query()
      .findById(session_id)
      .patch({ started: true });

    // Create an initial assistant greeting message
    const initialChat = await AiChat.query().insert({
      session_id,
      text: "Hi, I need to build my resume.",
      file_link: null,
      type: "user"
    });

    return res.json({
      message: "Chat session started successfully",
      data: {
        session: updatedSession,
        initialMessage: initialChat
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error starting chat session" });
  }
};

// Get all resume data for the authenticated user in one response
exports.getUserResumeData = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const PersonalDetails = require("../models/PersonalDetails");
    const Project = require("../models/Project");
    const WorkExperience = require("../models/WorkExperience");
    const JobRole = require("../models/JobRole");
    const Certificate = require("../models/Certificate");
    const Skill = require("../models/Skill");
    const Link = require("../models/Link");
    const TechnicalSummary = require("../models/TechnicalSummary");
    const Education = require("../models/Education");

    // Run all queries in parallel
    const [
      personalDetails,
      projects,
      workExperiences,
      jobRole,
      certificates,
      skills,
      links,
      technicalSummary,
      education,
    ] = await Promise.allSettled([
      PersonalDetails.query().findOne({ user_id }),
      Project.query().where({ user_id }).orderBy("project_id", "asc"),
      WorkExperience.query().where({ user_id }).orderBy("experience_id", "asc"),
      JobRole.query().findOne({ user_id }),
      Certificate.query().where({ user_id }),
      Skill.query().where({ user_id }).orderBy("skill_id", "asc"),
      Link.query().where({ user_id }).orderBy("link_id", "asc"),
      TechnicalSummary.query().findOne({ user_id }),
      Education.query().where({ user_id }).orderBy("education_id", "asc"),
    ]);

    // Helper to safely extract value from allSettled result
    const getValue = (result, fallback = null) =>
      result.status === "fulfilled" ? result.value ?? fallback : fallback;

    return res.json({
      message: "Resume data retrieved successfully",
      data: {
        personal_details: getValue(personalDetails),
        projects: getValue(projects, []),
        work_experience: {
          job_role: getValue(jobRole) ? getValue(jobRole).job_role : null,
          experiences: getValue(workExperiences, []),
        },
        certificates: getValue(certificates, []),
        skills: getValue(skills, []),
        links: getValue(links, []),
        technical_summary: getValue(technicalSummary),
        education: getValue(education, []),
      },
    });
  } catch (err) {
    console.error("Error fetching resume data:", err);
    res.status(500).json({ message: "Error fetching resume data" });
  }
};