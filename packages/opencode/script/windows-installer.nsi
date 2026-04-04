; HumanCode Windows CLI Installer
; Built with NSIS 3.x
;
; Cross-compiles on Linux via `makensis` (NSIS is a cross-compiler).
; Build-time defines are passed via -D flags from build.ts.

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "WordFunc.nsh"

; ---------- Build-time defines (passed via -D flags from build.ts) ----------
; !define VERSION "1.2.6"
; !define VERSION_QUAD "1.2.6.0"
; !define AVX2_BINARY "path/to/avx2/humancode.exe"
; !define BASELINE_BINARY "path/to/baseline/humancode.exe"
; !define LICENSE_FILE "path/to/LICENSE"
; !define ICON_FILE "path/to/icon.ico"
; !define OUTFILE "path/to/output.exe"

; ---------- Installer metadata ----------
Name "HumanCode ${VERSION}"
OutFile "${OUTFILE}"
RequestExecutionLevel highest

; Version info embedded in the .exe (requires X.X.X.X format)
VIProductVersion "${VERSION_QUAD}"
VIAddVersionKey "ProductName" "HumanCode"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "HumanCode CLI Installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "MIT License"

; ---------- MUI settings ----------
!define MUI_ICON "${ICON_FILE}"
!define MUI_UNICON "${ICON_FILE}"
!define MUI_ABORTWARNING

; ---------- Variables ----------
Var AddToPath
Var IsAdmin

; ---------- Pages ----------
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${LICENSE_FILE}"
!insertmacro MUI_PAGE_DIRECTORY
Page custom OptionsPage OptionsPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ---------- Init ----------
Function .onInit
  ; Default: add to PATH (important for silent installs where options page is skipped)
  StrCpy $AddToPath ${BST_CHECKED}

  ; Detect admin privileges
  UserInfo::GetAccountType
  Pop $0
  ${If} $0 == "Admin"
    StrCpy $IsAdmin "1"
    StrCpy $INSTDIR "$PROGRAMFILES64\HumanCode"
  ${Else}
    StrCpy $IsAdmin "0"
    StrCpy $INSTDIR "$LOCALAPPDATA\HumanCode"
  ${EndIf}
FunctionEnd

; ---------- Options page ----------
Function OptionsPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateCheckbox} 0 0 100% 12u "Add humancode to PATH"
  Pop $1
  ${NSD_SetState} $1 ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

Function OptionsPageLeave
  ${NSD_GetState} $1 $AddToPath
FunctionEnd

; ---------- Installer section ----------
Section "Install"
  SetOutPath "$INSTDIR\bin"

  ; Detect AVX2 support via kernel32 API
  System::Call 'kernel32::IsProcessorFeaturePresent(i 40) i .r0'

  ${If} $0 == 1
    ; AVX2 supported: install optimized as humancode.exe, baseline as fallback
    File "/oname=humancode.exe" "${AVX2_BINARY}"
    File "/oname=humancode-baseline.exe" "${BASELINE_BINARY}"
  ${Else}
    ; No AVX2: install baseline as humancode.exe only
    File "/oname=humancode.exe" "${BASELINE_BINARY}"
  ${EndIf}

  ; Install LICENSE to root
  SetOutPath "$INSTDIR"
  File "/oname=LICENSE" "${LICENSE_FILE}"

  ; Write uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Registry: Add/Remove Programs (HKLM for admin, HKCU for non-admin)
  ${If} $IsAdmin == "1"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "DisplayName" "HumanCode"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "DisplayVersion" "${VERSION}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "UninstallString" '"$INSTDIR\uninstall.exe"'
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "InstallLocation" "$INSTDIR"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "Publisher" "HumanCode"
    WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "NoModify" 1
    WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "NoRepair" 1
    ; Store admin flag for uninstaller
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "InstalledAsAdmin" "1"
  ${Else}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "DisplayName" "HumanCode"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "DisplayVersion" "${VERSION}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "UninstallString" '"$INSTDIR\uninstall.exe"'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "Publisher" "HumanCode"
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "NoModify" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "NoRepair" 1
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "InstalledAsAdmin" "0"
  ${EndIf}

  ; Start Menu shortcut for uninstaller
  CreateDirectory "$SMPROGRAMS\HumanCode"
  CreateShortCut "$SMPROGRAMS\HumanCode\Uninstall HumanCode.lnk" "$INSTDIR\uninstall.exe"

  ; Add to PATH if user opted in
  ${If} $AddToPath == ${BST_CHECKED}
    ${If} $IsAdmin == "1"
      ; Admin: modify system PATH (HKLM)
      ReadRegStr $2 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"
      WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path" "$2;$INSTDIR\bin"
    ${Else}
      ; Non-admin: modify user PATH (HKCU)
      ReadRegStr $2 HKCU "Environment" "Path"
      WriteRegExpandStr HKCU "Environment" "Path" "$2;$INSTDIR\bin"
    ${EndIf}
    ; Notify running applications of environment change
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${EndIf}

SectionEnd

; ---------- Uninstaller section ----------
Section "Uninstall"
  ; Remove files
  Delete "$INSTDIR\bin\humancode.exe"
  Delete "$INSTDIR\bin\humancode-baseline.exe"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR\bin"
  RMDir "$INSTDIR"

  ; Remove Start Menu
  Delete "$SMPROGRAMS\HumanCode\Uninstall HumanCode.lnk"
  RMDir "$SMPROGRAMS\HumanCode"

  ; Detect which hive was used during install
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode" "InstalledAsAdmin"
  ${If} $0 == "1"
    ; Admin install: clean HKLM registry and system PATH
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode"
    ReadRegStr $1 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"
    ${WordReplace} $1 ";$INSTDIR\bin" "" "+" $2
    ${WordReplace} $2 "$INSTDIR\bin;" "" "+" $3
    ${WordReplace} $3 "$INSTDIR\bin" "" "+" $4
    WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path" "$4"
  ${Else}
    ; Non-admin install: clean HKCU registry and user PATH
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode"
    ReadRegStr $1 HKCU "Environment" "Path"
    ${WordReplace} $1 ";$INSTDIR\bin" "" "+" $2
    ${WordReplace} $2 "$INSTDIR\bin;" "" "+" $3
    ${WordReplace} $3 "$INSTDIR\bin" "" "+" $4
    WriteRegExpandStr HKCU "Environment" "Path" "$4"
  ${EndIf}

  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000

SectionEnd
