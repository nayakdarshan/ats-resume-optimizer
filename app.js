// ── CONFIG ────────────────────────────────────────────────────────────────────
// After deploying the Cloudflare Worker, paste your Worker URL here.
// Leave as-is to run in free client-side mode (no password gate, no AI rewrite).
const WORKER_URL = 'https://ats-optimizer.nayakdarshan.workers.dev';
// ─────────────────────────────────────────────────────────────────────────────

let _sessionPassword = null;

// ── Stopwords ─────────────────────────────────────────────────────────────────
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

// ── Scoring helpers ───────────────────────────────────────────────────────────
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

function buildGapTable(jdKeywords, resumeTokens, addedKeywords) {
  return jdKeywords.slice(0, 40).map(k => ({
    keyword: k.kw,
    inResume: resumeTokens.has(k.kw),
    added: addedKeywords.has(k.kw)
  }));
}

// ── Client-side resume parser ─────────────────────────────────────────────────
function parseResumeSections(resumeText) {
  const headingRe = /^(summary|objective|profile|about|skills?|technical skills?|experience|work experience|employment|projects?|education|certifications?|achievements?|awards?|publications?|volunteer|interests?|languages?|references?)[\s:]*$/im;
  const lines = resumeText.split('\n');
  const sections = { summary: [], skills: [], experience: [], projects: [], education: [], other: [] };
  let current = 'other';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(headingRe);
    if (m) {
      const h = m[1].toLowerCase().replace(/s$/, '');
      if (/summar|objective|profile|about/.test(h)) current = 'summary';
      else if (/skill/.test(h)) current = 'skills';
      else if (/experience|employment|work/.test(h)) current = 'experience';
      else if (/project/.test(h)) current = 'projects';
      else if (/education/.test(h)) current = 'education';
      else current = 'other';
    } else {
      sections[current].push(trimmed);
    }
  }
  return sections;
}

function extractName(resumeText) {
  const lines = resumeText.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 5)) {
    if (/^[A-Z][a-z]+ [A-Z][a-z]+/.test(line) && line.split(' ').length <= 4) return line;
  }
  return lines[0] || 'Your Name';
}

function extractContact(resumeText) {
  const parts = [];
  const em = resumeText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (em) parts.push(em[0]);
  const ph = resumeText.match(/(\+?\d[\d\s\-().]{7,14}\d)/);
  if (ph) parts.push(ph[1].trim());
  const li = resumeText.match(/linkedin\.com\/in\/[\w\-]+/i);
  if (li) parts.push(li[0]);
  const gh = resumeText.match(/github\.com\/[\w\-]+/i);
  if (gh) parts.push(gh[0]);
  return parts.join(' | ');
}

function extractJobTitle(jdText) {
  const lines = jdText.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 10)) {
    if (line.length < 80 && /engineer|developer|analyst|manager|designer|scientist|lead|architect|consultant|specialist|coordinator/i.test(line)) {
      return line.replace(/[^a-zA-Z\s]/g, '').trim();
    }
  }
  return '';
}

