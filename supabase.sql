-- 1) أنشئ حساب المدير من Supabase Dashboard > Authentication > Users.
-- 2) انسخ User UID ثم نفّذ هذا الجزء لإعطائه صلاحية الإدارة.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);


-- تهيئة/التحقق من المدير الحالي من خلال دالة آمنة على Supabase.
-- لا يحتاج المتصفح إلى قراءة جدول admin_users قبل التهيئة.
create or replace function public.ensure_current_admin()
returns table(is_admin boolean, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing_role text;
  has_admin boolean;
begin
  if uid is null then
    return query select false, null::text;
    return;
  end if;

  select a.role into existing_role
  from public.admin_users a
  where a.user_id = uid
  limit 1;

  if existing_role is not null then
    return query select true, existing_role;
    return;
  end if;

  select exists (select 1 from public.admin_users) into has_admin;
  if not has_admin then
    insert into public.admin_users (user_id, role)
    values (uid, 'owner')
    on conflict (user_id) do nothing;
    select a.role into existing_role
    from public.admin_users a
    where a.user_id = uid
    limit 1;
    if existing_role is not null then
      return query select true, existing_role;
      return;
    end if;
  end if;

  return query select false, null::text;
end;
$$;

revoke all on function public.ensure_current_admin() from public;
grant execute on function public.ensure_current_admin() to authenticated;

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('video','exam','test','file')),
  description text default '',
  file_url text not null,
  file_path text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.materials enable row level security;

-- الإدارة: المديرون فقط يرون جدول الصلاحيات.
drop policy if exists "admins read admin_users" on public.admin_users;
create policy "admins read admin_users"
on public.admin_users for select to authenticated
using (user_id = auth.uid());

-- الموقع العام يستطيع عرض المواد المنشورة.
drop policy if exists "public read materials" on public.materials;
create policy "public read materials"
on public.materials for select to anon, authenticated
using (true);

-- المديرون فقط يضيفون/يحذفون المواد.
drop policy if exists "admins insert materials" on public.materials;
create policy "admins insert materials"
on public.materials for insert to authenticated
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "admins delete materials" on public.materials;
create policy "admins delete materials"
on public.materials for delete to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

-- Bucket للملفات. اجعله Public حتى تظهر روابط الفيديو/الملفات للزوار.
insert into storage.buckets (id, name, public)
values ('materials', 'materials', true)
on conflict (id) do update set public = true;

-- المديرون فقط يستطيعون رفع/حذف الملفات.
drop policy if exists "admins upload materials" on storage.objects;
create policy "admins upload materials"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'materials' and
  exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

drop policy if exists "admins delete material files" on storage.objects;
create policy "admins delete material files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'materials' and
  exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);


-- القراءة العامة الآمنة للمحتوى المنشور:
-- تسمح للطلاب والزوار برؤية نفس المواد التي نشرها المدير،
-- بدون إعطائهم صلاحية مباشرة لقراءة/تعديل جداول الإدارة.
create or replace function public.get_published_materials()
returns table (
  id uuid,
  title text,
  type text,
  description text,
  file_url text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select m.id, m.title, m.type, m.description, m.file_url, m.created_at
  from public.materials m
  order by m.created_at desc;
$$;

revoke all on function public.get_published_materials() from public;
grant execute on function public.get_published_materials() to anon, authenticated;

-- Persistent registration counters for deployments whose local filesystem is ephemeral (e.g. Back4App).
create table if not exists public.platform_registrations (
  email text primary key,
  role text not null check (role in ('student','teacher','school')),
  created_at timestamptz not null default now()
);
alter table public.platform_registrations enable row level security;
revoke all on public.platform_registrations from anon, authenticated, public;

create or replace function public.record_platform_registration(p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_email is null or length(trim(p_email)) < 3 or p_role not in ('student','teacher','school') then
    raise exception 'Invalid registration';
  end if;
  insert into public.platform_registrations(email, role)
  values (lower(trim(p_email)), p_role)
  on conflict (email) do update set role = excluded.role;
end;
$$;

create or replace function public.get_platform_stats()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'students', count(*) filter (where role = 'student'),
    'teachers', count(*) filter (where role = 'teacher'),
    'schools', count(*) filter (where role = 'school')
  ) from public.platform_registrations;
$$;

revoke all on function public.record_platform_registration(text,text) from public;
revoke all on function public.get_platform_stats() from public;
grant execute on function public.record_platform_registration(text,text) to anon, authenticated;
grant execute on function public.get_platform_stats() to anon, authenticated;
