import { cn } from '@/lib/utils'

/**
 * Toolbar / search “glass” shells pair with main-process `electron-liquid-glass`
 * (see `attachMacNativeLiquidGlass`); when native glass is active, use lighter CSS blur
 * so the stack doesn’t read as double-thick frosting.
 */
const shellBase =
  'border-border/60 flex shrink-0 items-center rounded-full border p-0.5 shadow-[inset_0_1px_0_0_oklch(1_0_0/0.08)] dark:border-white/12'

function shellIntensity(nativeAttached: boolean): string {
  return nativeAttached
    ? 'bg-muted/30 backdrop-blur-md dark:bg-white/[0.06]'
    : 'bg-muted/45 backdrop-blur-xl dark:bg-white/[0.09]'
}

/** Tab strip toolbar cluster (new note + tab overview). */
export function liquidGlassToolbarShellClass(nativeAttached: boolean): string {
  return cn(shellBase, 'gap-0.5 pl-1', shellIntensity(nativeAttached))
}

/** Single icon pill (sidebar collapse / expand when collapsed). */
export function liquidGlassControlPillClass(nativeAttached: boolean): string {
  return cn(shellBase, shellIntensity(nativeAttached))
}

/** Search field shell. */
export function liquidGlassSearchShellClass(nativeAttached: boolean): string {
  return cn(shellBase, 'relative flex w-full max-w-md items-center', shellIntensity(nativeAttached))
}

/**
 * macOS inset sidebar panel: pairs with main-process `electron-liquid-glass` (full-window glass
 * behind the web view). Translucent tint + backdrop blur over the editor. When native glass is
 * active, set `data-native-liquid-glass` on the host for lighter CSS blur (see `data-[native-liquid-glass]:…`).
 */
export function macSidebarLiquidGlassPanelClass(): string {
  return cn(
    'relative z-10 overflow-hidden border border-solid',
    'border-[color-mix(in_oklch,var(--sidebar-border)_42%,transparent)]',
    'bg-[color-mix(in_oklch,var(--sidebar)_78%,transparent)]',
    '[backdrop-filter:blur(32px)_saturate(1.65)] [-webkit-backdrop-filter:blur(32px)_saturate(1.65)]',
    'data-[native-liquid-glass]:[backdrop-filter:blur(22px)_saturate(1.5)] data-[native-liquid-glass]:[-webkit-backdrop-filter:blur(22px)_saturate(1.5)]',
    'shadow-[0_4px_20px_-4px_oklch(0_0_0/0.1),inset_0_1px_0_0_oklch(1_0_0/0.14),inset_0_-1px_0_0_oklch(0_0_0/0.05)]',
    'dark:border-[color-mix(in_oklch,var(--sidebar-border)_38%,transparent)]',
    'dark:bg-[color-mix(in_oklch,var(--sidebar)_58%,transparent)]',
    'dark:shadow-[0_6px_28px_-6px_oklch(0_0_0/0.42),inset_0_1px_0_0_oklch(1_0_0/0.06),inset_0_-1px_0_0_oklch(0_0_0/0.18)]',
    // If the browser cannot blur, fall back to opaque sidebar (native glass may still show at window edge).
    'supports-[not_((-webkit-backdrop-filter:blur(1px))_or_(backdrop-filter:blur(1px)))]:bg-sidebar',
    'supports-[not_((-webkit-backdrop-filter:blur(1px))_or_(backdrop-filter:blur(1px)))]:[backdrop-filter:none]',
    'supports-[not_((-webkit-backdrop-filter:blur(1px))_or_(backdrop-filter:blur(1px)))]:[-webkit-backdrop-filter:none]'
  )
}
