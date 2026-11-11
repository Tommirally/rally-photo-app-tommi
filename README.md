# Rally Photos

One shareable event link where competitors find photos of their car from every
photographer. It starts with UK club rallying.

- **[PRODUCT_BRIEF.md](./PRODUCT_BRIEF.md)** covers what we're building and why, the data model and the milestones.
- **[BUILD_STATUS.md](./BUILD_STATUS.md)** covers what works, what still needs testing and the next step.

## What's in the app

| Page | Who | What |
|---|---|---|
| `/` | Everyone | List of public events (plus the demo event) |
| `/events/<slug>?car=32` | Everyone | Event gallery with car-number search. The `?car=` part makes results shareable |
| `/events/demo-forest-stages-2026` | Everyone | Sample gallery using fictional data. It works without any setup |
| `/login` | Photographers | Email and password sign-in |
| `/photographer` | Photographers | My events |
| `/photographer/events/<id>` | Approved photographers | Upload, bulk-tag, publish and price photos |
| `/admin` | The owner (emails in `ADMIN_EMAILS`) | Create events, upload entry lists (CSV), make galleries public, see progress |

**How uploads work.** The browser asks our server for a signed upload link and
sends the JPEG **straight to Cloudflare R2**. The server then opens the file in
R2 and checks it is a real JPEG of the right size and dimensions. It also reads
the camera's capture time. Only after those checks is the photo marked ready.
Photos stay private until the photographer publishes them.

**What the public sees.** Public search shows only **confirmed** tags on
**published** photos at **public** events. Suggested tags (future number
recognition and burst suggestions) are stored separately and never appear
publicly until a photographer accepts them. The database enforces all of this
with row level security; see `supabase/migrations/`.

## Connect Supabase and Cloudflare R2

You do this once. It takes about 30 minutes. Keep a text file open to paste
values into as you go. Dashboard menus change from time to time, so if a label
doesn't match exactly, look for the closest one.

### 1. Supabase project (database and logins)

1. Go to https://supabase.com/dashboard and click **New project**.
   - Name: `rally-photos`. Choose a strong database password and save it.
   - Region: **West EU (London)**, or the closest UK/EU option.
   - Click **Create new project** and wait about 2 minutes.
2. **Create the tables.** In the left sidebar, click **SQL Editor** → **New query**.
   Open `supabase/migrations/20261111120000_pilot_schema.sql` from this repo on
   GitHub, click the **Copy raw file** button, paste it into the editor and
   click **Run**. You should see "Success. No rows returned".
3. **Turn off public sign-ups.** Photographer accounts are created by you only.
   Go to **Authentication** → **Sign In / Providers** and switch off
   **Allow new users to sign up**. Click **Save**.
4. **Set the site address.** Go to **Authentication** → **URL Configuration**.
   Set **Site URL** to your Vercel address (for example
   `https://rally-photo-app-tommi.vercel.app`) and click **Save**.
5. **Copy the keys.** Click **Project Settings** (cog, bottom left):
   - **Data API** (or the **Connect** button at the top of the project page):
     copy the **Project URL**. This is `NEXT_PUBLIC_SUPABASE_URL`.
   - **API Keys**: copy the **Publishable key** (`sb_publishable_…`). This is
     `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   - **API Keys** → **Secret keys**: click **Reveal** and copy it (`sb_secret_…`).
     This is `SUPABASE_SECRET_KEY`. **Never share this one or put it in
     anything starting with `NEXT_PUBLIC_`.**
   - On an older project that only shows **Legacy API keys**, use **anon public**
     as the publishable key and **service_role** as the secret key.

### 2. Cloudflare R2 bucket (photo storage)

1. Go to https://dash.cloudflare.com → **R2 Object Storage**. If asked, add a
   payment method. The free tier covers the pilot.
2. Click **Create bucket**. Name it `rally-photos`, leave **Location** on
   Automatic, and click **Create bucket**. Leave **Public access** disabled:
   the app serves photos through short-lived signed links.
3. **Allow uploads from the website.** Open the bucket → **Settings** →
   **CORS Policy** → **Add CORS policy**. Paste the contents of
   `supabase/r2-cors.json`, replace `https://YOUR-APP.vercel.app` with your
   Vercel address, and click **Save**.
