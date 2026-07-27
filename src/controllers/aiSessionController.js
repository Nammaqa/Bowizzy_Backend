const AiSession = require("../models/AiSession");
const AiChat = require("../models/AiChat");

// Create a new AI session
exports.createSession = async (req, res) => {
  try {
    const user_id = req.user && req.user.user_id;
    const { session_name, mode } = req.body;

    // Validation
    if (!session_name) {
      return res.status(400).json({ message: "Session name is required" });
    }

    if (!mode || !["jd", "non-jd"].includes(mode)) {
      return res.status(400).json({ message: "Mode must be 'jd' or 'non-jd'" });
    }

    const session = await AiSession.query().insert({
      session_name,
      mode,
      user_id
    });

    return res.status(201).json({
      message: "AI session created successfully",
      data: session
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating AI session" });
  }
};

// Get all sessions by user ID
exports.getSessionsByUser = async (req, res) => {
  try {
    // const user_id = req.params.user_id;
    const user_id = req.user && req.user.user_id;
    const sessions = await AiSession.query()
      .where({ user_id })
      .withGraphFetched("chats")
      .orderBy("created_at", "desc");

    const normalizedSessions = sessions.map((session) => ({
      ...session,
      is_paid: Boolean(session.is_paid)
    }));

    return res.json(normalizedSessions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching sessions by user" });
  }
};

// Get session by ID
exports.getSessionById = async (req, res) => {
  try {
    const { session_id } = req.params;

    const session = await AiSession.query()
      .findById(session_id)
      .withGraphFetched("chats");

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    return res.json(session ? { ...session, is_paid: Boolean(session.is_paid) } : null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching session" });
  }
};

// Get all sessions
exports.getAllSessions = async (req, res) => {
  try {
    const user_id = req.user && req.user.user_id;
    const sessions = await AiSession.query()
      .where({ user_id })
      .withGraphFetched("chats");

    return res.json(sessions.map((session) => ({
      ...session,
      is_paid: Boolean(session.is_paid)
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching sessions" });
  }
};

// Update session
exports.updateSession = async (req, res) => {
  try {
    const { session_id } = req.params;
    const { session_name, mode } = req.body;

    const session = await AiSession.query().findById(session_id);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const updatedSession = await AiSession.query()
      .findById(session_id)
      .patch({
        session_name: session_name || session.session_name,
        mode: mode || session.mode
      });

    return res.json({
      message: "Session updated successfully",
      data: updatedSession
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating session" });
  }
};

// Delete session
exports.deleteSession = async (req, res) => {
  try {
    const { session_id } = req.params;

    const session = await AiSession.query().findById(session_id);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    await AiSession.query().deleteById(session_id);

    return res.json({ message: "Session deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting session" });
  }
};
