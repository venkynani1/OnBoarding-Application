# Onboard Goodies

Goodie distribution for newly onboarded employees — same desk flow as the Gen AI Designathon app.

- **/admin** — organizer console: import the onboarded Excel (Emp ID, Emp Name, Onboarded Date, Onboarded Location), see collected / pending by location and date, change the desk PIN, download the report.
- **/desk** — distributors sign in with their name + desk PIN. One device shows the QR; every distributor shares the live queue and taps **Collected**.
- **/collect** — what the QR opens. Participant enters their employee ID; if they're on the list they see **"Collection pending"** and join the desk queue; the phone flips to **Collected** when the desk taps it.

## Setup
1. Run `db/schema.sql` on the database, and create a login role `onboard_app` with access to schema `onboard` only.
2. Environment variables (see `.env.example`): `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`.
3. `npm install && npm run build`.

Database: its own Supabase project (`onboard-goodies`, Mumbai). Hosting: Vercel project `onboard-goodies` (region bom1).
