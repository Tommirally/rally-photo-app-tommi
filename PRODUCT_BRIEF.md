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
| **Photo** | Belongs to one event and one photographer. Has the photographer's price in pence (GBP), a credit and a location (stage). |
| **Photo tag** | Many-to-many `photo_tags (photo_id, entry_id)`. One photo can show several entries. |

Search rule: the competitor's input is trimmed and upper-cased, then matched
**exactly** against `entries.number` within the event. There are no prefix,
partial or numeric matches.

Sketch of the planned Supabase (Postgres) tables:

```sql
events(id, slug unique, name, sport, entry_label, location_label, organiser, venue, start_date, end_date)
photographers(id, user_id → auth.users, slug unique, display_name, credit, website)
event_photographers(event_id, photographer_id, primary key (event_id, photographer_id))
entries(id, event_id, number text, competitors text[], vehicle, class_name, unique (event_id, number))
photos(id, event_id, photographer_id, location, taken_at, price_pence int,
       preview_key text,   -- R2 object key, public/watermarked
       original_key text,  -- R2 object key, PRIVATE, released only after verified payment
       created_at)
photo_tags(photo_id, entry_id, primary key (photo_id, entry_id))
```

The code types live in `src/lib/types.ts` and mirror these tables.

## Tech choices

- **Next.js + TypeScript** (App Router), deployed on **Vercel**.
- **Supabase** for the database and login (from the pilot onwards).
- **Cloudflare R2** for **every real photo upload**. Originals go in a private
  bucket and previews are served publicly. Use signed URLs for downloads.

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

### 1. Week-one pilot
- Photographer **logins** (Supabase Auth).
- Photographer **uploads** to **Cloudflare R2**. A photographer creates or joins
  an event, uploads photos, sets prices, and tags entries by hand.
- Move the demo data model into Supabase tables (as above). The gallery reads
  from Supabase.
- **Measure:**
  - Can competitors **find their car**? Track the search → results rate,
    "no results" searches, and time to the first photo view.
  - Will an **organiser share the link**? Track whether the event link is posted
    or shared, visits per event and their referrers, and share-button taps.
- No checkout yet. "Buy" stays disabled.

### 2. After the pilot (scheduled, not started)
- **Checkout**: one photographer per checkout. Release the original only after
  verified payment. Take the platform commission (rate still to be decided).
- **Payouts** to photographers.
- **Packs** (several photos at one price).
- **Automated tagging** (car-number recognition) to help photographers tag.

## Open questions
- Commission rate.
- Payment provider and payout mechanism (for example, a Connect-style
  marketplace).
- How organisers publish the entry list (CSV upload, or photographers typing it
  in).
- Watermark and preview resolution policy.
