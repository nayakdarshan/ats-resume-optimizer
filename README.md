# ATS Resume Optimizer

**Beat applicant tracking systems. Get more interviews.**

Upload or paste your resume, paste a job description, and get back a keyword-optimized resume with a Before/After ATS score, keyword gap table, and a clean downloadable PDF.

🔗 **Live Tool:** https://nayakdarshan.github.io/ats-resume-optimizer/

---

## Features

| Feature | Details |
|---|---|
| **PDF Upload** | Upload your resume as a PDF — text is parsed in your browser via pdf.js (never sent anywhere) |
| **Paste fallback** | Prefer to paste plain text? Works too. Textarea is always editable. |
| **ATS Score** | Before & After score (0–100) based on weighted keyword match against the JD |
| **Keyword Gap Table** | Shows every top JD keyword: was it in your resume? was it added? |
| **AI Rewrite** | Claude rewrites your resume section-by-section when a Worker is configured (invite-only) |
| **Client-side fallback** | Works fully offline/free when no Worker is set up |
| **PDF Export** | jsPDF generates real selectable text (not a screenshot) — ATS-parseable single-column PDF |
| **Password Gate** | Invite-only access gate when Worker is active |

---

## How to Use

1. Open the [live tool](https://nayakdarshan.github.io/ats-resume-optimizer/)
2. Enter the access password (invite-only when Worker is deployed; no gate in client-side mode)
3. **Upload your resume PDF** or paste text into the textarea
4. **Paste the job description** in the right box
5. Click **"Optimize My Resume"**
6. Review the Before/After ATS scores, keyword gap table, and rewritten resume
7. Click **"Download PDF"** to save the clean, ATS-friendly PDF

---

## Architecture

```
GitHub Pages (static)          Cloudflare Worker (serverless)
  index.html                     worker/worker.js
  styles.css        ──POST──►    • validates ACCESS_PASSWORD
  app.js            ◄──JSON──    • calls Anthropic API
                                 • returns { beforeScore, afterScore,
                                            missingKeywords, optimizedResume }
```

The frontend also runs a client-side keyword scorer at all times (for the gap table and as a fallback).

---

## Worker Setup (for AI mode)

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Deploy the Worker

```bash
cd worker
wrangler deploy
```

Note the Worker URL printed at the end (e.g. `https://ats-optimizer.YOUR-SUBDOMAIN.workers.dev`).

### 3. Set secrets

```bash
wrangler secret put ANTHROPIC_API_KEY
# Paste your Anthropic key when prompted (starts with sk-ant-)

wrangler secret put ACCESS_PASSWORD
# Choose an access password — share it only with invited users
```

### 4. Wire up the frontend

Open `app.js` and replace the placeholder on **line 4**:

```js
const WORKER_URL = 'https://ats-optimizer.YOUR-SUBDOMAIN.workers.dev';
```

Then commit and push:

```bash
git add app.js
git commit -m "chore: set Worker URL"
git push
```

GitHub Pages will redeploy automatically (~1 min). The password gate will now appear on load.

---

## Privacy & Security

- **Resume text is never stored** — processed in memory and discarded after each request
- **API key is never in the frontend** — stored as a Cloudflare secret, never committed to the repo
- **Access password is never in the frontend** — same: Cloudflare secret only
- **PDF parsing is local** — pdf.js runs in the browser; the PDF bytes never leave your device
- **No cookies, no localStorage, no analytics**

---

## Local Development

```bash
git clone https://github.com/nayakdarshan/ats-resume-optimizer.git
cd ats-resume-optimizer
open index.html   # or double-click — no server needed for client-side mode
```

For Worker development:
```bash
cd worker
wrangler dev   # runs Worker locally at localhost:8787
```

Then temporarily set `WORKER_URL = 'http://localhost:8787'` in `app.js` to test end-to-end.

---

Made by **Darshan**
