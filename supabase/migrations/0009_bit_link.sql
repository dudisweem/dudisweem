-- Optional Bit payment-request link (Bit business / payment page) opened from the booking success screen.
alter table public.settings add column if not exists bit_link text not null default '';
-- brand renamed to SWEEMER
alter table public.settings alter column business_name set default 'SWEEMER';
update public.settings set business_name = 'SWEEMER' where id = 1 and business_name = 'SEA.D.CHANGE';
