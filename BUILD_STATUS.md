# Build status

_Checkpoint: 11 November 2026. Read this together with [PRODUCT_BRIEF.md](./PRODUCT_BRIEF.md)._

## Where we are

- **Milestone 0** (sample gallery) is merged.
- **Milestone 1** (week-one pilot) is **built and tested locally**. It needs live
  Supabase, R2 and Vercel settings before anyone can use it. See README →
  "Connect Supabase and Cloudflare R2".

## What was tested in the cloud session (all passing)

| Area | How | Result |
|---|---|---|
| Typecheck and production build | `npm run typecheck`, `npm run build` | ✅ |
| Secret keys stay server-side | Built with dummy secrets and searched the browser bundle: no Supabase secret or R2 keys; only the public key is present | ✅ |
| Search, file checks, JPEG reader, retry logic | `npm test`: 25 unit tests | ✅ |
| Database permissions and search | `npm run test:integration`: 44 tests on real Postgres 16 with Supabase's roles. Cast: photographers A and B, a pending photographer, a suspended photographer, a signed-in non-photographer, an anonymous visitor and the service role | ✅ |
| R2 uploads | Same command: 12 tests against an S3-compatible emulator over real HTTP (signed PUT, verification, limits, retries) | ✅ |
| Phone search | `npm run test:e2e`: 8 tests × 2 phones (iPhone 13 and Pixel 7 sizes) on the demo event | ✅ |
| Manual setup SQL | `supabase/pilot-setup.sql` ran twice on a fresh database without errors | ✅ |

Highlights of what the tests prove:
- **32 / 032 / 320**:
  - Searching 32 returns only car 32's published photos, from both photographers.
  - 032 and 320 return only their own car.
  - 3, 03, 20, 0032 and 3200 return nothing.
  - Car numbers are scoped to their event.
- **Only confirmed tags on published photos are public**:
  - An unpublished photo tagged 32 stays hidden, even from a signed-in photographer using public search.
  - Pending suggestions are hidden.
  - An accepted suggestion becomes searchable; a rejected one does not.
- **Photographer isolation**:
  - B cannot see A's private photos or batches.
  - B cannot tag, untag, publish, unpublish, re-price or edit A's photos.
  - Pending and suspended photographers cannot upload, tag or publish.
  - Nobody but the service role can mark an upload verified.
  - Nobody can change a photo's R2 key.
- **Anonymous visitors**:
  - Cannot see draft events, private photos, upload batches, suggestions or photographers' login IDs.
  - Cannot write anything.
- **Upload limits**:
  - The browser, the database and the server all enforce them: ≤ 4 MB, JPEG only, 600–3000 px long edge, ≤ 100 files per upload.
  - The server rejects and deletes oversized, mismatched-size, non-JPEG, too-wide and too-small files.
- **Retries**:
  - Uploads survive dropped connections, a 500 error and an expired link (it fetches a fresh one).
  - The upload gives up after 4 tries and shows a **Retry failed** button.
- **Capture time**:
  - The EXIF capture time is stored, using the camera's offset when present.
  - Without an offset, the event's time zone is used (GMT or BST handled correctly).
  - Batch and sequence numbers are stored.

### Not tested here (and why)

The cloud session could not run the real Supabase API (PostgREST and Supabase
Auth). Docker images couldn't be pulled, and downloading the binaries was
blocked. So these were **not exercised end to end**:
- The app talking to a real Supabase project: sign-in, the API routes, the
  photographer pages and the bulk-action buttons.
- The browser upload screen itself. Its retry logic is tested, but not the
  screen in a real browser.
- Real Cloudflare R2. The emulator does not check signatures or CORS.

These need the live checklist below.

## Live checklist (after setup, on the Vercel address)

Tick each box after doing it on a real phone or computer.

**Setup**
- [ ] The migration ran in Supabase SQL Editor without errors.
- [ ] Public sign-ups are off. Two photographer logins exist (A and B).
- [ ] `pilot-setup.sql` has been run, approving A and B for one test event. The event is still a draft.
- [ ] All Vercel environment variables are set and the app has been redeployed.

**Photographer A (computer)**
- [ ] Signing in at `/login` works. "My events" shows the test event.
- [ ] Upload 5 or more web-sized JPEGs. Each one shows "Done", and thumbnails appear.
- [ ] Upload a 6 MB JPEG: it is refused before uploading with "Too large".
- [ ] Upload a full-size camera JPEG under 4 MB but over 3000 px: it is "Rejected" with the pixel size.
- [ ] Upload a PNG: it is refused as "Not a JPEG".
- [ ] **Retry:** start an upload of about 20 photos, switch Wi-Fi off for 5 seconds, then back on. They finish, or **Retry failed** completes them.
- [ ] Photos taken on a camera show a capture time on their card.
- [ ] Select 3 photos, type `32`, then **Add tags**. Tag one photo `032` and one `320`. Then type `999` → "Not on the entry list: 999".
- [ ] **Publish** two of the car-32 photos. Leave one 32 photo private.
- [ ] Set a price of `7.50` on the selection: the cards show £7.50.

**Photographer B (another browser or private window)**
- [ ] B uploads 2 photos, tags `32` and publishes them.
- [ ] B's workspace shows none of A's photos.

**Make it public**, then as an anonymous visitor on a phone:
- [ ] Run `update public.events set is_public = true where slug = '…';`.
- [ ] Open `/events/<slug>`, search `32`. Only A's two published 32 photos and B's two appear. A's private one does not. Credits show both photographers.
- [ ] Search `032`, then `320`: each shows only its own car. Search `3`: "No car 3 at this event".
- [ ] **Share this link** opens the phone's share sheet with `?car=32` in the address. Opening that link on another phone shows the same results.
- [ ] Before making the event public, `/events/<slug>` showed "not found".

**Storage**
- [ ] In Cloudflare R2 → `rally-photos`, objects are under `events/<event-id>/photographers/<photographer-id>/photos/<photo-id>.jpg`.
- [ ] Bucket **Public access** is disabled, and photos still show in the gallery through signed links.

## Exact next step

**Do the setup in README → "Connect Supabase and Cloudflare R2", then work
through the live checklist above.** If something fails, note which box and the
message shown, and bring it back to a session.

## After the pilot

1. **Paid downloads.** One photographer per checkout. Release the private
   original only after verified payment. The commission rate is still undecided.
2. **Assisted-tagging test** on about 200 hand-labelled rally photos. Suggestions
   go to `tag_suggestions` only.
