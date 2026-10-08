-- 1) أنشئ حساب المدير من Supabase Dashboard > Authentication > Users.
-- 2) انسخ User UID ثم نفّذ هذا الجزء لإعطائه صلاحية الإدارة.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

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
