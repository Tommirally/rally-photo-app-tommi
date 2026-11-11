-- =====================================================================
-- Week-one pilot schema
--
-- Tables (kept distinct, see PRODUCT_BRIEF.md):
--   events, entries, photographers, event_photographers (membership),
--   upload_batches, photos, photo_tags (CONFIRMED tags only),
--   tag_suggestions (machine/burst suggestions, never shown publicly).
--
-- Event setup is manual for the pilot: events, entries, photographers and
-- memberships are written by the project owner in the Supabase SQL Editor
-- (see supabase/pilot-setup.sql). Photographers can only upload, tag and
-- publish inside events they are APPROVED for.
--
-- Upload limits live in public.upload_limits() and must match
-- src/lib/upload/limits.ts (a database test checks this).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Car numbers are TEXT. We only strip whitespace and upper-case letters.
-- Leading zeros are kept: '32', '032' and '320' are different entries.
create or replace function public.normalise_entry_number(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_raw, ''), '\s', '', 'g')), '');
$$;

create or replace function public.upload_limits()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'max_file_bytes', 4194304,      -- 4 MiB: web-sized JPEGs only
    'max_files_per_batch', 100,
    'max_long_edge_px', 3000,
    'min_long_edge_px', 600,
    'content_type', 'image/jpeg'
  );
$$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 200),
  sport text not null default 'rally',
  entry_label text not null default 'Car',
  location_label text not null default 'Stage',
  organiser text not null default '',
  venue text not null default '',
  start_date date not null,
  end_date date not null,
  -- Used to interpret camera clock times that have no UTC offset.
  timezone text not null default 'Europe/London',
  -- Draft events are invisible to the public; approved photographers can
  -- still upload to them before launch.
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  number text not null
    check (number ~ '^[A-Z0-9]{1,12}$' and number = public.normalise_entry_number(number)),
  competitors text[] not null default '{}',
  vehicle text,
  class_name text,
  created_at timestamptz not null default now(),
  unique (event_id, number),
  unique (id, event_id)
);

create table public.photographers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 1 and 120),
  credit text not null check (char_length(credit) between 1 and 160),
  website text,
  created_at timestamptz not null default now()
);

-- Membership: which photographers may work at which events.
create table public.event_photographers (
  event_id uuid not null references public.events (id) on delete cascade,
  photographer_id uuid not null references public.photographers (id) on delete cascade,
  status text not null default 'approved' check (status in ('pending', 'approved', 'suspended')),
  created_at timestamptz not null default now(),
  primary key (event_id, photographer_id)
);

create table public.upload_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  photographer_id uuid not null,
  file_count int not null check (file_count >= 1),
  created_at timestamptz not null default now(),
  foreign key (event_id, photographer_id)
    references public.event_photographers (event_id, photographer_id),
  unique (id, event_id, photographer_id)
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  photographer_id uuid not null,
  batch_id uuid not null,
  -- Position of the image within its upload batch (1, 2, 3 …), in the order
  -- the photographer's files sort by name. Used later for burst suggestions.
  sequence int not null check (sequence >= 1),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  -- Stable R2 object key, derived from immutable ids at insert time and never
  -- changed afterwards. Set by trigger; clients cannot choose it.
  object_key text not null unique,
  declared_bytes int not null check (declared_bytes > 0),
  -- Filled in by the server after it has inspected the uploaded object.
  upload_status text not null default 'pending'
    check (upload_status in ('pending', 'ready', 'rejected')),
  rejection_reason text,
  byte_size int,
  width int,
  height int,
  captured_at timestamptz,
  capture_time_source text not null default 'none'
    check (capture_time_source in ('none', 'exif_offset', 'exif_event_timezone')),
  -- Photographer-controlled fields.
  price_pence int not null default 500 check (price_pence between 0 and 100000),
  location text not null default '' check (char_length(location) <= 120),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (batch_id, event_id, photographer_id)
    references public.upload_batches (id, event_id, photographer_id),
  unique (batch_id, sequence),
  unique (id, event_id),
  check (published_at is null or upload_status = 'ready')
);

create index photos_event_public_idx on public.photos (event_id, captured_at) where published_at is not null;
create index photos_photographer_idx on public.photos (photographer_id, event_id);

