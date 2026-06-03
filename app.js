// ── Stopwords ──────────────────────────────────────────────────────────────
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
  'plus','bonus','ideally','nice','will','must','able','help','drive','drive','lead',
  'build','develop','manage','create','contribute','collaborate','communicate','work'
]);

// ── Tech keywords to always preserve (multi-word first) ────────────────────
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

// ── Tokenize a text block into unique keyword tokens ───────────────────────
function tokenize(text) {
  const lower = text.toLowerCase();
  const found = new Set();

  // Extract multi-word tech phrases first
  for (const phrase of TECH_PHRASES) {
    if (lower.includes(phrase)) {
      found.add(phrase);
    }
  }

  // Extract single tokens
  const tokens = lower
    .replace(/[^a-z0-9#+.\-/\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));

  for (const t of tokens) found.add(t);
  return found;
}

// Extract "high value" keywords from JD (weighted by frequency + importance) ─
function extractJDKeywords(jdText) {
  const lower = jdText.toLowerCase();
  const wordFreq = {};
  const found = new Set();

  // Multi-word tech phrases → weight 3
  for (const phrase of TECH_PHRASES) {
    if (lower.includes(phrase)) {
      const count = (lower.match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g')) || []).length;
      wordFreq[phrase] = (wordFreq[phrase] || 0) + count * 3;
      found.add(phrase);
    }
  }

  // Single tokens → weight by frequency
  const tokens = lower
    .replace(/[^a-z0-9#+.\-/\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));

  for (const t of tokens) {
    wordFreq[t] = (wordFreq[t] || 0) + 1;
    found.add(t);
  }

  // Score each keyword
  const scored = [...found].map(kw => ({
    kw,
    score: (wordFreq[kw] || 0) + (TECH_PHRASES.includes(kw) ? 5 : 0)
  })).sort((a, b) => b.score - a.score);

  return scored;
}

// ── ATS score: what % of high-value JD keywords are in resume ─────────────
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

// ── Build keyword gap table data ──────────────────────────────────────────
function buildGapTable(jdKeywords, resumeTokens, addedKeywords) {
  return jdKeywords.slice(0, 40).map(k => ({
    keyword: k.kw,
    inResume: resumeTokens.has(k.kw),
    added: addedKeywords.has(k.kw)
  }));
}

// ── Parse resume into named sections ─────────────────────────────────────
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

// ── Extract name from resume (first non-empty line that looks like a name) ─
function extractName(resumeText) {
  const lines = resumeText.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 5)) {
    if (/^[A-Z][a-z]+ [A-Z][a-z]+/.test(line) && line.split(' ').length <= 4) {
      return line;
    }
  }
  return lines[0] || 'Your Name';
}

// ── Extract contact info ──────────────────────────────────────────────────
function extractContact(resumeText) {
  const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
  const phoneRe = /(\+?\d[\d\s\-().]{7,14}\d)/;
  const linkedinRe = /linkedin\.com\/in\/[\w\-]+/i;
  const githubRe = /github\.com\/[\w\-]+/i;
  const locationRe = /([A-Z][a-z]+(?:,\s*[A-Z]{2})?(?:,\s*[A-Z][a-z]+)?)\s*\|?\s*(?=\d{3}|[a-z]+@)/;

  const parts = [];
  const em = resumeText.match(emailRe);
  if (em) parts.push(em[0]);
  const ph = resumeText.match(phoneRe);
  if (ph) parts.push(ph[1].trim());
  const li = resumeText.match(linkedinRe);
  if (li) parts.push('linkedin.com/in/' + li[0].split('linkedin.com/in/')[1]);
  const gh = resumeText.match(githubRe);
  if (gh) parts.push('github.com/' + gh[0].split('github.com/')[1]);
  return parts.join(' | ');
}

// ── Rewrite resume with ATS optimizations (client-side) ──────────────────
function rewriteResume(resumeText, jdText, jdKeywords, jdTokens) {
  const sections = parseResumeSections(resumeText);
  const name = extractName(resumeText);
  const contact = extractContact(resumeText);

  // Gather user's existing skills
  const skillLine = sections.skills.join(' ');
  const userSkillTokens = tokenize(skillLine);

  // Keywords to surface: in JD + exist in resume OR in JD description but related
  const resumeTokens = tokenize(resumeText);
  const toSurface = jdKeywords
    .filter(k => resumeTokens.has(k.kw))
    .map(k => k.kw);
  const toAdd = jdKeywords
    .filter(k => !resumeTokens.has(k.kw) && k.score >= 3)
    .slice(0, 5)
    .map(k => k.kw);

  // Build merged skills list
  const mergedSkills = new Set([...userSkillTokens]);
  for (const k of toSurface.slice(0, 20)) mergedSkills.add(k);
  const userSkillWords = sections.skills
    .join(', ')
    .replace(/[•\-*]/g, '')
    .split(/[,;|]/)
    .map(s => s.trim())
    .filter(Boolean);

  const jdTitle = extractJobTitle(jdText);

  // Build summary
  let summaryLines = sections.summary.length
    ? sections.summary
    : sections.other.slice(0, 3);
  let summaryText = summaryLines.join(' ').replace(/[•\-*]/g, '').trim();
  if (!summaryText) {
    summaryText = `Results-driven professional with hands-on experience in ${userSkillWords.slice(0, 3).join(', ')}.`;
  }

  // Inject JD title and top keywords into summary if not present
  const summaryLower = summaryText.toLowerCase();
  const topKws = jdKeywords.slice(0, 5).map(k => k.kw);
  const missing = topKws.filter(k => !summaryLower.includes(k));
  if (missing.length && jdTitle) {
    summaryText = summaryText.replace(/\.$/, '') + `. Seeking to leverage expertise in ${missing.slice(0, 3).join(', ')} as a ${jdTitle}.`;
  }

  // Format experience bullets with action verbs
  const actionVerbs = ['Developed','Designed','Implemented','Built','Led','Optimized','Delivered',
    'Engineered','Architected','Automated','Streamlined','Reduced','Increased','Improved',
    'Collaborated','Managed','Deployed','Integrated','Maintained','Created'];

  function formatBullet(line) {
    const clean = line.replace(/^[•\-*>]+\s*/, '').trim();
    if (!clean) return '';
    // Capitalize first letter, ensure ends with period
    let b = clean[0].toUpperCase() + clean.slice(1);
    if (!/[.!?]$/.test(b)) b += '.';
    // Prepend action verb if not starting with one
    const startsWithVerb = actionVerbs.some(v => b.startsWith(v));
    if (!startsWithVerb && b.length > 10) {
      b = actionVerbs[Math.floor(Math.random() * 5)] + ' ' + b[0].toLowerCase() + b.slice(1);
    }
    return '• ' + b;
  }

  const expFormatted = sections.experience.map(formatBullet).filter(Boolean);
  const projFormatted = sections.projects.map(formatBullet).filter(Boolean);
  const eduFormatted = sections.education.map(l => l.replace(/^[•\-*]+\s*/, '').trim()).filter(Boolean);

  // Build skills sections: categorize if possible
  const allSkills = [...new Set([
    ...userSkillWords,
    ...toSurface.slice(0, 15)
  ])].filter(s => s.length > 1);

  const output = [];
  output.push(name);
  if (contact) output.push(contact);
  output.push('');

  output.push('SUMMARY');
  output.push('─'.repeat(60));
  output.push(summaryText);
  output.push('');

  output.push('SKILLS');
  output.push('─'.repeat(60));
  output.push(allSkills.join(' | '));
  output.push('');

  if (expFormatted.length) {
    output.push('EXPERIENCE');
    output.push('─'.repeat(60));
    output.push(...expFormatted);
    output.push('');
  }

  if (projFormatted.length) {
    output.push('PROJECTS');
    output.push('─'.repeat(60));
    output.push(...projFormatted);
    output.push('');
  }

  if (eduFormatted.length) {
    output.push('EDUCATION');
    output.push('─'.repeat(60));
    output.push(...eduFormatted);
    output.push('');
  }

  // Surface certifications/other relevant sections
  if (sections.other.length > 3) {
    const otherFiltered = sections.other
      .slice(0, 10)
      .map(l => l.replace(/^[•\-*]+\s*/, '').trim())
      .filter(Boolean);
    if (otherFiltered.length) {
      output.push('ADDITIONAL');
      output.push('─'.repeat(60));
      output.push(...otherFiltered);
      output.push('');
    }
  }

  return { text: output.join('\n'), addedKeywords: new Set(toSurface) };
}

function extractJobTitle(jdText) {
  const lines = jdText.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 10)) {
    if (line.length < 80 && /engineer|developer|analyst|manager|designer|scientist|lead|architect|consultant|specialist|coordinator/i.test(line)) {
      return line.replace(/[^a-zA-Z\s]/g,'').trim();
    }
  }
  return '';
}

// ── AI Rewrite via Anthropic API ──────────────────────────────────────────
async function aiRewrite(resumeText, jdText, apiKey) {
  const prompt = `You are an expert ATS resume optimizer and career coach.

TASK: Rewrite the resume below to maximize ATS keyword match for the given job description.

RULES (strictly follow):
1. Keep ALL real content — never fabricate employers, dates, titles, or experience.
2. Restructure into these sections in order: SUMMARY, SKILLS, EXPERIENCE, PROJECTS, EDUCATION.
3. Rewrite bullets with action verb + impact + technology + metric format where possible.
4. Mirror the job description's keywords and terminology where honest.
5. Put a comprehensive Skills section with relevant JD keywords that truthfully apply.
6. Use plain text only — no markdown, no tables, no columns, no special characters except bullets (•) and section dividers (─).
7. The output must be clean, single-column, ATS-parseable plain text.
8. Start with the candidate's name on the first line, then contact info on the second.

JOB DESCRIPTION:
${jdText.slice(0, 3000)}

RESUME TO REWRITE:
${resumeText.slice(0, 3000)}

OUTPUT: The complete rewritten resume in plain text. No preamble, no explanation.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-calls': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// ── PDF Generation ────────────────────────────────────────────────────────
async function generatePDF(resumeText, filename) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const marginL = 20, marginR = 20, marginT = 20;
  const pageW = 210;
  const usableW = pageW - marginL - marginR;
  let y = marginT;
  const pageH = 297;
  const bottomMargin = 20;

  function checkPage(needed) {
    if (y + needed > pageH - bottomMargin) {
      doc.addPage();
      y = marginT;
    }
  }

  const lines = resumeText.split('\n');
  let isFirst = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      y += 4;
      continue;
    }

    // Name (first non-empty line)
    if (isFirst && line.trim()) {
      isFirst = false;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(20, 20, 40);
      checkPage(10);
      doc.text(line.trim(), marginL, y);
      y += 10;
      continue;
    }

    // Section headers (all caps, followed by ─ divider line)
    if (/^[A-Z][A-Z\s]{2,}$/.test(line.trim()) && i + 1 < lines.length && lines[i+1].startsWith('─')) {
      i++; // skip divider
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(50, 80, 200);
      checkPage(10);
      doc.text(line.trim(), marginL, y);
      y += 3;
      // Draw underline
      doc.setDrawColor(50, 80, 200);
      doc.setLineWidth(0.5);
      doc.line(marginL, y, pageW - marginR, y);
      y += 6;
      continue;
    }

    // Contact line (contains @, phone, linkedin)
    if (/@|linkedin|github|\||\+\d/.test(line.toLowerCase()) && y < marginT + 25) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 100);
      checkPage(6);
      const wrapped = doc.splitTextToSize(line.trim(), usableW);
      doc.text(wrapped, marginL, y);
      y += wrapped.length * 5 + 2;
      continue;
    }

    // Bullet points
    if (line.trim().startsWith('•')) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 50);
      const content = line.trim().slice(1).trim();
      const wrapped = doc.splitTextToSize(content, usableW - 6);
      checkPage(wrapped.length * 5 + 2);
      doc.text('•', marginL, y);
      doc.text(wrapped, marginL + 5, y);
      y += wrapped.length * 5 + 2;
      continue;
    }

    // Regular text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 50);
    const wrapped = doc.splitTextToSize(line.trim(), usableW);
    checkPage(wrapped.length * 5 + 2);
    doc.text(wrapped, marginL, y);
    y += wrapped.length * 5 + 3;
  }

  doc.save(filename || 'ATS-Optimized-Resume.pdf');
}

// ── UI Helpers ─────────────────────────────────────────────────────────────
function show(id) { document.getElementById(id).style.display = ''; }
function hide(id) { document.getElementById(id).style.display = 'none'; }

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
  const tbody = document.getElementById('kwTableBody');
  tbody.innerHTML = rows.map(r => `
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
  setTimeout(() => { el.style.display = 'none'; }, 8000);
}

// ── Main optimize flow ────────────────────────────────────────────────────
async function optimize() {
  const resumeText = document.getElementById('resumeInput').value.trim();
  const jdText = document.getElementById('jdInput').value.trim();
  const apiKey = document.getElementById('apiKeyInput').value.trim();

  if (!resumeText) { showError('Please paste your resume before optimizing.'); return; }
  if (!jdText) { showError('Please paste the job description before optimizing.'); return; }

  // Hide results, show loading
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('inputSection').style.display = 'none';
  document.getElementById('loadingSection').style.display = 'block';
  document.getElementById('errorBox').style.display = 'none';

  const stepEls = [...document.querySelectorAll('.step-item')];

  try {
    // Step 1: Parse
    setStep(stepEls, 0);
    await sleep(300);

    const jdKeywords = extractJDKeywords(jdText);
    const jdTokens = tokenize(jdText);
    const resumeTokens = tokenize(resumeText);

    // Step 2: Score before
    setStep(stepEls, 1);
    await sleep(300);

    const scoreBefore = computeScore(jdKeywords, resumeTokens);

    // Step 3: Rewrite
    setStep(stepEls, 2);
    await sleep(400);

    let optimizedText;
    let isAI = false;

    if (apiKey) {
      try {
        optimizedText = await aiRewrite(resumeText, jdText, apiKey);
        isAI = true;
      } catch (e) {
        console.warn('AI rewrite failed, falling back to client engine:', e.message);
        showError('AI rewrite failed (' + e.message + '). Using client-side engine instead.');
        const r = rewriteResume(resumeText, jdText, jdKeywords, jdTokens);
        optimizedText = r.text;
      }
    } else {
      const r = rewriteResume(resumeText, jdText, jdKeywords, jdTokens);
      optimizedText = r.text;
    }

    // Step 4: Score after
    setStep(stepEls, 3);
    await sleep(300);

    const optimizedTokens = tokenize(optimizedText);
    const scoreAfter = computeScore(jdKeywords, optimizedTokens);

    // Step 5: Build gap table
    setStep(stepEls, 4);
    await sleep(200);

    const addedKeywords = new Set();
    for (const k of jdKeywords.slice(0, 40)) {
      if (!resumeTokens.has(k.kw) && optimizedTokens.has(k.kw)) addedKeywords.add(k.kw);
    }
    const gapRows = buildGapTable(jdKeywords, resumeTokens, addedKeywords);

    // Show results
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('inputSection').style.display = 'block';

    const resultsEl = document.getElementById('resultsSection');
    resultsEl.style.display = 'block';
    resultsEl.classList.add('fade-in');

    // Animate scores
    const beforeNumEl = document.getElementById('scoreBefore');
    const beforeBarEl = document.getElementById('barBefore');
    const afterNumEl = document.getElementById('scoreAfter');
    const afterBarEl = document.getElementById('barAfter');

    beforeNumEl.textContent = '0';
    afterNumEl.textContent = '0';
    beforeBarEl.style.width = '0%';
    afterBarEl.style.width = '0%';

    animateScore(beforeNumEl, beforeBarEl, scoreBefore, 200);
    animateScore(afterNumEl, afterBarEl, scoreAfter, 600);

    const diff = scoreAfter - scoreBefore;
    document.getElementById('scoreDelta').textContent = (diff >= 0 ? '+' : '') + diff + ' points improvement';

    // Gap table
    renderGapTable(gapRows);

    // Resume preview
    document.getElementById('resumePreview').textContent = optimizedText;

    // Store for PDF
    window._optimizedResume = optimizedText;
    window._isAI = isAI;

    if (isAI) {
      document.getElementById('aiTag').style.display = 'inline';
    }

    // Scroll to results
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (e) {
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('inputSection').style.display = 'block';
    showError('Something went wrong: ' + e.message);
    console.error(e);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Download PDF ──────────────────────────────────────────────────────────
async function downloadPDF() {
  const btn = document.getElementById('downloadBtn');
  const text = window._optimizedResume;
  if (!text) return;

  btn.disabled = true;
  btn.textContent = 'Generating PDF...';

  try {
    await generatePDF(text, 'ATS-Optimized-Resume.pdf');
  } catch (e) {
    showError('PDF generation failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>⬇</span> Download PDF';
  }
}

// ── AI toggle ─────────────────────────────────────────────────────────────
function toggleAI() {
  const toggle = document.getElementById('aiToggle');
  const body = document.getElementById('aiBody');
  const isOpen = toggle.classList.toggle('open');
  body.style.display = isOpen ? 'block' : 'none';
}

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('optimizeBtn').addEventListener('click', optimize);
  document.getElementById('downloadBtn').addEventListener('click', downloadPDF);
  document.getElementById('aiToggle').addEventListener('click', toggleAI);
  document.getElementById('resetBtn').addEventListener('click', () => {
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('resumeInput').value = '';
    document.getElementById('jdInput').value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
