/**
 * ATS Resume Optimizer — Cloudflare Worker
 *
 * Required secrets (set via `wrangler secret put`):
 *   ANTHROPIC_API_KEY   — your Anthropic API key
 *   ACCESS_PASSWORD     — the invite-only password for the frontend gate
 *
 * Endpoints (all POST, JSON body):
 *   { action: "ping",     password }                           → 200 {ok:true} | 401
 *   { action: "optimize", password, resumeText, jobDescription } → 200 {…} | 401 | 500
 */

// ── Shared scoring logic (mirrors app.js) ─────────────────────────────────────
const STOPWORDS = new Set([
  'a','about','above','after','again','against','all','am','an','and','any','are',
  'as','at','be','because','been','before','being','below','between','both','but','by',
  'can','did','do','does','doing','don','down','during','each','few','for','from',
  'further','get','got','had','has','have','having','he','her','here','hers','herself',
  'him','himself','his','how','i','if','in','into','is','it','its','itself','just',
  'me','more','most','my','myself','no','nor','not','now','of','off','on','once',
  'only','or','other','our','ours','ourselves','out','over','own','re','same','she',
  'should','so','some','such','than','that','the','their','them','themselves','then',
  'there','these','they','this','those','through','to','too','under','until','up',
  'us','very','was','we','were','what','when','where','which','while','who','whom',
  'why','will','with','you','your','yours','yourself','yourselves','would','could',
  'may','might','must','shall','need','dare','ought','used','s','t','ve','re','d',
  'll','m','o','y','ain','aren','couldn','didn','doesn','hadn','hasn','haven',
  'isn','ma','mightn','mustn','needn','shan','shouldn','wasn','weren','won','wouldn',
  'including','experience','years','year','also','etc','strong','good','excellent',
  'work','working','ability','skills','knowledge','understanding','using','use','used',
  'across','within','multiple','key','well','new','high','level','different','various',
  'make','team','teams','ensure','provide','support','responsible','responsibilities',
  'role','position','candidate','looking','seeking','job','opportunity','company',
  'apply','application','required','requirement','requirements','preferred','minimum',
  'plus','bonus','ideally','nice','will','must','able','help','drive','lead',
  'build','develop','manage','create','contribute','collaborate','communicate','work'
]);

const TECH_PHRASES = [
  'machine learning','deep learning','natural language processing','computer vision',
  'data science','data engineering','data analysis','data visualization','business intelligence',
  'software engineering','software development','full stack','full-stack','front end','back end',
  'frontend','backend','web development','mobile development','cloud computing',
  'devops','mlops','dataops','ci/cd','continuous integration','continuous deployment',
  'restful api','rest api','graphql api','api design','microservices','monolithic',
  'containerization','infrastructure as code','agile methodology','scrum','kanban',
  'test driven development','tdd','behavior driven development','bdd',
  'object oriented','functional programming','system design','distributed systems',
  'large language model','llm','generative ai','gen ai','reinforcement learning',
  'neural network','transformer','attention mechanism','fine tuning','prompt engineering',
  'vector database','knowledge graph','rag','retrieval augmented generation',
  'a/b testing','statistical analysis','hypothesis testing','regression analysis',
  'time series','feature engineering','model deployment','model evaluation',
  'power bi','tableau','google analytics','adobe analytics','looker','metabase',
  'apache spark','apache kafka','apache airflow','apache flink','hadoop',
  'amazon web services','google cloud platform','microsoft azure','azure devops',
  'amazon s3','amazon ec2','amazon rds','amazon lambda','gcp','aws','azure',
  'kubernetes','docker','terraform','ansible','jenkins','github actions','gitlab ci',
  'sql server','mysql','postgresql','mongodb','redis','elasticsearch','cassandra',
  'react.js','next.js','vue.js','angular','node.js','express.js','fastapi','django',
  'spring boot','asp.net','ruby on rails','.net','entity framework',
  'react native','flutter','swift','kotlin',
  'figma','sketch','adobe xd','user experience','ux design','ui design',
  'project management','product management','stakeholder management','cross functional',
  'tensorflow','pytorch','scikit-learn','hugging face','langchain','openai',
  'pandas','numpy','matplotlib','seaborn','plotly','scipy',
  'git','github','gitlab','bitbucket','jira','confluence','notion','slack',
  'linux','unix','bash','shell scripting','powershell','command line'
];

