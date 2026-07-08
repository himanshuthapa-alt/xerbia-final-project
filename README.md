# Workforce — Enterprise Workforce Management Platform

A full-stack MERN application that digitizes the complete employee lifecycle — recruitment → onboarding → attendance → leave → payroll → performance — with a built-in **AI Operations Assistant** (Google Gemini) available on every page.

```
React (Vite) ──► Express REST API ──► MongoDB
                     │
                     └──► Google Gemini (AI assistant, resume analysis, payroll explainer)
```

---

## Quick start

**Prereqs:** Node 18+, a MongoDB instance (local `mongod` or a free MongoDB Atlas cluster).

```bash
# 1. API
cd server
npm install
# edit server/.env → set MONGODB_URI (and GEMINI_API_KEY if rotating)
npm run seed        # demo org: departments, 9 role accounts, attendance, a candidate, a project
npm run dev         # → http://localhost:5000

# 2. Web app (second terminal)
cd client
npm install
npm run dev         # → http://localhost:5173  (proxies /api to :5000)
```

### Demo logins (after `npm run seed`)

All passwords: **`Secure@123`**

| Email | Role | What to try |
|---|---|---|
| `root@company.com` | SUPER_ADMIN | Sees everything, no employee profile |
| `admin@company.com` | ORG_ADMIN | Org configuration, all modules |
| `hr@company.com` | HR | Add employees, recruitment pipeline, payroll generation |
| `finance@company.com` | FINANCE | Approve payroll drafts, salary visibility |
| `manager@company.com` | MANAGER | Approve Rahul's pending leave, manage project tasks |
| `employee@company.com` | EMPLOYEE | Clock in/out, apply leave, ask the AI about balances |
| `priya@company.com` | EMPLOYEE | Second report under the manager |
| `it@company.com` | IT_ADMIN | Reset passwords / unlock accounts |
| `auditor@company.com` | AUDITOR | Read-only reporting access |

---

## What works (module by module)

### 1. Authentication & User Management
- Login with JWT **access token** (15 min, configurable) + **refresh token** (7 days) — the client silently refreshes on 401 and replays the request.
- **Account lockout** after 5 failed attempts (15 min), with the failed attempts counter reset on success.
- Password policy enforced server-side: 8+ chars, upper + lower + number + special.
- Change password (self), reset password / unlock (IT_ADMIN, ORG_ADMIN, HR).
- Login history stored per user (IP, user agent, success), capped at 50 entries.
- Identical error for wrong email vs wrong password (no user enumeration), rate-limited login endpoint.

### 2. Role-Based Access Control
Nine roles: `SUPER_ADMIN, ORG_ADMIN, HR, MANAGER, TEAM_LEAD, EMPLOYEE, FINANCE, IT_ADMIN, AUDITOR`.
Enforced **on the server** per route (the sidebar hiding in the UI is cosmetic):
- Salary fields are stripped from employee responses unless the caller is HR/Finance/admin.
- Employees can only read their own profile, attendance, leave, payslips, and assigned tasks.
- Managers/team-leads only see and decide on **their direct reports'** leave.
- Payroll approval is Finance-only; recruitment status changes are HR-only.

### 3. Organization Management
- Departments with unique codes, one manager each, optional parent (hierarchy).
- A department with active employees **cannot be archived**.

### 4. Employee Management
- HR creates the employee + login account in one step; **employee IDs auto-generate** (`EMP0001…`) via an atomic counter.
- Personal + professional details, reporting manager, employment type, salary grade.
- Search (name / EMP id / email), pagination, department filter.
- **Archive instead of delete** — the linked login is disabled at the same time.
- Document uploads (Aadhaar/PAN/resume/…): PDF/PNG/JPG/WEBP only, 5 MB cap, randomized filenames (uploads are never executable or trusted).
- Joining date cannot be in the future; email must be unique.
- Notifications: welcome message on creation, employee notified on manager change, Finance notified on salary change.

### 5. Recruitment
- Candidate pipeline: `Applied → Screening → Technical Interview → HR Interview → Offer → Joined` (+ `Rejected` from anywhere). Transitions can't move backwards.
- Business rules enforced: unique candidate email, **resume required before screening**, **interviews require screening first**, **offer requires HR approval**.
- Interview rounds with scheduling and feedback.
- **AI resume analysis**: paste resume text, get a 0–100 fit score, matched/missing skills, and a summary (Gemini, JSON mode).
- Funnel dashboard: applied / screening / interview / offer / joined / rejected counts.

