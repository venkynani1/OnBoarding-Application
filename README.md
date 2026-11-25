# Onboard Goodies

Goodie distribution for newly onboarded employees — same desk flow as the Gen AI Designathon app.

- **/admin** — organizer console: import the onboarded Excel (Emp ID, Emp Name, Onboarded Date, Onboarded Location), see collected / pending by location and date, change the desk PIN, download the report.
- **/desk** — distributors sign in with their name + desk PIN. One device shows the QR; every distributor shares the live queue and taps **Collected**.
- **/collect** — what the QR opens. Participant enters their employee ID; if they're on the list they see **"Collection pending"** and join the desk queue; the phone flips to **Collected** when the desk taps it.

## Setup
1. Connect a Neon database to the Vercel project (Storage tab). It adds `NEON_DATABASE_URL` etc.
2. Add `ADMIN_PASSWORD` and `SESSION_SECRET` (see `.env.example`).
3. Deploy. Every build runs `scripts/migrate.mjs`, which creates the tables from `db/schema.sql` (safe to re-run).

Hosting: Vercel project `on-boarding-application` (region bom1) with its own Neon database.