-- Machine or burst suggestions. Kept apart from confirmed tags so they can
-- never leak into public search. Written by a future server-side job.
create table public.tag_suggestions (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null,
  event_id uuid not null,
  suggested_number text not null check (suggested_number ~ '^[A-Z0-9]{1,12}$'),
  -- Resolved against the entry list when the suggestion was made, if it matched.
  entry_id uuid,
  source text not null check (source in ('number_recognition', 'burst', 'other')),
  confidence real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  model_version text,
  -- For burst suggestions: the already-tagged neighbour that motivated it.
  related_photo_id uuid references public.photos (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (photo_id, event_id) references public.photos (id, event_id) on delete cascade,
  foreign key (entry_id, event_id) references public.entries (id, event_id) on delete cascade
);

create index tag_suggestions_photo_idx on public.tag_suggestions (photo_id);

-- CONFIRMED tags. Only these, on published photos, appear in public search.
create table public.photo_tags (
  photo_id uuid not null,
  entry_id uuid not null,
  event_id uuid not null,
  source text not null default 'manual' check (source in ('manual', 'suggestion')),
  suggestion_id uuid references public.tag_suggestions (id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (photo_id, entry_id),
  -- Both FKs carry event_id, so a photo can only be tagged with an entry
  -- from its own event.
  foreign key (photo_id, event_id) references public.photos (id, event_id) on delete cascade,
  foreign key (entry_id, event_id) references public.entries (id, event_id) on delete cascade
);

create index photo_tags_entry_idx on public.photo_tags (entry_id);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

create or replace function public.photos_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.object_key := format(
    'events/%s/photographers/%s/photos/%s.jpg',
    new.event_id, new.photographer_id, new.id
  );
  if new.declared_bytes > (public.upload_limits() ->> 'max_file_bytes')::int then
    raise exception 'File is larger than the upload limit' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger photos_before_insert
before insert on public.photos
for each row execute function public.photos_before_insert();

create or replace function public.photos_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.event_id is distinct from old.event_id
     or new.photographer_id is distinct from old.photographer_id
     or new.batch_id is distinct from old.batch_id
     or new.sequence is distinct from old.sequence
     or new.object_key is distinct from old.object_key
     or new.original_filename is distinct from old.original_filename
     or new.declared_bytes is distinct from old.declared_bytes then
    raise exception 'Photo identity fields cannot be changed' using errcode = 'check_violation';
  end if;
  -- The server sets the publish time; clients only say publish / unpublish.
  if new.published_at is not null and old.published_at is null then
    new.published_at := now();
  elsif new.published_at is not null and old.published_at is not null then
    new.published_at := old.published_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger photos_before_update
before update on public.photos
for each row execute function public.photos_before_update();

create or replace function public.upload_batches_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.file_count > (public.upload_limits() ->> 'max_files_per_batch')::int then
    raise exception 'Too many files in one upload batch' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger upload_batches_before_insert
before insert on public.upload_batches
for each row execute function public.upload_batches_before_insert();

-- ---------------------------------------------------------------------
-- Permission helpers (SECURITY DEFINER so policies don't recurse)
-- ---------------------------------------------------------------------

create or replace function public.current_photographer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.photographers p where p.user_id = auth.uid();
$$;

create or replace function public.is_approved_for_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_photographers ep
    join public.photographers p on p.id = ep.photographer_id
    where ep.event_id = p_event_id
      and ep.status = 'approved'
      and p.user_id = auth.uid()
  );
$$;

create or replace function public.is_event_public(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.events e where e.id = p_event_id and e.is_public);
$$;

create or replace function public.owns_photo(p_photo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.photos ph
    join public.photographers p on p.id = ph.photographer_id
    where ph.id = p_photo_id and p.user_id = auth.uid()
  );
$$;

create or replace function public.is_photo_public(p_photo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.photos ph
    join public.events e on e.id = ph.event_id
    where ph.id = p_photo_id
      and ph.published_at is not null
      and ph.upload_status = 'ready'
      and e.is_public
  );
$$;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.entries enable row level security;
alter table public.photographers enable row level security;
alter table public.event_photographers enable row level security;
alter table public.upload_batches enable row level security;
alter table public.photos enable row level security;
alter table public.photo_tags enable row level security;
alter table public.tag_suggestions enable row level security;

-- events / entries: public when the event is public; approved photographers
-- also see draft events they work at. No client writes (manual setup).
create policy events_select on public.events
  for select to anon, authenticated
  using (is_public or public.is_approved_for_event(id));

create policy entries_select on public.entries
  for select to anon, authenticated
  using (public.is_event_public(event_id) or public.is_approved_for_event(event_id));

-- photographers: a photographer sees their own profile; everyone sees
-- photographers credited at a public event.
create policy photographers_select on public.photographers
  for select to anon, authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.event_photographers ep
      where ep.photographer_id = photographers.id
        and ep.status = 'approved'
        and public.is_event_public(ep.event_id)
    )
  );

