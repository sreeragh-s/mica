import type { JSX, SVGProps } from 'react'

export type MacSidebarLeadingToolbarIconProps = SVGProps<SVGSVGElement> & {
  /** Set when main-process `electron-liquid-glass` is active (macOS). */
  nativeLiquidGlassActive?: boolean
}

/**
 * Filled “sidebar on the left” glyph (SF Symbols–style `sidebar.leading`); pairs with
 * main-process `electron-liquid-glass` + `liquidGlassControlPillClass` shells.
 */
export function MacSidebarLeadingToolbarIcon({
  className,
  nativeLiquidGlassActive,
  ...rest
}: MacSidebarLeadingToolbarIconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 18 14"
      fill="currentColor"
      className={className}
      data-electron-liquid-glass={nativeLiquidGlassActive ? 'true' : undefined}
      aria-hidden
      {...rest}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.5 1A1.5 1.5 0 0 0 1 2.5v9A1.5 1.5 0 0 0 2.5 13h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 15.5 1h-13Zm0 1H6v10H2.5a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5Zm4.5 0h8.5a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H7V2Z"
      />
    </svg>
  )
}
