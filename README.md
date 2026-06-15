# RSP Attendance — PWA (Supabase Version)

Production-ready attendance system for Rourkela Steel Plant vocational trainees, migrated to **Supabase**.

---

## 📁 Project Structure

```
rsp-attendance/
├── index.html           ← Single-page app (all 5 screens)
├── styles.css           ← Complete UI styles
├── app.js               ← All client-side logic (Supabase client CRUD)
├── supabase.js          ← Supabase client initialization (fill in your URL and Anon Key)
├── supabase-setup.sql   ← Database schema, constraints, RLS, and triggers
├── .env.example         ← Template for API keys
├── manifest.json        ← PWA manifest
├── service-worker.js    ← Offline caching & API requests bypassing
├── package.json         ← Dev scripts and package configurations
├── icons/               ← PWA icons
│   ├── icon-72.png
│   ├── icon-96.png
│   └── ... (all sizes)
└── admin/
    ├── dashboard.html
    ├── dashboard.js     ← Admin dashboard (Supabase filters + client CSV export)
    └── dashboard.css
```

---

## 🚀 Setup & Deployment

### Step 1 — Create Supabase Project

1. Go to https://database.new and create a new project.
2. Once active, go to the **SQL Editor** tab.
3. Copy the entire contents of [supabase-setup.sql](file:///c:/Users/001YXR744/Downloads/rsp_attendance_comp/supabase-setup.sql) and paste them into the SQL Editor.
4. Click **Run** to create the tables (`trainees`, `attendance`), indexes, RLS policies, and the user signup trigger.

### Step 2 — Configure API keys

1. Go to **Project Settings → API** in your Supabase dashboard.
2. Find your **Project URL** and **Anon API Key**.
3. Edit [supabase.js](file:///c:/Users/001YXR744/Downloads/rsp_attendance_comp/supabase.js) and fill in your actual values:
   ```javascript
   const SUPABASE_URL = "https://your-project-id.supabase.co";
   const SUPABASE_ANON_KEY = "your-anon-public-api-key-here";
   ```
4. Copy `.env.example` to `.env` and fill it in for your environment reference.

### Step 3 — Set Admin Role (one-time)

To access the admin dashboard, create your admin user under **Authentication → Users** in the Supabase Dashboard first. Then execute the following query in the **SQL Editor** to assign the `admin` role metadata:

```sql
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
WHERE email = 'admin@rsp.gov.in'; -- Replace with your actual admin email
```

---

## 🖨️ QR Code Generation

Generate the permanent QR code with this JSON content:

```json
{"qrId":"RSP_ATTENDANCE"}
```

**Recommended:** Use https://qrcode-monkey.com
- Content: `{"qrId":"RSP_ATTENDANCE"}`
- Size: at least 300×300px
- Error correction: **H** (30% — highest, best for laminated prints)
- Print on A4, laminate, and post at the training center entrance

---

## ⏰ Session Windows (IST)

| Session | Window           |
|---------|-----------------|
| Morning | 9:00 AM – 9:30 AM |
| Midday  | 11:45 AM – 12:00 PM |

---

## 📍 GPS Parameters

| Parameter | Value |
|-----------|-------|
| RSP Latitude | 22.2235 |
| RSP Longitude | 84.8662 |
| Allowed radius | 200 metres |
| Max GPS accuracy | 50 metres |

---

## 🔒 Security

* **Database Constraints**: Session windows must be `MORNING` or `MIDDAY`. Distance must be $\le$ 200m and GPS accuracy $\le$ 50m.
* **Row Level Security (RLS)**:
  * Trainees can insert their profile only on their own UID.
  * Trainees can read and update only their own profile details.
  * Attendance records can be read only by the user who submitted them (`uid = auth.uid()`) or an account with `role: admin` in their JWT app metadata.
  * Duplicate submissions on the same date/session/ID are blocked via the primary key index (`YYYY-MM-DD_SESSION_traineeId`).

---

## 🛠️ Local Development & Running

Run the following commands in the project root:

```bash
# 1. Install local server dependencies
npm install

# 2. Start local PWA development server
npm run dev
```

Open your browser at the displayed local port (e.g. `http://localhost:3000` or whatever address `serve` outputs).

---

## 📱 PWA Features & Offline Persistence

* **Android:** Auto "Add to Home Screen" install banner.
* **iOS:** Step-by-step Safari installation guide modal.
* **Offline Caching:** Service worker caches all static UI files and assets.
* **Offline Queueing:** If a trainee submits attendance while offline or during a network failure, the application will queue the record in `localStorage` and register a Service Worker background sync event (`sync-attendance`). The records will automatically upload to Supabase when connection is restored.
