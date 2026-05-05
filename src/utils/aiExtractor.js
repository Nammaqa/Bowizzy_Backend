const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

async function callGroq(systemPrompt, userPrompt) {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function extractResumeUsingAI(text) {
  const systemPrompt = `You are a resume parsing assistant.
Extract structured resume data and return ONLY valid JSON.
No markdown. No code blocks. No explanation. No preamble.
Return ONLY the raw JSON object.`;

  const userPrompt = `Extract structured resume data from the text below.

EDUCATION RULES:
- Always separate "degree" and "field_of_study".
- "Bachelor of Engineering in X" → degree: "Bachelor's Degree", field_of_study: "X"
- "B.E in X" / "BTech in X" → field_of_study: "X"
- "Diploma in X" → degree: "Diploma", field_of_study: "X"
- NEVER leave field_of_study empty when "in" + branch exists.

RESULT RULES:
- "CGPA: X/Y" or "CGPA X.Y" → result_format: "CGPA", result: "X.Y"
- "Percentage: X" or "X%" → result_format: "Percentage", result: "X"

AWARDS RULE:
- Anything under "Awards", "Achievements", "Recognitions" → extract as a certificate.
- certificate_type: "Award", certificate_title: <name>, date: YYYY-MM format.

NATIONALITY RULE:
- If "Nationality: Indian" or similar is found → extract as nationality: "Indian" in personal_details.

Return JSON in EXACTLY this structure (no extra keys, no missing keys):
{
  "personal_details": {
    "first_name": "",
    "last_name": "",
    "email": "",
    "phone": "",
    "address": "",
    "city": "",
    "state": "",
    "country": "",
    "nationality": "",
    "date_of_birth": ""
  },
  "job_role": "",
  "summary": "",
  "education": [
    {
      "education_type": "",
      "degree": "",
      "field_of_study": "",
      "institution_name": "",
      "university_name": "",
      "start_year": "",
      "end_year": "",
      "currently_pursuing": false,
      "result_format": "",
      "result": ""
    }
  ],
  "work_experience": [
    {
      "company_name": "",
      "job_title": "",
      "start_date": "",
      "end_date": "",
      "currently_working_here": false,
      "description": ""
    }
  ],
  "projects": [
    {
      "project_title": "",
      "description": "",
      "roles_responsibilities": "",
      "start_date": "",
      "end_date": "",
      "currently_working": false
    }
  ],
  "skills": [
    {
      "skill_name": "",
      "skill_level": ""
    }
  ],
  "links": [
    {
      "link_type": "",
      "url": "",
      "description": ""
    }
  ],
  "certificates": [
    {
      "certificate_type": "",
      "certificate_title": "",
      "domain": "",
      "certificate_provided_by": "",
      "date": "",
      "description": "",
      "file_url": "",
      "file_type": ""
    }
  ]
}

RESUME TEXT:
${text}`;

  try {
    const raw = await callGroq(systemPrompt, userPrompt);
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("AI extraction failed:", err);
    throw new Error("AI extraction failed: " + err.message);
  }
}

module.exports = { extractResumeUsingAI };