// ── Client-side resume rewriter (fallback when no Worker) ─────────────────────
function rewriteResume(resumeText, jdText, jdKeywords) {
  const sections = parseResumeSections(resumeText);
  const name     = extractName(resumeText);
  const contact  = extractContact(resumeText);
  const jdTitle  = extractJobTitle(jdText);

  const resumeTokens = tokenize(resumeText);

  // Surface only tech-phrase keywords that genuinely appear in the resume
  const toSurface = jdKeywords
    .filter(k => resumeTokens.has(k.kw) && TECH_PHRASES.includes(k.kw))
    .map(k => k.kw);

  // Build skills list from user's own skill words + surfaced tech phrases only
  const userSkillWords = sections.skills
    .join(', ')
    .replace(/[•\-*]/g, '')
    .split(/[,;|]/)
    .map(s => s.trim())
    .filter(s => s.length > 1);

  const allSkills = [...new Set([...userSkillWords, ...toSurface.slice(0, 10)])];

  // Summary
  let summaryText = sections.summary.join(' ').replace(/[•\-*]/g, '').trim();
  if (!summaryText) {
    summaryText = `Results-driven professional with hands-on experience in ${userSkillWords.slice(0, 3).join(', ')}.`;
  }
  const summaryLower = summaryText.toLowerCase();
  const topKws  = jdKeywords.slice(0, 5).map(k => k.kw);
  const missing = topKws.filter(k => !summaryLower.includes(k));
  if (missing.length && jdTitle) {
    summaryText = summaryText.replace(/\.$/, '') +
      `. Seeking to leverage expertise in ${missing.slice(0, 3).join(', ')} as a ${jdTitle}.`;
  }

  const ACTION_VERBS = [
    'Developed','Designed','Implemented','Built','Led','Optimized','Delivered',
    'Engineered','Architected','Automated','Streamlined','Reduced','Increased',
    'Improved','Collaborated','Managed','Deployed','Integrated','Maintained','Created'
  ];

  // Format a genuine bullet line — never called on company/title/date lines
  function formatBullet(raw) {
    const clean = raw.replace(/^[•\-*>]+\s*/, '').trim();
    if (!clean) return '';
    let b = clean[0].toUpperCase() + clean.slice(1);
    if (!/[.!?]$/.test(b)) b += '.';
    if (!ACTION_VERBS.some(v => b.startsWith(v))) {
      b = ACTION_VERBS[Math.floor(Math.random() * 6)] + ' ' + b[0].toLowerCase() + b.slice(1);
    }
    return '• ' + b;
  }

  // Process experience: pass company/title/date lines through verbatim;
  // only reformat lines that are actual achievement bullets
  function processSection(lines) {
    return lines.map(line => {
      // A line is a bullet if it starts with a bullet character
      if (/^[•\-*>]/.test(line)) return formatBullet(line);
      // Otherwise: company name, job title, date range — output untouched
      return line.trim();
    }).filter(Boolean);
  }

  const expLines  = processSection(sections.experience);
  const projLines = processSection(sections.projects);
  const eduLines  = sections.education.map(l => l.replace(/^[•\-*]+\s*/, '').trim()).filter(Boolean);

  const out = [];
  out.push(name);
  if (contact) out.push(contact);
  out.push('');
  out.push('SUMMARY');
  out.push('─'.repeat(60));
  out.push(summaryText);
  out.push('');
  out.push('SKILLS');
  out.push('─'.repeat(60));
  out.push(allSkills.join(', '));
  out.push('');
  if (expLines.length) {
    out.push('EXPERIENCE');
    out.push('─'.repeat(60));
    out.push(...expLines);
    out.push('');
  }
  if (projLines.length) {
    out.push('PROJECTS');
    out.push('─'.repeat(60));
    out.push(...projLines);
    out.push('');
  }
  if (eduLines.length) {
    out.push('EDUCATION');
    out.push('─'.repeat(60));
    out.push(...eduLines);
    out.push('');
  }
  if (sections.other.length > 3) {
    const extra = sections.other
      .slice(0, 10)
      .map(l => l.replace(/^[•\-*]+\s*/, '').trim())
      .filter(Boolean);
    if (extra.length) { out.push('ADDITIONAL'); out.push('─'.repeat(60)); out.push(...extra); out.push(''); }
  }

  return {
    text: out.join('\n'),
    addedKeywords: new Set(toSurface)
  };
}

