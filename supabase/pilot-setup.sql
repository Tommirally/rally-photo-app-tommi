-- =====================================================================
-- MANUAL EVENT SETUP for the pilot.
-- Paste into Supabase → SQL Editor → New query, edit the values marked
-- EDIT, then click Run. Safe to re-run: existing rows are left as they are.
--
-- Before this: create each photographer's login in
-- Authentication → Users → Add user → Create new user (tick Auto Confirm).
-- =====================================================================

-- 1. The event. It starts as a DRAFT (not visible to the public).
insert into public.events (slug, name, sport, entry_label, location_label, organiser, venue, start_date, end_date)
values (
  'example-stages-2026',          -- EDIT: web address, lower-case-with-dashes
  'Example Stages Rally 2026',    -- EDIT: event name
  'rally', 'Car', 'Stage',
  'Example Motor Club',           -- EDIT: organiser
  'Example Forest',               -- EDIT: venue
  '2026-03-14', '2026-03-14'      -- EDIT: start and end dates
)
on conflict (slug) do nothing;

-- 2. The entry list. Numbers are TEXT exactly as on the car: '32', '032'
--    and '320' are different cars. Use capitals and no spaces ('H12').
insert into public.entries (event_id, number, competitors, vehicle, class_name)
select e.id, v.number, v.competitors, v.vehicle, v.class_name
from public.events e
cross join (values
  -- EDIT: one line per car
  ('1',   array['Driver One', 'Co-driver One'],     'Ford Escort Mk2',          'Historic'),
  ('32',  array['Driver Two', 'Co-driver Two'],     'Mitsubishi Lancer Evo IX', 'Class 4'),
  ('032', array['Driver Three', 'Co-driver Three'], 'Peugeot 208 Rally4',       'Class 3'),
  ('320', array['Driver Four', 'Co-driver Four'],   'Ford Fiesta R2',           'Class 2')
) as v(number, competitors, vehicle, class_name)
where e.slug = 'example-stages-2026'   -- EDIT: same slug as step 1
on conflict (event_id, number) do nothing;

-- 3. A photographer profile, linked to the login from Authentication → Users.
--    Repeat this block for each photographer.
insert into public.photographers (user_id, slug, display_name, credit, website)
select u.id,
  'fern-hollow',                            -- EDIT: short id, lower-case-with-dashes
  'Fern Hollow Photography',                -- EDIT: name shown on photos
  '© Fern Hollow Photography',              -- EDIT: credit line shown on every photo
  null                                      -- EDIT: website, or leave null
from auth.users u
where u.email = 'photographer@example.com'  -- EDIT: the login's email
on conflict (slug) do nothing;

-- 4. Approve the photographer at the event (use 'suspended' to pause them).
insert into public.event_photographers (event_id, photographer_id, status)
select e.id, p.id, 'approved'
from public.events e, public.photographers p
where e.slug = 'example-stages-2026'   -- EDIT
  and p.slug = 'fern-hollow'           -- EDIT
on conflict (event_id, photographer_id) do update set status = excluded.status;

-- 5. When photos are ready, make the gallery public (run this line on its own):
-- update public.events set is_public = true where slug = 'example-stages-2026';

-- Check what you have:
select e.slug, e.is_public, count(distinct en.id) as entries, count(distinct ep.photographer_id) as photographers
from public.events e
left join public.entries en on en.event_id = e.id
left join public.event_photographers ep on ep.event_id = e.id and ep.status = 'approved'
group by e.slug, e.is_public;
