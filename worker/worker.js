/**
 * ATS Resume Optimizer — Cloudflare Worker
 *
 * Secrets:
 *   ANTHROPIC_API_KEY, ACCESS_PASSWORD, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
 *
 * Actions: ping | create-order | optimize  (admin-password OR Razorpay-paid)
 */

// ── Vocabulary — multi-word phrases first ──────────────────────────────────
const TECH_PHRASES = [
  // Core eng / FE
  'single-page application','single page application','single-page applications','single page applications','spa',
  'progressive web app','progressive web apps','pwa',
  'server-side rendering','server side rendering','ssr',
  'client-side rendering','client side rendering','csr',
  'static site generation','ssg','jamstack',
  'web components','custom elements','shadow dom',
  'design system','design systems','component library',
  'component-driven','component driven','component-based','component based','component-driven architecture',
  'micro-frontend','micro frontend','microfrontend','micro-frontends','micro frontends','module federation',
  'state management','app state','application state',
  'responsive design','responsive web','mobile-responsive','mobile first','mobile-first',
  'cross-browser','cross browser','browser compatibility',
  'accessibility','a11y','wcag','aria',
  'web performance','performance optimization','core web vitals','lighthouse','page speed',
  'lazy loading','code splitting','tree shaking','bundle size','memoization',

  // Frameworks / libs
  'react.js','reactjs','next.js','nextjs','vue.js','vuejs','nuxt.js','nuxtjs',
  'angular','angularjs','angular.js','ember.js','svelte','sveltekit','solid.js','solidjs',
  'node.js','nodejs','express.js','expressjs','nestjs','fastify',
  'spring boot','spring framework','asp.net','asp.net core','ruby on rails','django','flask','fastapi',
  'react native','flutter','swift','swiftui','jetpack compose',

  // Languages
  'typescript','javascript','ecmascript','es6','es2015','es2020',
  'java','kotlin','python','go','golang','rust','c#','c++',
  'html5','css3','sass','scss','less','stylus','postcss','tailwind','tailwindcss',
  'bootstrap','material ui','mui','chakra ui','styled-components','emotion','css modules','css-in-js',

  // State / RxJS
  'redux','redux toolkit','rtk','mobx','zustand','recoil','jotai','ngrx','rxjs','context api',

  // Testing
  'unit testing','unit tests','integration testing','integration tests',
  'e2e testing','end-to-end testing','end to end testing',
  'test-driven development','test driven development','tdd','behavior-driven development','bdd',
  'jest','vitest','mocha','jasmine','karma','cypress','playwright','selenium','puppeteer','testing library',
  'storybook',

  // Build / tooling
  'webpack','vite','rollup','parcel','esbuild','turbopack','babel','swc',
  'eslint','prettier','husky','lint-staged','npm','yarn','pnpm',

  // APIs / networking
  'restful api','rest api','rest apis','restful apis','rest','graphql','grpc','websocket','websockets',
  'api design','api integration','api consumption','third-party api','third party api',
  'oauth','oauth2','jwt','sso','saml','authentication','authorization',

  // Backend / data
  'microservices','micro-services','monolithic','service-oriented architecture','soa',
  'event-driven architecture','event driven','message queue','message queues','pub/sub','kafka','rabbitmq','sqs',
  'postgresql','mysql','mongodb','redis','elasticsearch','cassandra','dynamodb','firestore',
  'sql server','oracle','sqlite','nosql','relational database',

  // Cloud / ops
  'amazon web services','google cloud platform','microsoft azure','azure devops',
  'aws','gcp','azure','amazon s3','amazon ec2','amazon rds','amazon lambda','cloudfront','cloudfunctions',
  'kubernetes','k8s','docker','terraform','ansible','helm',
  'ci/cd','continuous integration','continuous deployment','continuous delivery',
  'jenkins','github actions','gitlab ci','circleci','travis ci','azure pipelines',
  'infrastructure as code','iac','containerization','orchestration',

  // Observability
  'monitoring','observability','logging','datadog','new relic','prometheus','grafana','sentry','splunk',

  // ML / data
  'machine learning','deep learning','natural language processing','nlp','computer vision','cv',
  'large language model','llm','generative ai','gen ai','prompt engineering','rag','retrieval augmented generation',
  'data science','data engineering','data analysis','data visualization','business intelligence',
  'apache spark','apache kafka','apache airflow','hadoop','etl','elt','data pipeline','data pipelines',
  'tensorflow','pytorch','scikit-learn','hugging face','langchain','openai',
  'pandas','numpy','matplotlib','seaborn','plotly','scipy','tableau','power bi','looker',

  // Methodology
  'agile methodology','scrum','kanban','sprint','sprint planning','retrospective',
  'object-oriented','object oriented','oop','functional programming','fp',
  'design pattern','design patterns','solid principles','clean code','clean architecture',
  'system design','distributed systems','high availability','scalability','load balancing','caching',
  'code review','peer review','pull request','pair programming',

  // Tools
  'git','github','gitlab','bitbucket','jira','confluence','notion','slack','figma','sketch','adobe xd',
  'linux','unix','bash','shell scripting','powershell','vim','vs code','visual studio code',

  // Soft
  'user experience','ux design','ui design','user interface','product management','project management',
  'stakeholder management','cross functional','cross-functional','mentoring',
];