// ── Structured resume JSON → plain text (for preview + scoring) ───────────────
function resumeJSONtoText(resume) {
  const lines = [];
  if (resume.name)  lines.push(resume.name);
  if (resume.title) lines.push(resume.title);

  const c = resume.contact || {};
  const contactParts = [c.email, c.phone, c.location, ...(c.links || [])].filter(Boolean);
  if (contactParts.length) lines.push(contactParts.join(' | '));
  lines.push('');

  if (resume.summary) {
    lines.push('SUMMARY');
    lines.push('─'.repeat(60));
    lines.push(resume.summary);
    lines.push('');
  }

  if ((resume.skills || []).length) {
    lines.push('SKILLS');
    lines.push('─'.repeat(60));
    for (const g of resume.skills) {
      lines.push(g.category ? `${g.category}: ${g.items.join(', ')}` : g.items.join(', '));
    }
    lines.push('');
  }

  if ((resume.experience || []).length) {
    lines.push('EXPERIENCE');
    lines.push('─'.repeat(60));
    for (const j of resume.experience) {
      lines.push([j.company, j.title].filter(Boolean).join(' — '));
      const sub = [j.dates, j.location].filter(Boolean).join(' | ');
      if (sub) lines.push(sub);
      for (const b of (j.bullets || [])) lines.push('• ' + b);
      lines.push('');
    }
  }

  if ((resume.projects || []).length) {
    lines.push('PROJECTS');
    lines.push('─'.repeat(60));
    for (const p of resume.projects) {
      lines.push([p.name, p.context].filter(Boolean).join(' — '));
      if (p.dates) lines.push(p.dates);
      for (const b of (p.bullets || [])) lines.push('• ' + b);
      lines.push('');
    }
  }

  if ((resume.education || []).length) {
    lines.push('EDUCATION');
    lines.push('─'.repeat(60));
    for (const e of resume.education) {
      lines.push(e.degree || '');
      const sub = [e.institution, e.location, e.dates].filter(Boolean).join(' | ');
      if (sub) lines.push(sub);
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

// ── PDF from structured JSON (AI path) ───────────────────────────────────────
async function generatePDFFromJSON(resume, filename) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const ML = 20, MR = 20, MT = 22;
  const PW = 210, PH = 297, BM = 20;
  const UW = PW - ML - MR;
  let y = MT;

  function needPage(h) {
    if (y + h > PH - BM) { doc.addPage(); y = MT; }
  }

  // Typeset a paragraph — returns actual height used
  function para(str, x, { fs = 10, fw = 'normal', r = 40, g = 40, b = 50, gap = 1.5 } = {}) {
    if (!str) return;
    doc.setFont('helvetica', fw);
    doc.setFontSize(fs);
    doc.setTextColor(r, g, b);
    const avail = UW - (x - ML);
    const wrapped = doc.splitTextToSize(str, avail);
    const lh = fs * 0.353 + 0.5; // mm per line at given pt size
    needPage(wrapped.length * lh + gap);
    doc.text(wrapped, x, y);
    y += wrapped.length * lh + gap;
  }

  function bullet(str) {
    if (!str) return;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(35, 35, 50);
    const wrapped = doc.splitTextToSize(str, UW - 6);
    const lh = 10 * 0.353 + 0.5;
    needPage(wrapped.length * lh + 1);
    doc.text('•', ML, y);
    doc.text(wrapped, ML + 5, y);
    y += wrapped.length * lh + 1;
  }

  function sectionHeading(title) {
    y += 4;
    needPage(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(50, 80, 200);
    doc.text(title.toUpperCase(), ML, y);
    y += 3;
    doc.setDrawColor(50, 80, 200);
    doc.setLineWidth(0.4);
    doc.line(ML, y, PW - MR, y);
    y += 5;
  }

  // ── Name ──
  para(resume.name || 'Resume', ML, { fs: 20, fw: 'bold', r: 15, g: 15, b: 35, gap: 2 });

  // Title beneath name
  if (resume.title) para(resume.title, ML, { fs: 11, r: 60, g: 80, b: 180, gap: 2 });

  // Contact line
  const c = resume.contact || {};
  const cParts = [c.email, c.phone, c.location, ...(c.links || [])].filter(Boolean);
  if (cParts.length) para(cParts.join('   |   '), ML, { fs: 9, r: 80, g: 80, b: 100, gap: 1 });

  // ── Summary ──
  if (resume.summary) {
    sectionHeading('Summary');
    para(resume.summary, ML, { fs: 10, r: 35, g: 35, b: 50, gap: 2 });
  }

  // ── Skills ──
  if ((resume.skills || []).length) {
    sectionHeading('Skills');
    for (const grp of resume.skills) {
      const line = grp.category
        ? `${grp.category}:  ${grp.items.join(', ')}`
        : grp.items.join(', ');
      para(line, ML, { fs: 10, r: 35, g: 35, b: 50, gap: 1.5 });
    }
  }

  // ── Experience ──
  if ((resume.experience || []).length) {
    sectionHeading('Experience');
    for (const job of resume.experience) {
      y += 2;
      // Company — Title  (bold, dark)
      const header = [job.company, job.title].filter(Boolean).join('  —  ');
      para(header, ML, { fs: 10, fw: 'bold', r: 15, g: 15, b: 35, gap: 1 });
      // Dates | Location  (smaller, grey)
      const sub = [job.dates, job.location].filter(Boolean).join('   |   ');
      if (sub) para(sub, ML, { fs: 9, r: 100, g: 100, b: 120, gap: 1.5 });
      // Bullets
      for (const bText of (job.bullets || [])) bullet(bText);
    }
  }

  // ── Projects ──
  if ((resume.projects || []).length) {
    sectionHeading('Projects');
    for (const proj of resume.projects) {
      y += 2;
      const header = [proj.name, proj.context].filter(Boolean).join('  —  ');
      para(header, ML, { fs: 10, fw: 'bold', r: 15, g: 15, b: 35, gap: 1 });
      if (proj.dates) para(proj.dates, ML, { fs: 9, r: 100, g: 100, b: 120, gap: 1.5 });
      for (const bText of (proj.bullets || [])) bullet(bText);
    }
  }

  // ── Education ──
  if ((resume.education || []).length) {
    sectionHeading('Education');
    for (const edu of resume.education) {
      y += 2;
      if (edu.degree) para(edu.degree, ML, { fs: 10, fw: 'bold', r: 15, g: 15, b: 35, gap: 1 });
      const sub = [edu.institution, edu.location, edu.dates].filter(Boolean).join('   |   ');
      if (sub) para(sub, ML, { fs: 9, r: 100, g: 100, b: 120, gap: 2 });
    }
  }

  doc.save(filename || 'ATS-Optimized-Resume.pdf');
}

// ── PDF from plain text (client-side fallback) ────────────────────────────────
async function generatePDFFromText(resumeText, filename) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const ML = 20, MR = 20, MT = 22;
  const PW = 210, PH = 297, BM = 20;
  const UW = PW - ML - MR;
  let y = MT;

  function checkPage(needed) {
    if (y + needed > PH - BM) { doc.addPage(); y = MT; }
  }

  const lines = resumeText.split('\n');
  let isFirst = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { y += 4; continue; }

    // Name (first non-blank line)
    if (isFirst) {
      isFirst = false;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(15, 15, 35);
      checkPage(12);
      doc.text(line.trim(), ML, y);
      y += 10;
      continue;
    }

    // Section header (ALL CAPS followed by ─ divider on next line)
    if (/^[A-Z][A-Z\s]{2,}$/.test(line.trim()) && i + 1 < lines.length && lines[i+1].startsWith('─')) {
      i++;
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(50, 80, 200);
      checkPage(10);
      doc.text(line.trim(), ML, y);
      y += 3;
      doc.setDrawColor(50, 80, 200);
      doc.setLineWidth(0.4);
      doc.line(ML, y, PW - MR, y);
      y += 5;
      continue;
    }

    // Contact line (email / phone / links) — only near the top
    if (/@|linkedin|github|\+\d/.test(line.toLowerCase()) && y < MT + 30) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 100);
      checkPage(6);
      const wrapped = doc.splitTextToSize(line.trim(), UW);
      doc.text(wrapped, ML, y);
      y += wrapped.length * 4.5 + 1;
      continue;
    }

    // Bullet
    if (line.trim().startsWith('•')) {
      const content = line.trim().slice(1).trim();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(35, 35, 50);
      const wrapped = doc.splitTextToSize(content, UW - 6);
      checkPage(wrapped.length * 4.5 + 1);
      doc.text('•', ML, y);
      doc.text(wrapped, ML + 5, y);
      y += wrapped.length * 4.5 + 1;
      continue;
    }

    // Plain line (company, title, date, skill line, etc.)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(35, 35, 50);
    const wrapped = doc.splitTextToSize(line.trim(), UW);
    checkPage(wrapped.length * 4.5 + 1.5);
    doc.text(wrapped, ML, y);
    y += wrapped.length * 4.5 + 1.5;
  }

  doc.save(filename || 'ATS-Optimized-Resume.pdf');
}

