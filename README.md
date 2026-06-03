# ATS Resume Optimizer

**Beat applicant tracking systems. Get more interviews.**

A free, fully client-side tool that analyzes your resume against a job description, scores your ATS keyword match, and generates a rewritten, ATS-optimized resume you can download as a clean PDF.

🔗 **Live Tool:** https://nayakdarshan.github.io/ats-resume-optimizer/

---

## What It Does

1. **Parses the job description** — extracts high-value keywords, skills, tools, and technologies (handles multi-word phrases and acronyms).
2. **Scores your resume** — computes a 0–100 ATS match score based on keyword presence and frequency weighting.
3. **Rewrites your resume** — restructures into standard ATS-friendly sections (Summary, Skills, Experience, Projects, Education), surfaces keywords, and improves bullet impact.
4. **Shows the gap** — a keyword table showing every JD keyword: was it in your resume? was it added?
5. **Downloads a clean PDF** — single-column, plain-text, selectable (not an image) — exactly what ATS systems can parse.

---

## How to Use

1. Open the [live tool](https://nayakdarshan.github.io/ats-resume-optimizer/)
2. Paste your **current resume** in the left box
3. Paste the **job description** in the right box
4. Click **"Optimize My Resume"**
5. Review the Before/After ATS scores, keyword gap table, and rewritten resume
6. Click **"Download PDF"** to save the ATS-ready version

---

## Optional: AI-Enhanced Rewrite

The tool works **100% free with no API key** using the built-in keyword engine.

For higher-quality, human-level rewrites powered by Claude:

1. Expand **"Advanced: AI Rewrite (optional)"**
2. Enter your [Anthropic API key](https://console.anthropic.com/) (starts with `sk-ant-`)
3. Click Optimize — the tool will call Claude claude-sonnet-4-20250514 directly from your browser

> **Your API key is never stored or sent to any server other than api.anthropic.com.** It lives only in your browser's memory for the duration of your session.

---

## Tech Stack

- Vanilla HTML, CSS, JavaScript — no build step, no framework
- [jsPDF](https://github.com/parallax/jsPDF) for PDF generation (loaded via CDN)
- Hosted on GitHub Pages (static files only)

---

## Privacy

- **No data is ever sent to any server** (except optionally to api.anthropic.com if you provide an API key)
- No cookies, no localStorage, no analytics
- Everything runs in your browser

---

## Local Development

Just open `index.html` in a browser — no server needed.

```bash
git clone https://github.com/nayakdarshan/ats-resume-optimizer.git
cd ats-resume-optimizer
open index.html   # or double-click it
```

---

Made by **Darshan**
