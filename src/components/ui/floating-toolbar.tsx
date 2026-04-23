'use client';

import * as React from 'react';

import {
  type UseVirtualFloatingOptions,
  type FloatingToolbarState,
  flip,
  offset,
  useFloatingToolbar,
  useFloatingToolbarState,
} from '@platejs/floating';
import { upsertLink } from '@platejs/link';
import { useComposedRef } from '@udecode/cn';
import { FileText, LoaderCircle } from 'lucide-react';
import { KEYS } from 'platejs';
import {
  useEditorRef,
  useEditorId,
  useEventEditorValue,
  usePluginOption,
} from 'platejs/react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  isSameFilePath,
  listWorkspaceFiles,
  type WorkspaceFileEntry,
  useActiveFilePath,
} from '@/lib/wikilink-utils';
import { cn } from '@/lib/utils';

import { Toolbar } from './toolbar';

type FloatingToolbarWikiLinkContextValue = {
  closeWikiLinkPicker: () => void;
  isWikiLinkPickerOpen: boolean;
  toggleWikiLinkPicker: () => void;
};

const FloatingToolbarWikiLinkContext =
  React.createContext<FloatingToolbarWikiLinkContextValue | null>(null);

export function useFloatingToolbarWikiLink() {
  const context = React.useContext(FloatingToolbarWikiLinkContext);

  if (!context) {
    throw new Error('useFloatingToolbarWikiLink must be used within FloatingToolbar');
  }

  return context;
}


