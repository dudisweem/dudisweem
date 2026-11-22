-- Admin reports: one jsonb document per date range (business-local dates, inclusive).
-- Revenue uses the price snapshot on each booking; "earned" = approved + completed.
create or replace function public.admin_report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not app.is_admin() then return jsonb_build_object('error','not_found'); end if;
  if p_to < p_from or p_to - p_from > 731 then return jsonb_build_object('error','invalid'); end if;

  with b as (
    select bk.*, (bk.starts_at at time zone 'Asia/Jerusalem') as local_start
    from public.bookings bk
    where (bk.starts_at at time zone 'Asia/Jerusalem')::date between p_from and p_to
  ), earned as (
    select * from b where status in ('approved','completed')
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'lessons', (select count(*) from earned),
      'revenue', (select coalesce(sum(price_agorot),0) from earned),
      'paid', (select coalesce(sum(price_agorot),0) from earned where paid),
      'unpaid', (select coalesce(sum(price_agorot),0) from earned where not paid and payment_method <> 'card'),
      'card_lessons', (select count(*) from earned where payment_method = 'card'),
      'completed', (select count(*) from b where status = 'completed'),
      'no_show', (select count(*) from b where status = 'no_show'),
      'cancelled', (select count(*) from b where status = 'cancelled'),
      'declined', (select count(*) from b where status = 'declined'),
      'pending', (select count(*) from b where status = 'pending')
    ),
    'by_month', coalesce((select jsonb_agg(x order by x->>'month') from (
      select jsonb_build_object('month', to_char(local_start, 'YYYY-MM'), 'lessons', count(*), 'revenue', sum(price_agorot)) x
      from earned group by to_char(local_start, 'YYYY-MM')) m), '[]'::jsonb),
    'by_service', coalesce((select jsonb_agg(x order by (x->>'revenue')::bigint desc) from (
      select jsonb_build_object('name', sv.name, 'lessons', count(*), 'revenue', sum(e.price_agorot)) x
      from earned e join public.services sv on sv.id = e.service_id group by sv.name) s), '[]'::jsonb),
    'by_payment', coalesce((select jsonb_agg(x order by (x->>'lessons')::int desc) from (
      select jsonb_build_object('method', payment_method, 'lessons', count(*), 'revenue', sum(price_agorot),
                                'paid', coalesce(sum(price_agorot) filter (where paid), 0)) x
      from earned group by payment_method) p), '[]'::jsonb),
    'by_weekday', coalesce((select jsonb_agg(x order by (x->>'weekday')::int) from (
      select jsonb_build_object('weekday', extract(dow from local_start)::int, 'lessons', count(*)) x
      from earned group by extract(dow from local_start)) w), '[]'::jsonb),
    'by_hour', coalesce((select jsonb_agg(x order by (x->>'hour')::int) from (
      select jsonb_build_object('hour', extract(hour from local_start)::int, 'lessons', count(*)) x
      from earned group by extract(hour from local_start)) h), '[]'::jsonb),
    'by_instructor', coalesce((select jsonb_agg(x order by (x->>'lessons')::int desc) from (
      select jsonb_build_object('name', coalesce(nullif(p.full_name,''), p.email), 'color', p.color,
                                'lessons', count(*) filter (where e.status in ('approved','completed')),
                                'completed', count(*) filter (where e.status = 'completed'),
                                'no_show', count(*) filter (where e.status = 'no_show')) x
      from b e join public.profiles p on p.id = e.instructor_id group by p.id, p.full_name, p.email, p.color) i), '[]'::jsonb),
    'new_families', (select count(*) from public.profiles where role = 'parent'
                       and (created_at at time zone 'Asia/Jerusalem')::date between p_from and p_to),
    'new_students', (select count(*) from public.students
                       where (created_at at time zone 'Asia/Jerusalem')::date between p_from and p_to)
  ) into v;
  return v;
end $$;
revoke execute on function public.admin_report(date, date) from public, anon;
grant execute on function public.admin_report(date, date) to authenticated;
