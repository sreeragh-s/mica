'use client';

import * as React from 'react';

import type { VariantProps } from 'class-variance-authority';
import type { PlateContentProps, PlateViewProps } from 'platejs/react';

import { cva } from 'class-variance-authority';
import { ImagePlusIcon, SmilePlusIcon, XIcon } from 'lucide-react';
import { PlateContainer, PlateContent, PlateView } from 'platejs/react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const editorContainerVariants = cva(
  'relative w-full cursor-text select-text overflow-y-auto caret-primary selection:bg-brand/25 focus-visible:outline-none [&_.slate-selection-area]:z-50 [&_.slate-selection-area]:border [&_.slate-selection-area]:border-brand/25 [&_.slate-selection-area]:bg-brand/15',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        comment: cn(
          'flex flex-wrap justify-between gap-1 px-1 py-0.5 text-sm',
          'rounded-md border-[1.5px] border-transparent bg-transparent',
          'has-[[data-slate-editor]:focus]:border-brand/50 has-[[data-slate-editor]:focus]:ring-2 has-[[data-slate-editor]:focus]:ring-brand/30',
          'has-aria-disabled:border-input has-aria-disabled:bg-muted'
        ),
        default: 'h-full',
        demo: 'h-[650px]',
        select: cn(
          'group rounded-md border border-input ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          'has-data-readonly:w-fit has-data-readonly:cursor-default has-data-readonly:border-transparent has-data-readonly:focus-within:[box-shadow:none]'
        ),
      },
    },
  }
);

export function EditorContainer({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof editorContainerVariants>) {
  return (
    <PlateContainer
      className={cn(
        'ignore-click-outside/toolbar',
        editorContainerVariants({ variant }),
        className
      )}
      {...props}
    />
  );
}

export function EditorTitleInput({
  className,
  ...props
}: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'w-full bg-transparent px-16 pt-8 pb-4 text-3xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/70 sm:px-[max(64px,calc(50%-350px))]',
        'selection:bg-brand/25',
        className
      )}
      {...props}
    />
  );
}

export function EditorHeaderActions({
  className,
  coverControl,
  emojiControl,
  onAddCover,
}: {
  className?: string;
  coverControl?: React.ReactNode;
  emojiControl?: React.ReactNode;
  onAddCover?: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-16 pt-6 sm:px-[max(64px,calc(50%-350px))]',
        className
      )}
    >
      {emojiControl === undefined ? (
        <Button
          className="h-7 rounded-full px-2.5 text-muted-foreground hover:text-foreground"
          size="sm"
          type="button"
          variant="ghost"
        >
          <SmilePlusIcon className="size-3.5" />
          Add emoji
        </Button>
      ) : (
        emojiControl
      )}
      {coverControl === undefined ? (
        <Button
          className="h-7 rounded-full px-2.5 text-muted-foreground hover:text-foreground"
          onClick={onAddCover}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ImagePlusIcon className="size-3.5" />
          Add cover
        </Button>
      ) : (
        coverControl
      )}
    </div>
  );
}

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
        'w-full pt-6',
        className
      )}
    >
      <div className="group relative overflow-hidden bg-muted/30">
        <img
          alt="Note cover"
          className="h-52 w-full object-cover"
          src={src}
        />
        {onRemove ? (
          <button
            className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full bg-background/85 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-background hover:text-foreground focus-visible:bg-background focus-visible:text-foreground"
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

export function EditorTitleRow({
  children,
  className,
  emojiSlot,
}: {
  children: React.ReactNode;
  className?: string;
  emojiSlot?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 px-16 sm:px-[max(64px,calc(50%-350px))]',
        className
      )}
    >
      {emojiSlot ? <div className="mt-3 flex shrink-0 items-center gap-1">{emojiSlot}</div> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

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

const editorVariants = cva(
  cn(
    'group/editor',
    'relative w-full cursor-text select-text overflow-x-hidden whitespace-pre-wrap break-words',
    'rounded-md ring-offset-background focus-visible:outline-none',
    '**:data-slate-placeholder:!top-1/2 **:data-slate-placeholder:-translate-y-1/2 placeholder:text-muted-foreground/80 **:data-slate-placeholder:text-muted-foreground/80 **:data-slate-placeholder:opacity-100!',
    '[&_strong]:font-bold'
  ),
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      disabled: {
        true: 'cursor-not-allowed opacity-50',
      },
      focused: {
        true: 'ring-2 ring-ring ring-offset-2',
      },
      variant: {
        ai: 'w-full px-0 text-base md:text-sm',
        aiChat:
          'max-h-[min(70vh,320px)] w-full overflow-y-auto px-3 py-2 text-base md:text-sm',
        comment: cn('rounded-none border-none bg-transparent text-sm'),
        default:
          'size-full px-16 pt-2 pb-72 text-base sm:px-[max(64px,calc(50%-350px))]',
        demo: 'size-full px-16 pt-2 pb-72 text-base sm:px-[max(64px,calc(50%-350px))]',
        fullWidth: 'size-full px-16 pt-2 pb-72 text-base sm:px-24',
        none: '',
        select: 'px-3 py-2 text-base data-readonly:w-fit',
      },
    },
  }
);

export type EditorProps = PlateContentProps &
  VariantProps<typeof editorVariants>;

export const Editor = ({
  className,
  disabled,
  focused,
  variant,
  ref,
  ...props
}: EditorProps & { ref?: React.RefObject<HTMLDivElement | null> }) => (
  <PlateContent
    ref={ref}
    className={cn(
      editorVariants({
        disabled,
        focused,
        variant,
      }),
      className
    )}
    disabled={disabled}
    disableDefaultStyles
    {...props}
  />
);

Editor.displayName = 'Editor';

export function EditorView({
  className,
  variant,
  ...props
}: PlateViewProps & VariantProps<typeof editorVariants>) {
  return (
    <PlateView
      {...props}
      className={cn(editorVariants({ variant }), className)}
    />
  );
}

EditorView.displayName = 'EditorView';
