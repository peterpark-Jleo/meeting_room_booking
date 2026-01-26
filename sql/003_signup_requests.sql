create table if not exists signup_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  company_name text not null,
  password_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signup_requests_status_idx on signup_requests(status);
