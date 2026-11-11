# Build status

_Checkpoint: 11 November 2026. Read this together with [PRODUCT_BRIEF.md](./PRODUCT_BRIEF.md)._

## Where we are

Milestone 0 is complete and merged into `main`
([PR #1](https://github.com/Tommirally/rally-photo-app-tommi/pull/1)). This is
the shareable sample gallery that uses fictional demo data.

## What works (tested)

| Check | How it was tested | Result |
|---|---|---|
| Production build (`npm run build`) | Cloud session | ✅ Pass |
| Typecheck (`npm run typecheck`) | Cloud session | ✅ Pass |
| Search logic, 10 tests (`npm test`) | Vitest | ✅ Pass |
| Searching **32** shows only car 32: 4 photos from **both** photographers | Playwright, iPhone 13 size, production server | ✅ Pass |
| `?car=032` and `?car=320` each show only their own car | Playwright | ✅ Pass |
| No partial matches: 3, 03, 20 and 999 show "no results" | Playwright | ✅ Pass |
| The search is saved in the page address (`?car=32`), and a shared link opens straight to the results | Playwright | ✅ Pass |
| Tapping a car-number chip filters the gallery | Playwright | ✅ Pass |
| A photo tagged with two cars (7 and 15) shows up under each car | Unit test and Playwright | ✅ Pass |
| Search works with JavaScript turned off | Playwright | ✅ Pass |
| No sideways scrolling on a phone | Playwright | ✅ Pass |
| Demo-data banner, photographer credits and "demo price" labels are visible | Playwright and screenshot review | ✅ Pass |
| An unknown event address shows a 404 page | curl | ✅ Pass |

## Still needs testing

- [ ] **Vercel deployment:** not confirmed yet. The app has not been checked on a live Vercel address.
- [ ] **A real phone:** open the live link on an iPhone and on an Android phone.
- [ ] **"Share this link" button:** the phone's share menu opens, and the copy-to-clipboard fallback works on a desktop browser. Neither has been checked by hand.
- [ ] **Dark mode:** the colours are defined but have not been reviewed on a device.
- [ ] **Link previews:** check how the link looks when pasted into WhatsApp or Facebook. There is no preview image yet, only a title and description.
- [ ] **Real people:** has not been tried with real competitors or an organiser yet. That is the goal of the pilot.

## Exact next step

**Deploy `main` to Vercel and open it on your phone.**

1. Go to https://vercel.com and click **Sign Up → Continue with GitHub**.
2. Click **Add New… → Project**. Next to **rally-photo-app-tommi**, click **Import**.
3. Leave every setting as it is and click **Deploy**.
4. Copy the address under **Domains**. On your phone, open
   `https://<that-address>/events/demo-forest-stages-2026?car=32`
5. Tick the first two boxes under "Still needs testing" above.

## After that: week-one pilot (see PRODUCT_BRIEF.md)

1. Create a Supabase project and move the demo data model into tables.
2. Add photographer logins with Supabase Auth.
3. Create a Cloudflare R2 bucket and add photographer uploads: private
   originals, with public previews.
4. Add measurement for two questions: did competitors find their car, and did
   the organiser share the link?
