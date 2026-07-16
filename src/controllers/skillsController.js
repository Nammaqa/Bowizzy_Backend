const Skill = require("../models/Skill");
const { reHighlightUserSkills } = require("../services/skillHighlight");

exports.create = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { skills } = req.body;

    if (!Array.isArray(skills)) {
      return res.status(400).json({ message: "skills must be an array" });
    }

    const rows = skills.map(s => ({
      ...s,
      user_id
    }));

    const inserted = await Skill.query().insert(rows);

    // Re-bold matching skill names inside work-experience / project text.
    try {
      await reHighlightUserSkills(user_id);
    } catch (hlErr) {
      console.error("Skill highlighting after create failed:", hlErr);
    }

    return res.status(201).json(inserted);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating skills" });
  }
};

exports.getByUser = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const list = await Skill.query()
      .where({ user_id })
      .orderBy("skill_id", "asc");

    return res.json(list);

  } catch (err) {
    res.status(500).json({ message: "Error fetching skills" });
  }
};

exports.getById = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { skill_id } = req.params;

    const record = await Skill.query().findOne({
      user_id,
      skill_id
    });

    if (!record) {
      return res.status(404).json({ message: "Skills record not found" });
    }

    return res.json(record);

  } catch (err) {
    res.status(500).json({ message: "Error fetching skill" });
  }
};

exports.update = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { skill_id } = req.params;
    const data = req.body;

    const updatedCount = await Skill.query()
      .patch(data)
      .where({ user_id, skill_id });

    if (updatedCount === 0) {
      return res.status(404).json({ message: "Skills record not found" });
    }

    const updated = await Skill.query().findOne({
      user_id,
      skill_id
    });

    // Re-bold matching skill names inside work-experience / project text.
    try {
      await reHighlightUserSkills(user_id);
    } catch (hlErr) {
      console.error("Skill highlighting after update failed:", hlErr);
    }

    return res.json(updated);

  } catch (err) {
    res.status(500).json({ message: "Error updating skill" });
  }
};

exports.remove = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { skill_id } = req.params;

    const deleted = await Skill.query()
      .delete()
      .where({ user_id, skill_id });

    if (!deleted) {
      return res.status(404).json({ message: "Skills record not found" });
    }

    // Re-bold remaining skill names (the deleted one is un-bolded).
    try {
      await reHighlightUserSkills(user_id);
    } catch (hlErr) {
      console.error("Skill highlighting after delete failed:", hlErr);
    }

    return res.json({ message: "Deleted successfully" });

  } catch (err) {
    res.status(500).json({ message: "Error deleting skill" });
  }
};