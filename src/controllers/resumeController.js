const pdfParse = require("pdf-parse");
const { extractResumeUsingAI } = require("../utils/aiExtractor");

const PersonalDetails = require("../models/PersonalDetails");
const Education = require("../models/Education");
const JobRole = require("../models/JobRole");
const WorkExperience = require("../models/WorkExperience");
const Project = require("../models/Project");
const Skill = require("../models/Skill");
const Link = require("../models/Link");
const Certificate = require("../models/Certificate");

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizeEducationType(type) {
  if (!type) return "other";
  const t = type.toLowerCase();
  if (t.includes("sslc") || t.includes("10")) return "sslc";
  if (t.includes("puc") || t.includes("12")) return "puc";
  if (t.includes("diploma")) return "puc";
  if (
    t.includes("btech") ||
    t.includes("b.e") ||
    t.includes("be") ||
    t.includes("bachelor") ||
    t.includes("mtech") ||
    t.includes("master") ||
    t.includes("phd")
  ) {
    return "higher";
  }
  return "other";
}

function normalizeBoardType(board) {
  if (!board) return null;
  const t = board.toLowerCase();
  if (t.includes("cbse")) return "CBSE";
  if (t.includes("icse")) return "ICSE";
  if (t.includes("state")) return "State Board";
  return null;
}

function normalizeDegree(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes("bachelor") || t.includes("b.e") || t.includes("be") || t.includes("btech"))
    return "Bachelor's Degree";
  if (t.includes("master") || t.includes("m.e") || t.includes("me") || t.includes("mtech"))
    return "Master's Degree";
  if (t.includes("diploma")) return "Diploma";
  if (t.includes("phd") || t.includes("doctor")) return "PhD";
  return null;
}

function normalizeFieldOfStudy(text) {
  if (!text) return null;

  let clean = text.replace(/—.*/g, "")
                  .replace(/-.*/g, "")
                  .replace(/\(.*/g, "")
                  .trim();

  const lower = clean.toLowerCase();

  const fullForms = [
    "computer science", "information technology", "electronics and communication",
    "electronics", "electrical engineering", "mechanical engineering",
    "civil engineering", "automobile engineering", "biotechnology",
    "chemical engineering", "aerospace engineering", "data science",
    "artificial intelligence", "machine learning", "ai and ml",
    "mechatronics", "robotics", "software engineering",
    "commerce", "science", "arts",
  ];

  for (let field of fullForms) {
    if (lower.includes(field.toLowerCase())) return field;
  }

  const shortForms = {
    cse: "Computer Science",
    cs: "Computer Science",
    it: "Information Technology",
    ece: "Electronics and Communication",
    eee: "Electrical Engineering",
    mech: "Mechanical Engineering",
    civil: "Civil Engineering",
    auto: "Automobile Engineering",
    aiml: "Artificial Intelligence & Machine Learning",
    ai: "Artificial Intelligence",
    ml: "Machine Learning",
    ds: "Data Science",
  };

  for (let key in shortForms) {
    if (lower.includes(key)) return shortForms[key];
  }

  if (lower.includes(" in ")) {
    return clean.split(/in/i)[1].trim();
  }

  return clean.trim();
}

function normalizeResultFormat(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes("cgpa")) return "CGPA";
  if (t.includes("percent") || t.includes("%")) return "Percentage";
  return null;
}

function extractResultValue(text) {
  if (!text) return null;
  const num = text.match(/(\d+(\.\d+)?)/);
  return num ? num[1] : null;
}

function formatYearMonth(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthToFullDate(ym) {
  if (!ym) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ym)) return ym;
  if (/^\d{4}-\d{2}$/.test(ym)) return `${ym}-01`;
  return null;
}

function normalizeLinkType(type) {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t.includes("linkedin")) return "linkedin";
  if (t.includes("github")) return "github";
  if (t.includes("portfolio") || t.includes("website")) return "portfolio";
  return t;
}

// ── Save helpers ──────────────────────────────────────────────────────────────

async function updatePersonalDetails(userId, pd) {
  const existing = await PersonalDetails.query().findOne({ user_id: userId });
  if (!existing) return "not_found";

  const updateData = {
    date_of_birth: pd.date_of_birth || existing.date_of_birth,
    address:       pd.address       || existing.address,
    city:          pd.city          || existing.city,
    state:         pd.state         || existing.state,
    country:       pd.country       || existing.country,
    nationality:   pd.nationality   || existing.nationality,
  };

  await PersonalDetails.query().patch(updateData).where("user_id", userId);
  return "updated";
}

async function saveEducation(userId, list) {
  const saved = [];
  if (!Array.isArray(list)) return saved;

  for (let edu of list) {
    const record = {
      user_id:            userId,
      education_type:     normalizeEducationType(edu.education_type),
      institution_name:   edu.institution_name   || null,
      board_type:         normalizeBoardType(edu.board_type),
      subject_stream:     edu.subject_stream      || null,
      degree:             normalizeDegree(edu.degree),
      field_of_study:     normalizeFieldOfStudy(edu.field_of_study),
      university_name:    edu.university_name     || null,
      start_year:         formatYearMonth(edu.start_year),
      end_year:           formatYearMonth(edu.end_year),
      currently_pursuing: edu.currently_pursuing  || false,
      result_format:      normalizeResultFormat(edu.result_format),
      result:             extractResultValue(edu.result),
    };

    const inserted = await Education.query().insert(record);
    saved.push(inserted);
  }

  return saved;
}

