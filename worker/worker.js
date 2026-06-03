/**
 * ATS Resume Optimizer — Cloudflare Worker
 *
 * Required secrets (set via `wrangler secret put`):
 *   ANTHROPIC_API_KEY    — Anthropic API key
 *   ACCESS_PASSWORD      — Admin-only bypass password (hidden icon in footer)
 *   RAZORPAY_KEY_ID      — Razorpay publishable key  (e.g. rzp_live_xxx or rzp_test_xxx)
 *   RAZORPAY_KEY_SECRET  — Razorpay secret key (NEVER in frontend)
 *
 * Actions:
 *   POST { action: "ping",         password }
 *     → 200 { ok: true }  |  401
 *
 *   POST { action: "create-order" }
 *     → 200 { orderId, amount, currency, keyId }  |  503
 *
 *   POST { action: "optimize", password, resumeText, jobDescription }
 *     → Admin path: validates ACCESS_PASSWORD
 *
 *   POST { action: "optimize",
 *          razorpay_order_id, razorpay_payment_id, razorpay_signature,
 *          resumeText, jobDescription }
 *     → Paid path: verifies HMAC-SHA256 signature before optimizing
 */

// ── Scoring helpers (mirrors app.js) ──────────────────────────────────────────
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
  const tokens = lower.replace(/[^a-z0-9#+.\-/\s]/g, ' ').split(/\s+/)
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
      const count = (lower.match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      wordFreq[phrase] = (wordFreq[phrase] || 0) + count * 3;
      found.add(phrase);
    }
  }
  const tokens = lower.replace(/[^a-z0-9#+.\-/\s]/g, ' ').split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
  for (const t of tokens) { wordFreq[t] = (wordFreq[t] || 0) + 1; found.add(t); }
  return [...found].map(kw => ({
    kw, score: (wordFreq[kw] || 0) + (TECH_PHRASES.includes(kw) ? 5 : 0)
  })).sort((a, b) => b.score - a.score);
}

function computeScore(jdKeywords, resumeTokens) {
  if (!jdKeywords.length) return 0;
  const top = jdKeywords.slice(0, 60);
  const total = top.reduce((s, k) => s + k.score, 0);
  let matched = 0;
  for (const k of top) { if (resumeTokens.has(k.kw)) matched += k.score; }
  return Math.min(100, Math.round((matched / total) * 100));
}

function resumeToScoringText(resume) {
  return [
    resume.name, resume.title, resume.summary,
    ...(resume.skills     || []).flatMap(g => g.items),
    ...(resume.experience || []).flatMap(j => [j.company, j.title, ...(j.bullets || [])]),
    ...(resume.projects   || []).flatMap(p => [p.name, ...(p.bullets || [])]),
    ...(resume.education  || []).map(e => [e.degree, e.institution].join(' '))
  ].filter(Boolean).join('\n');
}

// ── Razorpay helpers ──────────────────────────────────────────────────────────

async function createRazorpayOrder(keyId, keySecret) {
  const credentials = btoa(`${keyId}:${keySecret}`);
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Basic ${credentials}`
    },
    body: JSON.stringify({
      amount:   2000,                     // ₹20 in paise
      currency: 'INR',
      receipt:  `ats_${Date.now()}`
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.description || `Razorpay error ${res.status}`);
  }
  return res.json(); // { id, amount, currency, … }
}

// HMAC-SHA256 signature verification (Razorpay spec)
// expected_signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
async function verifyRazorpaySignature(orderId, paymentId, signature, keySecret) {
  const enc     = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(keySecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sigBuf  = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(`${orderId}|${paymentId}`));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return computed === signature;
}

// ── Claude API ────────────────────────────────────────────────────────────────
async function callClaude(resumeText, jobDescription, apiKey) {
  const prompt = `You are an expert ATS resume optimizer and career coach.

TASK: Analyze the candidate's resume against the job description, then return an ATS-optimized version as a single valid JSON object.

CRITICAL RULES:
1. "company", "title", "dates", "location", "degree", "institution" MUST be copied character-for-character from the resume. Never rephrase or prepend anything.
2. "bullets" under each job/project are the ONLY content you rewrite: strong past-tense action verb + what they did + technology + quantified impact if present. Do NOT invent metrics.
3. "summary": 2–3 sentences referencing the target role and 3–5 JD keywords where honest.
4. "skills": group by category (Frontend, Backend, Cloud, Tools, Databases). Only include skills that appear in the candidate's resume.
5. Never fabricate any employer, date, institution, metric, or project.
6. Return ONLY the raw JSON object — no markdown fences, no explanation. Your entire response must be parseable by JSON.parse().

OUTPUT SCHEMA:
{
  "name": "string",
  "title": "string",
  "contact": { "email": "string", "phone": "string", "location": "string", "links": ["string"] },
  "summary": "string",
  "skills": [ { "category": "string", "items": ["string"] } ],
  "experience": [ { "company": "string", "title": "string", "location": "string", "dates": "string", "bullets": ["string"] } ],
  "projects":   [ { "name": "string", "context": "string", "dates": "string", "bullets": ["string"] } ],
  "education":  [ { "degree": "string", "institution": "string", "dates": "string", "location": "string" } ]
}

JOB DESCRIPTION:
${jobDescription.slice(0, 2500)}

CANDIDATE RESUME:
${resumeText.slice(0, 2500)}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 4000,
      messages:   [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic error ${res.status}`);
  }

  const data    = await res.json();
  const raw     = data.content[0].text.trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${e.message}. Preview: ${cleaned.slice(0, 200)}`);
  }
}

// ── CORS & response helpers ───────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

// ── Action handlers ───────────────────────────────────────────────────────────

function handlePing(body, env) {
  const { password } = body;
  if (!password || password !== env.ACCESS_PASSWORD) {
    return jsonRes({ error: 'Invalid password' }, 401);
  }
  return jsonRes({ ok: true });
}

async function handleCreateOrder(env) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return jsonRes({ error: 'Payment not configured on server' }, 503);
  }
  try {
    const order = await createRazorpayOrder(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET);
    return jsonRes({
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    env.RAZORPAY_KEY_ID   // public key — safe to return
    });
  } catch (e) {
    console.error('create-order error:', e);
    return jsonRes({ error: 'Could not create payment order: ' + e.message }, 500);
  }
}

