# NoSidian: English source catalogue.
# Every id here must exist, non-empty, in all 14 locales (enforced by tests).

app-name = NoSidian
app-tagline = Your studio for knowledge, study, projects and focus

## Shell landmarks
shell-skip-to-content = Skip to main content
shell-ribbon-label = Tools ribbon
shell-left-sidebar-label = Left sidebar
shell-right-sidebar-label = Right sidebar
shell-workspace-label = Workspace
shell-status-bar-label = Status bar
shell-left-sidebar-placeholder = Files, search, tags and calendar will appear here.
shell-right-sidebar-placeholder = Links, outline, focus timer and history will appear here.

## Ribbon
ribbon-dashboard = Home dashboard
ribbon-files = Files explorer
ribbon-search = Search
ribbon-graph = Knowledge graph
ribbon-flashcards = Flashcards
ribbon-focus = Zen Focus Studio
ribbon-settings = Settings

## Phase 0 preview panel
preview-title = Foundation preview
preview-intro = This early build checks language, text direction, themes, glass and accessibility. Every change is saved automatically.
preview-section-language = Language and direction
preview-section-appearance = Appearance
preview-section-accessibility = Accessibility
preview-sample-heading = Sample glass card
preview-sample-body = Text on glass must stay sharp and readable over the moving background.

## Fields
field-language = Interface language
field-theme = Theme
field-accent = Accent color
field-glass-blur = Glass blur
field-glass-opacity = Glass opacity
field-ambient-mesh = Animated background mesh
field-density = Density
field-radius = Corner style
field-experience = Experience level
field-screen-reader = Screen reader and accessibility mode
field-screen-reader-hint = Stronger focus outlines, spoken announcements and less motion.
field-reduce-motion = Reduce motion

## Options
density-compact = Compact
density-comfortable = Comfortable
radius-sharp = Sharp
radius-balanced = Balanced
radius-soft = Soft
experience-beginner = Beginner (essential)
experience-intermediate = Intermediate
experience-advanced = Advanced (power user)
theme-obsidian-slate = Obsidian Slate
theme-midnight-carbon = Midnight Carbon
theme-nord-arctic = Nord Arctic
theme-catppuccin-mocha = Catppuccin Mocha
theme-paper-daylight = Paper Daylight
theme-warm-parchment = Warm Parchment

## Status and announcements
status-no-vault = No vault open
status-modules-enabled =
    { $count ->
        [one] { $count } module enabled
       *[other] { $count } modules enabled
    }
announce-language-changed = Language changed to { $language }
announce-theme-changed = Theme changed to { $theme }
announce-setting-saved = Setting saved
action-reset-defaults = Reset to defaults

## Errors (one per core error code)
error-io = The file could not be read or written.
error-corrupt-data = A settings file was damaged and has been reset. A backup was kept.
error-invalid-vault-name = Please enter a valid vault name.
error-already-exists = A folder with this name already exists.
error-not-found = The folder could not be found.
error-not-a-folder = The selected path is not a folder.
error-unknown = Something went wrong: { $detail }