4. **Create an access key.** Go back to **R2 Object Storage** → **Manage API
   tokens** (top right, under "API") → **Create API token**:
   - Permissions: **Object Read & Write**.
   - Specify bucket(s): **Apply to specific buckets only** → `rally-photos`.
   - Click **Create API Token**. Copy the **Access Key ID** (`R2_ACCESS_KEY_ID`)
     and the **Secret Access Key** (`R2_SECRET_ACCESS_KEY`). The secret is
     shown only once.
5. Copy your **Account ID** from the R2 overview page (right-hand side). This
   is `R2_ACCOUNT_ID`. `R2_BUCKET` is `rally-photos`.

### 3. Vercel (where the app runs)

1. Open your project on https://vercel.com → **Settings** → **Environment Variables**.
2. Add each name from `.env.example` with the value you copied. Tick all three
   environments (Production, Preview, Development). Leave `R2_ENDPOINT` out
   unless you created an EU-jurisdiction bucket.
3. Go to **Deployments**, click **⋯** on the latest one → **Redeploy**. The
   `NEXT_PUBLIC_` values are built into the app, so a redeploy is required.

### 4. Run events from the admin area (no SQL)

1. In Vercel, add the setting `ADMIN_EMAILS` with your sign-in email, then
   redeploy. To allow more than one person, separate emails with commas.
2. Go to `/admin` and sign in.
3. Click **+ New event**: fill in the name, date, venue and organiser. It starts
   as a draft.
4. On the event page, under **Entry list**, choose the organiser's `.csv`. Check
   the preview, then click **Save N cars**. A template is available to download.
5. Click **Make gallery public** and **Copy link** to share it.

6. Under **Photographers and photos**, add each photographer:
   - **Someone you've worked with before:** pick them from the list and click **Add**.
   - **Someone new:** enter their email and the name shown on their photos, then choose:
     - **Create login now** (works straight away): click **Add photographer**,
       then **Copy message to send**. Text or WhatsApp them the message; the
       password is shown only once.
     - **Email them an invite:** they set their own password. This needs the
       two one-time Supabase settings below.
   - **Pause** or **Approve** a photographer at any time. Pausing stops
     uploads, tagging and publishing at that event; their live photos stay live.

`supabase/pilot-setup.sql` is no longer needed for routine work.

#### One-time settings for email invites and "Forgot password"
Supabase's built-in email only reaches members of your Supabase team, so
outside photographers need an email service:
1. Create a free account with an email provider that offers SMTP (for
   example Resend) and verify your sending domain there.
2. Supabase → **Authentication** → **Emails** → **SMTP Settings** → turn on
   **Enable Custom SMTP**, and enter the host, port, username, password and
   sender address from the provider. Click **Save**.
3. Supabase → **Authentication** → **URL Configuration** → **Redirect URLs** →
   **Add URL** → `https://rally-photo-app-tommi.vercel.app/**` → **Save**.

## Develop

```bash
npm install
cp .env.example .env.local   # then fill in values; the demo gallery works without them
npm run dev                  # http://localhost:3000
```

### Tests

```bash
npm test                  # unit tests
npm run test:integration  # database permissions and R2 uploads (local Postgres + S3 emulator)
npm run build && npm run test:e2e   # phone-sized browser tests
npm run test:all          # everything above
```

The integration tests don't need Docker. They need:
- **Postgres 16 or later** on the machine. `scripts/local-db.sh` starts a
  throwaway database on port 54322, and `tests/db/supabase-stub.sql` recreates
  Supabase's roles and `auth.uid()`.
- **Python 3.** `scripts/local-r2.sh` installs and starts moto, an
  S3-compatible emulator, on port 54340.

The JPEG test files are generated by `scripts/make-test-photos.py`.
