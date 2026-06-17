const ResumeTemplate = require("../models/ResumeTemplate");
const User = require("../models/User");

exports.create = async (req, res) => {
  try {
    const { user_id } = req.params;
    const data = req.body;

    const userExists = await User.query().findById(user_id);
    if (!userExists)
      return res.status(404).json({ message: "User not found" });

    if (Array.isArray(data.templates)) {
      const payload = data.templates.map(item => ({
        template_name: item.template_name,
        template_code: item.template_code,
        template_id: item.template_id,
        thumbnail_url: item.thumbnail_url,
        template_file_url: item.template_file_url,
        user_id
      }));

      const inserted = await ResumeTemplate.query().insert(payload);
      return res.status(201).json(inserted);
    }

    const record = await ResumeTemplate.query().insert({
      template_name: data.template_name,
      template_code: data.template_code,
      template_id: data.template_id,
      thumbnail_url: data.thumbnail_url,
      template_file_url: data.template_file_url,
      user_id
    });

    return res.status(201).json(record);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating template(s)" });
  }
};

exports.getByUser = async (req, res) => {
  try {
    const { user_id } = req.params;

    const list = await ResumeTemplate.query()
      .where({ user_id });

    res.json(list);

  } catch (err) {
    res.status(500).json({ message: "Error fetching templates" });
  }
};

exports.getById = async (req, res) => {
  try {
    const { user_id, id } = req.params;

    const record = await ResumeTemplate.query()
      .findOne({ user_id, resume_template_id: id });

    if (!record)
      return res.status(404).json({ message: "No resume template found" });

    res.json(record);

  } catch (err) {
    res.status(500).json({ message: "Error fetching template" });
  }
};

exports.update = async (req, res) => {
  try {
    const { user_id, id } = req.params;
    const data = req.body;
    // Batch upsert when `templates` array provided
    if (Array.isArray(data.templates)) {
      const results = [];
      for (const item of data.templates) {
        // find existing by resume_template_id or template_id
        let existing = null;
        if (item.resume_template_id) {
          existing = await ResumeTemplate.query().findOne({ user_id, resume_template_id: item.resume_template_id });
        }
        if (!existing && item.template_id) {
          existing = await ResumeTemplate.query().findOne({ user_id, template_id: item.template_id });
        }

        const upsertObj = {};
        if (item.template_name !== undefined) upsertObj.template_name = item.template_name;
        if (item.template_id !== undefined) upsertObj.template_id = item.template_id;
        if (item.template_code !== undefined) upsertObj.template_code = item.template_code;
        if (item.thumbnail_url !== undefined) upsertObj.thumbnail_url = item.thumbnail_url;
        if (item.template_file_url !== undefined) upsertObj.template_file_url = item.template_file_url;

        if (existing) {
          const updated = await ResumeTemplate.query().patchAndFetchById(existing.resume_template_id, upsertObj);
          results.push(updated);
        } else {
          const inserted = await ResumeTemplate.query().insert({ ...upsertObj, user_id });
          results.push(inserted);
        }
      }

      return res.json(results);
    }

    // Single update flow
    const exists = await ResumeTemplate.query().findOne({ user_id, resume_template_id: id });
    if (!exists) return res.status(404).json({ message: "No resume template found" });

    // Build update object only with provided fields to avoid overwriting with undefined
    const updateObj = {};
    if (data.template_name !== undefined) updateObj.template_name = data.template_name;
    if (data.template_id !== undefined) updateObj.template_id = data.template_id;
    if (data.template_code !== undefined) updateObj.template_code = data.template_code;
    if (data.thumbnail_url !== undefined) updateObj.thumbnail_url = data.thumbnail_url;
    if (data.template_file_url !== undefined) updateObj.template_file_url = data.template_file_url;

    const updated = await ResumeTemplate.query().patchAndFetchById(exists.resume_template_id, updateObj);
    res.json(updated);

  } catch (err) {
    res.status(500).json({ message: "Error updating template" });
  }
};

exports.remove = async (req, res) => {
  try {
    const { user_id, id } = req.params;

    const exists = await ResumeTemplate.query().findOne({ user_id, resume_template_id: id });
    if (!exists) {
      return res.status(404).json({ message: "No resume template found" });
    }

    await ResumeTemplate.query().delete().where({ user_id, resume_template_id: id });
    return res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting template" });
  }
};
