-- ============================================================
-- GS Calendario — Schema Supabase
-- Esegui questo file nell'editor SQL di Supabase
-- ============================================================

-- Estensioni
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILI UTENTE
-- Collegati alla tabella auth.users di Supabase
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        text not null check (role in ('admin', 'coach')),
  created_at  timestamptz default now()
);

-- RLS
alter table public.profiles enable row level security;
create policy "Profilo visibile a tutti gli utenti autenticati"
  on public.profiles for select using (auth.role() = 'authenticated');
create policy "Profilo modificabile solo da admin"
  on public.profiles for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Inserimento profilo al momento della registrazione"
  on public.profiles for insert with check (auth.uid() = id);

-- ============================================================
-- CATEGORIE
-- ============================================================
create table public.categories (
  id    serial primary key,
  name  text not null unique  -- U6, U8, U10, U12
);
insert into public.categories (name) values ('U6'), ('U8'), ('U10'), ('U12');

alter table public.categories enable row level security;
create policy "Categorie visibili a tutti" on public.categories for select using (auth.role() = 'authenticated');
create policy "Categorie modificabili solo da admin" on public.categories for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ============================================================
-- GRUPPI DI CATEGORIE
-- Es. U6+U8 allenate insieme
-- ============================================================
create table public.category_groups (
  id          serial primary key,
  name        text,
  created_at  timestamptz default now()
);

create table public.category_group_members (
  group_id    integer references public.category_groups(id) on delete cascade,
  category_id integer references public.categories(id) on delete cascade,
  primary key (group_id, category_id)
);

alter table public.category_groups enable row level security;
alter table public.category_group_members enable row level security;
create policy "Gruppi visibili a tutti" on public.category_groups for select using (auth.role() = 'authenticated');
create policy "Gruppi modificabili solo da admin" on public.category_groups for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Membri gruppi visibili a tutti" on public.category_group_members for select using (auth.role() = 'authenticated');
create policy "Membri gruppi modificabili solo da admin" on public.category_group_members for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ============================================================
-- ALLENAMENTI RICORRENTI
-- ============================================================
create table public.recurring_trainings (
  id          serial primary key,
  day_of_week integer not null check (day_of_week between 1 and 7), -- 1=Lun, 7=Dom
  start_time  time not null,
  active      boolean default true,
  created_at  timestamptz default now()
);

-- Minimi per categoria per allenamento ricorrente
create table public.recurring_training_categories (
  training_id integer references public.recurring_trainings(id) on delete cascade,
  category_id integer references public.categories(id) on delete cascade,
  min_coaches integer not null default 2,
  primary key (training_id, category_id)
);

alter table public.recurring_trainings enable row level security;
alter table public.recurring_training_categories enable row level security;
create policy "Allenamenti visibili a tutti" on public.recurring_trainings for select using (auth.role() = 'authenticated');
create policy "Allenamenti modificabili solo da admin" on public.recurring_trainings for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Cat. allenamenti visibili a tutti" on public.recurring_training_categories for select using (auth.role() = 'authenticated');
create policy "Cat. allenamenti modificabili solo da admin" on public.recurring_training_categories for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ============================================================
-- OVERRIDE DI ISTANZA
-- Modifica categorie/minimi per una singola occorrenza
-- ============================================================
create table public.training_instance_overrides (
  id            serial primary key,
  training_id   integer references public.recurring_trainings(id) on delete cascade,
  instance_date date not null,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz default now(),
  unique (training_id, instance_date)
);

create table public.instance_override_categories (
  override_id integer references public.training_instance_overrides(id) on delete cascade,
  category_id integer references public.categories(id) on delete cascade,
  min_coaches integer not null default 2,
  primary key (override_id, category_id)
);

alter table public.training_instance_overrides enable row level security;
alter table public.instance_override_categories enable row level security;
create policy "Override visibili a tutti" on public.training_instance_overrides for select using (auth.role() = 'authenticated');
create policy "Override modificabili solo da admin" on public.training_instance_overrides for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Cat. override visibili a tutti" on public.instance_override_categories for select using (auth.role() = 'authenticated');
create policy "Cat. override modificabili solo da admin" on public.instance_override_categories for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ============================================================
-- FESTIVAL
-- ============================================================
create table public.festivals (
  id          serial primary key,
  name        text not null,
  date        date not null,
  start_time  time not null,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz default now()
);

