'use client';

import * as React from 'react';

import {
  type UseVirtualFloatingOptions,
  flip,
  offset,
} from '@platejs/floating';
import { upsertLink, validateUrl } from '@platejs/link';
import {
  LinkPlugin,
  type LinkFloatingToolbarState,
  FloatingLinkUrlInput,
  useLinkOpenButtonState,
  useFloatingLinkEdit,
  useFloatingLinkEditState,
  useFloatingLinkInsert,
  useFloatingLinkInsertState,
} from '@platejs/link/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { cva } from 'class-variance-authority';
import { ExternalLink, FileText, Link as LinkIcon, LoaderCircle, Text, Unlink } from 'lucide-react';
import { KEYS } from 'platejs';
import {
  useEditorRef,
  useFormInputProps,
  usePluginOption,
} from 'platejs/react';

import { buttonVariants } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Separator } from '@/components/ui/separator';
import { isLinkInputValid, normalizeLinkInput } from '@/lib/link-utils';
import { isBrowserUrl } from '@/lib/file-types';
import {
  loadOpenLinksInApp,
  requestOpenInAppBrowser,
} from '@/lib/browser-settings';
import {
  isSameFilePath,
  isWorkspaceRelativeLink,
  listWorkspaceFiles,
  openWorkspaceLink,
  type WorkspaceFileEntry,
  useActiveFilePath,
} from '@/lib/wikilink-utils';

const popoverVariants = cva(
  'z-50 w-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-hidden'
);

const inputVariants = cva(
  'flex h-[28px] w-full rounded-md border-none bg-transparent px-1.5 py-1 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-transparent md:text-sm'
);

