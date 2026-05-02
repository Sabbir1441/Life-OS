# LifeOS 🧠 — Next.js + Firebase

## Project Structure
```
lifeos-next/
├── app/
│   ├── api/ai/route.ts      ← AI proxy (API key safe)
│   ├── dashboard/page.tsx   ← Main app
│   ├── login/page.tsx       ← Login/Register
│   ├── layout.tsx
│   ├── page.tsx             ← Redirect
│   └── globals.css
├── lib/
│   ├── firebase.ts          ← Firebase init
│   ├── db.ts                ← All Firestore operations
│   └── auth-context.tsx     ← Auth provider
├── .env.example             ← Copy this to .env.local
└── package.json
```

## Setup — ধাপে ধাপে

### Step 1 — Firebase Project বানাও
1. console.firebase.google.com → "Add project"
2. Project name: `lifeos` → Continue
3. Google Analytics: off করো → Create project

### Step 2 — Firebase Auth চালু করো
1. Build → Authentication → Get started
2. Sign-in method → Email/Password → Enable → Save

### Step 3 — Firestore Database বানাও
1. Build → Firestore Database → Create database
2. **Start in test mode** (develop এর সময়)
3. Location: asia-south1 (Mumbai — Bangladesh এর কাছে)

### Step 4 — Firebase Config নাও
1. Project Settings (⚙️) → General
2. "Your apps" → Web app (</>) → Register app
3. Config object copy করো

### Step 5 — .env.local বানাও
```bash
cp .env.example .env.local
```
তারপর values fill করো Firebase config থেকে + Anthropic key

### Step 6 — Install & Run
```bash
npm install
npm run dev
```
http://localhost:3000 এ open হবে

### Step 7 — Vercel Deploy
```bash
git init
git add .
git commit -m "LifeOS v2.0 — Firebase"
gh repo create lifeos --private --push
```
Vercel → New Project → GitHub থেকে import → Deploy

**Vercel এ Environment Variables add করো:**
Settings → Environment Variables → সব `.env.local` এর values paste করো

---
## Firestore Security Rules (Production এর আগে)
Firebase Console → Firestore → Rules:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