// ── PDF Parsing (pdf.js) ──────────────────────────────────────────────────────
async function parsePDFFile(file) {
  const pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  if (!pdfjsLib) throw new Error('pdf.js not loaded. Try refreshing the page.');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page    = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items   = content.items;
    if (!items.length) continue;

    let prevY = null, lineBuffer = [], pagelines = [];
    for (const item of items) {
      const y = Math.round(item.transform[5]);
      if (prevY !== null && Math.abs(y - prevY) > 3) {
        pagelines.push(lineBuffer.join(' ').trim());
        lineBuffer = [];
      }
      lineBuffer.push(item.str);
      prevY = y;
    }
    if (lineBuffer.length) pagelines.push(lineBuffer.join(' ').trim());
    fullText += pagelines.filter(Boolean).join('\n') + '\n\n';
  }

  return fullText.trim();
}

// ── Worker communication ──────────────────────────────────────────────────────
function workerConfigured() {
  return WORKER_URL && WORKER_URL !== 'YOUR_WORKER_URL_HERE';
}

async function pingWorker(password) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ping', password })
  });
  if (res.status === 401) throw new Error('Invalid password');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  return true;
}

async function callWorker(resumeText, jdText) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'optimize',
      password: _sessionPassword,
      resumeText,
      jobDescription: jdText
    })
  });
  if (res.status === 401) {
    _sessionPassword = null;
    throw new Error('401: Access denied — password rejected');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  // Returns: { beforeScore, afterScore, missingKeywords: string[], resume: {...} }
  return res.json();
}

