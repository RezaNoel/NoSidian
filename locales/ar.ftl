app-name = NoSidian
app-tagline = استوديوك للمعرفة والدراسة والمشاريع والتركيز

shell-skip-to-content = انتقل إلى المحتوى الرئيسي
shell-ribbon-label = شريط الأدوات
shell-left-sidebar-label = الشريط الجانبي الأيسر
shell-right-sidebar-label = الشريط الجانبي الأيمن
shell-workspace-label = مساحة العمل
shell-status-bar-label = شريط الحالة
shell-left-sidebar-placeholder = ستظهر هنا الملفات والبحث والوسوم والتقويم.
shell-right-sidebar-placeholder = ستظهر هنا الروابط والمخطط ومؤقت التركيز والسجل.

ribbon-dashboard = لوحة البداية
ribbon-files = مستكشف الملفات
ribbon-search = البحث
ribbon-graph = رسم المعرفة البياني
ribbon-flashcards = البطاقات التعليمية
ribbon-focus = استوديو التركيز زن
ribbon-settings = الإعدادات

preview-title = معاينة الأساس
preview-intro = يتحقق هذا الإصدار المبكر من اللغة واتجاه النص والسمات والزجاج وإمكانية الوصول. يُحفظ كل تغيير تلقائيًا.
preview-section-language = اللغة والاتجاه
preview-section-appearance = المظهر
preview-section-accessibility = إمكانية الوصول
preview-sample-heading = بطاقة زجاجية تجريبية
preview-sample-body = يجب أن يبقى النص على الزجاج واضحًا ومقروءًا فوق الخلفية المتحركة.

field-language = لغة الواجهة
field-theme = السمة
field-accent = لون التمييز
field-glass-blur = ضبابية الزجاج
field-glass-opacity = عتامة الزجاج
field-ambient-mesh = خلفية متحركة
field-density = الكثافة
field-radius = نمط الزوايا
field-experience = مستوى الخبرة
field-screen-reader = وضع قارئ الشاشة وإمكانية الوصول
field-screen-reader-hint = إطارات تركيز أوضح وإعلانات منطوقة وحركة أقل.
field-reduce-motion = تقليل الحركة

density-compact = مضغوط
density-comfortable = مريح
radius-sharp = حادة
radius-balanced = متوازنة
radius-soft = ناعمة
experience-beginner = مبتدئ (أساسي)
experience-intermediate = متوسط
experience-advanced = متقدم (مستخدم محترف)
theme-obsidian-slate = لوح الأوبسيديان
theme-midnight-carbon = كربون منتصف الليل
theme-nord-arctic = نورد القطبي
theme-catppuccin-mocha = Catppuccin Mocha
theme-paper-daylight = ورق النهار
theme-warm-parchment = رق دافئ

status-no-vault = لا يوجد مخزن مفتوح
status-modules-enabled =
    { $count ->
        [zero] لا توجد وحدات مفعّلة
        [one] وحدة واحدة مفعّلة
        [two] وحدتان مفعّلتان
        [few] { $count } وحدات مفعّلة
        [many] { $count } وحدة مفعّلة
       *[other] { $count } وحدة مفعّلة
    }
announce-language-changed = تم تغيير اللغة إلى { $language }
announce-theme-changed = تم تغيير السمة إلى { $theme }
announce-setting-saved = تم حفظ الإعداد
action-reset-defaults = إعادة الضبط إلى الافتراضي

error-io = تعذّرت قراءة الملف أو كتابته.
error-corrupt-data = كان أحد ملفات الإعدادات تالفًا وأُعيد ضبطه. تم الاحتفاظ بنسخة احتياطية.
error-invalid-vault-name = يُرجى إدخال اسم صالح للمخزن.
error-already-exists = يوجد مجلد بهذا الاسم بالفعل.
error-not-found = تعذّر العثور على المجلد.
error-not-a-folder = المسار المحدد ليس مجلدًا.
error-unknown = حدث خطأ ما: { $detail }
