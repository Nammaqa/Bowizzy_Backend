const PersonalDetails = require("../models/PersonalDetails");
const Project = require("../models/Project");
const WorkExperience = require("../models/WorkExperience");
const JobRole = require("../models/JobRole");
const Certificate = require("../models/Certificate");
const Skill = require("../models/Skill");
const Link = require("../models/Link");
const TechnicalSummary = require("../models/TechnicalSummary");
const Education = require("../models/Education");
const AiSession = require("../models/AiSession");
const { callGroq, parseGroqJSON } = require("../services/groqService");

// ── Context builder ────────────────────────────────────────────────────────

function buildJdContext(resumeData, jdText) {
  const { personal_details, projects, work_experience, education, technical_summary, skills } = resumeData;
  const pd = personal_details || {};
  const lines = [];

  lines.push("=== TARGET JOB DESCRIPTION ===");
  lines.push(jdText);

  lines.push("\n=== PERSONAL DETAILS ===");
  lines.push(`Name: ${[pd.first_name, pd.middle_name, pd.last_name].filter(Boolean).join(" ")}`);
  if (pd.about) lines.push(`About: ${pd.about}`);
  if (pd.languages_known?.length) lines.push(`Languages: ${pd.languages_known.join(", ")}`);

  if (projects?.length) {
    lines.push("\n=== PROJECTS ===");
    projects.forEach((p, i) => {
      lines.push(`Project ${i + 1}: ${p.project_title} (project_id: ${p.project_id ?? "null"})`);
      lines.push(`  Duration: ${p.start_date || "N/A"} to ${p.currently_working ? "Present" : (p.end_date || "N/A")}`);
      if (p.description) lines.push(`  Description: ${String(p.description).replace(/<[^>]+>/g, "")}`);
      if (p.roles_responsibilities) lines.push(`  Roles & Responsibilities: ${String(p.roles_responsibilities).replace(/<[^>]+>/g, "")}`);
    });
  }

  if (work_experience?.experiences?.length) {
    lines.push("\n=== WORK EXPERIENCE ===");
    if (work_experience.job_role) lines.push(`Job Role: ${work_experience.job_role}`);
    work_experience.experiences.forEach((e, i) => {
      lines.push(`Experience ${i + 1}: ${e.job_title} at ${e.company_name} (experience_id: ${e.experience_id ?? "null"})`);
      lines.push(`  Type: ${e.employment_type}, Mode: ${e.work_mode}, Location: ${e.location}`);
      lines.push(`  Duration: ${e.start_date} to ${e.currently_working_here ? "Present" : e.end_date}`);
      if (e.description) lines.push(`  Description: ${String(e.description).replace(/<[^>]+>/g, "")}`);
    });
  }

  if (education?.length) {
    lines.push("\n=== EDUCATION ===");
    education.forEach((e, i) => {
      const label = e.degree ? `${e.degree} in ${e.field_of_study}` : (e.education_type || "").toUpperCase();
      lines.push(`Education ${i + 1}: ${label} at ${e.institution_name}`);
    });
  }

  if (skills?.length) {
    lines.push("\n=== EXISTING SKILLS ===");
    skills.forEach((s) => lines.push(`- ${s.skill_name} (${s.skill_level || "N/A"})`));
  }

  if (technical_summary?.summary) {
    const rawSummary = String(technical_summary.summary).replace(/<[^>]+>/g, "").trim();
    if (rawSummary) {
      lines.push("\n=== EXISTING TECHNICAL SUMMARY ===");
      lines.push(rawSummary);
    }
  }

  return lines.join("\n");
}

// ── Fetch the user's current saved resume data ───────────────────────────────

async function fetchResumeData(user_id) {
  const [personalDetails, projects, workExperiences, jobRole, certificates, links, technicalSummary, education, skills] =
    await Promise.allSettled([
      PersonalDetails.query().findOne({ user_id }),
      Project.query().where({ user_id }).orderBy("project_id", "asc"),
      WorkExperience.query().where({ user_id }).orderBy("experience_id", "asc"),
      JobRole.query().findOne({ user_id }),
      Certificate.query().where({ user_id }),
      Link.query().where({ user_id }).orderBy("link_id", "asc"),
      TechnicalSummary.query().findOne({ user_id }),
      Education.query().where({ user_id }).orderBy("education_id", "asc"),
      Skill.query().where({ user_id }).orderBy("skill_id", "asc"),
    ]);

  const getValue = (result, fallback = null) =>
    result.status === "fulfilled" ? result.value ?? fallback : fallback;

  return {
    personal_details: getValue(personalDetails),
    projects: getValue(projects, []),
    work_experience: {
      job_role: getValue(jobRole)?.job_role ?? null,
      experiences: getValue(workExperiences, []),
    },
    certificates: getValue(certificates, []),
    links: getValue(links, []),
    skills: getValue(skills, []),
    technical_summary: getValue(technicalSummary),
    education: getValue(education, []),
  };
}

// ── Session ownership guard ───────────────────────────────────────────────────

