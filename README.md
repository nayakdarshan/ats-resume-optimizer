# ATS Resume Optimizer

**Beat applicant tracking systems. Get more interviews.**

Upload your resume PDF + paste a job description → get an AI-optimized resume with Before/After ATS score, keyword gap table, and a clean downloadable PDF. ₹20 per optimization, paid securely via Razorpay.

🔗 **Live Tool:** https://nayakdarshan.github.io/ats-resume-optimizer/

---

## How It Works

1. **Upload** your resume PDF (parsed locally by pdf.js — never leaves your device)
2. **Paste** the job description
3. **Click "Optimize My Resume — ₹20"**
4. Pay ₹20 via Razorpay (UPI / cards / netbanking)
5. Worker verifies payment server-side, calls Claude AI to rewrite your resume
6. Review the Before/After ATS scores, keyword gap table, and optimized preview
7. **Download PDF** — clean single-column, ATS-parseable, selectable text

---

## Features

| Feature | Details |
|---|---|
| **PDF Upload** | pdf.js parses resume locally; text never leaves the browser |
| **₹20 Payment** | Razorpay Checkout (UPI / card / netbanking); signature verified server-side |
| **AI Rewrite** | Claude rewrites only the bullets; company names, titles, dates untouched |
| **ATS Scores** | Before & After 0–100 keyword match score with animated gauges |
| **Keyword Gap Table** | Every top JD keyword: was it in your resume? was it added? |
| **PDF Export** | jsPDF real selectable text, fixed professional ATS template |
| **Hidden Admin Mode** | Tiny `⚙` icon in footer → password → free optimizations (admin only) |

---

## Architecture

```
Browser                            Cloudflare Worker
  │                                      │
  ├─ pdf.js parses PDF locally           │
  │                                      │
  ├─── POST create-order ──────────────► │
  │◄── { orderId, keyId } ──────────────┤ (Razorpay Orders API)
  │                                      │
  ├─ Razorpay Checkout opens             │
  ├─ User pays ₹20                       │
  │                                      │
  ├─── POST optimize ──────────────────► │
  │    { order_id, payment_id,           │
  │      signature, resumeText, jdText } │
  │                              verify HMAC-SHA256(order_id|payment_id, KEY_SECRET)
  │                              → callClaude(resumeText, jdText, ANTHROPIC_KEY)
  │◄── { beforeScore, afterScore, ──────┤
  │      missingKeywords, resume:{} }    │
  │                                      │
  └─ renderResumeHTML + generatePDFFromJSON
```

**Admin bypass** (skip payment):
```
Click ⚙ in footer → enter ACCESS_PASSWORD → admin mode → free optimizations
```
The admin password is validated by the Worker ping endpoint. It never appears in the frontend code.

---

## Payment & Security

- **Razorpay Key ID** (public) is returned by the Worker in `create-order` — it is **not** hardcoded in the frontend
- **Razorpay Key Secret** lives only as a Cloudflare Worker secret — never exposed to the browser
- **Signature verification** happens server-side using `HMAC-SHA256(orderId|paymentId, KEY_SECRET)`
- A `402` is returned if the signature is invalid; the AI never runs
- **One payment = one optimization**: the Razorpay signature is unique per payment; the Worker verifies it before proceeding
- Resume text is **never stored** — processed in memory and discarded

---

## Worker Setup & Secrets

### 1. Install Wrangler & deploy

```bash
npm install -g wrangler
wrangler login
cd worker
wrangler deploy
```

### 2. Set all required secrets

```bash
# Anthropic API key (already set)
wrangler secret put ANTHROPIC_API_KEY

# Admin bypass password (already set)
wrangler secret put ACCESS_PASSWORD

# Razorpay keys — get from dashboard.razorpay.com > Settings > API Keys
wrangler secret put RAZORPAY_KEY_ID
# Paste your Key ID when prompted (e.g. rzp_live_xxxx or rzp_test_xxxx)

wrangler secret put RAZORPAY_KEY_SECRET
# Paste your Key Secret when prompted
```

> **Razorpay Test Mode:** You can use `rzp_test_*` keys during development — no real money is charged. Switch to `rzp_live_*` after KYC approval.

### 3. Razorpay account setup

1. Sign up at **https://dashboard.razorpay.com**
2. Complete KYC (or use Test Mode keys immediately without KYC)
3. Go to **Settings → API Keys → Generate Key**
4. Copy the **Key ID** and **Key Secret**
5. Run the two `wrangler secret put` commands above

### 4. Frontend config

No frontend changes needed — the Razorpay Key ID is returned dynamically by the Worker. The `WORKER_URL` constant at the top of `app.js` is the only frontend config:

```js
const WORKER_URL = 'https://ats-optimizer.nayakdarshan.workers.dev';
```

---

## Admin Mode

1. Open the live tool
2. Click the tiny **⚙** icon in the footer (very faint — intentionally subtle)
3. Enter the `ACCESS_PASSWORD` (same secret as before)
4. The button changes to **"Optimize My Resume (Admin — Free)"**
5. Optimizations are free until you click **Exit** in the panel or refresh

---

## Local Development

```bash
git clone https://github.com/nayakdarshan/ats-resume-optimizer.git
cd ats-resume-optimizer
open index.html   # no server needed for UI
```

For Worker development:
```bash
cd worker
wrangler dev   # runs at localhost:8787
```
Then temporarily set `WORKER_URL = 'http://localhost:8787'` in `app.js`.

---

Made by **Darshan**
