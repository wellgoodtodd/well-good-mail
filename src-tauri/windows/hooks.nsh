; Well Good Mail installer hooks (bundle > windows > nsis > installerHooks in tauri.conf.json).
;
; The uninstaller's data box moves the app's data folders to the Recycle Bin instead of deleting them for good,
; so ticking it by mistake can be put right (Help: "Lost your accounts after reinstalling?").
; Before the uninstall runs, the box is noted and cleared, so Tauri's own RmDir is skipped. Afterwards, with the
; app closed, the two folders go to the Recycle Bin. If that fails, they stay where they are rather than being lost.

Var WgmBinData

!macro NSIS_HOOK_PREUNINSTALL
  StrCpy $WgmBinData 0
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    StrCpy $WgmBinData 1
    StrCpy $DeleteAppDataCheckboxState 0
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    SetShellVarContext current
    Delete "$SENDTO\Well Good Mail.lnk"
  ${EndIf}
  ${If} $WgmBinData = 1
    SetShellVarContext current
    DetailPrint "Moving Well Good Mail's data to the Recycle Bin..."
    nsExec::Exec `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName Microsoft.VisualBasic; foreach ($$p in @('$APPDATA\${BUNDLEID}', '$LOCALAPPDATA\${BUNDLEID}')) { if (Test-Path -LiteralPath $$p) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($$p, 'OnlyErrorDialogs', 'SendToRecycleBin') } }"`
    Pop $R9
  ${EndIf}
!macroend

; Right-click › Send to › Well Good Mail: a new email with the chosen files attached (src-tauri/src/sendto.rs).
; Made on every install and update, so it always points at the installed app.
!macro NSIS_HOOK_POSTINSTALL
  SetShellVarContext current
  CreateShortCut "$SENDTO\Well Good Mail.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "--attach" "$INSTDIR\${MAINBINARYNAME}.exe" 0
!macroend
