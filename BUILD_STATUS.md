# Build status

_Last updated: 11 November 2026. Read this together with [PRODUCT_BRIEF.md](./PRODUCT_BRIEF.md)._
_Any new session should start by reading both files._

## Where we are

**The pilot is live** at https://rally-photo-app-tommi.vercel.app, using
Supabase and Cloudflare R2.
- The test event `malton-forest-rally-2026` is public.
- The owner is set up as a photographer. Uploading, tagging car 32 and
  publishing all work.

**Now building milestone 1b** (PRODUCT_BRIEF.md): the admin area and an easier
photographer workflow.

### Plan progress
- [x] 1. Admin: events and CSV entry lists (plus auto-publish on upload): built and tested locally, needs the live check below
- [x] 2. Admin: photographer invites and approvals: built, needs the live check below. "Create login now" works without email. Email invites and "Forgot password" need custom SMTP plus a Redirect URL (README)
- [ ] 3. Upload: drag and drop, resize in the browser, overall progress, default price
- [ ] 4. Tagging mode: one at a time, same as last, burst select

## Lessons from live setup (11 Nov)
- **Uploads failed with "Network error while uploading"** because the R2 bucket
  had no CORS policy. It was fixed by adding the policy in Cloudflare → R2 →
  rally-photos → Settings → CORS Policy, with `AllowedOrigins`
  `https://rally-photo-app-tommi.vercel.app`. PR #3 makes the upload page show
  the exact address to allow.
  - A CORS check can be run from a cloud session with
    `curl -X OPTIONS https://<account-id>.r2.cloudflarestorage.com/rally-photos/x.jpg -H "Origin: https://rally-photo-app-tommi.vercel.app" -H "Access-Control-Request-Method: PUT"`.
    A 204 response with Access-Control-Allow-Origin means it's OK.
  - Cloud sessions cannot open *.vercel.app; the network policy blocks it.
- **Tagging said "Not on the entry list"** because the event had no entries.
  The `pilot-setup.sql` entry step didn't take effect. A multi-line SQL paste
  failed for the owner, while a one-line insert worked. This is why admin forms
  replace SQL (milestone 1b).
- The owner should not have to run SQL for routine work. Any future **schema
  change** needs a migration the owner can apply without hand-editing SQL.
  Prefer changes that need no migration, or automate migrations on deploy.

## Tested earlier (milestone 1, all passing)
- **Unit tests:** 25.
- **Database permission and search tests:** 44, on Postgres with Supabase roles.
- **Upload tests:** 12, against an R2 emulator.
- **Phone browser tests:** 16.
- **Commands:** `npm test`, `npm run test:integration`, `npm run build && npm run test:e2e`.
  See the README.

## Live check for step 1 (after merging and adding `ADMIN_EMAILS` in Vercel)
- [ ] `/admin` asks you to sign in, then lists the events. Any other account sees "isn't an admin account".
- [ ] **+ New event** creates a draft with a web address made from the name.
- [ ] Upload the organiser's CSV: the preview shows the cars. Duplicates or blank numbers block saving; 32/032 shows a warning.
- [ ] **Save N cars**: the entry table shows them, and tagging those numbers works for photographers.
- [ ] **Make gallery public** and **Copy link**: the link opens the public gallery.
- [ ] A newly uploaded photo appears in the public gallery straight away, before tagging.

## Live check for step 2
- [ ] Admin event page → add a new photographer with **Create login now** → copy the message, then sign in as them in a private window: the event appears under My events.
- [ ] **Pause** them: their workspace says not approved. **Approve** again: it works.
- [ ] A photographer from another event appears in "Add someone you've worked with" and can be added.
- [ ] (After SMTP is set up) **Email invite** arrives; the link opens "Set your password"; after saving, My events opens.
- [ ] (After SMTP is set up) "Forgot password?" on the sign-in page sends a working reset link.

## Exact next step
Merge PR #3 and add `ADMIN_EMAILS` in Vercel, then do the live checks for steps 1–2. After that, build step 3 (upload improvements).
