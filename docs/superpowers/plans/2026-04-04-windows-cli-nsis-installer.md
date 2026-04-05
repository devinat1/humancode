# Windows CLI NSIS Installer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an NSIS-based `.exe` installer for the HumanCode CLI on Windows that handles AVX2 detection, PATH setup, and Add/Remove Programs integration.

**Architecture:** A standalone `.nsi` script bundles both AVX2 and baseline CLI binaries. The existing `build.ts` is extended to invoke `makensis` after cross-compiling Windows binaries. The CI pipeline installs NSIS and uploads the resulting `.exe` to GitHub Releases.

**Tech Stack:** NSIS 3.x, TypeScript (build.ts modifications), GitHub Actions YAML

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `packages/opencode/script/windows-installer.nsi` | NSIS installer script |
| Modify | `packages/opencode/script/build.ts` | Invoke `makensis` after Windows build, upload `.exe` |
| Modify | `.github/workflows/publish.yml` | Install NSIS in CI |

---

## Chunk 1: NSIS Installer Script

### Task 1: Create the NSIS installer script

**Files:**
- Create: `packages/opencode/script/windows-installer.nsi`

- [ ] **Step 1: Create the NSIS script file**

Create `packages/opencode/script/windows-installer.nsi` with the full installer logic. The script uses `!define` placeholders for version and binary paths that `build.ts` will pass via `-D` flags to `makensis`.

Key design choices:
- Uses `RequestExecutionLevel highest` and detects admin status at runtime via `UserInfo::GetAccountType`
- Admin installs go to `$PROGRAMFILES64\HumanCode` with `HKLM` registry; non-admin to `$LOCALAPPDATA\HumanCode` with `HKCU`
- Initializes `$AddToPath` in `.onInit` so silent installs (`/S`) add to PATH by default
- Strips prerelease suffixes from version for `VIProductVersion` (requires `X.X.X.X` format)
- Includes `WordFunc.nsh` for PATH cleanup in the uninstaller

```nsis
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
```

- [ ] **Step 2: Commit the NSIS script**

```bash
git add packages/opencode/script/windows-installer.nsi
git commit -m "feat: add NSIS installer script for Windows CLI"
```

---

## Chunk 2: Build Integration

### Task 2: Extend build.ts to produce the installer

**Files:**
- Modify: `packages/opencode/script/build.ts:209-218`

- [ ] **Step 1: Add NSIS build step inside the `if (Script.release)` block**

In `build.ts`, the release block (lines 209-218) currently looks like:

```typescript
if (Script.release) {
  for (const key of Object.keys(binaries)) {
    if (key.includes("linux")) {
      await $`tar -czf ../../${key}.tar.gz *`.cwd(`dist/${key}/bin`)
    } else {
      await $`zip -r ../../${key}.zip *`.cwd(`dist/${key}/bin`)
    }
  }
  await $`gh release upload v${Script.version} ./dist/*.zip ./dist/*.tar.gz --clobber`
}
```

Replace the entire `if (Script.release)` block with:

```typescript
if (Script.release) {
  for (const key of Object.keys(binaries)) {
    if (key.includes("linux")) {
      await $`tar -czf ../../${key}.tar.gz *`.cwd(`dist/${key}/bin`)
    } else {
      await $`zip -r ../../${key}.zip *`.cwd(`dist/${key}/bin`)
    }
  }

  // Build Windows NSIS installer if both Windows binary variants were built
  const windowsAvx2Binary = "dist/humancode-windows-x64/bin/humancode.exe"
  const windowsBaselineBinary = "dist/humancode-windows-x64-baseline/bin/humancode.exe"
  if (fs.existsSync(windowsAvx2Binary) && fs.existsSync(windowsBaselineBinary)) {
    const nsiScript = path.join(__dirname, "windows-installer.nsi")
    const outFile = path.resolve("dist/HumanCode-Setup-x64.exe")
    const licenseFile = path.resolve(dir, "../../LICENSE")
    const iconFile = path.resolve(dir, "../desktop/src-tauri/icons/prod/icon.ico")

    // Convert semver to X.X.X.X format for VIProductVersion (strip prerelease suffix)
    const semverMatch = /^(\d+\.\d+\.\d+)/.exec(Script.version)
    const versionQuad = semverMatch ? `${semverMatch[1]}.0` : "0.0.0.0"

    await $`makensis \
      -DVERSION=${Script.version} \
      -DVERSION_QUAD=${versionQuad} \
      -DAVX2_BINARY=${path.resolve(windowsAvx2Binary)} \
      -DBASELINE_BINARY=${path.resolve(windowsBaselineBinary)} \
      -DLICENSE_FILE=${licenseFile} \
      -DICON_FILE=${iconFile} \
      -DOUTFILE=${outFile} \
      ${nsiScript}`
    console.log("Built Windows installer: HumanCode-Setup-x64.exe")
  }

  await $`gh release upload v${Script.version} ./dist/*.zip ./dist/*.tar.gz ./dist/HumanCode-Setup-*.exe --clobber`
}
```

Note: The upload glob uses `./dist/HumanCode-Setup-*.exe` instead of `./dist/*.exe` to avoid accidentally uploading other `.exe` files (like the raw CLI binaries in subdirectories).

- [ ] **Step 2: Verify build.ts has no syntax errors**

Run:
```bash
cd /Users/devinat1/conductor/workspaces/humancode/porto-v2/packages/opencode && bun run script/build.ts --help 2>&1 | head -5 || echo "Syntax check: file parses OK"
```

The script will fail (no `--help` flag) but should not show TypeScript syntax errors.

- [ ] **Step 3: Commit build.ts changes**

```bash
git add packages/opencode/script/build.ts
git commit -m "feat: integrate NSIS installer build into build.ts"
```

---

## Chunk 3: CI Pipeline

### Task 3: Add NSIS to the CI pipeline

**Files:**
- Modify: `.github/workflows/publish.yml:62-85`

- [ ] **Step 1: Add NSIS installation step to the build-cli job**

In `.github/workflows/publish.yml`, in the `build-cli` job (line 62), add a step between `setup-bun` (line 71) and the `Build` step (line 73):

```yaml
      - name: Install NSIS
        run: |
          sudo apt-get update
          sudo apt-get install -y nsis
```

The full `build-cli` job steps should be:
1. `actions/checkout@v3`
2. `./.github/actions/setup-bun`
3. **Install NSIS** (new) -- needed by `build.ts` to create the Windows `.exe` installer
4. Build (existing)
5. `actions/upload-artifact@v4` (existing)

- [ ] **Step 2: Commit CI changes**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: install NSIS in build-cli job for Windows installer"
```

---

## Chunk 4: Verification

### Task 4: Local verification

- [ ] **Step 1: Install makensis locally (macOS)**

```bash
brew install makensis 2>/dev/null || echo "NSIS already installed or not on macOS"
```

- [ ] **Step 2: Create dummy binaries and test NSIS compilation**

NSIS `File` directive requires real files to exist, so create dummy binaries:

```bash
cd /Users/devinat1/conductor/workspaces/humancode/porto-v2/packages/opencode
mkdir -p /tmp/nsis-test
echo "dummy" > /tmp/nsis-test/avx2.exe
echo "dummy" > /tmp/nsis-test/baseline.exe

makensis \
  -DVERSION=1.2.6 \
  -DVERSION_QUAD=1.2.6.0 \
  -DAVX2_BINARY=/tmp/nsis-test/avx2.exe \
  -DBASELINE_BINARY=/tmp/nsis-test/baseline.exe \
  -DLICENSE_FILE=../../LICENSE \
  -DICON_FILE=../desktop/src-tauri/icons/prod/icon.ico \
  -DOUTFILE=/tmp/nsis-test/HumanCode-Setup-x64.exe \
  script/windows-installer.nsi
```

Expected: NSIS compiles without errors. The output `.exe` is a valid Windows installer (not functional with dummy binaries, but proves the script is syntactically correct).

- [ ] **Step 3: Clean up test artifacts**

```bash
rm -rf /tmp/nsis-test
```

- [ ] **Step 4: Review all changes together**

```bash
git diff HEAD~3..HEAD --stat
```

Verify:
- `packages/opencode/script/windows-installer.nsi` was created
- `packages/opencode/script/build.ts` was modified (NSIS invocation + upload glob)
- `.github/workflows/publish.yml` was modified (NSIS install step)

- [ ] **Step 5: Fix any issues found and commit**

If any issues were found during verification, fix and commit:
```bash
git add -A
git commit -m "fix: address NSIS installer issues found during verification"
```