create policy event_photographers_select on public.event_photographers
  for select to anon, authenticated
  using (
    photographer_id = public.current_photographer_id()
    or (status = 'approved' and public.is_event_public(event_id))
  );

create policy upload_batches_select on public.upload_batches
  for select to authenticated
  using (photographer_id = public.current_photographer_id());

create policy upload_batches_insert on public.upload_batches
  for insert to authenticated
  with check (
    photographer_id = public.current_photographer_id()
    and public.is_approved_for_event(event_id)
  );

-- photos: the public sees published + ready photos at public events.
-- Photographers see all of their own photos.
create policy photos_select on public.photos
  for select to anon, authenticated
  using (
    photographer_id = public.current_photographer_id()
    or (published_at is not null and upload_status = 'ready' and public.is_event_public(event_id))
  );

create policy photos_insert on public.photos
  for insert to authenticated
  with check (
    photographer_id = public.current_photographer_id()
    and public.is_approved_for_event(event_id)
    and upload_status = 'pending'
    and published_at is null
  );

create policy photos_update on public.photos
  for update to authenticated
  using (photographer_id = public.current_photographer_id())
  with check (
    photographer_id = public.current_photographer_id()
    and public.is_approved_for_event(event_id)
  );

-- photo_tags (confirmed): public only for public photos.
create policy photo_tags_select on public.photo_tags
  for select to anon, authenticated
  using (public.owns_photo(photo_id) or public.is_photo_public(photo_id));

create policy photo_tags_insert on public.photo_tags
  for insert to authenticated
  with check (public.owns_photo(photo_id) and public.is_approved_for_event(event_id));

create policy photo_tags_delete on public.photo_tags
  for delete to authenticated
  using (public.owns_photo(photo_id) and public.is_approved_for_event(event_id));

-- tag_suggestions: only the owning photographer can read them. Nobody but
-- the service role writes them; review goes through review_tag_suggestion().
create policy tag_suggestions_select on public.tag_suggestions
  for select to authenticated
  using (public.owns_photo(photo_id));

-- ---------------------------------------------------------------------
-- Table privileges (explicit, so Supabase's broad defaults don't apply)
-- ---------------------------------------------------------------------

revoke all on public.events, public.entries, public.photographers, public.event_photographers,
  public.upload_batches, public.photos, public.photo_tags, public.tag_suggestions
  from anon, authenticated;

grant select on public.events, public.entries, public.event_photographers to anon, authenticated;

-- Never expose photographers.user_id to clients. (RLS still uses it.)
grant select (id, slug, display_name, credit, website, created_at) on public.photographers to anon, authenticated;

grant select on public.upload_batches to authenticated;
grant insert (event_id, photographer_id, file_count) on public.upload_batches to authenticated;

grant select on public.photos to anon, authenticated;
grant insert (event_id, photographer_id, batch_id, sequence, original_filename, declared_bytes)
  on public.photos to authenticated;
-- Photographers may only change these columns; upload status, size and
-- capture time are written by the server after inspecting the file.
grant update (price_pence, location, published_at) on public.photos to authenticated;

grant select on public.photo_tags to anon, authenticated;
grant insert (photo_id, entry_id, event_id) on public.photo_tags to authenticated;
grant delete on public.photo_tags to authenticated;

grant select on public.tag_suggestions to authenticated;

grant all on public.events, public.entries, public.photographers, public.event_photographers,
  public.upload_batches, public.photos, public.photo_tags, public.tag_suggestions
  to service_role;

-- ---------------------------------------------------------------------
-- RPC functions used by the app
-- ---------------------------------------------------------------------

