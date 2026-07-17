const Skill = require("../models/Skill");
const WorkExperience = require("../models/WorkExperience");
const Project = require("../models/Project");

// Remove all <b>...</b> (and <bold>...</bold>) markers, keeping the inner text.
// Required so re-bolding (create/update/delete of skills) stays idempotent
// and never leaves stale or doubled markers behind.
function stripBold(text) {
  if (!text) return text;
  return text
    .replace(/<b>(.*?)<\/b>/gi, "$1")
    .replace(/<bold>(.*?)<\/bold>/gi, "$1");
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Wrap every whole-word occurrence of any skill name in <b>...</b> (HTML bold).
function boldSkillsInText(text, skillNames) {
  if (!text) return text;

  let result = stripBold(text);

  const names = skillNames
    .map(n => (n || "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // longer first so e.g. "JavaScript" wins over "Java"

  for (const name of names) {
    const pattern = new RegExp(`(?<![\\w])${escapeRegExp(name)}(?![\\w])`, "gi");
    result = result.replace(pattern, "<b>$&</b>");
  }

  return result;
}

// Re-scan the user's work-experience descriptions, project descriptions and
// project roles/responsibilities, bolding any text that matches a current skill.
async function reHighlightUserSkills(user_id) {
  const skills = await Skill.query().where({ user_id });
  const skillNames = skills.map(s => s.skill_name);

  const experiences = await WorkExperience.query().where({ user_id });
  for (const exp of experiences) {
    if (exp.description == null) continue;
    const updated = boldSkillsInText(exp.description, skillNames);
    if (updated !== exp.description) {
      await WorkExperience.query()
        .patch({ description: updated })
        .where({ user_id, experience_id: exp.experience_id });
    }
  }

  const projects = await Project.query().where({ user_id });
  for (const proj of projects) {
    const patch = {};
    let changed = false;

    if (proj.description != null) {
      const d = boldSkillsInText(proj.description, skillNames);
      if (d !== proj.description) {
        patch.description = d;
        changed = true;
      }
    }

    if (proj.roles_responsibilities != null) {
      const r = boldSkillsInText(proj.roles_responsibilities, skillNames);
      if (r !== proj.roles_responsibilities) {
        patch.roles_responsibilities = r;
        changed = true;
      }
    }

    if (changed) {
      await Project.query()
        .patch(patch)
        .where({ user_id, project_id: proj.project_id });
    }
  }
}

module.exports = { stripBold, boldSkillsInText, reHighlightUserSkills };
