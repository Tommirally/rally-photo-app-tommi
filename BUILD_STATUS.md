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
- [ ] 1. Admin: events and CSV entry lists (plus auto-publish on upload)
- [ ] 2. Admin: photographer invites and approvals
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

## Exact next step
Continue the plan above from the first unticked item.