### 6. Attendance
- Clock in / clock out (once per day — unique index on employee+date).
- Working hours auto-calculated; **Late** if clock-in after `OFFICE_START` (09:30), **Half Day** under 4.5h, **overtime** beyond 9h — all configurable via `.env`.
- Optional GPS capture on clock-in.
- Correction requests by the employee → manager approves/rejects; approval recalculates hours.
- Monthly self view; HR/Finance/managers can query by date, month, or employee.
- Late arrivals notify the reporting manager.

### 7. Leave Management
- Typed balances per year: Casual 12, Sick 10, Earned 15, Maternity/Paternity by policy, WFH 24.
- Apply (no past dates, no overlapping requests, balance checked up front) → manager notified → approve/reject → **balance deducted automatically on approval** and can never go negative.
- Employees can cancel their own pending requests.
- Notification matrix implemented: applied → manager; approved/rejected → employee; approved → HR; cancelled → HR.

### 8. Payroll
- Generate per employee per month (**unique — can't run twice**), Draft → Finance **Approve** → visible to the employee.
- Requires attendance records for the month (rule: attendance mandatory before payroll).
- Components computed from real attendance + approved leave:

  | Component | Formula |
  |---|---|
  | HRA | 20% of basic |
  | Overtime pay | OT hours × hourly rate × 1.5 |
  | PF | 12% of basic, capped at ₹1,800 |
  | Professional tax | ₹200 flat |
  | Income tax | 5% of gross when gross > ₹50,000 (simplified) |
  | Unpaid-leave deduction | unpaid days × per-day basic (22 working days/month) |

- Employees see only their own approved payslips; full payroll table for HR/Finance/Auditor.
- **AI Payroll Explainer**: "Explain my latest payslip" produces a plain-language line-by-line breakdown.

### 9. Performance
- Quarterly review cycle: goals → self assessment → manager evaluation (KPI score, rating 1–5 mapped to Outstanding…Unsatisfactory) → finalize.
- Promotion recommendation flag; finalized reviews are locked.

### 10. Projects & Tasks
- Projects with owner, members, mandatory deadline.
- Tasks: one owner, mandatory deadline, flow `To Do → In Progress → Review → Completed` (+ Blocked).
- **A task cannot be completed without passing Review**, and only a manager can complete it; completed tasks are read-only.
- A project can't be completed while tasks are open; completion notifies HR.
- Employees see only their assigned tasks; task assignment notifies the assignee.

### 11. Notifications
- In-app notification center (bell icon, unread badge, mark-all-read), polled every 30s.
- Fired by: employee created, manager/salary changes, late arrival, attendance correction decisions, the full leave matrix, payslip ready, task assigned/completed, project completed.

### 12. Reports & Analytics
- Dashboard: headcount, present-today, pending leaves, active projects/open tasks, headcount by department, recruitment funnel.
- Payroll totals appear only for money-visible roles.

### 13. AI Operations Assistant (Gemini)
- Floating chat widget on **every page**.
- The server builds a per-user context (own profile, live leave balances, this month's attendance, latest payslip) and injects it into the prompt — the model only ever sees data that user is allowed to see.
- Answers: "How many casual leaves do I have remaining?", policy questions, attendance/payroll queries.
- Extra endpoints: `POST /api/ai/payroll-explain`, `POST /api/ai/summarize` (meeting notes / documents).
- **Graceful degradation**: if the AI API is down or rate-limited, leave-balance questions are answered directly from MongoDB and other queries return a clean error. AI usage is rate-limited to 10 req/min/user; the key never leaves the server.

---

## API reference (summary)

All routes are under `http://localhost:5000/api` and require `Authorization: Bearer <token>` except login/refresh.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, `POST /auth/change-password`, `POST /auth/reset-password`, `GET /auth/login-history` |
| Org | `GET/POST /org/departments`, `PATCH /org/departments/:id` |
| Employees | `GET/POST /employees`, `GET/PATCH/DELETE /employees/:id`, `POST /employees/:id/documents` |
| Recruitment | `GET/POST /recruitment/candidates`, `PATCH /recruitment/candidates/:id/status`, `POST /recruitment/candidates/:id/interviews`, `POST /recruitment/candidates/:id/analyze`, `GET /recruitment/dashboard` |
| Attendance | `POST /attendance/clock-in`, `POST /attendance/clock-out`, `GET /attendance/me`, `GET /attendance`, `POST/PATCH /attendance/:id/correction` |
| Leave | `GET /leave/balance`, `POST /leave`, `GET /leave/me`, `GET /leave/pending`, `PATCH /leave/:id/decide`, `PATCH /leave/:id/cancel` |
| Payroll | `POST /payroll/generate`, `PATCH /payroll/:id/approve`, `GET /payroll/me`, `GET /payroll` |
| Performance | `POST /performance`, `PATCH /performance/:id/self`, `PATCH /performance/:id/evaluate`, `GET /performance/me`, `GET /performance` |
| Projects | `GET/POST /projects`, `PATCH /projects/:id`, `GET/POST /projects/:id/tasks`, `PATCH /projects/tasks/:taskId` |
| Notifications | `GET /notifications`, `PATCH /notifications/read-all` |
| AI | `POST /ai/chat`, `POST /ai/payroll-explain`, `POST /ai/summarize` |
| Analytics | `GET /analytics/summary` |
| Health | `GET /health` (no auth) |

Response convention: `{ success: true, ... }` or `{ success: false, message }` with proper status codes (400 validation, 401 auth, 403 role, 404 missing, 409 conflict/duplicate, 429 rate limit, 502 AI upstream, 503 DB down).

---

## Project structure

```
server/
  src/
    app.js                 # express wiring: helmet, cors, rate limit, routes
    server.js              # entry point
    config/                # env + mongo connection
    middleware/            # requireAuth / requireRole / global error handler
    utils/                 # ApiError, asyncHandler, sequential id counter
    modules/               # one folder per business module
      auth/  org/  employees/  recruitment/  attendance/
      leave/  payroll/  performance/  projects/
      notifications/  ai/  analytics/
    seed/seed.js           # demo data (wipes collections — dev only)
client/
  src/
    api/client.js          # axios + automatic token refresh
    context/AuthContext.jsx
    components/            # Layout (sidebar/notifications), AiWidget
    pages/                 # Dashboard, Employees, Departments, Attendance,
                           # Leave, Payroll, Recruitment, Projects, Login
```

Each server module owns its models, routes, and rules; modules talk to each other through small services (e.g. `notification.service.js`), so features can be changed independently. Different modules were written at different times and vary a little in style (some keep handlers inline in routes, others split controllers) — the conventions that matter (auth middleware, error handling, response shape) are uniform.

## Configuration (`server/.env`)

| Var | Purpose | Default |
|---|---|---|
| `MONGODB_URI` | Mongo connection string | `mongodb://127.0.0.1:27017/workforce` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | token signing (change in prod) | dev values |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` | token lifetimes | `15m` / `7d` |
| `GEMINI_API_KEY` | Google AI Studio key (server-side only) | — |
| `GEMINI_MODEL` | Gemini model id | `gemini-2.5-flash` |
| `OFFICE_START` / `FULL_DAY_HOURS` / `HALF_DAY_THRESHOLD` | attendance policy | `09:30` / `9` / `4.5` |
| `CORS_ORIGIN` | allowed web origin | `http://localhost:5173` |

## Security notes

- All validation happens server-side (client validation is UX only). Inputs bounded (message/text length caps, pagination caps).
- Passwords bcrypt-hashed; JWT secrets and the AI key live only in `.env` (gitignored).
- Rate limits: global 500/15min, login 30/15min, AI 10/min/user.
- Helmet headers, CORS locked to the app origin, internal errors never leak to responses.
- IDOR guards on every "own resource" route (profile, leave, attendance, tasks, payslips).
- File uploads: MIME whitelist, size cap, randomized names, never served for execution.

## Known limitations (deliberate v1 scope)

- Email/SMS notifications, real-time websockets, and QR attendance are not wired (in-app notifications + polling instead).
- Password reset is done by IT/HR (no SMTP), matching the "HR creates accounts" assumption in the spec.
- Asset management, help desk, and a standalone document repository have data-model hooks but no dedicated UI pages yet.
- Payroll tax math is intentionally simplified (documented formula above) — not a statutory payroll engine.
- Times are server-local; multi-timezone offices would need a rework of the attendance clock.
