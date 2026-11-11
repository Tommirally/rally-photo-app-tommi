# Product brief – event photo marketplace

_Read this first in any new session. It is the source of truth for what we are
building and in what order. Update it when a decision changes._

## Problem

UK club rally competitors hunt for photos of their car across separate Facebook
albums and message each photographer individually. Photographers lose sales,
and competitors miss photos.

## Product

A marketplace for event photos, starting with **UK club rallying**.

- The **organiser** shares **one event link**.
- A **competitor** opens it, types their **car number**, and sees photos of
  their car from **every photographer** at that event.
- **Photographers** upload and credit their own work and **set their own prices**.

## Commercial model

- Paid **digital downloads**. A competitor buys a single photo now, and a
  **pack** later.
- The platform takes a **commission on completed sales**. **The commission rate
  is undecided.** Do not hard-code one; keep it configurable.
- First sales version: **one photographer per checkout** (no multi-photographer
  basket yet).
- The **private high-resolution original** is released **only after verified
  payment** (for example, a payment-provider webhook, not a client redirect).
  Public galleries only ever see watermarked or low-resolution previews.

## Domain model (keep these distinct)

| Concept | Notes |
|---|---|
| **Event** | Sport-agnostic. Has `sport` (e.g. `rally`), `entry_label` ("Car", "Bike", "Runner") and `location_label` ("Stage"), so it also works for other numbered sports later. |
| **Photographer** | Independent account. Works across many events. |
| **Event ↔ Photographer** | Many-to-many join (`event_photographers`). An event has many photographers. |
| **Entry** | One numbered competitor at one event. `number` is **text**, scoped to its event: unique on `(event_id, number)`. `32`, `032` and `320` are **different** entries. Never cast to an integer and never strip leading zeros. |
| **Upload batch** | One upload session by one photographer at one event. Photos keep their **sequence** within the batch (camera file order). |
| **Photo** | Belongs to one event, one photographer and one batch. Has a **stable R2 object key** (`events/<event>/photographers/<photographer>/photos/<photo>.jpg`, set once from ids and never changed), the photographer's price in pence (GBP), the capture time from EXIF where available, an upload status (`pending` → `ready` or `rejected`) and a publish time. |
| **Photo tag (confirmed)** | Many-to-many `photo_tags (photo_id, entry_id)`. One photo can show several entries. A tag can only point at an entry from the photo's own event. **Only confirmed tags on published photos are searchable publicly.** |
| **Tag suggestion** | Separate table `tag_suggestions`, for future number recognition and same-car burst suggestions. It has a source, confidence, model version and related photo. It never appears publicly. A photographer accepts it, which creates a confirmed tag, or rejects it. |

Search rule: spaces are removed from the competitor's input and letters are
upper-cased, then it is matched **exactly** against `entries.number` within the
event. There are no prefix, partial or numeric matches. The rule is implemented
in both `normaliseEntryNumber` (TypeScript) and `public.normalise_entry_number`
(SQL).

The schema lives in `supabase/migrations/`. Membership (`event_photographers.status`)
is `pending`, `approved` or `suspended`. Only `approved` photographers can
upload, tag or publish.

The pilot stores **web-sized JPEGs only**: up to 4 MB, 600–3000 px on the long
edge, and 100 per upload. These are what the gallery shows. **Private
high-resolution originals** for paid downloads are a separate object per photo,
added in the sales milestone.

## Tech choices

- **Next.js + TypeScript** (App Router), deployed on **Vercel**.
- **Supabase** for the database and login (from the pilot onwards).
- **Cloudflare R2** for **every real photo upload**. Browsers upload straight to
  R2 with short-lived signed URLs. The bucket is private, and the gallery shows
  images through signed view URLs. Secrets stay server-side.

## Milestones

### 0. Shareable sample gallery – _done in this repo_
- One phone-friendly rally event gallery using fictional demo data.
- Two fictional photographers with credits and illustrative GBP prices, all
  clearly labelled as demo data.
- Prominent car-number search. The filter is in the URL (`?car=32`) so results
  can be shared.
- Entries 32, 032 and 320 are seeded separately. Searching 32 shows only car 32,
  with photos from both photographers.
- Data lives in `src/lib/demo-data.ts`, and the query logic in `src/lib/gallery.ts`.

### 1. Week-one pilot – _built, needs live setup (see BUILD_STATUS.md)_
- Photographer **logins** (Supabase Auth, email and password). Accounts are
  created by the organiser, and public sign-up is off.
- **Event setup is manual**: the organiser runs `supabase/pilot-setup.sql` in
  the Supabase SQL Editor (event, entry list, photographers, approval).
- Photographer **uploads** go directly to **Cloudflare R2** with retries, then
  are verified on the server. Photographers **bulk-tag** car numbers, **publish**
  previews and set prices.
- The public gallery reads from Supabase. The demo event still works without
  setup.
- **Measure:**
  - Can competitors **find their car**? Track the search → results rate,
    "no results" searches, and time to the first photo view.
  - Will an **organiser share the link**? Track whether the event link is posted
    or shared, visits per event and their referrers, and share-button taps.
- No checkout yet. "Buy" stays disabled.

### 2. After the pilot (scheduled, not started). Next features, in order:
1. **Paid downloads.** One photographer per checkout. Release the private
   high-resolution original only after verified payment (webhook). Take the
   platform commission (rate still to be decided).
2. **Assisted-tagging test** on about **200 hand-labelled rally photos**:
   - Measure number-recognition and same-car burst suggestions against the hand
     labels (precision and recall, with 32 / 032 / 320-style confusions counted
     separately).
   - Write suggestions into `tag_suggestions`, never straight into confirmed tags.
   - Capture time, batch and sequence are already stored for burst grouping.

Later:
- **Payouts** to photographers.
- **Packs** (several photos at one price).

## Open questions
- Commission rate.
- Payment provider and payout mechanism (for example, a Connect-style
  marketplace).
- How organisers publish the entry list (CSV upload, or photographers typing it
  in).
- Watermark and preview resolution policy.
