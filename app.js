// ── CONFIG ────────────────────────────────────────────────────────────────────
const WORKER_URL = 'https://ats-optimizer.nayakdarshan.workers.dev';
// Razorpay Key ID is returned by the Worker in create-order — nothing to set here.
// ─────────────────────────────────────────────────────────────────────────────

// ── Session state (never persisted to storage) ────────────────────────────────
let _parsedResumeText = null;   // PDF text extracted by pdf.js
let _isAdminMode      = false;  // true after valid TOTP code
let _adminSession     = null;   // HMAC-signed session token from Worker (memory only)

// ── Keyword scoring (synonym-aware) ───────────────────────────────────────────
// Mirrors worker/worker.js — same vocab/synonyms so worker & frontend agree.

const TECH_PHRASES = [
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
  'react.js','reactjs','next.js','nextjs','vue.js','vuejs','nuxt.js','nuxtjs',
  'angular','angularjs','angular.js','ember.js','svelte','sveltekit','solid.js','solidjs',
  'node.js','nodejs','express.js','expressjs','nestjs','fastify',
  'spring boot','spring framework','asp.net','asp.net core','ruby on rails','django','flask','fastapi',
  'react native','flutter','swift','swiftui','jetpack compose',
  'typescript','javascript','ecmascript','es6','es2015','es2020',
  'java','kotlin','python','go','golang','rust','c#','c++',
  'html5','css3','sass','scss','less','stylus','postcss','tailwind','tailwindcss',
  'bootstrap','material ui','mui','chakra ui','styled-components','emotion','css modules','css-in-js',
  'redux','redux toolkit','rtk','mobx','zustand','recoil','jotai','ngrx','rxjs','context api',
  'unit testing','unit tests','integration testing','integration tests',
  'e2e testing','end-to-end testing','end to end testing',
  'test-driven development','test driven development','tdd','behavior-driven development','bdd',
  'jest','vitest','mocha','jasmine','karma','cypress','playwright','selenium','puppeteer','testing library','storybook',
  'webpack','vite','rollup','parcel','esbuild','turbopack','babel','swc',
  'eslint','prettier','husky','lint-staged','npm','yarn','pnpm',
  'restful api','rest api','rest apis','restful apis','rest','graphql','grpc','websocket','websockets',
  'api design','api integration','api consumption','third-party api','third party api',
  'oauth','oauth2','jwt','sso','saml','authentication','authorization',
  'microservices','micro-services','monolithic','service-oriented architecture','soa',
  'event-driven architecture','event driven','message queue','message queues','pub/sub','kafka','rabbitmq','sqs',
  'postgresql','mysql','mongodb','redis','elasticsearch','cassandra','dynamodb','firestore',
  'sql server','oracle','sqlite','nosql','relational database',
  'amazon web services','google cloud platform','microsoft azure','azure devops',
  'aws','gcp','azure','amazon s3','amazon ec2','amazon rds','amazon lambda','cloudfront',
  'kubernetes','k8s','docker','terraform','ansible','helm',
  'ci/cd','continuous integration','continuous deployment','continuous delivery',
  'jenkins','github actions','gitlab ci','circleci','travis ci','azure pipelines',
  'infrastructure as code','iac','containerization','orchestration',
  'monitoring','observability','logging','datadog','new relic','prometheus','grafana','sentry','splunk',
  'machine learning','deep learning','natural language processing','nlp','computer vision','cv',
  'large language model','llm','generative ai','gen ai','prompt engineering','rag','retrieval augmented generation',
  'data science','data engineering','data analysis','data visualization','business intelligence',
  'apache spark','apache kafka','apache airflow','hadoop','etl','elt','data pipeline','data pipelines',
  'tensorflow','pytorch','scikit-learn','hugging face','langchain','openai',
  'pandas','numpy','matplotlib','seaborn','plotly','scipy','tableau','power bi','looker',
  'agile methodology','scrum','kanban','sprint','sprint planning','retrospective',
  'object-oriented','object oriented','oop','functional programming','fp',
  'design pattern','design patterns','solid principles','clean code','clean architecture',
  'system design','distributed systems','high availability','scalability','load balancing','caching',
  'code review','peer review','pull request','pair programming',
  'git','github','gitlab','bitbucket','jira','confluence','notion','slack','figma','sketch','adobe xd',
  'linux','unix','bash','shell scripting','powershell','vim','vs code','visual studio code',
  'user experience','ux design','ui design','user interface','product management','project management',
  'stakeholder management','cross functional','cross-functional','mentoring'
];

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
  ['version control','git']
];

