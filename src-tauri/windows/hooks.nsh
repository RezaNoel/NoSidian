; NoSidian installer hooks.
; Uninstalling removes the app's settings (language, onboarding progress,
; appearance) and the webview cache, so a fresh install starts with the setup
; wizard again. Vaults live in folders the user chose (Documents by default)
; and are never touched. Updates (/UPDATE) keep everything.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    RmDir /r "$APPDATA\${BUNDLEID}"
    RmDir /r "$LOCALAPPDATA\${BUNDLEID}"
  ${EndIf}
!macroend
