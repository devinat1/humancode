import { createMemo, createSignal } from "solid-js"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { useTheme } from "@tui/context/theme"
import { TextAttributes } from "@opentui/core"
import { Keybind } from "@/util/keybind"
import { Standards } from "@/agent/standards"

const CATALOG: { key: keyof Standards.Config["standards"]; label: string; description: string }[] = [
  { key: "clean", label: "Clean Code Foundations", description: "Naming, functions, structure, error handling" },
  { key: "solid", label: "SOLID Principles", description: "SRP, OCP, LSP, ISP, DIP" },
  { key: "oop", label: "Elegant Objects (OOP)", description: "Immutable objects, no static/nulls/getters" },
  { key: "bob", label: "Clean Code (Bob Martin)", description: "Functions <20 lines, Law of Demeter, TDD" },
  { key: "typescript_react", label: "TypeScript & React", description: "Tailwind-only, named params, strong types" },
  { key: "ddd", label: "Domain-Driven Design", description: "Aggregates, bounded contexts, domain events" },
]

const DEFAULTS: Record<keyof Standards.Config["standards"], boolean> = {
  clean: true,
  solid: true,
  oop: false,
  bob: false,
  typescript_react: false,
  ddd: false,
}

function CheckIcon(props: { checked: boolean }) {
  const { theme } = useTheme()
  if (props.checked) {
    return <span style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>✓ On</span>
  }
  return <span style={{ fg: theme.textMuted }}>○ Off</span>
}

export function DialogStandards(props: { directory: string }) {
  const dialog = useDialog()

  const [enabled, setEnabled] = createSignal<Record<string, boolean>>({ ...DEFAULTS })

  const options = createMemo<DialogSelectOption<string>[]>(() =>
    CATALOG.map((item) => ({
      value: item.key,
      title: item.label,
      description: item.description,
      footer: <CheckIcon checked={!!enabled()[item.key]} />,
    })),
  )

  const keybinds = createMemo(() => [
    {
      keybind: Keybind.parse("space")[0],
      title: "toggle",
      onTrigger: (option: DialogSelectOption<string>) => {
        const key = option.value
        setEnabled((prev) => ({ ...prev, [key]: !prev[key] }))
      },
    },
    {
      keybind: Keybind.parse("return")[0],
      title: "confirm",
      onTrigger: async (_option: DialogSelectOption<string>) => {
        const current = enabled()
        const config: Standards.Config = Standards.Config.parse({
          standards: current,
          custom: [],
        })
        await Standards.save(props.directory, config)
        dialog.clear()
      },
    },
  ])

  return (
    <DialogSelect
      title="Quality Standards (space=toggle, enter=confirm)"
      skipFilter
      options={options()}
      keybind={keybinds()}
      onSelect={() => {
        // Prevent dialog from closing on single item select; use enter keybind to confirm
      }}
    />
  )
}
