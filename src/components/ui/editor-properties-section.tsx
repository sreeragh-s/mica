'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type EditorPropertyValue = boolean | null | number | string | string[];

export interface EditorPropertyItem {
  key: string;
  value: EditorPropertyValue;
}

function formatPropertyValue(value: Exclude<EditorPropertyValue, string[]>) {
  if (value === null) return 'Empty';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

export function EditorPropertiesSection({
  editable = false,
  className,
  onPropertyChange,
  properties,
}: {
  editable?: boolean;
  className?: string;
  onPropertyChange?: (key: string, value: EditorPropertyValue) => void;
  properties: EditorPropertyItem[];
}) {
  if (properties.length === 0) {
    return null;
  }

  return (
    <section
      className={cn(
        'px-16 pt-1 pb-6 sm:px-[max(64px,calc(50%-350px))]',
        className
      )}
    >
      <div className="space-y-0">
        {properties.map((property) => (
          <div
            key={property.key}
            className="group grid grid-cols-[minmax(110px,160px)_1fr] items-center gap-1.5 rounded-md px-1 py-px transition-colors hover:bg-muted/35"
          >
            <div className="truncate text-sm font-medium text-muted-foreground">
              {property.key}
            </div>
            <div className="min-w-0 text-sm text-foreground">
              {editable && onPropertyChange ? (
                Array.isArray(property.value) ? (
                  <input
                    className="h-8 w-full rounded-md bg-transparent px-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 hover:bg-muted/25 focus:bg-muted/35"
                    onChange={(event) => {
                      const nextValues = event.target.value
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean);
                      onPropertyChange(property.key, nextValues);
                    }}
                    placeholder="Add values separated by commas"
                    value={property.value.join(', ')}
                  />
                ) : (
                  <input
                    className="h-8 w-full rounded-md bg-transparent px-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 hover:bg-muted/25 focus:bg-muted/35"
                    onChange={(event) => {
                      onPropertyChange(property.key, event.target.value);
                    }}
                    placeholder="Empty"
                    value={property.value === null ? '' : String(property.value)}
                  />
                )
              ) : Array.isArray(property.value) ? (
                property.value.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {property.value.map((item) => (
                      <Badge
                        key={`${property.key}-${item}`}
                        className="max-w-full truncate border-transparent bg-muted/50 text-foreground hover:bg-muted/70"
                        variant="outline"
                      >
                        {item}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">Empty</span>
                )
              ) : (
                <span className="break-words">{formatPropertyValue(property.value)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