function tokenize(text) {
  const lower = text.toLowerCase();
  const found = new Set();
  for (const phrase of TECH_PHRASES) {
    if (lower.includes(phrase)) found.add(phrase);
  }
  const tokens = lower
    .replace(/[^a-z0-9#+.\-/\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
  for (const t of tokens) found.add(t);
  return found;
}

function extractJDKeywords(jdText) {
  const lower = jdText.toLowerCase();
  const wordFreq = {};
  const found = new Set();
  for (const phrase of TECH_PHRASES) {
    if (lower.includes(phrase)) {
      const count = (lower.match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g')) || []).length;
      wordFreq[phrase] = (wordFreq[phrase] || 0) + count * 3;
      found.add(phrase);
    }
  }
  const tokens = lower
    .replace(/[^a-z0-9#+.\-/\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
  for (const t of tokens) {
    wordFreq[t] = (wordFreq[t] || 0) + 1;
    found.add(t);
  }
  return [...found].map(kw => ({
    kw,
    score: (wordFreq[kw] || 0) + (TECH_PHRASES.includes(kw) ? 5 : 0)
  })).sort((a, b) => b.score - a.score);
}

function computeScore(jdKeywords, resumeTokens) {
  if (!jdKeywords.length) return 0;
  const top = jdKeywords.slice(0, 60);
  const totalWeight = top.reduce((s, k) => s + k.score, 0);
  let matched = 0;
  for (const k of top) {
    if (resumeTokens.has(k.kw)) matched += k.score;
  }
  return Math.min(100, Math.round((matched / totalWeight) * 100));
}

// Serialize structured resume JSON → plain text for scoring
function resumeToScoringText(resume) {
  const parts = [
    resume.name,
    resume.title,
    resume.summary,
    ...(resume.skills || []).flatMap(g => g.items),
    ...(resume.experience || []).flatMap(j => [j.company, j.title, ...(j.bullets || [])]),
    ...(resume.projects  || []).flatMap(p => [p.name, ...(p.bullets  || [])]),
    ...(resume.education || []).map(e => [e.degree, e.institution].join(' '))
  ].filter(Boolean);
  return parts.join('\n');
}

// ── Claude API — structured JSON output ───────────────────────────────────────
async function callClaude(resumeText, jobDescription, apiKey) {
  const prompt = `You are an expert ATS resume optimizer and career coach.

TASK: Analyze the candidate's resume against the job description, then return an ATS-optimized version as a single valid JSON object.

CRITICAL RULES — read carefully:
1. "company", "title", "dates", "location", "degree", "institution" MUST be copied character-for-character from the resume. Never rephrase, shorten, or prepend anything to these fields.
2. "bullets" under each job/project are the ONLY content you rewrite. Format: strong past-tense action verb + what they did + technology + quantified impact if present in the original. Do NOT invent metrics.
3. "summary": 2–3 sentences. Reference the target role title and mirror 3–5 JD keywords where honest.
4. "skills": group into categories (e.g. Frontend, Backend, Cloud, Tools, Databases). Only include skills that actually appear in the candidate's resume. Do not invent skills.
5. Never fabricate any employer, date, institution, metric, or project.
6. Return ONLY the raw JSON object — no markdown code fences, no \`\`\`json, no explanation, no preamble. Your entire response must be parseable by JSON.parse().

OUTPUT SCHEMA (return exactly this shape — all fields required, use empty string or empty array if unknown):
{
  "name": "Full Name",
  "title": "Most recent job title from resume, or empty string",
  "contact": {
    "email": "email or empty string",
    "phone": "phone or empty string",
    "location": "City, Country or empty string",
    "links": ["linkedin URL", "github URL"]
  },
  "summary": "2–3 sentence paragraph optimized for this JD",
  "skills": [
    { "category": "Frontend", "items": ["React", "Angular", "TypeScript"] },
    { "category": "Backend",  "items": ["Node.js", "Spring Boot", "Python"] }
  ],
  "experience": [
    {
      "company": "EXACT company name from resume",
      "title": "EXACT job title from resume",
      "location": "location or empty string",
      "dates": "EXACT date range from resume",
      "bullets": [
        "Developed REST APIs using Spring Boot and PostgreSQL, reducing response latency by 35%.",
        "Automated CI/CD pipeline with GitHub Actions, cutting deployment time from 2 hours to 15 minutes."
      ]
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "context": "Brief context or company or empty string",
      "dates": "dates or empty string",
      "bullets": ["Built...", "Integrated..."]
    }
  ],
  "education": [
    {
      "degree": "EXACT degree name from resume",
      "institution": "EXACT institution name from resume",
      "dates": "EXACT dates from resume",
      "location": "location or empty string"
    }
  ]
}

JOB DESCRIPTION:
${jobDescription.slice(0, 2500)}

CANDIDATE RESUME:
${resumeText.slice(0, 2500)}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error ${response.status}`);
  }

  const data = await response.json();
  const raw = data.content[0].text.trim();

  // Strip any accidental markdown fences Claude might still emit
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${e.message}. Raw (first 200 chars): ${cleaned.slice(0, 200)}`);
  }

  return parsed;
}

// ── CORS helper ───────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return jsonRes({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonRes({ error: 'Invalid JSON body' }, 400);
    }

    const { action = 'optimize', password, resumeText, jobDescription } = body;

    if (!password || password !== env.ACCESS_PASSWORD) {
      return jsonRes({ error: 'Invalid or missing password' }, 401);
    }

    if (action === 'ping') {
      return jsonRes({ ok: true });
    }

    if (action !== 'optimize') {
      return jsonRes({ error: 'Unknown action' }, 400);
    }

    if (!resumeText || !jobDescription) {
      return jsonRes({ error: 'resumeText and jobDescription are required' }, 400);
    }

    try {
      const jdKeywords   = extractJDKeywords(jobDescription);
      const resumeTokens = tokenize(resumeText);
      const beforeScore  = computeScore(jdKeywords, resumeTokens);

      // AI rewrite → structured JSON
      const resume = await callClaude(resumeText, jobDescription, env.ANTHROPIC_API_KEY);

      // Score against serialised text of the structured resume
      const optimizedText   = resumeToScoringText(resume);
      const optimizedTokens = tokenize(optimizedText);
      const afterScore      = computeScore(jdKeywords, optimizedTokens);

      const missingKeywords = jdKeywords
        .filter(k => !resumeTokens.has(k.kw) && optimizedTokens.has(k.kw))
        .slice(0, 25)
        .map(k => k.kw);

      return jsonRes({ beforeScore, afterScore, missingKeywords, resume });

    } catch (e) {
      console.error('Worker error:', e);
      return jsonRes({ error: e.message || 'Internal server error' }, 500);
    }
  }
};
