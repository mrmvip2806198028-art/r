إعداد دخول لوحة الإدارة + Supabase

1) افتح Supabase Dashboard > Authentication > Users وأنشئ حساب المدير بالإيميل والباسورد الذي تريده.
2) انسخ User UID.
3) افتح SQL Editor وشغّل كل محتوى ملف supabase.sql.
4) بعد تشغيل SQL نفّذ:
   insert into public.admin_users (user_id, role) values ('ضع-UID-هنا', 'owner');
5) افتح supabase-config.js وضع Publishable/Anon Key في SUPABASE_ANON_KEY.
6) على الاستضافة ضع متغيرات البيئة:
   SUPABASE_URL=https://nfrfnebuxnalemakrvqk.supabase.co
   SUPABASE_ANON_KEY=نفس Publishable/Anon Key
7) شغّل الموقع: npm start

من لوحة الإدارة:
- اختر فيديو أو امتحان أو اختبار أو ملف/PDF.
- اختر الملف واضغط «رفع ونشر للناس».
- سيظهر المحتوى تلقائيًا في الصفحة الرئيسية.

إضافة مدير آخر:
- أنشئ حسابه من Authentication > Users.
- أضف UID الخاص به في admin_users بنفس الطريقة.

مهم: لا تضع Service Role Key داخل ملفات الموقع أو في المتصفح. استخدم Publishable/Anon Key فقط مع RLS.
