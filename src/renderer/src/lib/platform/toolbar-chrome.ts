import { cn } from '@/lib/utils'

const shellBase =
  'border-border/60 flex shrink-0 items-center rounded-lg border p-0.5 shadow-[inset_0_1px_0_0_oklch(1_0_0/0.08)] dark:border-white/12'

const shellFill = 'bg-muted/45 backdrop-blur-xl dark:bg-white/[0.09]'

/** Tab strip toolbar cluster (new note + tab overview). */
export const toolbarShellClass = cn(shellBase, 'gap-0.5 pl-1', shellFill)

/** Single icon pill (sidebar collapse / expand when collapsed). */
export const toolbarControlPillClass = cn(shellBase, shellFill)

/** Search field shell. */
export const toolbarSearchShellClass = cn(
  shellBase,
  'relative flex w-full max-w-md items-center',
  shellFill
)
