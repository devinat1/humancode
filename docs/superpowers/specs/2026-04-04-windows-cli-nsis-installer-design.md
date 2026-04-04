# Windows CLI NSIS Installer Design

## Problem

Windows users have no frictionless way to install the HumanCode CLI. Current options require either Node.js (npm) or manual zip extraction with PATH configuration. A proper `.exe` installer is expected on Windows and provides the best user experience.

## Solution

An NSIS 3.x installer (`HumanCode-Setup-x64.exe`) that bundles both AVX2 and baseline CLI binaries, auto-detects the correct variant, installs to a standard location, and integrates with Windows system conventions (PATH, Add/Remove Programs, uninstaller).

## Installer Flow

1. **Welcome page** -- branded with HumanCode icon and product name
2. **License page** -- displays the MIT license
3. **Install directory** -- defaults to `C:\Program Files\HumanCode\` (admin) or `%LOCALAPPDATA%\HumanCode\` (non-admin)
4. **Options page** -- checkbox: "Add humancode to PATH" (checked by default)
5. **Install progress** -- extracts the correct binary (AVX2 or baseline, auto-detected at install time)
6. **Finish page** -- "Installation complete. Open a terminal and run `humancode` to get started."

Supports silent install via `/S` flag for automation and enterprise use.

## File Layout

```
<install-dir>\
  bin\
    humancode.exe            (AVX2 variant if supported, otherwise baseline)
    humancode-baseline.exe   (baseline, only installed on AVX2 machines as fallback)
  LICENSE
  uninstall.exe
```

On non-AVX2 machines, only `humancode.exe` (baseline) is installed -- no duplicate.

## System Integration

- **PATH**: Adds `<install-dir>\bin` to system PATH (admin, `HKLM`) or user PATH (non-admin, `HKCU`)
- **Start Menu**: `HumanCode` folder with "Uninstall HumanCode" shortcut
- **Registry**: Uninstall entry under `HKLM` (admin) or `HKCU` (non-admin) at `Software\Microsoft\Windows\CurrentVersion\Uninstall\HumanCode`, including `DisplayVersion`
- **Version info**: `VIProductVersion` and `VIFileVersion` NSIS directives set on the installer `.exe`
- **No desktop shortcut** -- CLI tool, not a GUI app

## AVX2 Detection

The installer detects AVX2 support using the NSIS `System::Call` plugin (bundled with NSIS 3.x):

```nsis
System::Call 'kernel32::IsProcessorFeaturePresent(i 40) i .r0'
```

This calls `IsProcessorFeaturePresent(PF_AVX2_INSTRUCTIONS_AVAILABLE)`. If `$0 == 1`, the AVX2 binary is installed as `humancode.exe` and baseline as `humancode-baseline.exe`. Otherwise, only the baseline binary is installed as `humancode.exe`.

## Uninstaller

Accessible via Add/Remove Programs or Start Menu shortcut. Removes:
- All installed files under the install directory
- PATH entry (from whichever hive it was added to)
- Start Menu folder
- Registry entries

## Build Integration

**NSIS script**: `packages/opencode/script/windows-installer.nsi`

**build.ts changes**: After compiling Windows binaries (which already happens), invoke `makensis` to produce the installer. The script references the compiled binaries at their exact output paths:
- `dist/humancode-windows-x64/bin/humancode.exe` (AVX2)
- `dist/humancode-windows-x64-baseline/bin/humancode.exe` (baseline)

Output: `packages/opencode/dist/HumanCode-Setup-x64.exe`.

**publish.yml changes**: In the `build-cli` job (runs on `ubuntu-latest`):
1. Add `apt-get install -y nsis` step
2. Add NSIS compilation step after Windows binaries are built
3. Extend the upload glob in `build.ts` to include `*.exe` alongside `*.zip` and `*.tar.gz`

## Artifact Naming

- `HumanCode-Setup-x64.exe` -- uploaded to GitHub Releases

## Out of Scope

- Code signing (can be added later via existing SignPath infrastructure)
- Auto-update mechanism (future enhancement)
- Tauri desktop app changes (separate pipeline)
- npm publishing changes
- ARM64 Windows support (no current demand)

## Decisions

- **NSIS over Inno Setup/WiX**: NSIS is already a CI dependency via the Tauri build pipeline, and `makensis` is available cross-platform via apt, making it the lowest-friction choice. No hand-written `.nsi` scripts exist in the project today, but the ecosystem is familiar.
- **Bundle both binaries**: Simpler than requiring users to know their CPU capabilities. Small size overhead is acceptable for an installer.
- **System PATH by default**: CLI tools should be immediately usable from any terminal after install.
- **RequestExecutionLevel highest**: Installer adapts to admin/non-admin context, using appropriate install directory, registry hive, and PATH location.
- **Script location**: `packages/opencode/script/` follows existing convention for build/CI scripts in this package.
