-- Onboard Goodies: one isolated schema. The app connects as its own role (onboard_app),
-- which can only see this schema.
create schema if not exists onboard;

create table if not exists onboard.participants (
  emp_id          text primary key,
  emp_name        text not null,
  onboarded_on    date,
  onboarded_raw   text,          -- original text when the date couldn't be read
  location        text,
  imported_at     timestamptz not null default now(),
  checked_in_at   timestamptz,   -- scanned the desk QR and entered their ID (in the queue)
  collected_at    timestamptz,
  collected_by    text,
  updated_at      timestamptz not null default now()
);
create index if not exists participants_queue_idx on onboard.participants (checked_in_at)
  where collected_at is null and checked_in_at is not null;
create index if not exists participants_collected_idx on onboard.participants (collected_at desc)
  where collected_at is not null;

create table if not exists onboard.settings (
  k text primary key,
  v text not null
);
insert into onboard.settings (k, v) values ('desk_pin', '1234'), ('desk_pin_version', '1')
  on conflict (k) do nothing;

create table if not exists onboard.activity (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  emp_id  text,
  action  text not null,
  actor   text,
  detail  text
);

create table if not exists onboard.rate (
  k            text primary key,
  n            int not null,
  window_start timestamptz not null
);