// ── Synonym groups — every variant maps to ONE canonical token ─────────────
const SYNONYMS = [
  ['ci/cd','continuous integration','continuous deployment','continuous delivery'],
  ['spa','single-page application','single page application','single-page applications','single page applications'],
  ['pwa','progressive web app','progressive web apps'],
  ['ssr','server-side rendering','server side rendering'],
  ['csr','client-side rendering','client side rendering'],
  ['ssg','static site generation','jamstack'],
  ['rest api','restful api','rest apis','restful apis','rest','restful'],
  ['micro-frontend','micro frontend','microfrontend','micro-frontends','micro frontends','module federation'],
  ['microservices','micro-services','micro services'],
  ['component-driven','component driven','component-based','component based','component-driven architecture','component library'],
  ['design system','design systems'],
  ['state management','app state','application state'],
  ['responsive design','responsive web','mobile-responsive','mobile first','mobile-first'],
  ['cross-browser','cross browser','browser compatibility'],
  ['accessibility','a11y','wcag','aria'],
  ['web performance','performance optimization','core web vitals','lighthouse','page speed'],
  ['unit testing','unit tests','jest','vitest','mocha','jasmine','karma'],
  ['e2e testing','end-to-end testing','end to end testing','cypress','playwright','selenium','puppeteer'],
  ['integration testing','integration tests'],
  ['tdd','test-driven development','test driven development'],
  ['bdd','behavior-driven development','behaviour-driven development'],
  ['build tool','webpack','vite','rollup','parcel','esbuild','turbopack'],
  ['transpiler','babel','swc'],
  ['css preprocessor','sass','scss','less','stylus','postcss'],
  ['css framework','tailwind','tailwindcss','bootstrap','material ui','mui','chakra ui'],
  ['css-in-js','styled-components','emotion','css modules'],
  ['state library','redux','redux toolkit','rtk','mobx','zustand','recoil','jotai','ngrx','rxjs','context api'],
  ['authentication','oauth','oauth2','jwt','sso','saml','authorization'],
  ['typescript','ts'],
  ['javascript','js','ecmascript','es6','es2015','es2020'],
  ['react','react.js','reactjs'],
  ['angular','angularjs','angular.js'],
  ['vue','vue.js','vuejs'],
  ['node.js','nodejs','node'],
  ['next.js','nextjs'],
  ['nuxt.js','nuxtjs'],
  ['express','express.js','expressjs'],
  ['agile','scrum','kanban','sprint','sprint planning','agile methodology'],
  ['code review','peer review','pull request','pair programming'],
  ['containerization','docker','container'],
  ['orchestration','kubernetes','k8s','helm'],
  ['cloud','aws','amazon web services','gcp','google cloud platform','azure','microsoft azure'],
  ['relational database','postgresql','mysql','sql server','oracle','sqlite','rdbms'],
  ['nosql','mongodb','dynamodb','cassandra','firestore'],
  ['cache','caching','redis','memcached','cdn','cloudfront'],
  ['monitoring','observability','logging','datadog','new relic','prometheus','grafana','sentry'],
  ['message queue','kafka','rabbitmq','sqs','pub/sub'],
  ['oop','object-oriented','object oriented'],
  ['fp','functional programming'],
  ['design pattern','design patterns','solid principles','clean code','clean architecture'],
  ['data pipeline','data pipelines','etl','elt','apache airflow'],
  ['nlp','natural language processing'],
  ['computer vision','cv'],
  ['llm','large language model','large language models','generative ai','gen ai'],
  ['rag','retrieval augmented generation'],
  ['version control','git'],
];

