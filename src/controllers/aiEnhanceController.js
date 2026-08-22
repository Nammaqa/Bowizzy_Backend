// aiEnhanceController.js
// Server-side AI enhancement for resume sections (Career Objective,
// Roles & Responsibilities, Technical Summary).
// Ported from the frontend utils so the OpenAI key never reaches the browser.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Strips HTML tags from a string and returns plain text.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Error carrying the HTTP status the API should respond with.
 */
class EnhanceError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

/**
 * Calls OpenAI chat completions, retrying on 429 with the same backoff the
 * frontend used (retry-after header, else exponential 1s/2s/4s).
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt
 * @param {string} opts.userPrompt
 * @param {number} opts.maxTokens
 * @param {number} [opts.retries]
 * @param {number} [opts.delayMs]
 * @returns {Promise<string>} raw assistant message content
 */
async function callOpenAIWithRetry({
  systemPrompt,
  userPrompt,
  maxTokens,
  retries = 3,
  delayMs = 1000,
}) {
  if (!OPENAI_API_KEY) {
    throw new EnhanceError("AI service is not configured.", 500);
  }

  for (let i = 0; i < retries; i++) {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter
        ? parseInt(retryAfter) * 1000
        : delayMs * Math.pow(2, i);
      console.warn(
        `Rate limited. Retrying in ${waitMs}ms... (attempt ${i + 1}/${retries})`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new EnhanceError(
        errorData?.error?.message || `OpenAI API error: ${response.status}`
      );
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "";
  }

  throw new EnhanceError(
    "Too many requests. Please wait a moment and try again.",
    429
  );
}

/**
 * Sends an EnhanceError with its own status, anything else as a 500.
 */
function sendEnhanceError(res, err, fallbackMessage) {
  if (err instanceof EnhanceError) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(fallbackMessage, err);
  return res.status(500).json({ message: fallbackMessage });
}

// ── 1. Career Objective ───────────────────────────────────────────────────────

/**
 * Builds a structured context string from skills, experiences, and projects.
 * @param {string[]} skills
 * @param {Array} experiences
 * @param {Array} projects
 * @returns {string}
 */
function buildCareerObjectiveContext(skills, experiences, projects) {
  const lines = [];

  if (skills && skills.length > 0) {
    lines.push(`Skills: ${skills.join(", ")}`);
  }

  if (experiences && experiences.length > 0) {
    const expLines = experiences
      .filter((e) => e.jobTitle || e.companyName)
      .map((e) => {
        const parts = [];
        if (e.jobTitle) parts.push(`Role: ${e.jobTitle}`);
        if (e.companyName) parts.push(`Company: ${e.companyName}`);
        if (e.employmentType) parts.push(`Type: ${e.employmentType}`);
        if (e.startDate || e.endDate) {
          parts.push(
            `Duration: ${e.startDate || "N/A"} - ${
              e.currentlyWorking ? "Present" : e.endDate || "N/A"
            }`
          );
        }
        if (e.description) parts.push(`Details: ${stripHtml(e.description)}`);
        return parts.join(" | ");
      });

    if (expLines.length > 0) {
      lines.push(`Work Experience:\n${expLines.map((l) => `  - ${l}`).join("\n")}`);
    }
  }

  if (projects && projects.length > 0) {
    const projLines = projects
      .filter((p) => p.projectTitle)
      .map((p) => {
        const parts = [];
        if (p.projectTitle) parts.push(`Project: ${p.projectTitle}`);
        if (p.projectType) parts.push(`Type: ${p.projectType}`);
        if (p.description) parts.push(`Description: ${stripHtml(p.description)}`);
        if (p.rolesResponsibilities)
          parts.push(`Roles: ${stripHtml(p.rolesResponsibilities)}`);
        return parts.join(" | ");
      });

    if (projLines.length > 0) {
      lines.push(`Projects:\n${projLines.map((l) => `  - ${l}`).join("\n")}`);
    }
  }

  return lines.join("\n\n");
}

/**
 * POST /enhance/career-objective
 * Body: { userInput, skills = [], experiences = [], projects = [] }
 * Returns: { data: { professional, elaborate } }
 */
exports.enhanceCareerObjective = async (req, res) => {
  try {
    const { userInput, skills = [], experiences = [], projects = [] } = req.body;

    const plainInput = stripHtml(userInput);
    if (!plainInput) {
      return res
        .status(400)
        .json({ message: "Career objective text is required" });
    }

    const context = buildCareerObjectiveContext(skills, experiences, projects);

    const systemPrompt = `You are a professional resume writer and career coach.
Your task is to enhance a user's career objective/about section for their resume.
You will be given their current career objective along with their skills, experience, and projects as context.
Generate exactly TWO enhanced versions:
1. "professional" - Concise, impactful, formal tone. 2-3 sentences max. ATS-friendly.
2. "elaborate" - Detailed, rich narrative that showcases depth. 4-6 sentences. Highlights specific skills and achievements.

Both versions should naturally incorporate relevant details from the provided context.

STRICT LENGTH LIMIT: Each version MUST NOT exceed 500 characters (including spaces and punctuation). Count the characters of every version before responding, and if a version is longer than 500 characters, rewrite it shorter until it fits. Aim for 450-490 characters for "elaborate" so it stays safely under the limit. A version longer than 500 characters is invalid.
Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation, no code fences):
{
  "professional": "...",
  "elaborate": "..."
}`;

    const userPrompt = `Current Career Objective:
"${plainInput}"

Resume Context:
${context || "No additional context provided."}

Generate two enhanced versions as specified. Remember: each version must be 500 characters or fewer.`;

    const raw = await callOpenAIWithRetry({
      systemPrompt,
      userPrompt,
      maxTokens: 600,
    });

    // Strip any markdown code fences if present
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new EnhanceError("Failed to parse AI response. Please try again.");
    }

    if (!parsed.professional || !parsed.elaborate) {
      throw new EnhanceError("Incomplete AI response. Please try again.");
    }

    return res.json({
      message: "Career objective enhanced successfully",
      data: {
        professional: parsed.professional.trim(),
        elaborate: parsed.elaborate.trim(),
      },
    });
  } catch (err) {
    return sendEnhanceError(res, err, "Error enhancing career objective");
  }
};

