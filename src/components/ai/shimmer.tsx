import React from 'react'
import { cn } from "@/lib/utils"

function Shimmer({ className, duration, ...props }: React.ComponentProps<"div"> & { duration: number }) {
    return <div className={cn("animate-pulse rounded-md", className)} {...props} style={{ animationDuration: `${duration}s` }} />
}

export default Shimmer