create table public.festival_categories (
  festival_id integer references public.festivals(id) on delete cascade,
  category_id integer references public.categories(id) on delete cascade,
  min_coaches integer not null default 2,
  primary key (festival_id, category_id)
);

alter table public.festivals enable row level security;
alter table public.festival_categories enable row level security;
create policy "Festival visibili a tutti" on public.festivals for select using (auth.role() = 'authenticated');
create policy "Festival modificabili solo da admin" on public.festivals for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Cat. festival visibili a tutti" on public.festival_categories for select using (auth.role() = 'authenticated');
create policy "Cat. festival modificabili solo da admin" on public.festival_categories for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ============================================================
-- DISPONIBILITÀ STAGIONALE
-- ============================================================
create table public.seasonal_availability (
  id          serial primary key,
  coach_id    uuid references public.profiles(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 1 and 7),
  category_id integer references public.categories(id), -- null = jolly
  season_year integer not null default extract(year from now())::integer,
  created_at  timestamptz default now(),
  unique (coach_id, day_of_week, season_year)
);

alter table public.seasonal_availability enable row level security;
create policy "Disponibilità stagionale visibile a tutti" on public.seasonal_availability for select using (auth.role() = 'authenticated');
create policy "Disponibilità stagionale modificabile da owner o admin" on public.seasonal_availability for all using (
  auth.uid() = coach_id or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ============================================================
-- PRESENZE PUNTUALI
-- ============================================================
create table public.attendances (
  id            serial primary key,
  coach_id      uuid references public.profiles(id) on delete cascade,
  -- Per allenamento ricorrente
  training_id   integer references public.recurring_trainings(id) on delete cascade,
  instance_date date,
  -- Per festival
  festival_id   integer references public.festivals(id) on delete cascade,
  -- Categoria dichiarata (null = jolly)
  category_id   integer references public.categories(id),
  created_at    timestamptz default now(),
  constraint one_activity check (
    (training_id is not null and festival_id is null) or
    (training_id is null and festival_id is not null)
  ),
  unique (coach_id, training_id, instance_date),
  unique (coach_id, festival_id)
);

alter table public.attendances enable row level security;
create policy "Presenze visibili a tutti" on public.attendances for select using (auth.role() = 'authenticated');
create policy "Presenze inseribili da owner o admin" on public.attendances for insert with check (
  auth.uid() = coach_id or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Presenze eliminabili da owner o admin" on public.attendances for delete using (
  auth.uid() = coach_id or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ============================================================
-- NOTE E IMMAGINI
-- ============================================================
create table public.notes (
  id            serial primary key,
  author_id     uuid references public.profiles(id) on delete cascade,
  -- Contesto
  training_id   integer references public.recurring_trainings(id) on delete cascade,
  instance_date date,
  festival_id   integer references public.festivals(id) on delete cascade,
  -- Ambito
  scope         text not null check (scope in ('single', 'week', 'multi')),
  content       text,
  created_at    timestamptz default now()
);

create table public.note_images (
  id          serial primary key,
  note_id     integer references public.notes(id) on delete cascade,
  storage_path text not null,  -- path in Supabase Storage
  created_at  timestamptz default now()
);

alter table public.notes enable row level security;
alter table public.note_images enable row level security;
create policy "Note visibili a tutti" on public.notes for select using (auth.role() = 'authenticated');
create policy "Note inseribili da autenticati" on public.notes for insert with check (auth.uid() = author_id);
create policy "Note eliminabili da owner o admin" on public.notes for delete using (
  auth.uid() = author_id or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
create policy "Immagini note visibili a tutti" on public.note_images for select using (auth.role() = 'authenticated');
create policy "Immagini note inseribili da autenticati" on public.note_images for insert with check (auth.role() = 'authenticated');

-- ============================================================
-- STORAGE BUCKET per immagini note
-- Eseguire separatamente nella sezione Storage di Supabase
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('note-images', 'note-images', false);
