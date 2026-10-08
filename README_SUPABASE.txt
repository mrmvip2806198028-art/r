إعداد دخول لوحة الإدارة + Supabase

1) افتح Supabase Dashboard > Authentication > Users وأنشئ حساب المدير بالإيميل والباسورد الذي تريده.
2) انسخ User UID.
3) افتح SQL Editor وشغّل كل محتوى ملف supabase.sql.
4) بعد تشغيل SQL نفّذ:
   insert into public.admin_users (user_id, role) values ('ضع-UID-هنا', 'owner');
5) افتح supabase-config.js وضع Publishable/Anon Key في SUPABASE_ANON_KEY.
6) على الاستضافة ضع متغيرات البيئة:
   SUPABASE_URL=https://tlywcfgqlgbuugkhebmb.supabase.co
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


ملاحظة منصة نبغة 8: نفّذ ملف supabase.sql كاملًا مرة واحدة. إذا كان admin_users فارغًا، أول حساب يسجل دخولًا بنجاح يمكنه تهيئة نفسه كمدير تلقائيًا. بعد إنشاء أول مدير، لا يمكن لحساب آخر استخدام التهيئة التلقائية.


إصلاح النسخة 10: تم نقل التحقق/تهيئة أول مدير إلى دالة Supabase آمنة ensure_current_admin لتجنب خطأ Failed to fetch الناتج عن قراءة admin_users من المتصفح قبل التهيئة.


منصة نبغة 12: تم تضمين مكتبة Supabase في الصفحة وتحميل supabase-config.js تلقائيًا. كما تمت إضافة زر X واضح أعلى لوحة الإدارة لإغلاقها.


مهم في النسخة 16: نفّذ supabase.sql كاملًا مرة واحدة. تم إضافة get_published_materials لجعل الدورات عامة لكل الطلاب والزوار.