// ── 2. Roles & Responsibilities ───────────────────────────────────────────────

/**
 * Fixes unescaped newlines/tabs inside JSON string values so JSON.parse doesn't choke.
 * Models sometimes return literal newlines inside string values instead of \n.
 * @param {string} raw
 * @returns {string}
 */
function fixJsonStringNewlines(raw) {
  return raw.replace(/"((?:[^"\\]|\\.)*)"/gs, (match, inner) => {
    const fixed = inner
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    return `"${fixed}"`;
  });
}

/**
 * POST /enhance/roles-responsibilities
 * Body: { rolesInput, projectTitle, projectType, description }
 * Returns: { data: { precise, technical } }
 */
exports.enhanceRolesResponsibilities = async (req, res) => {
  try {
    const { rolesInput, projectTitle, projectType, description } = req.body;

    const plainRoles = stripHtml(rolesInput);
    if (!plainRoles) {
      return res
        .status(400)
        .json({ message: "Roles & responsibilities text is required" });
    }

    const plainDescription = stripHtml(description);

    const contextLines = [];
    if (projectTitle) contextLines.push(`Project Title: ${projectTitle}`);
    if (projectType) contextLines.push(`Project Type: ${projectType}`);
    if (plainDescription)
      contextLines.push(`Project Description: ${plainDescription}`);
    const context =
      contextLines.length > 0
        ? contextLines.join("\n")
        : "No additional context provided.";

    const systemPrompt = `You are a professional resume writer specializing in technical roles.
Your task is to enhance a candidate's roles & responsibilities for a project section of their resume.
You will be given the current roles & responsibilities along with project context.
Generate exactly TWO enhanced versions:
1. "precise" - Bullet-point style, concise action verbs, each point under 15 words. Max 4 bullets. No fluff. Focuses on what was done.
2. "technical" - Detailed technical breakdown highlighting tools, technologies, methodologies, and impact. Max 5 bullets, each 15-25 words.

STRICT LENGTH LIMIT: Each version MUST NOT exceed 500 characters in total, counting all of its bullets together including the bullet characters, spaces, punctuation and line breaks. Count the characters of every version before responding, and if a version is longer than 500 characters, shorten or drop bullets until it fits. A version longer than 500 characters is invalid.

IMPORTANT: Format both as plain text using "• " as the bullet character separated by \\n (escaped newline, NOT a real line break).
Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation, no code fences):
{"precise":"• point one\\n• point two\\n• point three","technical":"• point one\\n• point two\\n• point three"}`;

    const userPrompt = `Current Roles & Responsibilities:
"${plainRoles}"

Project Context:
${context}

Generate two enhanced versions as specified. Remember: each version must total 500 characters or fewer across all of its bullets.`;

    const raw = await callOpenAIWithRetry({
      systemPrompt,
      userPrompt,
      maxTokens: 600,
    });

    // Step 1: strip markdown code fences
    const stripped = raw.replace(/```json|```/g, "").trim();

    // Step 2: fix literal newlines inside JSON string values
    const fixedJson = fixJsonStringNewlines(stripped);

    let parsed;

    // Step 3: try direct parse first
    try {
      parsed = JSON.parse(fixedJson);
    } catch {
      // Step 4: fallback — extract the {...} block and try again
      const jsonMatch = fixedJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error(
            "Parse error after fallback:",
            e,
            "\nCleaned string:",
            fixedJson
          );
          throw new EnhanceError(
            "Failed to parse AI response. Please try again."
          );
        }
      } else {
        console.error("No JSON object found in response:", fixedJson);
        throw new EnhanceError("Failed to parse AI response. Please try again.");
      }
    }

    if (!parsed.precise || !parsed.technical) {
      throw new EnhanceError("Incomplete AI response. Please try again.");
    }

    return res.json({
      message: "Roles & responsibilities enhanced successfully",
      data: {
        precise: parsed.precise.trim(),
        technical: parsed.technical.trim(),
      },
    });
  } catch (err) {
    return sendEnhanceError(res, err, "Error enhancing roles & responsibilities");
  }
};

