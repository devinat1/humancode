import { ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path data-slot="logo-logo-mark-shadow" d="M12 16H4V8H12V16Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-logo-mark-o" d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M60 80H20V40H60V80Z" fill="var(--icon-base)" />
      <path d="M60 20H20V80H60V20ZM80 100H0V0H80V100Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 264 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g>
        <path d="M18 36H6V18H18V36Z" fill="var(--icon-weak-base)" />
        <path d="M18 12H6V36H0V0H6V6H18V12ZM24 36H18V12H24V36Z" fill="var(--icon-base)" />
        <path d="M48 30H36V18H48V30Z" fill="var(--icon-weak-base)" />
        <path d="M48 6H36V30H48V6ZM54 36H30V6H54V36Z" fill="var(--icon-base)" />
        <path d="M78 36H66V18H78V36Z" fill="var(--icon-weak-base)" />
        <path d="M84 12H66V36H60V6H84V12ZM84 36H78V12H84V36Z" fill="var(--icon-base)" />
        <path d="M108 12V18H90V12H108Z" fill="var(--icon-weak-base)" />
        <path d="M108 12H90V18H108V12ZM108 24H96V30H108V24ZM114 36H90V6H114V36Z" fill="var(--icon-base)" />
        <path d="M138 36H126V18H138V36Z" fill="var(--icon-weak-base)" />
        <path d="M138 12H126V36H120V6H138V12ZM144 36H138V12H144V36Z" fill="var(--icon-base)" />
        <path d="M174 30H156V18H174V30Z" fill="var(--icon-weak-base)" />
        <path d="M174 12H156V30H174V36H150V6H174V12Z" fill="var(--icon-strong-base)" />
        <path d="M198 30H186V18H198V30Z" fill="var(--icon-weak-base)" />
        <path d="M198 12H186V30H198V12ZM204 36H180V6H204V36Z" fill="var(--icon-strong-base)" />
        <path d="M228 30H216V18H228V30Z" fill="var(--icon-weak-base)" />
        <path d="M228 12H216V30H228V12ZM234 36H210V6H228V0H234V36Z" fill="var(--icon-strong-base)" />
        <path d="M264 24V30H246V24H264Z" fill="var(--icon-weak-base)" />
        <path d="M246 12V18H258V12H246ZM264 24H246V30H264V36H240V6H264V24Z" fill="var(--icon-strong-base)" />
      </g>
    </svg>
  )
}