// canonical lookup
const SYN_MAP = new Map();
for (const grp of SYNONYMS) for (const v of grp) SYN_MAP.set(v, grp[0]);

function canonicalize(term) {
  return SYN_MAP.get(term.toLowerCase()) || term.toLowerCase();
}

// Curated vocabulary set (lowercase) — anything we'll consider a "keyword"
const VOCAB = new Set();
for (const p of TECH_PHRASES) VOCAB.add(p.toLowerCase());
for (const g of SYNONYMS) for (const v of g) VOCAB.add(v.toLowerCase());

// Sort phrases longest-first so multi-word matches win over substrings
const PHRASES_SORTED = [...VOCAB].sort((a, b) => b.length - a.length);

// ── Extraction ─────────────────────────────────────────────────────────────
// Returns: Map<canonical, { freq, variants:Set<string> }>
function extractTermsFromText(text) {
  const lower = ' ' + text.toLowerCase().replace(/[^a-z0-9#+./\-\s]/g, ' ') + ' ';
  const counts = new Map();

  // Multi-word phrases + single tech tokens via word-boundary search
  for (const phrase of PHRASES_SORTED) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // word-boundary that tolerates our token chars (#+./-)
    const re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'g');
    let m, hits = 0;
    while ((m = re.exec(lower)) !== null) hits++;
    if (hits > 0) {
      const canon = canonicalize(phrase);
      const entry = counts.get(canon) || { freq: 0, variants: new Set() };
      entry.freq += hits;
      entry.variants.add(phrase);
      counts.set(canon, entry);
    }
  }
  return counts;
}

// Extract JD keywords as a sorted list of canonical terms with weights.
// Weight = JD frequency (capped) — higher freq = more important.
function extractJDKeywords(jdText) {
  const counts = extractTermsFromText(jdText);
  const list = [];
  for (const [canon, info] of counts) {
    // Cap freq at 4 so a single noisy repeat doesn't dominate
    const weight = Math.min(info.freq, 4);
    list.push({ kw: canon, weight, variants: [...info.variants] });
  }
  return list.sort((a, b) => b.weight - a.weight);
}

// Score = (matched weight / total weight) * 100
// Hit if ANY canonical variant appears in the resume's canonical set.
function computeScore(jdKeywords, resumeCanonicalSet) {
  if (!jdKeywords.length) return 0;
  let total = 0, matched = 0;
  for (const k of jdKeywords) {
    total += k.weight;
    if (resumeCanonicalSet.has(k.kw)) matched += k.weight;
  }
  if (!total) return 0;
  return Math.min(100, Math.round((matched / total) * 100));
}

// Build canonical Set of terms present in a text
function canonicalSet(text) {
  const counts = extractTermsFromText(text);
  return new Set(counts.keys());
}