// ── 3. Technical Summary ──────────────────────────────────────────────────────

/**
 * Normalises a bullet string into one bullet per real newline.
 * Guards against two malformed shapes the model occasionally returns:
 * a double-escaped "\\n" that survives JSON.parse as literal text, and
 * all bullets run together on a single line.
 * @param {string} value
 * @returns {string}
 */
function normalizeBulletLines(value) {
  return value
    .replace(/\\r\\n|\\r|\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    .split(/\n+|(?=[•◦▪●‣]\s)/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * POST /enhance/technical-summary
 * Body: { userInput, skills = [] }
 * Returns: { data: { atsFriendly, informative } }
 */
exports.enhanceTechnicalSummary = async (req, res) => {
  try {
    const { userInput, skills = [] } = req.body;

    const plainInput = stripHtml(userInput);
    if (!plainInput) {
      return res
        .status(400)
        .json({ message: "Technical summary text is required" });
    }

    const skillsContext =
      skills && skills.length > 0
        ? `Skills: ${skills.join(", ")}`
        : "No skills provided.";

    const systemPrompt = `You are a professional resume writer and technical career coach.
Your task is to enhance a user's technical summary section for their resume.
You will be given their current technical summary along with their skills as context.
Generate exactly TWO enhanced versions:
1. "atsFriendly" - Optimized for Applicant Tracking Systems. Must be written as exactly 6 bullet points (each starting with "• "). Each bullet is one concise, keyword-rich sentence using relevant skills. No paragraphs, no prose.
2. "informative" - Must be written as exactly 6 bullet points (each starting with "• "). Each bullet is a detailed sentence highlighting technical depth, breadth, and value. No paragraphs, no prose.

Both versions must naturally incorporate the provided skills.
Each version MUST have exactly 6 bullet points. No more, no less.

STRICT LENGTH LIMIT: Each version MUST NOT exceed 500 characters in total, counting all 6 bullets together including the bullet characters, spaces, punctuation and line breaks. That means roughly 70-78 characters per bullet. Count the characters of every version before responding, and if a version is longer than 500 characters, shorten the bullets until it fits (keep all 6 bullets). A version longer than 500 characters is invalid.
IMPORTANT: Format both as plain text using "• " as the bullet character separated by \\n (escaped newline, NOT a real line break).
Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation, no code fences):
{"atsFriendly":"• point 1\\n• point 2\\n• point 3\\n• point 4\\n• point 5\\n• point 6","informative":"• point 1\\n• point 2\\n• point 3\\n• point 4\\n• point 5\\n• point 6"}`;

    const userPrompt = `Current Technical Summary:
"${plainInput}"

Resume Context:
${skillsContext}

Generate two enhanced versions as specified. Remember: each version must total 500 characters or fewer across its 6 bullets.`;

    const raw = await callOpenAIWithRetry({
      systemPrompt,
      userPrompt,
      maxTokens: 900,
    });

    // Strip any markdown code fences if present
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      // Fix unescaped newlines inside JSON string values before parsing
      const sanitized = cleaned.replace(
        /"(atsFriendly|informative)":\s*"([\s\S]*?)(?<!\\)"/g,
        (match, key, value) => {
          const escaped = value
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")
            .replace(/\t/g, "\\t");
          return `"${key}": "${escaped}"`;
        }
      );
      parsed = JSON.parse(sanitized);
    } catch {
      throw new EnhanceError("Failed to parse AI response. Please try again.");
    }

    if (!parsed.atsFriendly || !parsed.informative) {
      throw new EnhanceError("Incomplete AI response. Please try again.");
    }

    return res.json({
      message: "Technical summary enhanced successfully",
      data: {
        atsFriendly: normalizeBulletLines(parsed.atsFriendly),
        informative: normalizeBulletLines(parsed.informative),
      },
    });
  } catch (err) {
    return sendEnhanceError(res, err, "Error enhancing technical summary");
  }
};
