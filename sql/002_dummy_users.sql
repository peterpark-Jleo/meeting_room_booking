insert into users (email, password_hash, name, company_name, role)
values
  (
    'alice@northshore.com',
    '$2a$10$frFTreW3BoD0ZSjMqS3AY.ej6YdDIbLzMtvDx1eFFRAIJfATeiiuG',
    'Alice Ford',
    'Northshore Ltd',
    'user'
  ),
  (
    'bruno@harborlane.com',
    '$2a$10$frFTreW3BoD0ZSjMqS3AY.ej6YdDIbLzMtvDx1eFFRAIJfATeiiuG',
    'Bruno Hale',
    'Harbor Lane',
    'user'
  ),
  (
    'chloe@silveroak.com',
    '$2a$10$frFTreW3BoD0ZSjMqS3AY.ej6YdDIbLzMtvDx1eFFRAIJfATeiiuG',
    'Chloe Park',
    'Silver Oak',
    'user'
  )
on conflict (email) do nothing;