async function saveJobRole(userId, workList) {
  if (!Array.isArray(workList) || workList.length === 0) return null;
  const latestJobTitle = workList[0].job_title;
  if (!latestJobTitle) return null;

  return await JobRole.query().insert({
    user_id:  userId,
    job_role: latestJobTitle,
  });
}

async function saveWorkExperience(userId, list) {
  const saved = [];
  if (!Array.isArray(list)) return saved;

  for (let w of list) {
    const startYM   = formatYearMonth(w.start_date);
    const startDate = monthToFullDate(startYM);

    const endLower = (w.end_date || "").toString().toLowerCase();
    let endDate = null;

    if (!endLower.includes("present") && !endLower.includes("current")) {
      const endYM = formatYearMonth(w.end_date);
      endDate = monthToFullDate(endYM);
    }

    const record = {
      user_id:                userId,
      company_name:           w.company_name           || null,
      job_title:              w.job_title              || null,
      employment_type:        w.employment_type        || null,
      location:               w.location               || null,
      work_mode:              w.work_mode              || null,
      start_date:             startDate,
      end_date:               endDate,
      currently_working_here: endDate === null ? true : !!w.currently_working_here,
      description:            w.description            || null,
    };

    const inserted = await WorkExperience.query().insert(record);
    saved.push(inserted);
  }

  return saved;
}

async function saveProjects(userId, projectList) {
  const saved = [];
  if (!Array.isArray(projectList)) return saved;

  for (let proj of projectList) {
    const record = {
      user_id:                userId,
      project_title:          proj.project_title          || null,
      project_type:           proj.project_type           || null,
      start_date:             formatYearMonth(proj.start_date),
      end_date:               formatYearMonth(proj.end_date),
      currently_working:      proj.currently_working      || false,
      description:            proj.description            || null,
      roles_responsibilities: proj.roles_responsibilities || null,
    };

    const inserted = await Project.query().insert(record);
    saved.push(inserted);
  }

  return saved;
}

async function saveSkills(userId, skillsList) {
  if (!Array.isArray(skillsList)) return;

  for (let s of skillsList) {
    if (!s.skill_name) continue;
    await Skill.query().insert({
      user_id:     userId,
      skill_name:  s.skill_name,
      skill_level: s.skill_level || null,
    });
  }
}

async function saveLinks(userId, links) {
  const saved = [];
  if (!Array.isArray(links)) return saved;

  // ── FIX: skip any link where url is missing or empty ─────────────────────
  const validLinks = links.filter((l) => l.url && l.url.trim() !== "");

  for (let link of validLinks) {
    const record = {
      user_id:     userId,
      link_type:   normalizeLinkType(link.link_type),
      url:         link.url.trim(),
      description: link.description || null,
    };

    const inserted = await Link.query().insert(record);
    saved.push(inserted);
  }

  return saved;
}

async function saveCertificates(userId, list) {
  const saved = [];
  if (!Array.isArray(list)) return saved;

  for (let c of list) {
    // skip certificates with no title
    if (!c.certificate_title) continue;

    const record = {
      user_id:                 userId,
      certificate_type:        c.certificate_type        || "Award",
      certificate_title:       c.certificate_title,
      domain:                  c.domain                  || null,
      certificate_provided_by: c.certificate_provided_by || null,
      date:                    monthToFullDate(formatYearMonth(c.date)),
      description:             c.description             || null,
      file_url:                c.file_url                || null,
      file_type:               c.file_type               || null,
    };

    const inserted = await Certificate.query().insert(record);
    saved.push(inserted);
  }

  return saved;
}

// ── Controller ────────────────────────────────────────────────────────────────

exports.extractResume = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "No file uploaded" });

    const pdf  = await pdfParse(req.file.buffer);
    const text = pdf.text;

    const extracted = await extractResumeUsingAI(text);
    const userId    = req.user.user_id;

    const personalStatus = await updatePersonalDetails(userId, extracted.personal_details);

    if (personalStatus === "not_found") {
      return res.status(400).json({ message: "Personal details not found" });
    }

    const savedEducation     = await saveEducation(userId, extracted.education);
    const savedJobRole       = await saveJobRole(userId, extracted.work_experience);
    const savedProjects      = await saveProjects(userId, extracted.projects);
    const savedSkills        = await saveSkills(userId, extracted.skills);
    const savedLinks         = await saveLinks(userId, extracted.links);
    const savedCertificates  = await saveCertificates(userId, extracted.certificates);
    const savedWorkExp       = await saveWorkExperience(userId, extracted.work_experience);

    return res.json({
      message:                  "Resume extracted & saved successfully",
      personal_details_updated: true,
      education_saved:          savedEducation,
      job_role_saved:           savedJobRole,
      work_experience_saved:    savedWorkExp,
      ai_output:                extracted,
    });

  } catch (err) {
    console.error("AI Extract Error:", err);
    return res.status(500).json({ message: "AI extraction failed" });
  }
};