// ── Password Gate ─────────────────────────────────────────────────────────────
function showPasswordGate() {
  document.getElementById('passwordGate').style.display = 'flex';
  setTimeout(() => document.getElementById('gatePasswordInput').focus(), 100);
}

function hidePasswordGate() {
  document.getElementById('passwordGate').style.display = 'none';
}

async function submitPassword() {
  const pw = document.getElementById('gatePasswordInput').value.trim();
  if (!pw) return;

  const errEl      = document.getElementById('gateError');
  const btn        = document.getElementById('gateSubmitBtn');
  const btnText    = document.getElementById('gateBtnText');
  const btnSpinner = document.getElementById('gateBtnSpinner');

  errEl.style.display = 'none';
  btn.disabled = true;
  btnText.style.display = 'none';
  btnSpinner.style.display = 'inline-block';

  try {
    await pingWorker(pw);
    _sessionPassword = pw;
    hidePasswordGate();
    updateModeBar();
  } catch (e) {
    errEl.textContent = e.message.includes('Invalid')
      ? 'Wrong password — try again.'
      : 'Could not reach server. Check your connection.';
    errEl.style.display = 'block';
    document.getElementById('gatePasswordInput').select();
  } finally {
    btn.disabled = false;
    btnText.style.display = '';
    btnSpinner.style.display = 'none';
  }
}

// ── Mode bar ──────────────────────────────────────────────────────────────────
function updateModeBar() {
  const bar   = document.getElementById('modeBar');
  const badge = document.getElementById('headerBadge');
  if (workerConfigured()) {
    bar.innerHTML  = '⚡ AI mode active — powered by Claude via secure server';
    bar.className  = 'mode-bar mode-ai';
    bar.style.display = 'block';
    badge.textContent = 'Invite-Only · AI-Powered · No Data Stored';
  } else {
    bar.innerHTML  = '⚙ Client-side mode — no AI rewrite. <a href="https://github.com/nayakdarshan/ats-resume-optimizer#worker-setup" target="_blank" rel="noopener" style="color:inherit">Set up the Worker</a> to enable AI.';
    bar.className  = 'mode-bar mode-client';
    bar.style.display = 'block';
    badge.textContent = 'Free · No Signup · Client-Side Mode';
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function setStep(steps, activeIdx) {
  steps.forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i < activeIdx) el.classList.add('done');
    else if (i === activeIdx) el.classList.add('active');
  });
}

