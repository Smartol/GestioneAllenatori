-- ============================================================
-- GS Calendario — Schema Supabase (senza autenticazione)
-- Esegui questo file nell'editor SQL di Supabase
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILI UTENTE (senza collegamento a auth.users)
-- ============================================================
create table public.profiles (
  id         uuid primary key default uuid_generate_v4(),
  full_name  text not null,
  role       text not null check (role in ('admin', 'coach')),
  created_at timestamptz default now()
);

-- RLS disabilitato: accesso pubblico (nessuna autenticazione)
alter table public.profiles disable row level security;

-- ============================================================
-- CATEGORIE
-- ============================================================
create table public.categories (
  id   serial primary key,
  name text not null unique
);
insert into public.categories (name) values ('U6'), ('U8'), ('U10'), ('U12');
alter table public.categories disable row level security;

-- ============================================================
-- GRUPPI DI CATEGORIE
-- ============================================================
create table public.category_groups (
  id         serial primary key,
  name       text,
  created_at timestamptz default now()
);
create table public.category_group_members (
  group_id    integer references public.category_groups(id) on delete cascade,
  category_id integer references public.categories(id) on delete cascade,
  primary key (group_id, category_id)
);
alter table public.category_groups disable row level security;
alter table public.category_group_members disable row level security;

-- ============================================================
-- ALLENAMENTI RICORRENTI
-- ============================================================
create table public.recurring_trainings (
  id          serial primary key,
  day_of_week integer not null check (day_of_week between 1 and 7),
  start_time  time not null,
  active      boolean default true,
  created_at  timestamptz default now()
);
create table public.recurring_training_categories (
  training_id integer references public.recurring_trainings(id) on delete cascade,
  category_id integer references public.categories(id) on delete cascade,
  min_coaches integer not null default 2,
  primary key (training_id, category_id)
);
alter table public.recurring_trainings disable row level security;
alter table public.recurring_training_categories disable row level security;

-- ============================================================
-- OVERRIDE DI ISTANZA
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
alter table public.training_instance_overrides disable row level security;
alter table public.instance_override_categories disable row level security;

-- ============================================================
-- FESTIVAL
-- ============================================================
create table public.festivals (
  id         serial primary key,
  name       text not null,
  date       date not null,
  start_time time not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
create table public.festival_categories (
  festival_id integer references public.festivals(id) on delete cascade,
  category_id integer references public.categories(id) on delete cascade,
  min_coaches integer not null default 2,
  primary key (festival_id, category_id)
);
alter table public.festivals disable row level security;
alter table public.festival_categories disable row level security;

-- ============================================================
-- PRESENZE PUNTUALI
-- ============================================================
create table public.attendances (
  id            serial primary key,
  coach_id      uuid references public.profiles(id) on delete cascade,
  training_id   integer references public.recurring_trainings(id) on delete cascade,
  instance_date date,
  festival_id   integer references public.festivals(id) on delete cascade,
  category_id   integer references public.categories(id),
  created_at    timestamptz default now(),
  constraint one_activity check (
    (training_id is not null and festival_id is null) or
    (training_id is null and festival_id is not null)
  ),
  unique (coach_id, training_id, instance_date),
  unique (coach_id, festival_id)
);
alter table public.attendances disable row level security;

-- ============================================================
-- NOTE E IMMAGINI
-- ============================================================
create table public.notes (
  id            serial primary key,
  author_id     uuid references public.profiles(id) on delete cascade,
  training_id   integer references public.recurring_trainings(id) on delete cascade,
  instance_date date,
  festival_id   integer references public.festivals(id) on delete cascade,
  scope         text not null check (scope in ('single', 'week', 'multi')),
  content       text,
  created_at    timestamptz default now()
);
create table public.note_images (
  id           serial primary key,
  note_id      integer references public.notes(id) on delete cascade,
  storage_path text not null,
  created_at   timestamptz default now()
);
alter table public.notes disable row level security;
alter table public.note_images disable row level security;

-- ============================================================
-- API KEY: usa la "anon key" di Supabase normalmente.
-- Poiché RLS è disabilitato, tutte le tabelle sono accessibili
-- in lettura e scrittura dalla anon key.
-- Assicurati che il progetto Supabase NON sia pubblico su internet
-- condividendo solo il link Vercel con il tuo gruppo.
-- ============================================================
