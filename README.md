# 💎 Finora - Your Intelligent Financial OS

> **Finora** is a premium, AI-driven personal finance ecosystem built with **React**, **Vite**, and **Firebase**. It combines advanced automation, systematic investment tracking (SIP), and RAG-based AI companionship to simplify your financial life.

![Finora Preview](https://github.com/Parsh06/Finora/raw/main/public/preview.png) *(Note: Placeholder for your app screenshot)*

---

## 🚀 Key Features

### 🤖 Finora AI (Intelligent Assistant)
- **RAG-Powered Chat**: A conversational assistant that understands your entire financial history (Transactions, Budgets, Savings).
- **Financial Health Score**: Real-time AI analysis that scores your financial habits from 0-100.
- **Expense DNA**: Monthly AI-generated "Spending Personality" profile (e.g., Weekend Splurger, Night Owl) with witty insights and shareable cards.
- **Live Insights**: Proactive alerts about overspending, upcoming bills, and high-expense categories.

### 📈 Smart SIP Engine
-   **Predictive Cash Flow Engine**: Local AI-driven 30/60/90-day balance forecasting with "Danger Day" alerts and safety floor monitoring.
- **Smart Category Correction**: Personal learning engine that maps merchants to your preferred categories over time.
- **Retroactive Batch Fixing**: One-tap cleanup for historical transaction categories.
- **Contextual Spending Narratives**: AI-generated written stories that explain *why* you spent what you did, correlating category spikes and comparing data to the previous year.
-   **📈 Intelligent SIP Engine**: Robust Systematic Investment Plans with automated annually/monthly set-ups and automated step-up adjustments.
- **Dynamic Step-up**: Automatically grow your SIP amounts by a chosen percentage (e.g., 5%, 10%) every month or year.
- **SIP Performance Analysis**: Track "Total SIP Capital," "Tenure Tracking" (how long a plan has been active), and future projections.

### 💸 Automated Money Management
- **Voice Transactions**: Add expenses or income simply by speaking.
- **AI Bill Scanner**: Scan physical/digital receipts to automatically extract amounts, categories, and dates.
- **Smart Recurring Payments**: Manage subscriptions and bills with "Next Payment" date tracking and overdue alerts.

### 🛡️ Privacy & Security
- **Global Privacy Toggle**: A one-click "Ghost Mode" that blurs all sensitive financial amounts across the entire app.
- **Seamless Auth**: Secure Google and Email/Password authentication via Firebase.

### 📊 Financial Utilities
- **Advanced Analytics**: Interactive spending heatmaps and category-wise breakdown charts.
- **Dynamic Budgets**: Set monthly limits with rollover support and AI-driven budget alerts.
- **Net Worth Tracker**: Full balance sheet (Assets vs Liabilities) with historical MoM trend visualization and SIP integration.
- **Savings Goals**: Milestone-based tracking for your long-term purchases.
- **Splitwise Integration**: Create groups and settle bills with friends easily.

---

## 🛠️ Tech Stack

- **Frontend**: React 18 (TypeScript), Vite, Tailwind CSS
- **Animations**: Framer Motion (Smooth micro-interactions)
- **Backend**: Firebase Firestore (NoSQL), Firebase Auth, Hosting
- **AI Services**: Groq (Llama-3), Google Gemini
- **Utilities**: Date-fns (Complex scheduling), Lucide Icons, Sonner (Toasts)

---

## ⚡ Quick Start

### 1. Installation
```bash
npm install
```

### 2. Environment Setup
Create a `.env` file in the root with your API keys:
```env
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project
VITE_GROQ_API_KEY=your_groq_key
VITE_GEMINI_API_KEY=your_gemini_key
```

### 3. Run Development
```bash
npm run dev
```

### 4. Build & Verify
```bash
# Verify env vars and build for production
npm run build:prod
```

---

## 📜 Project Structure

- `src/components/` — Modular UI components (Dashboards, Modals, Chat).
- `src/lib/` — Core service logic (RAG-AI, Firestore observers, recurring schedulers).
- `src/pages/` — Main application views and routing.
- `scripts/` — Production build and environment verification utilities.

---

## 📤 Deployment
- **Firebase**: Fully configured for Firebase Hosting. Use `firebase deploy`.
- **PowerShell Help**: Use `.\scripts\build-and-deploy.ps1` for an automated build-to-deploy pipeline on Windows.

---

*Finora is designed to be more than just a tracker—it's your proactive financial partner.*