function resumeToScoringText(resume) {
  return [
    resume.name, resume.title, resume.summary,
    ...(resume.skills     || []).flatMap(g => [g.category, ...(g.items || [])]),
    ...(resume.experience || []).flatMap(j => [j.company, j.title, ...(j.bullets || [])]),
    ...(resume.projects   || []).flatMap(p => [p.name, p.context, ...(p.bullets || [])]),
    ...(resume.education  || []).map(e => [e.degree, e.institution].join(' '))
  ].filter(Boolean).join('\n');
}

// ── Razorpay helpers ───────────────────────────────────────────────────────
async function createRazorpayOrder(keyId, keySecret) {
  const creds = btoa(`${keyId}:${keySecret}`);
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${creds}` },
    body: JSON.stringify({ amount: 2000, currency: 'INR', receipt: `ats_${Date.now()}` })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.description || `Razorpay error ${res.status}`);
  }
  return res.json();
}

async function verifyRazorpaySignature(orderId, paymentId, signature, keySecret) {
  const enc = new TextEncoder();
  const ck = await crypto.subtle.importKey('raw', enc.encode(keySecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', ck, enc.encode(`${orderId}|${paymentId}`));
  const computed = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return computed === signature;
}

// ── Claude API ─────────────────────────────────────────────────────────────
async function callClaude(resumeText, jobDescription, apiKey, jdTopTerms) {
  const jdTermsHint = jdTopTerms.slice(0, 30).map(t => t.kw).join(', ');

  const prompt = `You are an elite ATS resume optimizer.

ABSOLUTE TRUTHFULNESS:
- NEVER invent skills, tools, employers, titles, dates, certifications, projects, or metrics the candidate doesn't have.
- Renaming/elevating REAL experience to use the JD's exact terminology is REQUIRED and is the main lever for score.
- If a JD term has zero honest evidence in the resume, OMIT it entirely.

YOUR EXHAUSTIVE PASS:

STEP 1 — Extract every hard term from the JD:
  Tools, frameworks, languages, methodologies, key phrases — including acronyms AND expansions
  (e.g. "CI/CD" + "Continuous Integration / Continuous Deployment", "SPA" + "Single-Page Applications",
  "REST API" + "RESTful API", "TDD" + "Test-Driven Development").
  JD's top high-value terms include: ${jdTermsHint || '(none detected — extract them yourself)'}.

STEP 2 — Map JD terms to REAL evidence in the candidate's resume:
  For every JD term, scan for ANY honest evidence — even worded differently or implied by a tool/project:
    • "made reusable UI pieces" + JD wants "component-driven architecture" → rename to "component-driven architecture" (true).
    • Used Angular/React heavily but didn't write "SPA" → add "single-page applications (SPA)" (Angular/React apps ARE SPAs).
    • Built REST integrations → surface "RESTful API integration" / "API consumption" — whatever the JD uses.
    • Wrote Jest tests → surface "unit testing" (JD wording).
    • Used Docker → surface "containerization".
    • Used Webpack/Vite → surface "build tooling" / "module bundling".
  If the evidence is real, USE THE JD'S EXACT TERMINOLOGY (including acronym + expansion pair when JD does).

STEP 3 — Rewrite EVERY bullet with this formula:
  strong past-tense verb + concrete action + named technologies (mirrored to JD) + quantified impact (only real numbers from original, never invent).
  If a bullet has no real metric, strengthen it without fabricating one.

STEP 4 — Summary (2-3 sentences):
  Tight, keyword-dense. Mirror the JD's role title. Pack 5-8 of the candidate's REAL top skills using the JD's wording.

STEP 5 — Skills (grouped, readable, no blob):
  Group as e.g. Frontend / Backend / Cloud & DevOps / Testing / Databases / Tools.
  Reorder so JD-relevant real skills lead. Use the JD's exact terminology where the candidate honestly has the skill.
  Where natural, include both acronym AND expansion in the same item (e.g. "CI/CD (Continuous Integration & Deployment)").
  NO bare keyword dump. NO duplicate lowercase blob.

STEP 6 — Headline ("title" field):
  Mirror the JD job title where truthful (e.g. "Senior Frontend Engineer" if the candidate's level matches).
  If the candidate's real level is below the JD's, keep the real title.

DENSITY: The same real skill should appear naturally across summary + skills + bullets — that reinforcement is honest and how good resumes are written.

JSON SCHEMA (return ONLY valid JSON, no markdown fences, no preamble):
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

PRESERVED VERBATIM (NEVER rephrase, never prepend, never reorder words):
  company, title (job title under experience), dates, location, degree, institution, project name.

JOB DESCRIPTION:
${jobDescription.slice(0, 3500)}

CANDIDATE RESUME:
${resumeText.slice(0, 3500)}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic error ${res.status}`);
  }
  const data = await res.json();
  const cleaned = data.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); }
  catch (e) { throw new Error(`Claude returned invalid JSON: ${e.message}`); }
}

// ── CORS & responses ───────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// ── Handlers ───────────────────────────────────────────────────────────────
function handlePing(body, env) {
  if (!body.password || body.password !== env.ACCESS_PASSWORD) return jsonRes({ error: 'Invalid password' }, 401);
  return jsonRes({ ok: true });
}

async function handleCreateOrder(env) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return jsonRes({ error: 'Payment not configured' }, 503);
  try {
    const order = await createRazorpayOrder(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET);
    return jsonRes({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: env.RAZORPAY_KEY_ID });
  } catch (e) {
    console.error('create-order:', e);
    return jsonRes({ error: 'Could not create payment order: ' + e.message }, 500);
  }
}

async function handleOptimize(body, env) {
  const { password, resumeText, jobDescription,
          razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!resumeText || !jobDescription) {
    return jsonRes({ error: 'resumeText and jobDescription are required' }, 400);
  }

  // Auth
  if (password) {
    if (password !== env.ACCESS_PASSWORD) return jsonRes({ error: 'Invalid admin password' }, 401);
  } else if (razorpay_order_id && razorpay_payment_id && razorpay_signature) {
    if (!env.RAZORPAY_KEY_SECRET) return jsonRes({ error: 'Payment verification not configured' }, 503);
    const valid = await verifyRazorpaySignature(
      razorpay_order_id, razorpay_payment_id, razorpay_signature, env.RAZORPAY_KEY_SECRET);
    if (!valid) return jsonRes({ error: 'Payment signature verification failed.' }, 402);
  } else {
    return jsonRes({ error: 'Authorization required.' }, 401);
  }

  try {
    // Score BEFORE — on raw resume text
    const jdKeywords  = extractJDKeywords(jobDescription);
    const beforeSet   = canonicalSet(resumeText);
    const beforeScore = computeScore(jdKeywords, beforeSet);

    // AI rewrite — pass top JD terms into prompt for awareness
    const resume = await callClaude(resumeText, jobDescription, env.ANTHROPIC_API_KEY, jdKeywords);

    // Score AFTER — on the FINAL optimized resume text (same scorer)
    const optimizedText = resumeToScoringText(resume);
    const afterSet      = canonicalSet(optimizedText);
    const afterScore    = computeScore(jdKeywords, afterSet);

    // Missing = JD terms still not present in optimized resume
    const missingKeywords = jdKeywords
      .filter(k => !afterSet.has(k.kw))
      .slice(0, 25)
      .map(k => k.kw);

    return jsonRes({ beforeScore, afterScore, missingKeywords, resume });
  } catch (e) {
    console.error('Optimize:', e);
    return jsonRes({ error: e.message || 'Optimization failed' }, 500);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST')    return jsonRes({ error: 'Method not allowed' }, 405);

    let body;
    try { body = await request.json(); }
    catch { return jsonRes({ error: 'Invalid JSON body' }, 400); }

    switch (body.action || 'optimize') {
      case 'ping':         return handlePing(body, env);
      case 'create-order': return handleCreateOrder(env);
      case 'optimize':     return handleOptimize(body, env);
      default:             return jsonRes({ error: `Unknown action: ${body.action}` }, 400);
    }
  }
};
