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
