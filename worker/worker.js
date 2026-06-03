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

// ── Claude API call ───────────────────────────────────────────────────────────
async function callClaude(resumeText, jobDescription, apiKey) {
  const prompt = `You are an expert ATS resume optimizer and career coach.

TASK: Rewrite the resume below to maximize ATS keyword match for the given job description.

RULES — follow strictly:
1. NEVER fabricate employers, job titles, dates, projects, metrics, or any experience.
2. Restructure into these sections in exactly this order: SUMMARY, SKILLS, EXPERIENCE, PROJECTS (if any), EDUCATION.
3. Each section header must be ALL CAPS on its own line, followed immediately by a line of 60 ─ characters.
4. Rewrite bullets as: action verb + what you did + technology used + quantified impact (if present in original).
5. Mirror the job description's exact keywords and phrasing where honest.
6. Skills section: a single line of skills separated by " | ", merging user's existing skills with JD keywords that genuinely apply.
7. Summary: 2-3 sentences, reference the target role and 3-5 top JD keywords.
8. Plain text only — no markdown, no asterisks, no tables, no columns. Use • for bullets.
9. Start with the candidate's full name on line 1, contact info on line 2.
10. For skills the user does NOT have, list them in an "UPSKILLING TARGETS" section at the very end (not in the skills line).

JOB DESCRIPTION:
${jobDescription.slice(0, 3000)}

RESUME TO REWRITE:
${resumeText.slice(0, 3000)}

OUTPUT: The complete rewritten resume in plain text only. No preamble, no explanation, no markdown.`;

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
  return data.content[0].text;
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
    // CORS preflight
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

    // ── Password check (applies to all actions) ──
    if (!password || password !== env.ACCESS_PASSWORD) {
      return jsonRes({ error: 'Invalid or missing password' }, 401);
    }

    // ── Ping: just validate password ──
    if (action === 'ping') {
      return jsonRes({ ok: true });
    }

    // ── Optimize ──
    if (action !== 'optimize') {
      return jsonRes({ error: 'Unknown action' }, 400);
    }

    if (!resumeText || !jobDescription) {
      return jsonRes({ error: 'resumeText and jobDescription are required' }, 400);
    }

    try {
      // Score before
      const jdKeywords = extractJDKeywords(jobDescription);
      const resumeTokens = tokenize(resumeText);
      const beforeScore = computeScore(jdKeywords, resumeTokens);

      // AI rewrite
      const optimizedResume = await callClaude(resumeText, jobDescription, env.ANTHROPIC_API_KEY);

      // Score after
      const optimizedTokens = tokenize(optimizedResume);
      const afterScore = computeScore(jdKeywords, optimizedTokens);

      // Keywords added by the rewrite
      const missingKeywords = jdKeywords
        .filter(k => !resumeTokens.has(k.kw) && optimizedTokens.has(k.kw))
        .slice(0, 25)
        .map(k => k.kw);

      return jsonRes({ beforeScore, afterScore, missingKeywords, optimizedResume });

    } catch (e) {
      console.error('Worker error:', e);
      return jsonRes({ error: e.message || 'Internal server error' }, 500);
    }
  }
};