async function loadOwnedSession(session_id, user_id) {
  const session = await AiSession.query().findById(session_id);
  if (!session) return { error: { status: 404, message: "Session not found" } };
  if (session.user_id && session.user_id !== user_id) {
    return { error: { status: 403, message: "Not authorized to use this session" } };
  }
  return { session };
}

// ── Generate JD-tailored resume content (no persistence) ─────────────────────

exports.generateJdResume = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { session_id, jd_text } = req.body;

    if (!jd_text || !jd_text.trim()) {
      return res.status(400).json({ message: "Job description text (jd_text) is required" });
    }

    if (session_id) {
      const { error } = await loadOwnedSession(session_id, user_id);
      if (error) return res.status(error.status).json({ message: error.message });
    }

    const resumeData = await fetchResumeData(user_id);
    const { projects: allProjects, work_experience, certificates: allCertificates, links: allLinks, education: allEducation } = resumeData;
    const allExperiences = work_experience.experiences;

    const context = buildJdContext(resumeData, jd_text.trim());

    const systemPrompt = `You are an expert resume writer and ATS (Applicant Tracking System) optimization specialist.
Your task is to tailor a candidate's resume content to a specific job description, maximizing keyword relevance and ATS match score while staying strictly truthful to their actual experience.
Always respond with valid JSON only — no markdown, no explanation, no extra text.`;

    const projectListForPrompt = allProjects
      .map((p, i) => `${i + 1}. "${p.project_title}" (project_id: ${p.project_id ?? "null"})`)
      .join("\n");
    const expListForPrompt = allExperiences
      .map((e, i) => `${i + 1}. "${e.job_title} at ${e.company_name}" (experience_id: ${e.experience_id ?? "null"})`)
      .join("\n");

    const combinedPrompt = `Tailor the candidate's resume content below to the TARGET JOB DESCRIPTION so it reads as highly compatible with that role and scores well against ATS keyword matching. Do not fabricate employers, titles, dates, or qualifications the candidate does not have — only rephrase, emphasize, reframe truthful content, and infer clearly-evidenced skills.

---

TASK 1 — TECHNICAL SUMMARY:
Write a compelling technical summary (4-6 sentences) tailored to the job description, naturally incorporating its key terms and highlighting the candidate's most relevant qualifications for this specific role.

---

TASK 2 — PROJECTS:
Rewrite the description for EVERY project listed below into professional bullet points that emphasize relevance to the job description.
You MUST include ALL ${allProjects.length} project(s) — do not skip any.

Projects to enhance:
${projectListForPrompt || "None"}

Rules:
- 3-5 enhanced_description bullets per project, each starting with a strong action verb, weaving in job-description-relevant keywords/technologies where truthfully applicable
- 2-3 roles_responsibilities bullets per project

---

TASK 3 — WORK EXPERIENCE:
Rewrite the description for EVERY work experience listed below into professional bullet points that emphasize relevance to the job description.
You MUST include ALL ${allExperiences.length} experience(s) — do not skip any.

Experiences to enhance:
${expListForPrompt || "None"}

Rules:
- 3-5 enhanced_description bullets per experience, each starting with a strong action verb, aligned to the job description's requirements where truthfully applicable

---

TASK 4 — SKILLS:
Produce two skill lists:

a) "skills" — the candidate's existing skills (from === EXISTING SKILLS === below), returned exactly as-is, unmodified. If none exist, return [].

b) "ai_skills" — a list combining:
   - skills clearly evidenced by the candidate's projects, experience, or summary
   - skills explicitly required or preferred in the TARGET JOB DESCRIPTION that are reasonably supported by the candidate's background, to improve ATS match
   Deduplicate against "skills" — do not repeat entries already in "skills". Each entry needs skill_name and skill_level (Beginner/Intermediate/Expert). Aim for 8-15 entries, prioritizing terms that appear in the job description.

---

Education and certificates must NOT be modified — they are passed through unchanged and are not part of your output.

Respond with this exact JSON structure and nothing else:
{
  "technical_summary_generated": "<paragraph here>",
  "projects_generated": [
    { "project_id": <number or null>, "project_title": "<title>", "enhanced_description": ["bullet 1", "bullet 2"], "roles_responsibilities": ["bullet 1", "bullet 2"] }
  ],
  "work_experience_generated": [
    { "experience_id": <number or null>, "job_title": "<title>", "company_name": "<company>", "enhanced_description": ["bullet 1", "bullet 2"] }
  ],
  "skills": [ { "skill_name": "<name>", "skill_level": "<level>" } ],
  "ai_skills": [ { "skill_name": "<name>", "skill_level": "<Beginner|Intermediate|Expert>" } ]
}

CANDIDATE INFO:
${context}`;

    let enhancedRaw = "";
    try {
      enhancedRaw = await callGroq(systemPrompt, combinedPrompt);
    } catch (err) {
      console.error("[jd-enhancement] Groq call failed:", err);
    }

    let enhancedData = {
      technical_summary_generated: null,
      projects_generated: [],
      work_experience_generated: [],
      skills: [],
      ai_skills: [],
    };

    try {
      enhancedData = parseGroqJSON(enhancedRaw);
    } catch (err) {
      console.error("[jd-enhancement] JSON parse failed. Raw:", enhancedRaw);
    }

    const projectsOut = allProjects.map((p) => {
      const pTitle = p.project_title?.toLowerCase() ?? "";
      const match = (enhancedData.projects_generated || []).find((g) => {
        if (p.project_id && g.project_id && Number(g.project_id) === Number(p.project_id)) return true;
        const gTitle = g.project_title?.toLowerCase() ?? "";
        return gTitle === pTitle || gTitle.includes(pTitle) || pTitle.includes(gTitle);
      });
      return {
        project_id: p.project_id ?? null,
        project_title: p.project_title,
        start_date: p.start_date ?? null,
        end_date: p.end_date ?? null,
        currently_working: p.currently_working ?? false,
        enhanced_description: match?.enhanced_description ?? [],
        roles_responsibilities: match?.roles_responsibilities ?? [],
      };
    });

    const experiencesOut = allExperiences.map((e) => {
      const eCompany = e.company_name?.toLowerCase() ?? "";
      const eTitle = e.job_title?.toLowerCase() ?? "";
      const match = (enhancedData.work_experience_generated || []).find((g) => {
        if (e.experience_id && g.experience_id) return Number(g.experience_id) === Number(e.experience_id);
        const gCompany = g.company_name?.toLowerCase() ?? "";
        const gTitle = g.job_title?.toLowerCase() ?? "";
        const companyMatch = gCompany === eCompany || gCompany.includes(eCompany) || eCompany.includes(gCompany);
        const titleMatch = gTitle === eTitle || gTitle.includes(eTitle) || eTitle.includes(gTitle);
        return companyMatch && titleMatch;
      });
      return {
        experience_id: e.experience_id ?? null,
        job_title: e.job_title,
        company_name: e.company_name,
        employment_type: e.employment_type ?? null,
        location: e.location ?? null,
        work_mode: e.work_mode ?? null,
        start_date: e.start_date ?? null,
        end_date: e.end_date ?? null,
        currently_working_here: e.currently_working_here ?? false,
        enhanced_description: match?.enhanced_description ?? [],
      };
    });

    const educationOut = allEducation.map((e) => ({
      education_id: e.education_id ?? null,
      education_type: e.education_type ?? null,
      institution_name: e.institution_name ?? null,
      degree: e.degree ?? null,
      field_of_study: e.field_of_study ?? null,
      university_name: e.university_name ?? null,
      start_year: e.start_year ?? null,
      end_year: e.end_year ?? null,
      currently_pursuing: e.currently_pursuing ?? false,
      result_format: e.result_format ?? null,
      result: e.result ?? null,
    }));

    const skillsOut = (enhancedData.skills || []).map((s) => ({
      skill_name: s.skill_name ?? null,
      skill_level: s.skill_level ?? null,
    }));

    const aiSkillsOut = (enhancedData.ai_skills || []).map((s) => ({
      skill_name: s.skill_name ?? null,
      skill_level: s.skill_level ?? null,
    }));

    const certificatesOut = allCertificates.map((c) => ({
      certificate_id: c.certificate_id ?? null,
      certificate_title: c.certificate_title ?? null,
      certificate_type: c.certificate_type ?? null,
      certificate_provided_by: c.certificate_provided_by ?? null,
      domain: c.domain ?? null,
      date: c.date ?? null,
    }));

    const linksOut = allLinks.map((l) => ({
      link_id: l.link_id ?? null,
      link_type: l.link_type ?? null,
      url: l.url ?? null,
    }));

    const finalPayload = {
      personal_details: resumeData.personal_details,
      technical_summary_generated: enhancedData.technical_summary_generated ?? null,
      projects: projectsOut,
      work_experience: { experiences: experiencesOut },
      education: educationOut,
      skills: skillsOut,
      ai_skills: aiSkillsOut,
      certificates: certificatesOut,
      links: linksOut,
    };

    return res.json({
      message: "JD-optimized resume generated successfully",
      data: finalPayload,
    });
  } catch (err) {
    console.error("Error generating JD-optimized resume:", err);
    res.status(500).json({ message: "Error generating JD-optimized resume content" });
  }
};

// ── Persist the (possibly user-edited) JD resume payload to the session ──────

exports.saveJdResume = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { session_id, data } = req.body;

    if (!session_id) {
      return res.status(400).json({ message: "Session ID is required" });
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return res.status(400).json({ message: "Resume data (data) is required" });
    }

    const { error } = await loadOwnedSession(session_id, user_id);
    if (error) return res.status(error.status).json({ message: error.message });

    await AiSession.query().findById(session_id).patch({ infoJson: data, mode: "jd" });
    const updatedSession = await AiSession.query().findById(session_id);

    return res.json({
      message: "JD resume data saved successfully",
      data: updatedSession,
    });
  } catch (err) {
    console.error("Error saving JD resume data:", err);
    res.status(500).json({ message: "Error saving JD resume data" });
  }
};