function animateScore(el, barEl, target, delay = 0) {
  setTimeout(() => {
    let current = 0;
    const step = target / 40;
    const interval = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = Math.round(current);
      barEl.style.width = current + '%';
      if (current >= target) clearInterval(interval);
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
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 9000);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main optimize flow ────────────────────────────────────────────────────────
async function optimize() {
  const resumeText = document.getElementById('resumeInput').value.trim();
  const jdText     = document.getElementById('jdInput').value.trim();

  if (!resumeText) { showError('Please upload a PDF or paste your resume text before optimizing.'); return; }
  if (!jdText)     { showError('Please paste the job description before optimizing.'); return; }

  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('inputSection').style.display  = 'none';
  document.getElementById('loadingSection').style.display = 'block';
  document.getElementById('errorBox').style.display       = 'none';

  const stepEls   = [...document.querySelectorAll('.step-item')];
  const useWorker = workerConfigured() && _sessionPassword;

  if (useWorker) {
    document.getElementById('loadingText').textContent = 'AI is rewriting your resume for this specific role…';
  }

  try {
    setStep(stepEls, 0);
    await sleep(200);
    const jdKeywords    = extractJDKeywords(jdText);
    const resumeTokens  = tokenize(resumeText);

    setStep(stepEls, 1);
    await sleep(200);
    const clientScoreBefore = computeScore(jdKeywords, resumeTokens);

    setStep(stepEls, 2);

    let optimizedText, isAI = false;
    let scoreBefore = clientScoreBefore, scoreAfter;
    let addedKeywords = new Set();
    window._resumeJSON = null; // reset structured data

    if (useWorker) {
      try {
        const result = await callWorker(resumeText, jdText);

        // result.resume is the structured JSON from Claude
        if (!result.resume || typeof result.resume !== 'object') {
          throw new Error('Worker returned unexpected data shape — missing resume object.');
        }

        window._resumeJSON = result.resume;
        optimizedText      = resumeJSONtoText(result.resume);
        scoreBefore        = result.beforeScore ?? clientScoreBefore;
        scoreAfter         = result.afterScore;
        addedKeywords      = new Set(result.missingKeywords || []);
        isAI               = true;

      } catch (e) {
        if (e.message.startsWith('401')) {
          document.getElementById('loadingSection').style.display = 'none';
          document.getElementById('inputSection').style.display   = 'block';
          showPasswordGate();
          return;
        }
        showError('AI server error — using client engine instead. (' + e.message + ')');
        const r = rewriteResume(resumeText, jdText, jdKeywords);
        optimizedText = r.text;
        addedKeywords = r.addedKeywords;
      }
    } else {
      const r = rewriteResume(resumeText, jdText, jdKeywords);
      optimizedText = r.text;
      addedKeywords = r.addedKeywords;
    }

    setStep(stepEls, 3);
    await sleep(200);
    const optimizedTokens = tokenize(optimizedText);
    if (scoreAfter === undefined) scoreAfter = computeScore(jdKeywords, optimizedTokens);

    setStep(stepEls, 4);
    await sleep(200);
    if (!isAI || addedKeywords.size === 0) {
      for (const k of jdKeywords.slice(0, 40)) {
        if (!resumeTokens.has(k.kw) && optimizedTokens.has(k.kw)) addedKeywords.add(k.kw);
      }
    }
    const gapRows = buildGapTable(jdKeywords, resumeTokens, addedKeywords);

    // Render
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('inputSection').style.display   = 'block';
    document.getElementById('loadingText').textContent = 'Analyzing your resume against the job description…';

    const resultsEl = document.getElementById('resultsSection');
    resultsEl.style.display = 'block';
    resultsEl.classList.add('fade-in');

    document.getElementById('scoreBefore').textContent = '0';
    document.getElementById('scoreAfter').textContent  = '0';
    document.getElementById('barBefore').style.width   = '0%';
    document.getElementById('barAfter').style.width    = '0%';

    animateScore(document.getElementById('scoreBefore'), document.getElementById('barBefore'), scoreBefore, 200);
    animateScore(document.getElementById('scoreAfter'),  document.getElementById('barAfter'),  scoreAfter,  600);

    const diff = scoreAfter - scoreBefore;
    document.getElementById('scoreDelta').textContent =
      (diff >= 0 ? '+' : '') + diff + ' points improvement';

    renderGapTable(gapRows);
    document.getElementById('resumePreview').textContent = optimizedText;
    document.getElementById('aiTag').style.display = isAI ? 'inline' : 'none';

    window._optimizedResume = optimizedText;
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (e) {
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('inputSection').style.display   = 'block';
    document.getElementById('loadingText').textContent = 'Analyzing your resume against the job description…';
    showError('Something went wrong: ' + e.message);
    console.error(e);
  }
}

// ── Download PDF ──────────────────────────────────────────────────────────────
async function downloadPDF() {
  if (!window._optimizedResume && !window._resumeJSON) {
    showError('Nothing to download — optimize your resume first.');
    return;
  }

  const btns = document.querySelectorAll('#downloadBtn, #downloadBtn2');
  btns.forEach(b => { b.disabled = true; b.textContent = 'Generating PDF…'; });

  try {
    if (window._resumeJSON) {
      await generatePDFFromJSON(window._resumeJSON, 'ATS-Optimized-Resume.pdf');
    } else {
      await generatePDFFromText(window._optimizedResume, 'ATS-Optimized-Resume.pdf');
    }
  } catch (e) {
    showError('PDF generation failed: ' + e.message);
  } finally {
    btns.forEach(b => { b.disabled = false; b.innerHTML = '<span>⬇</span> Download PDF'; });
  }
}

// ── Upload zone ───────────────────────────────────────────────────────────────
function initUploadZone() {
  const zone       = document.getElementById('uploadZone');
  const fileInput  = document.getElementById('pdfFileInput');
  const status     = document.getElementById('uploadStatus');
  const parsedNote = document.getElementById('parsedNote');
  const textarea   = document.getElementById('resumeInput');

  let pageCount = 0;

  async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') {
      status.textContent = '⚠ Please upload a PDF file.';
      status.className   = 'upload-status upload-error';
      status.style.display = 'block';
      return;
    }

    zone.classList.add('uploading');
    status.textContent   = 'Parsing PDF…';
    status.className     = 'upload-status upload-loading';
    status.style.display = 'block';
    parsedNote.style.display = 'none';

    try {
      const pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
      if (!pdfjsLib) throw new Error('pdf.js not loaded — refresh the page');
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      pageCount  = pdf.numPages;
      let fullText = '';

      for (let p = 1; p <= pdf.numPages; p++) {
        const page    = await pdf.getPage(p);
        const content = await page.getTextContent();
        const items   = content.items;
        if (!items.length) continue;
        let prevY = null, buf2 = [], plines = [];
        for (const item of items) {
          const y = Math.round(item.transform[5]);
          if (prevY !== null && Math.abs(y - prevY) > 3) { plines.push(buf2.join(' ').trim()); buf2 = []; }
          buf2.push(item.str); prevY = y;
        }
        if (buf2.length) plines.push(buf2.join(' ').trim());
        fullText += plines.filter(Boolean).join('\n') + '\n\n';
      }

      textarea.value = fullText.trim();
      zone.classList.remove('uploading');
      zone.classList.add('upload-done');
      status.textContent   = `✓ ${file.name} — ${pageCount} page${pageCount !== 1 ? 's' : ''}, ${fullText.trim().length.toLocaleString()} chars extracted`;
      status.className     = 'upload-status upload-success';
      parsedNote.style.display = 'block';

    } catch (e) {
      zone.classList.remove('uploading');
      status.textContent   = '✗ Could not parse PDF: ' + e.message;
      status.className     = 'upload-status upload-error';
    }
  }

  fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  zone.addEventListener('dragover',    e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave',   ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop',        e   => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initUploadZone();
  updateModeBar();

  if (workerConfigured()) showPasswordGate();

  document.getElementById('gatePasswordInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitPassword();
  });
  document.getElementById('gateSubmitBtn').addEventListener('click', submitPassword);
  document.getElementById('optimizeBtn').addEventListener('click', optimize);
  document.getElementById('downloadBtn').addEventListener('click', downloadPDF);

  document.getElementById('resetBtn').addEventListener('click', () => {
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('resumeInput').value  = '';
    document.getElementById('jdInput').value      = '';
    document.getElementById('uploadStatus').style.display  = 'none';
    document.getElementById('parsedNote').style.display    = 'none';
    document.getElementById('uploadZone').className        = 'upload-zone';
    document.getElementById('pdfFileInput').value          = '';
    window._optimizedResume = null;
    window._resumeJSON      = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