async function handleOptimize(body, env) {
  const { password, resumeText, jobDescription,
          razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

  if (!resumeText || !jobDescription) {
    return jsonRes({ error: 'resumeText and jobDescription are required' }, 400);
  }

  // ── Authorization: admin password OR valid Razorpay payment ──
  if (password) {
    // Admin path
    if (password !== env.ACCESS_PASSWORD) {
      return jsonRes({ error: 'Invalid admin password' }, 401);
    }
  } else if (razorpay_order_id && razorpay_payment_id && razorpay_signature) {
    // Paid path — verify signature server-side
    if (!env.RAZORPAY_KEY_SECRET) {
      return jsonRes({ error: 'Payment verification not configured' }, 503);
    }
    const valid = await verifyRazorpaySignature(
      razorpay_order_id, razorpay_payment_id, razorpay_signature,
      env.RAZORPAY_KEY_SECRET
    );
    if (!valid) {
      return jsonRes({ error: 'Payment signature verification failed. Contact support if you were charged.' }, 402);
    }
  } else {
    return jsonRes({ error: 'Authorization required: provide admin password or valid payment data.' }, 401);
  }

  // ── Run optimization ──
  try {
    const jdKeywords    = extractJDKeywords(jobDescription);
    const resumeTokens  = tokenize(resumeText);
    const beforeScore   = computeScore(jdKeywords, resumeTokens);

    const resume = await callClaude(resumeText, jobDescription, env.ANTHROPIC_API_KEY);

    const optimizedText   = resumeToScoringText(resume);
    const optimizedTokens = tokenize(optimizedText);
    const afterScore      = computeScore(jdKeywords, optimizedTokens);

    const missingKeywords = jdKeywords
      .filter(k => !resumeTokens.has(k.kw) && optimizedTokens.has(k.kw))
      .slice(0, 25)
      .map(k => k.kw);

    return jsonRes({ beforeScore, afterScore, missingKeywords, resume });

  } catch (e) {
    console.error('Optimization error:', e);
    return jsonRes({ error: e.message || 'Optimization failed' }, 500);
  }
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
    try { body = await request.json(); }
    catch { return jsonRes({ error: 'Invalid JSON body' }, 400); }

    const { action = 'optimize' } = body;

    switch (action) {
      case 'ping':         return handlePing(body, env);
      case 'create-order': return handleCreateOrder(env);
      case 'optimize':     return handleOptimize(body, env);
      default:             return jsonRes({ error: `Unknown action: ${action}` }, 400);
    }
  }
};
