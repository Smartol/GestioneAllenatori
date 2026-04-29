-- ============================================================
-- GS Calendario — Schema Supabase (senza autenticazione)
-- Esegui questo file nell'editor SQL di Supabase
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- IMPOSTAZIONI APP (PIN admin, ecc.)
-- ============================================================
create table public.app_settings (
  key   text primary key,
  value text not null
);
insert into public.app_settings (key, value) values ('admin_pin', '1234');
alter table public.app_settings disable row level security;

-- ============================================================
-- PROFILI UTENTE (senza collegamento a auth.users)
-- ============================================================
create table public.profiles (
  id         uuid primary key default uuid_generate_v4(),
  full_name  text not null,
  role       text not null check (role in ('admin', 'coach', 'sostegno')),
  created_at timestamptz default now()
);
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
-- Aggiunto: title (opzionale), end_time, start_date, end_date
-- ============================================================
create table public.recurring_trainings (
  id          serial primary key,
  day_of_week integer not null check (day_of_week between 1 and 7),
  start_time  time not null,
  end_time    time,
  title       text,
  start_date  date,
  end_date    date,
  active      boolean default true,
  created_at  timestamptz default now()
);

-- Categorie O gruppi associati all'allenamento ricorrente.
-- Uno dei due (category_id o group_id) deve essere valorizzato, non entrambi.
create table public.recurring_training_categories (
  training_id integer references public.recurring_trainings(id) on delete cascade,
  category_id integer references public.categories(id) on delete cascade,
  group_id    integer references public.category_groups(id) on delete cascade,
  min_coaches integer not null default 2,
  primary key (training_id, category_id, group_id),
  constraint one_of_cat_or_group check (
    (category_id is not null and group_id is null) or
    (category_id is null and group_id is not null)
  )
);
alter table public.recurring_trainings disable row level security;
alter table public.recurring_training_categories disable row level security;

-- ============================================================
-- ECCEZIONI SINGOLE ISTANZE (allenamenti eliminati per festività ecc.)
-- ============================================================
create table public.training_instance_exceptions (
  id            serial primary key,
  training_id   integer references public.recurring_trainings(id) on delete cascade,
  instance_date date not null,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz default now(),
  unique (training_id, instance_date)
);
alter table public.training_instance_exceptions disable row level security;

-- ============================================================
-- OVERRIDE DI ISTANZA (modifiche temporanee a singola istanza)
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
  group_id    integer references public.category_groups(id) on delete cascade,
  min_coaches integer not null default 2,
  primary key (override_id, category_id, group_id),
  constraint one_of_cat_or_group check (
    (category_id is not null and group_id is null) or
    (category_id is null and group_id is not null)
  )
);
alter table public.training_instance_overrides disable row level security;
alter table public.instance_override_categories disable row level security;

-- ============================================================
-- ATTIVITÀ (ex Festival)
-- type: 'festival' | 'other'
-- Festival: location e hosting_team opzionali
-- Other: title obbligatorio, location opzionale
-- ============================================================
create table public.activities (
  id           serial primary key,
  type         text not null check (type in ('festival', 'other')),
  title        text,
  date         date not null,
  start_time   time not null,
  end_time     time,
  location     text,
  hosting_team text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz default now(),
  constraint festival_or_title check (
    (type = 'festival') or
    (type = 'other' and title is not null)
  )
);
create table public.activity_categories (
  activity_id integer references public.activities(id) on delete cascade,
  category_id integer references public.categories(id) on delete cascade,
  group_id    integer references public.category_groups(id) on delete cascade,
  min_coaches integer not null default 2,
  primary key (activity_id, category_id, group_id),
  constraint one_of_cat_or_group check (
    (category_id is not null and group_id is null) or
    (category_id is null and group_id is not null)
  )
);
alter table public.activities disable row level security;
alter table public.activity_categories disable row level security;

-- ============================================================
-- PRESENZE PUNTUALI
-- Aggiunto: group_id (a quale gruppo/categoria si è disponibile)
--           is_jolly (disponibile come jolly)
-- ============================================================
create table public.attendances (
  id            serial primary key,
  coach_id      uuid references public.profiles(id) on delete cascade,
  training_id   integer references public.recurring_trainings(id) on delete cascade,
  instance_date date,
  activity_id   integer references public.activities(id) on delete cascade,
  category_id   integer references public.categories(id),
  group_id      integer references public.category_groups(id),
  is_jolly      boolean not null default false,
  created_at    timestamptz default now(),
  -- Solo uno tra training e activity
  constraint one_activity check (
    (training_id is not null and activity_id is null) or
    (training_id is null and activity_id is not null)
  ),
  -- Solo uno tra category, group o jolly
  constraint one_slot check (
    (is_jolly = true and category_id is null and group_id is null) or
    (is_jolly = false and (category_id is not null or group_id is not null))
  ),
  unique (coach_id, training_id, instance_date),
  unique (coach_id, activity_id)
);
alter table public.attendances disable row level security;

-- ============================================================
-- BACHECA
-- Solo admin e coach possono creare post
-- Admin può cancellare tutto, coach solo i propri
-- ============================================================
create table public.board_posts (
  id         serial primary key,
  author_id  uuid references public.profiles(id) on delete cascade,
  content    text,
  created_at timestamptz default now()
);
create table public.board_post_images (
  id           serial primary key,
  post_id      integer references public.board_posts(id) on delete cascade,
  storage_path text not null,
  created_at   timestamptz default now()
);
alter table public.board_posts disable row level security;
alter table public.board_post_images disable row level security;

-- ============================================================
-- NOTE E IMMAGINI (invariate)
-- ============================================================
create table public.notes (
  id            serial primary key,
  author_id     uuid references public.profiles(id) on delete cascade,
  training_id   integer references public.recurring_trainings(id) on delete cascade,
  instance_date date,
  activity_id   integer references public.activities(id) on delete cascade,
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