-- Creates a batch and one pending photo row per file, in the given order.
-- Runs as the caller, so RLS decides whether they may upload to the event.
create or replace function public.create_upload_batch(p_event_id uuid, p_files jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_limits jsonb := public.upload_limits();
  v_photographer uuid := public.current_photographer_id();
  v_count int;
  v_batch uuid;
  v_file jsonb;
  v_seq int := 0;
  v_name text;
  v_size bigint;
  v_type text;
begin
  if v_photographer is null or not public.is_approved_for_event(p_event_id) then
    raise exception 'Not approved to upload to this event' using errcode = '42501';
  end if;
  if jsonb_typeof(p_files) <> 'array' then
    raise exception 'files must be an array' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_files);
  if v_count < 1 or v_count > (v_limits ->> 'max_files_per_batch')::int then
    raise exception 'A batch must contain between 1 and % files', v_limits ->> 'max_files_per_batch'
      using errcode = '22023';
  end if;

  -- Validate everything before writing anything.
  for v_file in select * from jsonb_array_elements(p_files) loop
    v_name := v_file ->> 'name';
    v_size := (v_file ->> 'size')::bigint;
    v_type := v_file ->> 'type';
    if v_name is null or char_length(v_name) not between 1 and 255 or v_name !~* '\.jpe?g$' then
      raise exception 'Only .jpg files can be uploaded: %', coalesce(v_name, '(no name)') using errcode = '22023';
    end if;
    if v_type is distinct from (v_limits ->> 'content_type') then
      raise exception 'Only JPEG images can be uploaded: %', v_name using errcode = '22023';
    end if;
    if v_size is null or v_size < 1 or v_size > (v_limits ->> 'max_file_bytes')::bigint then
      raise exception 'File is empty or larger than the upload limit: %', v_name using errcode = '22023';
    end if;
  end loop;

  insert into public.upload_batches (event_id, photographer_id, file_count)
  values (p_event_id, v_photographer, v_count)
  returning id into v_batch;

  for v_file in select * from jsonb_array_elements(p_files) loop
    v_seq := v_seq + 1;
    insert into public.photos (event_id, photographer_id, batch_id, sequence, original_filename, declared_bytes)
    values (p_event_id, v_photographer, v_batch, v_seq, v_file ->> 'name', (v_file ->> 'size')::int);
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch,
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', ph.id,
        'sequence', ph.sequence,
        'object_key', ph.object_key,
        'original_filename', ph.original_filename,
        'declared_bytes', ph.declared_bytes
      ) order by ph.sequence), '[]'::jsonb)
      from public.photos ph where ph.batch_id = v_batch
    )
  );
end;
$$;

