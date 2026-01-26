create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  company_name text not null,
  role text not null check (role in ('admin', 'user')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_role_idx on users(role);
create index if not exists users_company_idx on users(company_name);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capacity integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_active_idx on rooms(active);

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  approval_mode boolean not null default false,
  slot_minutes integer not null default 30,
  max_duration_minutes integer not null default 120,
  open_time time not null default '09:00',
  close_time time not null default '21:00',
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id),
  user_id uuid not null references users(id),
  title text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null check (status in ('pending', 'approved', 'rejected', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reservations_room_time_idx on reservations(room_id, start_at, end_at);
create index if not exists reservations_user_idx on reservations(user_id);
create index if not exists reservations_status_idx on reservations(status);

create table if not exists reservation_changes (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id),
  requested_by uuid not null references users(id),
  old_start_at timestamptz not null,
  old_end_at timestamptz not null,
  new_start_at timestamptz not null,
  new_end_at timestamptz not null,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reservation_changes_res_idx on reservation_changes(reservation_id);
create index if not exists reservation_changes_status_idx on reservation_changes(status);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references reservations(id),
  type text not null check (type in ('created', 'updated', 'canceled', 'approved', 'rejected')),
  channel text not null default 'email',
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_res_idx on notifications(reservation_id);
create index if not exists notifications_status_idx on notifications(status);

insert into rooms (name, capacity)
select 'Meeting Room', 6
where not exists (select 1 from rooms);

insert into settings (approval_mode)
select false
where not exists (select 1 from settings);