export function LinkFloatingToolbar({
  state,
}: {
  state?: LinkFloatingToolbarState;
}) {
  console.log('[LinkToolbar] LinkFloatingToolbar render');
  const editor = useEditorRef();
  const activeFilePath = useActiveFilePath();
  const activeCommentId = usePluginOption({ key: KEYS.comment }, 'activeId');
  const activeSuggestionId = usePluginOption(
    { key: KEYS.suggestion },
    'activeId'
  );
  const openButtonState = useLinkOpenButtonState();
  const url = usePluginOption(LinkPlugin, 'url') ?? '';
  const selectedLinkUrl = openButtonState.element?.url ?? url;
  const isWikiLink = isWorkspaceRelativeLink(selectedLinkUrl);
  const [workspaceFiles, setWorkspaceFiles] = React.useState<WorkspaceFileEntry[]>([]);
  const [workspaceSearch, setWorkspaceSearch] = React.useState('');
  const [isWorkspaceFilesLoading, setIsWorkspaceFilesLoading] = React.useState(false);
  const [workspaceFilesError, setWorkspaceFilesError] = React.useState<string | null>(
    null
  );
  const loadWorkspaceTokenRef = React.useRef(0);
  const normalizedUrl = React.useMemo(() => normalizeLinkInput(url), [url]);
  const urlError = React.useMemo(() => {
    if (isWikiLink) {
      return null;
    }

    if (!url.trim()) {
      return null;
    }

    return validateUrl(editor, normalizedUrl) ? null : 'Enter a valid link';
  }, [editor, isWikiLink, normalizedUrl, url]);

  const floatingOptions: UseVirtualFloatingOptions = React.useMemo(
    () => ({
      middleware: [
        offset(8),
        flip({
          fallbackPlacements: ['bottom-end', 'top-start', 'top-end'],
          padding: 12,
        }),
      ],
      placement:
        activeSuggestionId || activeCommentId ? 'top-start' : 'bottom-start',
    }),
    [activeCommentId, activeSuggestionId]
  );

  const insertState = useFloatingLinkInsertState({
    ...state,
    floatingOptions: {
      ...floatingOptions,
      ...state?.floatingOptions,
    },
  });
  const {
    hidden,
    props: insertProps,
    ref: insertRef,
    textInputProps,
  } = useFloatingLinkInsert(insertState);

  const editState = useFloatingLinkEditState({
    ...state,
    floatingOptions: {
      ...floatingOptions,
      ...state?.floatingOptions,
    },
  });
  const {
    editButtonProps,
    props: editProps,
    ref: editRef,
    unlinkButtonProps,
  } = useFloatingLinkEdit(editState);
  const inputProps = useFormInputProps({
    preventDefaultOnEnterKeydown: true,
  });

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
    if (!isWikiLink || !editState.isEditing) {
      setWorkspaceSearch('');
      return;
    }

    let cancelled = false;
    const loadToken = ++loadWorkspaceTokenRef.current;

    const loadFiles = async () => {
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

    void loadFiles();

    return () => {
      cancelled = true;
    };
  }, [editState.isEditing, isWikiLink]);

  const handleWikiLinkSelect = React.useCallback(
    (file: WorkspaceFileEntry) => {
      if (isSameFilePath(file.path, activeFilePath)) {
        return;
      }

      editor.setOption(LinkPlugin, 'url', file.relativePath);
      editor.tf.setNodes(
        {
          url: file.relativePath,
        },
        {
          match: (node) =>
            typeof node === 'object' &&
            node !== null &&
            'type' in node &&
            (node as { type?: string }).type === 'a',
        }
      );
      setWorkspaceSearch('');
    },
    [activeFilePath, editor]
  );

  const handleLinkInputKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter') {
        return;
      }

      const rawUrl = (editor.getOption(LinkPlugin, 'url') ?? '') as string;
      const rawText = (editor.getOption(LinkPlugin, 'text') ?? '') as string;
      const transformed = normalizeLinkInput(rawUrl);
      const pluginValid = Boolean(transformed) && validateUrl(editor, transformed);
      const localValid = isLinkInputValid(transformed);
      const isValid = pluginValid || localValid;

      console.log('[LinkToolbar] Enter pressed', {
        rawUrl,
        transformed,
        rawText,
        pluginValid,
        localValid,
        isValid,
        hasSelection: Boolean(editor.selection),
        isEditing: editor.getOption(LinkPlugin, 'isEditing'),
        mode: editor.getOption(LinkPlugin, 'mode'),
      });

      if (!isValid) {
        console.log('[LinkToolbar] Enter blocked: invalid URL');
        return;
      }

      if (!editor.selection) {
        console.log('[LinkToolbar] Enter blocked: no editor selection');
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const result = upsertLink(editor, {
        skipValidation: true,
        text: rawText,
        url: transformed,
      });

      console.log('[LinkToolbar] upsertLink result:', result);

      editor.setOption(LinkPlugin, 'isEditing', false);
      editor.setOption(LinkPlugin, 'mode', '');
      editor.setOption(LinkPlugin, 'openEditorId', null);
      editor.setOption(LinkPlugin, 'url', '');
      editor.setOption(LinkPlugin, 'text', '');
      editor.setOption(LinkPlugin, 'updated', false);

      setTimeout(() => {
        if (editor.selection) {
          editor.tf.focus({ at: editor.selection });
        }
      }, 0);
    },
    [editor]
  );

  if (hidden) return null;

  const editContent = editState.isEditing ? (
    isWikiLink ? (
      <WikiLinkFields
        filteredWorkspaceFiles={filteredWorkspaceFiles}
        inputProps={inputProps.props}
        isWorkspaceFilesLoading={isWorkspaceFilesLoading}
        onSelectFile={handleWikiLinkSelect}
        onSearchChange={setWorkspaceSearch}
        searchValue={workspaceSearch}
        textInputProps={textInputProps}
        workspaceFilesError={workspaceFilesError}
      />
    ) : (
      <LinkFields
        isWikiLink={false}
        inputProps={inputProps.props}
        onSubmitKeyDown={handleLinkInputKeyDown}
        textInputProps={textInputProps}
        urlError={urlError}
      />
    )
  ) : (
    <div className="box-content flex items-center">
      <button
        className={buttonVariants({ size: 'sm', variant: 'ghost' })}
        type="button"
        {...editButtonProps}
      >
        {isWikiLink ? 'Edit wiki' : 'Edit link'}
      </button>

      <Separator orientation="vertical" />

      {isWikiLink ? (
        <button
          className={buttonVariants({ size: 'sm', variant: 'ghost' })}
          type="button"
          onClick={() => {
            openWorkspaceLink(selectedLinkUrl);
          }}
        >
          <ExternalLink width={18} />
        </button>
      ) : (
        <button
          className={buttonVariants({ size: 'sm', variant: 'ghost' })}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const target = selectedLinkUrl;
            if (!target || !isBrowserUrl(target)) return;
            if (loadOpenLinksInApp()) {
              requestOpenInAppBrowser(target);
              return;
            }
            void openUrl(target);
          }}
        >
          <ExternalLink width={18} />
        </button>
      )}

      <Separator orientation="vertical" />

      <button
        className={buttonVariants({
          size: 'sm',
          variant: 'ghost',
        })}
        type="button"
        {...unlinkButtonProps}
      >
        <Unlink width={18} />
      </button>
    </div>
  );

  return (
    <>
      <div ref={insertRef} className={popoverVariants()} {...insertProps}>
        <LinkFields
          isWikiLink={false}
          inputProps={inputProps.props}
          onSubmitKeyDown={handleLinkInputKeyDown}
          textInputProps={textInputProps}
          urlError={urlError}
        />
      </div>

      <div ref={editRef} className={popoverVariants()} {...editProps}>
        {editContent}
      </div>
    </>
  );
}