const SYN_MAP = new Map();
for (const grp of SYNONYMS) for (const v of grp) SYN_MAP.set(v, grp[0]);
function canonicalize(term) { return SYN_MAP.get(term.toLowerCase()) || term.toLowerCase(); }

const VOCAB = new Set();
for (const p of TECH_PHRASES) VOCAB.add(p.toLowerCase());
for (const g of SYNONYMS) for (const v of g) VOCAB.add(v.toLowerCase());
const PHRASES_SORTED = [...VOCAB].sort((a, b) => b.length - a.length);

// Returns Map<canonical, { freq, variants:Set }>
function extractTermsFromText(text) {
  const lower = ' ' + text.toLowerCase().replace(/[^a-z0-9#+./\-\s]/g, ' ') + ' ';
  const counts = new Map();
  for (const phrase of PHRASES_SORTED) {
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, 'g');
    let m, hits = 0;
    while ((m = re.exec(lower)) !== null) hits++;
    if (hits > 0) {
      const canon = canonicalize(phrase);
      const e = counts.get(canon) || { freq: 0, variants: new Set() };
      e.freq += hits; e.variants.add(phrase);
      counts.set(canon, e);
    }
  }
  return counts;
}

function extractJDKeywords(jdText) {
  const counts = extractTermsFromText(jdText);
  const list = [];
  for (const [canon, info] of counts) {
    list.push({ kw: canon, weight: Math.min(info.freq, 4), variants: [...info.variants] });
  }
  return list.sort((a, b) => b.weight - a.weight);
}

function canonicalSet(text) {
  return new Set(extractTermsFromText(text).keys());
}

function computeScore(jdKeywords, canonSet) {
  if (!jdKeywords.length) return 0;
  let total = 0, matched = 0;
  for (const k of jdKeywords) {
    total += k.weight;
    if (canonSet.has(k.kw)) matched += k.weight;
  }
  if (!total) return 0;
  return Math.min(100, Math.round((matched / total) * 100));
}

function buildGapTable(jdKeywords, beforeSet, addedSet) {
  return jdKeywords.slice(0, 40).map(k => ({
    keyword: k.kw,
    inResume: beforeSet.has(k.kw),
    added: addedSet.has(k.kw)
  }));
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

// ── Resume HTML preview renderer ──────────────────────────────────────────────
function renderResumeHTML(resume) {
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  let h = '';
  h += `<div class="rp-name">${esc(resume.name)}</div>`;
  if (resume.title) h += `<div class="rp-jobtitle">${esc(resume.title)}</div>`;
  const c = resume.contact || {};
  const cParts = [c.phone, c.email, c.location, ...(c.links || [])].filter(Boolean);
  if (cParts.length) h += `<div class="rp-contact">${cParts.map(esc).join(' &nbsp;·&nbsp; ')}</div>`;

  if (resume.summary) {
    h += `<div class="rp-section"><div class="rp-heading">CAREER SUMMARY</div><div class="rp-rule"></div>
          <p class="rp-para">${esc(resume.summary)}</p></div>`;
  }
  if ((resume.skills || []).length) {
    h += `<div class="rp-section"><div class="rp-heading">TECHNICAL SKILLS</div><div class="rp-rule"></div>`;
    for (const g of resume.skills) {
      h += `<div class="rp-skill-line"><span class="rp-skill-cat">${esc(g.category||'Skills')}:</span> ${esc((g.items||[]).join(', '))}</div>`;
    }
    h += '</div>';
  }
  if ((resume.experience || []).length) {
    h += `<div class="rp-section"><div class="rp-heading">WORK EXPERIENCE</div><div class="rp-rule"></div>`;
    for (const job of resume.experience) {
      h += `<div class="rp-entry-header"><span class="rp-company">${esc(job.company)}</span><span class="rp-dates">${esc(job.dates)}</span></div>`;
      if (job.title) h += `<div class="rp-entry-title">${esc(job.title)}${job.location ? ' &nbsp;·&nbsp; ' + esc(job.location) : ''}</div>`;
      for (const b of (job.bullets || [])) h += `<div class="rp-bullet">&#8226;&nbsp;${esc(b)}</div>`;
    }
    h += '</div>';
  }
  if ((resume.projects || []).length) {
    h += `<div class="rp-section"><div class="rp-heading">PROJECTS</div><div class="rp-rule"></div>`;
    for (const p of resume.projects) {
      h += `<div class="rp-entry-header"><span class="rp-company">${esc(p.name)}</span><span class="rp-dates">${esc(p.dates||'')}</span></div>`;
      if (p.context) h += `<div class="rp-entry-title">${esc(p.context)}</div>`;
      for (const b of (p.bullets || [])) h += `<div class="rp-bullet">&#8226;&nbsp;${esc(b)}</div>`;
    }
    h += '</div>';
  }
  if ((resume.education || []).length) {
    h += `<div class="rp-section"><div class="rp-heading">EDUCATION</div><div class="rp-rule"></div>`;
    for (const e of resume.education) {
      h += `<div class="rp-entry-header"><span class="rp-company">${esc(e.degree)}</span><span class="rp-dates">${esc(e.dates||'')}</span></div>`;
      const sub = [e.institution, e.location].filter(Boolean).join(' · ');
      if (sub) h += `<div class="rp-entry-title">${esc(sub)}</div>`;
    }
    h += '</div>';
  }
  return h;
}

// ── PDF generator — fixed professional ATS template ──────────────────────────
// NOTE: Uses a fixed single-column template by design.
// PDF text extraction (pdf.js) discards all visual layout, so we cannot
// reproduce the uploaded resume's original design — nor should we for ATS.
async function generatePDFFromJSON(resume, filename) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ML = 18, MR = 18, MT = 20, BM = 18;
  const PW = 210, PH = 297, CW = PW - ML - MR;
  let y = MT;

  function checkPage(needed) {
    if (y + needed > PH - BM) { doc.addPage(); y = MT; }
  }
  function addText(text, x, { fs=10, fw='normal', r=30, g=30, b=40, lh=1.4, gap=1 } = {}) {
    if (!text) return;
    doc.setFont('helvetica', fw); doc.setFontSize(fs); doc.setTextColor(r, g, b);
    const lines = doc.splitTextToSize(String(text), CW - (x - ML));
    const lineH = fs * 0.352778 * lh;
    checkPage(lines.length * lineH + gap);
    doc.text(lines, x, y);
    y += lines.length * lineH + gap;
  }
  function addEntryHeader(left, right) {
    if (!left && !right) return;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(10, 10, 30);
    const rw = right ? doc.getTextWidth(String(right)) + 1 : 0;
    const leftLines = doc.splitTextToSize(String(left || ''), CW - rw - 4);
    const lh = 10.5 * 0.352778 * 1.3;
    checkPage(leftLines.length * lh + 1.5);
    doc.text(leftLines, ML, y);
    if (right) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100, 100, 115);
      doc.text(String(right), PW - MR, y, { align: 'right' });
    }
    y += leftLines.length * lh + 1.5;
  }
  function addSubtitle(text) {
    if (!text) return;
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5); doc.setTextColor(70, 70, 90);
    const lines = doc.splitTextToSize(String(text), CW);
    const lh = 9.5 * 0.352778 * 1.3;
    checkPage(lines.length * lh + 1);
    doc.text(lines, ML, y);
    y += lines.length * lh + 1;
  }
  function addBullet(text) {
    if (!text) return;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 30, 45);
    const lines = doc.splitTextToSize(String(text), CW - 5);
    const lh = 10 * 0.352778 * 1.35;
    checkPage(lines.length * lh + 0.8);
    doc.text('•', ML, y);
    doc.text(lines, ML + 5, y);
    y += lines.length * lh + 0.8;
  }
  function addSection(title) {
    y += 5; checkPage(10);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40, 60, 160);
    doc.text(title.toUpperCase(), ML, y);
    y += 2.5;
    doc.setDrawColor(40, 60, 160); doc.setLineWidth(0.35); doc.line(ML, y, PW - MR, y);
    y += 4;
  }

  // Name
  addText(resume.name || 'Resume', ML, { fs:22, fw:'bold', r:10, g:10, b:30, lh:1.2, gap:2 });
  if (resume.title) addText(resume.title, ML, { fs:11, r:55, g:75, b:180, gap:2 });
  const ct = resume.contact || {};
  const contactLine = [ct.phone, ct.email, ...(ct.links || []), ct.location].filter(Boolean).join('   ·   ');
  if (contactLine) addText(contactLine, ML, { fs:9, r:90, g:90, b:105, gap:1 });

  if (resume.summary) {
    addSection('Career Summary');
    addText(resume.summary, ML, { fs:10, r:30, g:30, b:45, lh:1.45, gap:1.5 });
  }
  if ((resume.skills || []).length) {
    addSection('Technical Skills');
    for (const grp of resume.skills) {
      const label = grp.category ? `${grp.category}: ` : '';
      const items = (grp.items || []).join(', ');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 30, 45);
      const lw = doc.getTextWidth(label);
      const bodyLines = doc.splitTextToSize(items, CW - lw);
      const lh = 10 * 0.352778 * 1.35;
      checkPage(bodyLines.length * lh + 1.5);
      doc.text(label, ML, y);
      doc.setFont('helvetica', 'normal'); doc.text(bodyLines, ML + lw, y);
      y += bodyLines.length * lh + 1.5;
    }
  }
  if ((resume.experience || []).length) {
    addSection('Work Experience');
    for (const job of resume.experience) {
      addEntryHeader(job.company, job.dates);
      addSubtitle([job.title, job.location].filter(Boolean).join('  ·  '));
      for (const b of (job.bullets || [])) addBullet(b);
      y += 2;
    }
  }
  if ((resume.projects || []).length) {
    addSection('Projects');
    for (const p of resume.projects) {
      addEntryHeader(p.name, p.dates || '');
      if (p.context) addSubtitle(p.context);
      for (const b of (p.bullets || [])) addBullet(b);
      y += 2;
    }
  }
  if ((resume.education || []).length) {
    addSection('Education');
    for (const edu of resume.education) {
      addEntryHeader(edu.degree, edu.dates || '');
      addSubtitle([edu.institution, edu.location].filter(Boolean).join('  ·  '));
      y += 1;
    }
  }

  doc.save(filename || 'ATS-Optimized-Resume.pdf');
}