## Phase 1: shell, explorer, editor, onboarding
tab-files = Files
tab-recent = Recent
tab-search = Search
tab-tags = Tags
tab-starred = Starred
tab-calendar = Calendar
tab-links = Links
tab-outline = Outline
tab-focus = Focus
tab-history = History
action-new-note = New Note
action-new-folder = New Folder
action-delete = Delete
action-cancel = Cancel
action-close = Close
mode-editor = Editor
mode-split = Split
mode-reader = Reader
status-saved = Saved
status-saving = Saving...
links-backlinks = Linked Mentions
links-outgoing = Outgoing Links
links-unlinked = Unlinked Mentions
empty-title = No note is currently open
empty-subtitle = Create a new Markdown note, explore your Home Dashboard, or jump back into a recent file.
vault-welcome-title = Choose Your Workspace Vault
vault-open-default = Open Default Vault
vault-create-new = Create New Vault
vault-load-existing = Load Existing Vault
vault-switcher-title = Switch Vault
footer-ambient = Ambient Effects & Music
ribbon-quick-switcher = Quick Switcher
ribbon-command-palette = Command Palette
ribbon-mindmap = Mindmap
ribbon-kanban = Kanban
ribbon-slides = Presentation Slides
ribbon-daily-note = Daily Note
ribbon-projects = Projects
confirm-delete-title = Delete Note?
no-starred = No starred notes yet.
no-tags = No tags found across your vault.
search-placeholder = Search notes and content...
no-results = No matching results found
tab-srs = Review stats
left-tabs-label = Sidebar sections
action-sort = Change sort order
action-reveal-active = Reveal active file
action-collapse-all = Collapse all folders
action-rename = Rename
action-open = Open
action-create = Create
action-star = Star note
action-unstar = Remove star
action-close-tab = Close tab
sort-name-asc = Name (A to Z)
sort-name-desc = Name (Z to A)
sort-modified-new = Modified (newest first)
sort-modified-old = Modified (oldest first)
sort-created-new = Created (newest first)
sort-created-old = Created (oldest first)
status-words = { $count } words
status-chars = { $count } characters
status-read-time = { $minutes } min read
status-backlinks = { $count } backlinks
outline-empty = This note has no headings yet.
links-none = No links yet.
panel-coming-soon = This panel arrives in a later phase.
vault-create-new-desc = Start clean with an empty vault folder on this device.
vault-load-existing-desc = Open any folder of Markdown and PDF files. Your files stay where they are.
vault-welcome-subtitle = Start with the sample vault, create a fresh empty vault, or open your existing notes folder.
vault-open-default-desc = Explore NoSidian with sample notes, flashcards, Kanban and the 3D companion.
vault-name-placeholder = New vault name
vault-create-btn = Create and open
vault-pick-folder = Open local folder
vault-choose-location = Location: { $path }
vault-change-location = Change location
footer-terminal = Integrated terminal
footer-settings = Settings
ribbon-media = Cinema and books
ribbon-terminal = Integrated terminal
ribbon-toggle-left = Toggle left sidebar
ribbon-toggle-right = Toggle right sidebar
ribbon-more = More tools
nav-files = Files
nav-workspace = Workspace
nav-new = New note
nav-context = Context
nav-more = More
nav-label = Main navigation
untitled-note = Untitled
prompt-note-name = Note name
prompt-folder-name = Folder name
confirm-delete-body = “{ $name }” will be moved to the vault trash folder. You can restore it from there.
resize-left = Resize left sidebar
resize-right = Resize context panel
announce-opened = Opened { $name }
announce-saved = Note saved
editor-label = Note editor
view-mode-label = View mode
tabs-label = Open notes
onboarding-step = Step { $current } of { $total }
onboarding-language-title = Choose your language
onboarding-language-hint = The rest of setup continues in this language. You can change it any time in Settings.
onboarding-experience-title = What is your experience level with knowledge and note apps like this?
onboarding-experience-hint = This only sets which panels start visible. You can turn any module on or off later in Settings.
experience-beginner-desc = A calm, simple start. Developer and power panels stay hidden.
experience-intermediate-desc = Core notes, dashboard, flashcards, media shelf and basic customization.
experience-advanced-desc = Everything: Project Mode, terminal, MCP bridge, developer extensions and full customization.
onboarding-personal-title = Make it yours
onboarding-use-case = What will you mainly use NoSidian for?
use-case-study = Study and languages
use-case-writing = Writing
use-case-projects = Projects and coding
use-case-general = General
onboarding-pet = Show the 3D companion pet
onboarding-ambient = Ambient effects and music
onboarding-vault-title = Choose your vault
action-next = Next
action-back = Back
error-invalid-path = This name or path is not allowed in a vault.
error-no-vault = No vault is open.
vault-recent = Recent vaults