function LinkFields({
  isWikiLink,
  inputProps,
  onSubmitKeyDown,
  textInputProps,
  urlError,
}: {
  isWikiLink: boolean;
  inputProps: React.HTMLAttributes<HTMLDivElement>;
  onSubmitKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  textInputProps: React.InputHTMLAttributes<HTMLInputElement>;
  urlError: string | null;
}) {
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    console.log('[LinkToolbar] LinkFields mounted', { isWikiLink });
    return () => {
      console.log('[LinkToolbar] LinkFields unmounted');
    };
  }, [isWikiLink]);

  React.useEffect(() => {
    const root = wrapperRef.current;
    if (!root) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      console.log('[LinkToolbar] native Enter captured on wrapper');
      const reactEvent = {
        key: event.key,
        preventDefault: () => event.preventDefault(),
        stopPropagation: () => {
          event.stopPropagation();
          event.stopImmediatePropagation();
        },
        get defaultPrevented() {
          return event.defaultPrevented;
        },
      } as unknown as React.KeyboardEvent<HTMLInputElement>;
      onSubmitKeyDown?.(reactEvent);
    };

    root.addEventListener('keydown', handler, true);
    return () => {
      root.removeEventListener('keydown', handler, true);
    };
  }, [onSubmitKeyDown]);

  return (
    <div
      ref={wrapperRef}
      className="flex w-[330px] flex-col"
      {...inputProps}
    >
      <div className="flex items-center">
        <div className="flex items-center pr-1 pl-2 text-muted-foreground">
          <LinkIcon className="size-4" />
        </div>

        <FloatingLinkUrlInput
          className={inputVariants()}
          placeholder={isWikiLink ? 'Workspace file path' : 'Paste link'}
          data-plate-focus
        />
      </div>
      <div
        className={`px-9 pb-1 text-[10px] ${
          urlError ? 'text-destructive' : 'text-muted-foreground'
        }`}
      >
        {urlError ??
          (isWikiLink ? 'Press Enter to save wikilink' : 'Press Enter to confirm')}
      </div>
      <Separator className="my-1" />
      <div className="flex items-center">
        <div className="flex items-center pr-1 pl-2 text-muted-foreground">
          <Text className="size-4" />
        </div>
        <input
          className={inputVariants()}
          placeholder="Text to display"
          data-plate-focus
          {...textInputProps}
        />
      </div>
    </div>
  );
}

function WikiLinkFields({
  filteredWorkspaceFiles,
  inputProps,
  isWorkspaceFilesLoading,
  onSearchChange,
  onSelectFile,
  searchValue,
  textInputProps,
  workspaceFilesError,
}: {
  filteredWorkspaceFiles: WorkspaceFileEntry[];
  inputProps: React.HTMLAttributes<HTMLDivElement>;
  isWorkspaceFilesLoading: boolean;
  onSearchChange: (value: string) => void;
  onSelectFile: (file: WorkspaceFileEntry) => void;
  searchValue: string;
  textInputProps: React.InputHTMLAttributes<HTMLInputElement>;
  workspaceFilesError: string | null;
}) {
  return (
    <div className="flex w-[330px] flex-col" {...inputProps}>
      <Command shouldFilter={false}>
        <CommandInput
          autoFocus
          onValueChange={onSearchChange}
          placeholder="Search workspace files"
          value={searchValue}
        />
        <CommandList className="max-h-52">
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
                    onSelect={() => onSelectFile(file)}
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
      <div className="px-3 pb-1 text-[10px] text-muted-foreground">
        Choose a file to update this wiki link.
      </div>
      <Separator className="my-1" />
      <div className="flex items-center">
        <div className="flex items-center pr-1 pl-2 text-muted-foreground">
          <Text className="size-4" />
        </div>
        <input
          className={inputVariants()}
          placeholder="Text to display"
          data-plate-focus
          {...textInputProps}
        />
      </div>
    </div>
  );
}