// ── Worker communication ──────────────────────────────────────────────────────
function workerConfigured() {
  return WORKER_URL && WORKER_URL !== 'YOUR_WORKER_URL_HERE';
}

async function fetchWorker(payload) {
  const res = await fetch(WORKER_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  });
  return res; // caller handles status
}

// ── Admin panel ───────────────────────────────────────────────────────────────
function toggleAdminPanel() {
  const panel = document.getElementById('adminPanel');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    document.getElementById('adminLoginView').style.display  = _isAdminMode ? 'none'  : 'block';
    document.getElementById('adminActiveView').style.display = _isAdminMode ? 'block' : 'none';
    document.getElementById('adminError').style.display = 'none';
    if (!_isAdminMode) {
      document.getElementById('adminCodeInput').value = '';
      setTimeout(() => document.getElementById('adminCodeInput').focus(), 50);
    }
  }
}

async function submitAdminCode() {
  const code   = document.getElementById('adminCodeInput').value.replace(/\D/g, '');
  const errEl  = document.getElementById('adminError');
  const btn    = document.getElementById('adminSubmitBtn');
  if (!/^\d{6}$/.test(code)) {
    errEl.textContent   = 'Enter the 6-digit code from your authenticator app.';
    errEl.style.display = 'block';
    return;
  }

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = '…';

  try {
    const res = await fetchWorker({ action: 'verify-totp', code });
    if (res.status === 401) throw new Error('Invalid or expired code.');
    if (!res.ok) throw new Error('Server error. Try again.');

    const data = await res.json();
    if (!data.sessionToken) throw new Error('No session returned.');

    _isAdminMode  = true;
    _adminSession = data.sessionToken;
    document.getElementById('adminPanel').style.display = 'none';
    updateOptimizeBtn();
    showToast('Admin mode active — optimizations are free.');
  } catch (e) {
    errEl.textContent   = e.message;
    errEl.style.display = 'block';
    document.getElementById('adminCodeInput').select();
  } finally {
    btn.disabled    = false;
    btn.textContent = '→';
  }
}

