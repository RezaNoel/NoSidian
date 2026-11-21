# NoSidian

A cross-platform (Windows, Linux, macOS, Android, iOS) studio for knowledge
management, study, projects and focus. Built with **Tauri 2**: all logic in
Rust, UI in **TypeScript + SolidJS**.

Status: **Phase 0 (foundation)**. See `docs/ROADMAP.md`.

## Layout

| Path | What |
|---|---|
| `crates/nosidian-core` | Vaults, app config, per-vault workspace profiles, module presets (pure Rust, no UI) |
| `crates/nosidian-i18n` | Locale checks: every key, in all 14 languages, non-empty, same variables, no English leftovers |
| `src-tauri` | Tauri app and the commands the UI calls |
| `src` | SolidJS UI (shell, i18n runtime, settings store, accessibility helpers) |
| `locales` | `*.ftl` Fluent catalogues, the single source of truth for every UI string |

## Develop

```bash
npm install
npm run tauri dev       # desktop app with hot reload
npm run dev             # UI only in a browser (settings stored in localStorage)
```

Linux needs: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev libxdo-dev`.

## Check

```bash
npm run i18n:check && npm run typecheck && npm test
cargo clippy --workspace --all-targets && cargo test --workspace
```

## Adding a UI string

1. Add `my-key = Text` to `locales/en.ftl`.
2. Add a real translation to **all 13 other** `.ftl` files (the test fails otherwise).
3. `npm run i18n:gen` regenerates typed keys; use `t("my-key")` in the UI.

Brand names that stay identical go in `locales/allow-identical.txt`.

## Release builds

`.github/workflows/build.yml` builds the Windows installer (`.exe`) and the
Android package (`.apk`) when a `v*` tag is pushed or the workflow is run by
hand. Without signing secrets the APK is debug-signed (fine for testing).
For a release APK add `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`
and `ANDROID_KEY_ALIAS` repository secrets.

## License

MIT
