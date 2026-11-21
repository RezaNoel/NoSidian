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
