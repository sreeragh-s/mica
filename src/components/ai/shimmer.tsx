import React from 'react'

function Shimmer({ className, duration, ...props }: React.ComponentProps<"div"> & { duration: number }) {
    return <div className="animate-pulse rounded-md bg-muted" {...props} style={{ animationDuration: `${duration}s` }} />
}

export default Shimmer