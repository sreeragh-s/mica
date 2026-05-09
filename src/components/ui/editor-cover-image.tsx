'use client';

import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export function EditorCoverImage({
  className,
  onRemove,
  src,
}: {
  className?: string;
  onRemove?: () => void;
  src?: string | null;
}) {
  if (!src) {
    return null;
  }

  return (
    <div
      className={cn(
        'w-full',
        className
      )}
    >
      <div className="group relative overflow-hidden bg-muted/30">
        <img
          alt="Note cover"
          className="block h-[30vh] max-h-[280px] w-full object-cover object-[center_60%]"
          src={src}
        />
        {onRemove ? (
          <button
            className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full bg-background/85 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity transition-colors hover:bg-background hover:text-foreground focus-visible:bg-background focus-visible:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
            onClick={onRemove}
            type="button"
          >
            <XIcon className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