function exitAdminMode() {
  _isAdminMode  = false;
  _adminSession = null;
  document.getElementById('adminPanel').style.display = 'none';
  updateOptimizeBtn();
}

function updateOptimizeBtn() {
  const label = document.getElementById('optimizeBtnLabel');
  const note  = document.getElementById('paymentNote');
  const icon  = document.getElementById('adminIconBtn');
  if (_isAdminMode) {
    label.textContent   = 'Optimize My Resume  (Admin — Free)';
    note.style.display  = 'none';
    icon.classList.add('admin-icon-active');
  } else {
    label.textContent    = 'Optimize My Resume — ₹20';
    note.style.display   = 'block';
    icon.classList.remove('admin-icon-active');
  }
}

// ── Razorpay payment ──────────────────────────────────────────────────────────
async function createOrder() {
  const res = await fetchWorker({ action: 'create-order' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Order creation failed (${res.status})`);
  }
  return res.json(); // { orderId, amount, currency, keyId }
}

function openRazorpayCheckout(orderData) {
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error('Razorpay checkout could not load. Please refresh and try again.'));
      return;
    }
    const options = {
      key:         orderData.keyId,
      amount:      orderData.amount,
      currency:    orderData.currency,
      name:        'ATS Resume Optimizer',
      description: 'AI Resume Optimization — ₹20',
      order_id:    orderData.orderId,
      handler:     (response) => resolve(response),
      modal:       { ondismiss: () => reject(new Error('PAYMENT_CANCELLED')) },
      theme:       { color: '#4f6ef7' }
    };
    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (r) =>
      reject(new Error('Payment failed: ' + (r.error?.description || 'Unknown error')))
    );
    rzp.open();
  });
}

// ── Main optimize flow ────────────────────────────────────────────────────────
async function optimize() {
  const resumeText = _parsedResumeText;
  const jdText     = document.getElementById('jdInput').value.trim();

  if (!resumeText) { showError('Please upload your resume PDF before optimizing.'); return; }
  if (!jdText)     { showError('Please paste the job description.'); return; }
  if (!workerConfigured()) { showError('Service not configured. Contact Darshan.'); return; }

  const btn   = document.getElementById('optimizeBtn');
  const label = document.getElementById('optimizeBtnLabel');

  let workerPayload;

  if (_isAdminMode) {
    // ── Admin path: skip payment ──────────────────────────────────────────────
    workerPayload = {
      action:        'optimize',
      admin_session: _adminSession,
      resumeText,
      jobDescription: jdText
    };
  } else {
    // ── Paid path: create order → checkout → verify ───────────────────────────
    btn.disabled        = true;
    label.textContent   = 'Creating order…';

    let orderData;
    try {
      orderData = await createOrder();
    } catch (e) {
      btn.disabled      = false;
      label.textContent = 'Optimize My Resume — ₹20';
      showError('Could not create payment: ' + e.message);
      return;
    }

    label.textContent = 'Waiting for payment…';
    let paymentResponse;
    try {
      paymentResponse = await openRazorpayCheckout(orderData);
    } catch (e) {
      btn.disabled      = false;
      label.textContent = 'Optimize My Resume — ₹20';
      if (e.message === 'PAYMENT_CANCELLED') {
        showError('Payment cancelled. No charges were made.');
      } else {
        showError(e.message);
      }
      return;
    }

    btn.disabled      = false;
    label.textContent = 'Optimize My Resume — ₹20';

    workerPayload = {
      action:              'optimize',
      razorpay_order_id:   paymentResponse.razorpay_order_id,
      razorpay_payment_id: paymentResponse.razorpay_payment_id,
      razorpay_signature:  paymentResponse.razorpay_signature,
      resumeText,
      jobDescription:      jdText
    };
  }

  await runOptimization(workerPayload);
}

async function runOptimization(payload) {
  // Show loading section
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('inputSection').style.display   = 'none';
  document.getElementById('loadingSection').style.display = 'block';
  document.getElementById('errorBox').style.display       = 'none';
  document.getElementById('loadingText').textContent      = 'AI is optimizing your resume for this role…';

  const stepEls     = [...document.querySelectorAll('.step-item')];
  const resumeText  = payload.resumeText;
  const jdText      = payload.jobDescription;

  try {
    setStep(stepEls, 0); await sleep(150);
    const jdKeywords = extractJDKeywords(jdText);
    const beforeSet  = canonicalSet(resumeText);

    setStep(stepEls, 1); await sleep(150);
    const clientScoreBefore = computeScore(jdKeywords, beforeSet);

    setStep(stepEls, 2);
    const res = await fetchWorker(payload);

    if (res.status === 401) {
      exitAdminMode();
      throw new Error('401: Admin session expired. Please re-enter your password.');
    }
    if (res.status === 402) {
      throw new Error('Payment signature verification failed. Contact Darshan if you were charged.');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const result = await res.json();
    if (!result?.resume || typeof result.resume !== 'object') {
      throw new Error('Invalid response from server. Please try again.');
    }

    setStep(stepEls, 3); await sleep(100);
    // Build before/after canonical sets and derive "added by optimizer"
    const afterSet = canonicalSet(resumeToScoringText(result.resume));
    const addedSet = new Set();
    for (const k of jdKeywords.slice(0, 40)) {
      if (!beforeSet.has(k.kw) && afterSet.has(k.kw)) addedSet.add(k.kw);
    }
    const gapRows = buildGapTable(jdKeywords, beforeSet, addedSet);

    setStep(stepEls, 4); await sleep(100);

    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('inputSection').style.display   = 'block';
    document.getElementById('loadingText').textContent      = 'Analyzing your resume against the job description…';

    const resultsEl = document.getElementById('resultsSection');
    resultsEl.style.display = 'block';
    resultsEl.classList.add('fade-in');

    const scoreBefore = result.beforeScore ?? clientScoreBefore;
    const scoreAfter  = result.afterScore  ?? computeScore(jdKeywords, afterSet);

    document.getElementById('scoreBefore').textContent = '0';
    document.getElementById('scoreAfter').textContent  = '0';
    document.getElementById('barBefore').style.width   = '0%';
    document.getElementById('barAfter').style.width    = '0%';
    animateScore(document.getElementById('scoreBefore'), document.getElementById('barBefore'), scoreBefore, 200);
    animateScore(document.getElementById('scoreAfter'),  document.getElementById('barAfter'),  scoreAfter,  600);

    const diff = scoreAfter - scoreBefore;
    document.getElementById('scoreDelta').textContent = (diff >= 0 ? '+' : '') + diff + ' points improvement';

    renderGapTable(gapRows);
    document.getElementById('resumePreview').innerHTML = renderResumeHTML(result.resume);
    document.getElementById('aiTag').style.display = 'inline';
    window._resumeJSON = result.resume;

    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (e) {
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('inputSection').style.display   = 'block';
    document.getElementById('loadingText').textContent      = 'Analyzing your resume against the job description…';
    showError('Optimization failed: ' + e.message);
    console.error(e);

    if (e.message.startsWith('401')) toggleAdminPanel();
  }
}

// ── Download PDF ──────────────────────────────────────────────────────────────
async function downloadPDF() {
  if (!window._resumeJSON) {
    showError('No optimized resume to download — click Optimize first.');
    return;
  }
  const btns = document.querySelectorAll('#downloadBtn, #downloadBtn2');
  btns.forEach(b => { b.disabled = true; b.textContent = 'Generating PDF…'; });
  try {
    await generatePDFFromJSON(window._resumeJSON, 'ATS-Optimized-Resume.pdf');
  } catch (e) {
    showError('PDF generation failed: ' + e.message);
  } finally {
    btns.forEach(b => { b.disabled = false; b.innerHTML = '<span>⬇</span> Download PDF'; });
  }
}

// ── PDF Upload ────────────────────────────────────────────────────────────────
function initUploadZone() {
  const zone      = document.getElementById('uploadZone');
  const fileInput = document.getElementById('pdfFileInput');
  const status    = document.getElementById('uploadStatus');

  async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') {
      status.textContent = '⚠ Please upload a PDF file.';
      status.className   = 'upload-status upload-error';
      status.style.display = 'block';
      return;
    }
    zone.classList.remove('upload-done');
    zone.classList.add('uploading');
    status.textContent   = 'Reading PDF…';
    status.className     = 'upload-status upload-loading';
    status.style.display = 'block';
    _parsedResumeText    = null;
    try {
      const pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
      if (!pdfjsLib) throw new Error('pdf.js not loaded — refresh the page.');
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page    = await pdf.getPage(p);
        const content = await page.getTextContent();
        const items   = content.items;
        if (!items.length) continue;
        let prevY = null, lb = [], lines = [];
        for (const item of items) {
          const cy = Math.round(item.transform[5]);
          if (prevY !== null && Math.abs(cy - prevY) > 3) { lines.push(lb.join(' ').trim()); lb = []; }
          lb.push(item.str); prevY = cy;
        }
        if (lb.length) lines.push(lb.join(' ').trim());
        text += lines.filter(Boolean).join('\n') + '\n\n';
      }
      _parsedResumeText = text.trim();
      zone.classList.remove('uploading');
      zone.classList.add('upload-done');
      status.textContent = `✓ ${file.name} — ${pdf.numPages} page${pdf.numPages !== 1 ? 's' : ''} ready`;
      status.className   = 'upload-status upload-success';
    } catch (e) {
      _parsedResumeText = null;
      zone.classList.remove('uploading');
      status.textContent = '✗ Could not read PDF: ' + e.message;
      status.className   = 'upload-status upload-error';
    }
  }

  fileInput.addEventListener('change',  e  => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  zone.addEventListener('dragover',     e  => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave',    () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop',         e  => {
    e.preventDefault(); zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function setStep(steps, idx) {
  steps.forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i < idx) el.classList.add('done');
    else if (i === idx) el.classList.add('active');
  });
}

function animateScore(el, barEl, target, delay = 0) {
  setTimeout(() => {
    let cur = 0;
    const step = target / 40;
    const iv = setInterval(() => {
      cur = Math.min(cur + step, target);
      el.textContent = Math.round(cur);
      barEl.style.width = cur + '%';
      if (cur >= target) clearInterval(iv);
    }, 20);
  }, delay);
}

function renderGapTable(rows) {
  document.getElementById('kwTableBody').innerHTML = rows.map(r => `
    <tr>
      <td>${r.keyword}</td>
      <td><span class="badge ${r.inResume ? 'yes' : 'no'}">${r.inResume ? '✓ Yes' : '✗ No'}</span></td>
      <td><span class="badge ${r.added ? 'added' : (r.inResume ? 'yes' : 'no')}">${r.added ? '+ Added' : (r.inResume ? '✓ Present' : '— Not added')}</span></td>
    </tr>
  `).join('');
}

function showError(msg) {
  const el = document.getElementById('errorBox');
  el.textContent   = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 10000);
}

function showToast(msg) {
  const el = document.getElementById('toastMsg');
  if (!el) return;
  el.textContent   = msg;
  el.style.display = 'block';
  el.style.opacity = '1';
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; }, 500);
  }, 3000);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initUploadZone();

  // Admin icon toggle
  document.getElementById('adminIconBtn').addEventListener('click', toggleAdminPanel);

  // Admin panel keyboard + button
  const codeInput = document.getElementById('adminCodeInput');
  codeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  submitAdminCode();
    if (e.key === 'Escape') document.getElementById('adminPanel').style.display = 'none';
  });
  // Sanitize input: digits only, max 6
  codeInput.addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });
  document.getElementById('adminSubmitBtn').addEventListener('click', submitAdminCode);

  // Close admin panel when clicking outside
  document.addEventListener('click', e => {
    const panel = document.getElementById('adminPanel');
    const icon  = document.getElementById('adminIconBtn');
    if (panel.style.display !== 'none' && !panel.contains(e.target) && e.target !== icon) {
      panel.style.display = 'none';
    }
  });

  document.getElementById('optimizeBtn').addEventListener('click', optimize);
  document.getElementById('downloadBtn').addEventListener('click', downloadPDF);

  document.getElementById('resetBtn').addEventListener('click', () => {
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('jdInput').value       = '';
    document.getElementById('uploadStatus').style.display = 'none';
    document.getElementById('uploadZone').className       = 'upload-zone';
    document.getElementById('pdfFileInput').value         = '';
    document.getElementById('resumePreview').innerHTML    = '';
    _parsedResumeText = null;
    window._resumeJSON = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
