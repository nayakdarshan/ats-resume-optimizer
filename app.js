// ── CONFIG ────────────────────────────────────────────────────────────────────
const WORKER_URL = 'https://ats-optimizer.nayakdarshan.workers.dev';
// Razorpay Key ID is returned by the Worker in create-order — nothing to set here.
// ─────────────────────────────────────────────────────────────────────────────

// ── Session state (never persisted to storage) ────────────────────────────────
let _parsedResumeText = null;   // PDF text extracted by pdf.js
let _isAdminMode      = false;  // true after valid admin password
let _adminPassword    = null;   // held in memory only

// ── Keyword scoring (client-side gap table + before-score) ────────────────────
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
  'visual studio code','vs code','jupyter notebook','google colab',
  'sql server','mysql','postgresql','mongodb','redis','elasticsearch','cassandra',
  'react.js','next.js','vue.js','angular','node.js','express.js','fastapi','django',
  'spring boot','asp.net','ruby on rails','.net','entity framework',
  'react native','flutter','swift','kotlin','android studio','xcode',
  'figma','sketch','adobe xd','user experience','ux design','ui design',
  'project management','product management','stakeholder management','cross functional',
  'communication skills','problem solving','critical thinking','decision making',
  'tensorflow','pytorch','scikit-learn','hugging face','langchain','openai',
  'pandas','numpy','matplotlib','seaborn','plotly','scipy',
  'git','github','gitlab','bitbucket','jira','confluence','notion','slack',
  'linux','unix','bash','shell scripting','powershell','command line'
];

function tokenize(text) {
  const lower = text.toLowerCase();
  const found = new Set();
  for (const phrase of TECH_PHRASES) { if (lower.includes(phrase)) found.add(phrase); }
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

function buildGapTable(jdKeywords, resumeTokens, addedKeywords) {
  return jdKeywords.slice(0, 40).map(k => ({
    keyword: k.kw,
    inResume: resumeTokens.has(k.kw),
    added: addedKeywords.has(k.kw)
  }));
}

function resumeToScoringText(resume) {
  return [
    resume.name, resume.title, resume.summary,
    ...(resume.skills     || []).flatMap(g => g.items),
    ...(resume.experience || []).flatMap(j => [j.company, j.title, ...(j.bullets || [])]),
    ...(resume.projects   || []).flatMap(p => [p.name, ...(p.bullets  || [])]),
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
    // Show correct view
    document.getElementById('adminLoginView').style.display  = _isAdminMode ? 'none'  : 'block';
    document.getElementById('adminActiveView').style.display = _isAdminMode ? 'block' : 'none';
    document.getElementById('adminError').style.display = 'none';
    if (!_isAdminMode) {
      document.getElementById('adminPwInput').value = '';
      setTimeout(() => document.getElementById('adminPwInput').focus(), 50);
    }
  }
}

async function submitAdminPassword() {
  const pw     = document.getElementById('adminPwInput').value.trim();
  const errEl  = document.getElementById('adminError');
  const btn    = document.getElementById('adminSubmitBtn');
  if (!pw) return;

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = '…';

  try {
    const res = await fetchWorker({ action: 'ping', password: pw });
    if (res.status === 401) throw new Error('Wrong password.');
    if (!res.ok) throw new Error('Server error. Try again.');

    _isAdminMode   = true;
    _adminPassword = pw;
    document.getElementById('adminPanel').style.display = 'none';
    updateOptimizeBtn();
    showToast('Admin mode active — optimizations are free.');
  } catch (e) {
    errEl.textContent   = e.message;
    errEl.style.display = 'block';
    document.getElementById('adminPwInput').select();
  } finally {
    btn.disabled    = false;
    btn.textContent = '→';
  }
}

function exitAdminMode() {
  _isAdminMode   = false;
  _adminPassword = null;
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
      password:      _adminPassword,
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
    const jdKeywords   = extractJDKeywords(jdText);
    const resumeTokens = tokenize(resumeText);

    setStep(stepEls, 1); await sleep(150);
    const clientScoreBefore = computeScore(jdKeywords, resumeTokens);

    setStep(stepEls, 2);
    const res = await fetchWorker(payload);

    if (res.status === 401) {
      // Admin password rejected mid-session — exit admin mode and re-show panel
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
    const addedKeywords = new Set(result.missingKeywords || []);
    if (addedKeywords.size === 0) {
      const optimTokens = tokenize(resumeToScoringText(result.resume));
      for (const k of jdKeywords.slice(0, 40)) {
        if (!resumeTokens.has(k.kw) && optimTokens.has(k.kw)) addedKeywords.add(k.kw);
      }
    }
    const gapRows = buildGapTable(jdKeywords, resumeTokens, addedKeywords);

    setStep(stepEls, 4); await sleep(100);

    // Render results
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('inputSection').style.display   = 'block';
    document.getElementById('loadingText').textContent      = 'Analyzing your resume against the job description…';

    const resultsEl = document.getElementById('resultsSection');
    resultsEl.style.display = 'block';
    resultsEl.classList.add('fade-in');

    const scoreBefore = result.beforeScore ?? clientScoreBefore;
    const scoreAfter  = result.afterScore  ??
      computeScore(jdKeywords, tokenize(resumeToScoringText(result.resume)));

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
  document.getElementById('adminPwInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAdminPassword();
    if (e.key === 'Escape') document.getElementById('adminPanel').style.display = 'none';
  });
  document.getElementById('adminSubmitBtn').addEventListener('click', submitAdminPassword);

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
