app-name = NoSidian
app-tagline = Ваша студия для знаний, учёбы, проектов и концентрации

shell-skip-to-content = Перейти к основному содержимому
shell-ribbon-label = Лента инструментов
shell-left-sidebar-label = Левая боковая панель
shell-right-sidebar-label = Правая боковая панель
shell-workspace-label = Рабочая область
shell-status-bar-label = Строка состояния
shell-left-sidebar-placeholder = Здесь появятся файлы, поиск, теги и календарь.
shell-right-sidebar-placeholder = Здесь появятся ссылки, структура, таймер концентрации и история.

ribbon-dashboard = Главная панель
ribbon-files = Проводник файлов
ribbon-search = Поиск
ribbon-graph = Граф знаний
ribbon-flashcards = Карточки
ribbon-focus = Дзен-студия концентрации
ribbon-settings = Настройки

preview-title = Предпросмотр основы
preview-intro = Эта ранняя сборка проверяет язык, направление текста, темы, эффект стекла и доступность. Все изменения сохраняются автоматически.
preview-section-language = Язык и направление
preview-section-appearance = Внешний вид
preview-section-accessibility = Доступность
preview-sample-heading = Пример стеклянной карточки
preview-sample-body = Текст на стекле должен оставаться чётким и читаемым поверх движущегося фона.

field-language = Язык интерфейса
field-theme = Тема
field-accent = Акцентный цвет
field-glass-blur = Размытие стекла
field-glass-opacity = Непрозрачность стекла
field-ambient-mesh = Анимированный фон
field-density = Плотность
field-radius = Стиль углов
field-experience = Уровень опыта
field-screen-reader = Режим экранного диктора и доступности
field-screen-reader-hint = Более заметная рамка фокуса, голосовые объявления и меньше анимации.
field-reduce-motion = Уменьшить анимацию

density-compact = Компактная
density-comfortable = Свободная
radius-sharp = Острые
radius-balanced = Сбалансированные
radius-soft = Мягкие
experience-beginner = Новичок (основное)
experience-intermediate = Средний уровень
experience-advanced = Продвинутый (опытный пользователь)
theme-obsidian-slate = Обсидиановый сланец
theme-midnight-carbon = Полуночный карбон
theme-nord-arctic = Северная Арктика
theme-catppuccin-mocha = Catppuccin Mocha
theme-paper-daylight = Бумага при дневном свете
theme-warm-parchment = Тёплый пергамент

status-no-vault = Хранилище не открыто
status-modules-enabled =
    { $count ->
        [one] Включён { $count } модуль
        [few] Включено { $count } модуля
        [many] Включено { $count } модулей
       *[other] Включено { $count } модуля
    }
announce-language-changed = Язык изменён на { $language }
announce-theme-changed = Тема изменена на { $theme }
announce-setting-saved = Настройка сохранена
action-reset-defaults = Сбросить по умолчанию

error-io = Не удалось прочитать или записать файл.
error-corrupt-data = Файл настроек был повреждён и сброшен. Резервная копия сохранена.
error-invalid-vault-name = Введите допустимое имя хранилища.
error-already-exists = Папка с таким именем уже существует.
error-not-found = Папка не найдена.
error-not-a-folder = Выбранный путь не является папкой.
error-unknown = Что-то пошло не так: { $detail }
