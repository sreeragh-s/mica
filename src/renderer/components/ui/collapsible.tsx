import * as React from "react"
import {
  Collapsible as CollapsiblePrimitive,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@radix-ui/react-collapsible"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive>) {
  return <CollapsiblePrimitive data-slot="collapsible" {...props} />
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger }

export function CollapsibleSectionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger>) {
  return (
    <CollapsibleTrigger
      data-slot="collapsible-section-trigger"
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md py-2 pr-1 pl-1 text-left text-xs font-semibold tracking-wide text-foreground uppercase",
        "hover:bg-accent/50 [&[data-state=open]>svg]:rotate-180",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 transition-transform duration-200" />
    </CollapsibleTrigger>
  )
}
