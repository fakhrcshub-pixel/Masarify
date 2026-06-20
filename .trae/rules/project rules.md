---
alwaysApply: false
description: 
---

# RULES.md - Masarify Development Constitution

## [1] Project Profile & Context
- **Project Name:** Masarify (مصاريفي)
- **Description:** A lightweight, single-user session-based monthly expense management dashboard.
- **Target Platform:** Mobile-First Responsive Web Application.
- **Key Flow:** User registers/logs in -> enters their monthly budget -> adds daily expenses -> views live remaining budget and category stats -> automatic monthly archive on the 1st of each calendar month.

## [2] Tech Stack & Environment Constraints
- **Frontend Stack:** HTML5, CSS3, Tailwind CSS (V3 via CDN - Play CDN allowed for development), Vanilla ES6+ JavaScript.
- **Backend-as-a-Service:** Supabase (Auth, PostgreSQL DB).
- **Environment Constraints:** 
  - STRICTLY NO Node.js/npm or complex bundlers (Webpack/Vite). This is a purely serverless, CDN-driven, static file structure.
  - All external libraries must be imported via official CDNs or ESM imports.
  - Data privacy must be strictly secured using Supabase Row Level Security (RLS) policies.

## [3] Directory & File Structure
```text
masarify/
├── index.html            # Landing Page & Auth (Login/Signup Modal)
├── dashboard.html        # Main Application Interface
├── assets/
│   ├── css/
│   │   └── style.css     # Custom override styles (if needed)
│   ├── js/
│   │   ├── config.js     # Supabase initialization & Global config
│   │   ├── auth.js       # User signup, login, logout, and session checks
│   │   ├── db.js         # Fetching, adding, deleting, and editing expenses/budget
│   │   └── ui.js         # DOM rendering, updates, chart renderings, and Modals
│   └── images/
│       └── logo.png      # Application Logo (White wallet on Royal Blue)
└── RULES.md              # AI Instructions and development rules
