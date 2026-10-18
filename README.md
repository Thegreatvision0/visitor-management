# DJJS Nurmahal — Sewadar & Accommodation Management (MERN)

The browser-only prototype (`index visitor managment.html`) rebuilt as a MERN application:

- **MongoDB + Mongoose**: data storage (previously `localStorage`)
- **Express**: REST API with real sign-in (bcrypt passwords and JWT). Roles, branch and department scoping, and every business rule are enforced on the server.
- **React (Vite)**: the same 11 screens, dialogs and reports as the prototype
- **Node**: runs the server; serves the built React app in production

The prototype file is left untouched for reference.

## Project layout

```
server/            Express API
  src/index.js       app setup, start-up, serves client/dist in production
  src/models/        Mongoose schemas (Member, Registration, Allocation, Duty, Bed, …)
  src/services/      business rules (domain.js), sample data, backup / snapshot
  src/routes/        auth, members & branches, regs (visits), accommodation, departments, admin
  src/middleware/    JWT authentication and role guards
client/            React app (Vite)
  src/pages/         Dashboard, Members, Branches, PreReg, Approvals, Reception,
                     Accommodation, Departments, LongTerm, Reports, Admin, Login
  src/modals/        every add / edit / confirm dialog
  src/components/    layout, tables, form modal, camera photo field
  src/lib/           read-only view helpers and report definitions
shared/            date helpers, constants and role defaults used by both sides
```

## Requirements

- Node.js 22 or newer
- MongoDB 6 or newer: a local install, `docker compose up -d` (uses the included `docker-compose.yml`), or a MongoDB Atlas connection string

## Set up and run (development)

```bash
npm run install:all                     # installs root, server and client packages
cp server/.env.example server/.env      # then edit: MONGODB_URI and a long random JWT_SECRET
npm run dev                             # API on :5000, React on http://localhost:5173
```

On first start with an empty database, the server loads the prototype's sample data and creates the demo users below (set `SEED_ON_EMPTY=false` to skip). `npm run seed` reloads the sample data at any time; sign-in users are kept.

### Demo accounts

All demo accounts use the password from `SEED_PASSWORD` (default `Noormahal@123`). **Change these passwords, or delete the accounts, before real use** (Admin → Users).

| Username | Role |
|---|---|
| `admin` | Super Admin / IT Admin |
| `manager` | Nurmahal Sewadar Manager |
| `coord.ludhiana`, `coord.amritsar` | Branch Coordinator (own branch only) |
| `reception` | Reception Staff |
| `accom` | Accommodation Manager |
| `supervisor.security` | Department Supervisor (Security only) |
| `viewer` | Management / Report Viewer |

## Phones and tablets

The app adapts to the screen:

| Screen | Layout |
|---|---|
| Desktop (≥ 1181 px) | Full sidebar |
| Tablet landscape (901–1180 px) | Icon-only sidebar |
| Tablet portrait & phones (≤ 900 px) | ☰ slide-out menu |
| Phones (≤ 640 px) | Tables become cards, dialogs open full-screen, larger touch targets |

Charts respond to touch: tap a bar or point to see its value, then tap again to open it. Notched iPhones are handled, and inputs are 16 px so iOS doesn't zoom in on focus.

**Try it on a phone during development.** Connect the phone to the same Wi-Fi as the computer, then run:

```bash
npm run dev:lan
```

Open the `Network:` address Vite prints (for example `http://192.168.1.20:5173`) on the phone. Windows may ask to allow Node.js through the firewall; allow it on private networks only.

**Install it like an app.** In production (HTTPS), open the site and choose **Add to Home Screen** (Safari on iPhone/iPad) or **Install app** (Chrome on Android). It opens full-screen with the DJJS logo as its icon.

## Deploying on the office PC (office network + public)

See **[deploy/DEPLOY.md](deploy/DEPLOY.md)**. In short, one administrator script (`deploy\setup.ps1`) does the following:
- installs the app as a Windows service
- opens it to the office network
- schedules daily backups

A Cloudflare Tunnel then publishes it on HTTPS without any router changes.

## Production

```bash
npm run build      # builds client/dist
npm start          # Express serves the API and the built app on PORT (default 5000)
```

Set a strong `JWT_SECRET`, put the server behind HTTPS, and set `SEED_ON_EMPTY=false`.

## Moving data over from the prototype

In the old HTML prototype, open **Admin & Prototype → Download JSON backup**. In this app, open **Admin → Data → Import JSON** and choose that file. The format is the same, so backups made here can also be re-imported. Importing replaces all sewadar data and keeps the sign-in users.

## How it works

- **Reads:** after sign-in, the browser loads `GET /api/snapshot`, which holds everything that user may see. A coordinator gets only their branch, and a supervisor only their department. Dashboard, lists, the bed board and reports are computed from it in the browser, as in the prototype.
- **Writes:** each action calls its own endpoint, for example `POST /api/regs/:id/checkin` or `POST /api/regs/:id/bed/transfer`. The server checks the role's page access (view/edit), the user's scope and the business rules before saving. These rules include: a bed is never booked twice for overlapping dates; only approved members can be checked in; one live request per member per date range; and items in use cannot be deleted. The browser then reloads the snapshot.
- **IDs:** records keep the prototype's readable IDs (`NM-0001`, `PR-0001`, `BR001`, `BD001` …), issued from a counters collection.
- **Write lock:** writes are processed one at a time so the overlap checks are race-free. Run a **single server process**. Scaling out needs MongoDB transactions (replica set) in `server/src/services/domain.js`.
- **Time zone:** every date ("today", arrivals, attendance) uses `TZ` from `.env` (default `Asia/Kolkata`).

### Main API routes

| Area | Routes |
|---|---|
| Auth | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/password`, `GET /api/snapshot` |
| Members / branches | `POST/PUT/DELETE /api/members[/:id]`, `POST/PUT/DELETE /api/branches[/:id]` (`?moveTo=` on delete) |
| Visits | `POST/PUT/DELETE /api/regs[/:id]`, `/:id/submit · withdraw · reopen · cancel · extension-request` |
| Approvals | `/:id/approve · reject · revert · reconsider · extension-decision` |
| Reception | `/:id/checkin · checkout · undo-checkin · undo-checkout` |
| Beds & sewa | `/:id/bed`, `/:id/bed/transfer`, `/:id/bed/release`, `/:id/extend`, `/:id/duty`, `/:id/duty/end` |
| Structure | `/api/accommodation/sites · buildings · buildings/:id/floors · rooms · rooms/:id/beds · beds/:id`, `DELETE /api/accommodation/:kind/:id` |
| Departments | `/api/depts`, `DELETE /api/duties/:id`, `POST /api/attendance`, `POST /api/attendance/mark-all` |
| Admin (Super Admin) | `/api/admin/users`, `/perms`, `/lists/:k`, `/export`, `/import`, `/reset-sample`, `/clear-people`, `/clear-all` |

## Known limits

- The snapshot sends all of a user's visible records at once. That suits a single ashram's volume (thousands of records). For much larger data, move lists and reports to paginated server-side queries.
- Member photos are stored in MongoDB as small JPEG data URLs (max 240 px), as in the prototype.
