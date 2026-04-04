import { dlopen, ptr } from "bun:ffi"

const STD_INPUT_HANDLE = -10
const ENABLE_PROCESSED_INPUT = 0x0001

const FILE_TYPE_DISK = 0x0001
const FILE_TYPE_CHAR = 0x0002
const FILE_TYPE_PIPE = 0x0003

const kernel = () =>
  dlopen("kernel32.dll", {
    GetStdHandle: { args: ["i32"], returns: "ptr" },
    GetConsoleMode: { args: ["ptr", "ptr"], returns: "i32" },
    SetConsoleMode: { args: ["ptr", "u32"], returns: "i32" },
    FlushConsoleInputBuffer: { args: ["ptr"], returns: "i32" },
    GetFileType: { args: ["ptr"], returns: "u32" },
  })

let k32: ReturnType<typeof kernel> | undefined

function load() {
  if (process.platform !== "win32") return false
  try {
    k32 ??= kernel()
    return true
  } catch {
    return false
  }
}

/**
 * Clear ENABLE_PROCESSED_INPUT on the console stdin handle.
 */
export function win32DisableProcessedInput() {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load()) return

  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  const buf = new Uint32Array(1)
  if (k32!.symbols.GetConsoleMode(handle, ptr(buf)) === 0) return

  const mode = buf[0]!
  if ((mode & ENABLE_PROCESSED_INPUT) === 0) return
  k32!.symbols.SetConsoleMode(handle, mode & ~ENABLE_PROCESSED_INPUT)
}

/**
 * Discard any queued console input (mouse events, key presses, etc.).
 */
export function win32FlushInputBuffer() {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load()) return

  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  k32!.symbols.FlushConsoleInputBuffer(handle)
}

let unhook: (() => void) | undefined

/**
 * Keep ENABLE_PROCESSED_INPUT disabled.
 *
 * On Windows, Ctrl+C becomes a CTRL_C_EVENT (instead of stdin input) when
 * ENABLE_PROCESSED_INPUT is set. Various runtimes can re-apply console modes
 * (sometimes on a later tick), and the flag is console-global, not per-process.
 *
 * We combine:
 * - A `setRawMode(...)` hook to re-clear after known raw-mode toggles.
 * - A low-frequency poll as a backstop for native/external mode changes.
 */
export function win32InstallCtrlCGuard() {
  if (process.platform !== "win32") return
  if (!process.stdin.isTTY) return
  if (!load()) return
  if (unhook) return unhook

  const stdin = process.stdin as any
  const original = stdin.setRawMode

  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  const buf = new Uint32Array(1)

  if (k32!.symbols.GetConsoleMode(handle, ptr(buf)) === 0) return
  const initial = buf[0]!

  const enforce = () => {
    if (k32!.symbols.GetConsoleMode(handle, ptr(buf)) === 0) return
    const mode = buf[0]!
    if ((mode & ENABLE_PROCESSED_INPUT) === 0) return
    k32!.symbols.SetConsoleMode(handle, mode & ~ENABLE_PROCESSED_INPUT)
  }

  // Some runtimes can re-apply console modes on the next tick; enforce twice.
  const later = () => {
    enforce()
    setImmediate(enforce)
  }

  let wrapped: ((mode: boolean) => unknown) | undefined

  if (typeof original === "function") {
    wrapped = (mode: boolean) => {
      const result = original.call(stdin, mode)
      later()
      return result
    }

    stdin.setRawMode = wrapped
  }

  // Ensure it's cleared immediately too (covers any earlier mode changes).
  later()

  const interval = setInterval(enforce, 100)
  interval.unref()

  let done = false
  unhook = () => {
    if (done) return
    done = true

    clearInterval(interval)
    if (wrapped && stdin.setRawMode === wrapped) {
      stdin.setRawMode = original
    }

    k32!.symbols.SetConsoleMode(handle, initial)
    unhook = undefined
  }

  return unhook
}

/**
 * Fix process.stdin.isTTY on Windows.
 *
 * Bun compiled binaries launched via Node.js spawnSync can report
 * process.stdin.isTTY as false even when stdin is a console handle.
 * This causes code guarded by `!process.stdin.isTTY` (e.g. reading
 * piped input via Bun.stdin.text()) to block forever on a terminal.
 *
 * Uses kernel32 GetFileType to positively identify pipes and files.
 * If stdin is NOT a pipe or file, patches process.stdin.isTTY to true.
 * This "default to TTY" approach is safer: a false-positive TTY just
 * skips piped input, while a false-negative causes a permanent hang.
 */
export function win32FixStdinIsTTY() {
  if (process.platform !== "win32") return
  if (process.stdin.isTTY) return

  // The Node.js wrapper (bin/humancode) passes its own TTY detection via env var.
  // This is more reliable than kernel32 FFI because spawnSync can create internal
  // pipes for stdio: "inherit", making GetFileType return FILE_TYPE_PIPE even when
  // the parent's stdin is a real console handle.
  const parentStdinTTY = process.env.OPENCODE_STDIN_IS_TTY
  if (parentStdinTTY === "1") {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    })
    return
  }
  if (parentStdinTTY === "0") return // genuinely piped by the user

  // No env var — launched directly without the wrapper. Fall back to kernel32 FFI.
  if (!load()) {
    // Can't load kernel32 FFI — default to TTY to prevent blocking forever.
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    })
    return
  }

  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  const fileType = k32!.symbols.GetFileType(handle)

  // Only keep isTTY as false when stdin is definitively a pipe or disk file.
  // For console handles (FILE_TYPE_CHAR), unknown types, or errors,
  // treat as TTY to prevent Bun.stdin.text() from blocking forever.
  if (fileType !== FILE_TYPE_PIPE && fileType !== FILE_TYPE_DISK) {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    })
  }
}