-- Called by the server (service role) after it has inspected the object in R2.
create or replace function public.finalize_photo_upload(
  p_photo_id uuid,
  p_accept boolean,
  p_byte_size int,
  p_width int,
  p_height int,
  p_exif_datetime text,
  p_exif_offset text,
  p_rejection_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.photos;
  v_tz text;
  v_local timestamp;
  v_captured timestamptz;
  v_source text := 'none';
begin
  select * into v_photo from public.photos where id = p_photo_id for update;
  if not found then
    raise exception 'Photo not found' using errcode = 'P0002';
  end if;
  if v_photo.upload_status <> 'pending' then
    return jsonb_build_object('upload_status', v_photo.upload_status, 'rejection_reason', v_photo.rejection_reason);
  end if;

  if not p_accept then
    update public.photos
      set upload_status = 'rejected', rejection_reason = left(coalesce(p_rejection_reason, 'Rejected'), 300)
      where id = p_photo_id;
    return jsonb_build_object('upload_status', 'rejected', 'rejection_reason', p_rejection_reason);
  end if;

  if p_exif_datetime ~ '^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$' then
    begin
      v_local := to_timestamp(p_exif_datetime, 'YYYY:MM:DD HH24:MI:SS')::timestamp;
      if p_exif_offset ~ '^[+-]\d{2}:\d{2}$' then
        v_captured := (to_char(v_local, 'YYYY-MM-DD"T"HH24:MI:SS') || p_exif_offset)::timestamptz;
        v_source := 'exif_offset';
      else
        select e.timezone into v_tz from public.events e where e.id = v_photo.event_id;
        v_captured := v_local at time zone v_tz;
        v_source := 'exif_event_timezone';
      end if;
      -- Cameras with unset clocks report silly dates; ignore them.
      if v_captured < '1990-01-01'::timestamptz or v_captured > now() + interval '2 days' then
        v_captured := null;
        v_source := 'none';
      end if;
    exception when others then
      v_captured := null;
      v_source := 'none';
    end;
  end if;

  update public.photos
    set upload_status = 'ready',
        rejection_reason = null,
        byte_size = p_byte_size,
        width = p_width,
        height = p_height,
        captured_at = v_captured,
        capture_time_source = v_source
    where id = p_photo_id;

  return jsonb_build_object('upload_status', 'ready', 'captured_at', v_captured, 'capture_time_source', v_source);
end;
$$;

-- Bulk-tag the caller's own photos with car numbers. Unknown numbers are
-- reported back and nothing is written, so typos don't silently disappear.
create or replace function public.add_photo_tags(p_photo_ids uuid[], p_numbers text[])
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_me uuid := public.current_photographer_id();
  v_numbers text[];
  v_event uuid;
  v_events int;
  v_missing text[];
  v_added int;
begin
  select coalesce(array_agg(distinct n), '{}') into v_numbers
  from (select public.normalise_entry_number(x) as n from unnest(p_numbers) x) s
  where n is not null;
  if cardinality(v_numbers) = 0 then
    return jsonb_build_object('added', 0, 'missing', '[]'::jsonb, 'error', 'No car numbers given');
  end if;

  select count(distinct ph.event_id), min(ph.event_id::text)::uuid into v_events, v_event
  from public.photos ph where ph.id = any(p_photo_ids) and ph.photographer_id = v_me;
  if v_events = 0 then
    return jsonb_build_object('added', 0, 'missing', '[]'::jsonb, 'error', 'No photos of yours were selected');
  elsif v_events > 1 then
    raise exception 'Selected photos belong to different events' using errcode = '22023';
  end if;

  select coalesce(array_agg(n order by n), '{}') into v_missing
  from unnest(v_numbers) n
  where not exists (select 1 from public.entries e where e.event_id = v_event and e.number = n);
  if cardinality(v_missing) > 0 then
    return jsonb_build_object('added', 0, 'missing', to_jsonb(v_missing));
  end if;

  insert into public.photo_tags (photo_id, entry_id, event_id)
  select ph.id, e.id, ph.event_id
  from public.photos ph
  join public.entries e on e.event_id = ph.event_id and e.number = any(v_numbers)
  where ph.id = any(p_photo_ids) and ph.photographer_id = v_me
  on conflict (photo_id, entry_id) do nothing;
  get diagnostics v_added = row_count;

  return jsonb_build_object('added', v_added, 'missing', '[]'::jsonb);
end;
$$;

create or replace function public.remove_photo_tags(p_photo_ids uuid[], p_numbers text[])
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_removed int;
begin
  delete from public.photo_tags t
  using public.entries e, public.photos ph
  where t.entry_id = e.id
    and t.photo_id = ph.id
    and ph.photographer_id = public.current_photographer_id()
    and t.photo_id = any(p_photo_ids)
    and e.number = any(select public.normalise_entry_number(x) from unnest(p_numbers) x);
  get diagnostics v_removed = row_count;
  return jsonb_build_object('removed', v_removed);
end;
$$;

create or replace function public.set_photos_published(p_photo_ids uuid[], p_published boolean)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_me uuid := public.current_photographer_id();
  v_updated int;
  v_not_ready int;
begin
  select count(*) into v_not_ready from public.photos
  where id = any(p_photo_ids) and photographer_id = v_me and upload_status <> 'ready';

  update public.photos
    set published_at = case when p_published then coalesce(published_at, now()) else null end
    where id = any(p_photo_ids)
      and photographer_id = v_me
      and upload_status = 'ready'
      and (published_at is null) = p_published;
  get diagnostics v_updated = row_count;

  return jsonb_build_object('updated', v_updated, 'skipped_not_ready', v_not_ready);
end;
$$;

create or replace function public.set_photos_price(p_photo_ids uuid[], p_price_pence int)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated int;
begin
  update public.photos set price_pence = p_price_pence
  where id = any(p_photo_ids) and photographer_id = public.current_photographer_id();
  get diagnostics v_updated = row_count;
  return jsonb_build_object('updated', v_updated);
end;
$$;

-- Accept or reject a suggestion on one of your own photos. Accepting turns
-- it into a confirmed tag (source = 'suggestion').
create or replace function public.review_tag_suggestion(p_suggestion_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.tag_suggestions;
  v_entry uuid;
begin
  select * into v_s from public.tag_suggestions where id = p_suggestion_id for update;
  if not found or not public.owns_photo(v_s.photo_id) or not public.is_approved_for_event(v_s.event_id) then
    raise exception 'Suggestion not found' using errcode = 'P0002';
  end if;

  if p_accept then
    v_entry := coalesce(
      v_s.entry_id,
      (select e.id from public.entries e where e.event_id = v_s.event_id and e.number = v_s.suggested_number)
    );
    if v_entry is null then
      return jsonb_build_object('status', v_s.status, 'error', 'Car number is not on the entry list');
    end if;
    insert into public.photo_tags (photo_id, entry_id, event_id, source, suggestion_id, created_by)
    values (v_s.photo_id, v_entry, v_s.event_id, 'suggestion', v_s.id, auth.uid())
    on conflict (photo_id, entry_id) do nothing;
  end if;

  update public.tag_suggestions
    set status = case when p_accept then 'accepted' else 'rejected' end,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_suggestion_id;

  return jsonb_build_object('status', case when p_accept then 'accepted' else 'rejected' end);
end;
$$;

-- PUBLIC SEARCH. Only confirmed tags on published, ready photos at public
-- events. Exact text match on the normalised car number.
create or replace function public.search_event_photos(
  p_event_slug text,
  p_number text default null,
  p_limit int default 120
)
returns table (
  photo_id uuid,
  object_key text,
  captured_at timestamptz,
  sequence int,
  location text,
  price_pence int,
  width int,
  height int,
  photographer_id uuid,
  photographer_name text,
  photographer_credit text,
  numbers text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ev as (
    select e.id from public.events e where e.slug = p_event_slug and e.is_public
  ),
  wanted as (
    select en.id from public.entries en, ev
    where en.event_id = ev.id and en.number = public.normalise_entry_number(p_number)
  )
  select
    ph.id, ph.object_key, ph.captured_at, ph.sequence, ph.location,
    ph.price_pence, ph.width, ph.height,
    pg.id, pg.display_name, pg.credit,
    coalesce((
      select array_agg(en.number order by en.number)
      from public.photo_tags t join public.entries en on en.id = t.entry_id
      where t.photo_id = ph.id
    ), '{}')
  from public.photos ph
  join ev on ev.id = ph.event_id
  join public.photographers pg on pg.id = ph.photographer_id
  where ph.published_at is not null
    and ph.upload_status = 'ready'
    and (
      public.normalise_entry_number(p_number) is null
      or exists (select 1 from public.photo_tags t join wanted w on w.id = t.entry_id where t.photo_id = ph.id)
    )
  order by ph.captured_at nulls last, ph.created_at, ph.sequence
  limit least(greatest(coalesce(p_limit, 120), 1), 500);
$$;

-- Car numbers that have at least one public photo, for the quick-pick chips.
create or replace function public.public_event_numbers(p_event_slug text)
returns table (number text, photo_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select en.number, count(distinct t.photo_id)
  from public.events e
  join public.entries en on en.event_id = e.id
  join public.photo_tags t on t.entry_id = en.id
  join public.photos ph on ph.id = t.photo_id
  where e.slug = p_event_slug and e.is_public
    and ph.published_at is not null and ph.upload_status = 'ready'
  group by en.number
  order by en.number;
$$;

-- ---------------------------------------------------------------------
-- Function privileges (Supabase grants EXECUTE to anon by default)
-- ---------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.normalise_entry_number(text) to anon, authenticated, service_role;
grant execute on function public.upload_limits() to anon, authenticated, service_role;
grant execute on function public.search_event_photos(text, text, int) to anon, authenticated, service_role;
grant execute on function public.public_event_numbers(text) to anon, authenticated, service_role;

-- Used inside RLS policies, so every role that reads these tables needs them.
grant execute on function public.current_photographer_id() to anon, authenticated, service_role;
grant execute on function public.is_approved_for_event(uuid) to anon, authenticated, service_role;
grant execute on function public.is_event_public(uuid) to anon, authenticated, service_role;
grant execute on function public.owns_photo(uuid) to anon, authenticated, service_role;
grant execute on function public.is_photo_public(uuid) to anon, authenticated, service_role;

grant execute on function public.create_upload_batch(uuid, jsonb) to authenticated;
grant execute on function public.add_photo_tags(uuid[], text[]) to authenticated;
grant execute on function public.remove_photo_tags(uuid[], text[]) to authenticated;
grant execute on function public.set_photos_published(uuid[], boolean) to authenticated;
grant execute on function public.set_photos_price(uuid[], int) to authenticated;
grant execute on function public.review_tag_suggestion(uuid, boolean) to authenticated;

grant execute on function public.finalize_photo_upload(uuid, boolean, int, int, int, text, text, text) to service_role;