export function FloatingToolbar({
  children,
  className,
  state,
  ...props
}: React.ComponentProps<typeof Toolbar> & {
  state?: FloatingToolbarState;
}) {
  const editor = useEditorRef();
  const editorId = useEditorId();
  const focusedEditorId = useEventEditorValue('focus');
  const activeFilePath = useActiveFilePath();
  const isFloatingLinkOpen = !!usePluginOption({ key: KEYS.link }, 'mode');
  const isAIChatOpen = usePluginOption({ key: KEYS.aiChat }, 'open');
  const [isWikiLinkPickerOpen, setIsWikiLinkPickerOpen] = React.useState(false);
  const [workspaceFiles, setWorkspaceFiles] = React.useState<WorkspaceFileEntry[]>([]);
  const [workspaceSearch, setWorkspaceSearch] = React.useState('');
  const [isWorkspaceFilesLoading, setIsWorkspaceFilesLoading] = React.useState(false);
  const [workspaceFilesError, setWorkspaceFilesError] = React.useState<string | null>(
    null
  );
  const loadWorkspaceTokenRef = React.useRef(0);

  const closeWikiLinkPicker = React.useCallback(() => {
    setIsWikiLinkPickerOpen(false);
    setWorkspaceSearch('');
  }, []);

  const toggleWikiLinkPicker = React.useCallback(() => {
    setIsWikiLinkPickerOpen((open) => !open);
  }, []);

  const floatingOptions: UseVirtualFloatingOptions = React.useMemo(
    () => ({
      middleware: [
        offset(isWikiLinkPickerOpen ? 8 : 12),
        flip({
          fallbackPlacements: isWikiLinkPickerOpen
            ? ['top-start', 'bottom-end', 'top-end']
            : ['top-start', 'top-end', 'bottom-start', 'bottom-end'],
          padding: 12,
        }),
      ],
      placement: isWikiLinkPickerOpen ? 'bottom-start' : 'top',
    }),
    [isWikiLinkPickerOpen]
  );

  const floatingToolbarState = useFloatingToolbarState({
    editorId,
    focusedEditorId: isWikiLinkPickerOpen ? editorId : focusedEditorId,
    hideToolbar: (isFloatingLinkOpen || isAIChatOpen) && !isWikiLinkPickerOpen,
    ...state,
    floatingOptions: isWikiLinkPickerOpen
      ? floatingOptions
      : {
          ...floatingOptions,
          ...state?.floatingOptions,
        },
  });

  const {
    clickOutsideRef,
    hidden,
    props: rootProps,
    ref: floatingRef,
  } = useFloatingToolbar(floatingToolbarState);

  const ref = useComposedRef<HTMLDivElement>(props.ref, floatingRef);

  const filteredWorkspaceFiles = React.useMemo(() => {
    const availableFiles = workspaceFiles.filter(
      (file) => !isSameFilePath(file.path, activeFilePath)
    );
    const query = workspaceSearch.trim().toLowerCase();

    if (!query) {
      return availableFiles.slice(0, 8);
    }

    return availableFiles
      .filter(({ name, relativePath }) => {
        const lowerName = name.toLowerCase();
        const lowerRelativePath = relativePath.toLowerCase();

        return (
          lowerName.includes(query) ||
          lowerRelativePath.includes(query) ||
          lowerRelativePath.replace(/\//g, ' ').includes(query)
        );
      })
      .slice(0, 12);
  }, [activeFilePath, workspaceFiles, workspaceSearch]);

  React.useEffect(() => {
    if (hidden) {
      closeWikiLinkPicker();
    }
  }, [closeWikiLinkPicker, hidden]);

  React.useEffect(() => {
    if (!isWikiLinkPickerOpen) {
      return;
    }

    let cancelled = false;
    const loadToken = ++loadWorkspaceTokenRef.current;

    const loadWorkspaceFiles = async () => {
      setIsWorkspaceFilesLoading(true);
      setWorkspaceFilesError(null);

      try {
        const files = await listWorkspaceFiles();

        if (cancelled || loadToken !== loadWorkspaceTokenRef.current) {
          return;
        }

        if (!files) {
          setWorkspaceFiles([]);
          setWorkspaceFilesError('Open a workspace to link another file.');
          return;
        }

        setWorkspaceFiles(files);
      } catch (error) {
        if (cancelled || loadToken !== loadWorkspaceTokenRef.current) {
          return;
        }

        setWorkspaceFiles([]);
        setWorkspaceFilesError(
          error instanceof Error ? error.message : 'Could not load workspace files.'
        );
      } finally {
        if (!cancelled && loadToken === loadWorkspaceTokenRef.current) {
          setIsWorkspaceFilesLoading(false);
        }
      }
    };

    void loadWorkspaceFiles();

    return () => {
      cancelled = true;
    };
  }, [isWikiLinkPickerOpen]);

  const handleWikiLinkSelect = React.useCallback(
    (file: WorkspaceFileEntry) => {
      if (isSameFilePath(file.path, activeFilePath)) {
        return;
      }

      const selectionText = editor.api.string(editor.selection ?? undefined).trim();

      upsertLink(editor, {
        skipValidation: true,
        text: selectionText ? undefined : file.name,
        url: file.relativePath,
      });

      closeWikiLinkPicker();
    },
    [activeFilePath, closeWikiLinkPicker, editor]
  );

  if (hidden) return null;

  return (
    <div ref={clickOutsideRef}>
      <FloatingToolbarWikiLinkContext.Provider
        value={{
          closeWikiLinkPicker,
          isWikiLinkPickerOpen,
          toggleWikiLinkPicker,
        }}
      >
        <div
          {...rootProps}
          ref={ref}
          className="absolute z-50 print:hidden"
        >
          {isWikiLinkPickerOpen ? (
            <div className="z-50 w-[360px] max-w-[calc(100vw-32px)] rounded-md border bg-popover shadow-md">
              <Command shouldFilter={false}>
                <CommandInput
                  autoFocus
                  onValueChange={setWorkspaceSearch}
                  placeholder="Search workspace files"
                  value={workspaceSearch}
                />

                <CommandList className="max-h-64">
                  {isWorkspaceFilesLoading ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                      <LoaderCircle className="size-3.5 animate-spin" />
                      Indexing workspace files...
                    </div>
                  ) : workspaceFilesError ? (
                    <div className="px-3 py-4 text-xs text-destructive">
                      {workspaceFilesError}
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>No matching files found.</CommandEmpty>

                      <CommandGroup heading="Workspace files">
                        {filteredWorkspaceFiles.map((file) => (
                          <CommandItem
                            key={file.path}
                            onSelect={() => handleWikiLinkSelect(file)}
                            value={file.relativePath}
                          >
                            <FileText className="size-3.5" />
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate">{file.name}</span>
                              <span className="truncate text-[11px] text-muted-foreground">
                                {file.relativePath}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>

              <div className="px-2 pb-2 pt-1 text-[10px] text-muted-foreground">
                Choose a file to link the selected text.
              </div>
            </div>
          ) : (
            <Toolbar
              {...props}
              className={cn(
                'scrollbar-hide max-w-[80vw] overflow-x-auto whitespace-nowrap rounded-md border bg-popover p-1 opacity-100 shadow-md',
                className
              )}
            >
              {children}
            </Toolbar>
          )}
        </div>
      </FloatingToolbarWikiLinkContext.Provider>
    </div>
  );
}
