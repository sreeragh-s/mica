'use client';

import * as React from 'react';

import type { Emoji } from '@emoji-mart/data';

import debounce from 'lodash/debounce.js';
import { upsertLink } from '@platejs/link';
import { useEmojiDropdownMenuState } from '@platejs/emoji/react';
import { open } from '@tauri-apps/plugin-dialog';
import { exists, readFile, readTextFile, rename, writeTextFile } from '@tauri-apps/plugin-fs';
import { MarkdownPlugin } from '@platejs/markdown';
import { FileText, LoaderCircle, SmilePlusIcon, XIcon } from 'lucide-react';
import { Plate, type PlateChunkProps, usePlateEditor } from 'platejs/react';

import { BottomEditorBar } from '@/components/editor/bottom-editor-bar';
import { EditorKit } from '@/components/editor/editor-kit';
import { EmojiPicker, EmojiPopover } from '@/components/ui/emoji-toolbar-button';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Editor,
  EditorCoverImage,
  EditorContainer,
  EditorHeaderActions,
  EditorPropertiesSection,
  EditorTitleInput,
  EditorTitleRow,
  type EditorPropertyItem,
} from '@/components/ui/editor';
import {
  isSameFilePath,
  listWorkspaceFiles,
  type WorkspaceFileEntry,
} from '@/lib/wikilink-utils';
import {
  cacheEditorContent,
  cacheParsedEditorBlocks,
  getCachedEditorContent,
  moveEditorCachePath,
  readParsedEditorBlocks,
} from '@/lib/editor-cache';
import { logInstantFeel, warnInstantFeel } from '@/lib/instant-feel-logger';

interface PlateEditorProps {
  fileName?: string;
  filePath?: string;
  isActive?: boolean;
  zenMode?: boolean;
}

type WikiLinkFocusRequestDetail = {
  text?: string | null;
};

type ExternalNoteContentChangedDetail = {
  content?: string | null;
  path?: string | null;
  source?: string | null;
};

const EMPTY_DOCUMENT = [{ type: 'p', children: [{ text: '' }] }];
const AUTOSAVE_DEBOUNCE_MS = 600;
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const OPEN_SELECT_WIKI_EVENT = 'open-select-wiki';
const NOTE_CONTENT_EXTERNAL_CHANGED_EVENT = 'note-content-external-changed';
const LazySettingsDialog = React.lazy(async () => {
  const mod = await import('@/components/editor/settings-dialog');
  return { default: mod.SettingsDialog };
});

function logSwitchMetric(filePath: string, stage: string, duration: number) {
  console.debug(`[PlateEditor] ${stage} (${filePath}): ${duration.toFixed(1)}ms`);
}

function renderEditorChunk({ attributes, children, lowest }: PlateChunkProps) {
  return (
    <div
      {...attributes}
      style={
        lowest
          ? {
              containIntrinsicSize: '800px',
              contentVisibility: 'auto',
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

function getBaseName(filePath: string): string {
  const fileName = filePath.split('/').pop() ?? '';
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) return fileName;
  return fileName.slice(0, lastDot);
}

function parseScalarValue(rawValue: string): boolean | null | number | string {
  const trimmedValue = rawValue.trim();

  if (!trimmedValue) {
    return '';
  }

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }

  if (trimmedValue === 'true') return true;
  if (trimmedValue === 'false') return false;
  if (trimmedValue === 'null' || trimmedValue === '~') return null;

  const numericValue = Number(trimmedValue);
  if (!Number.isNaN(numericValue) && trimmedValue === String(numericValue)) {
    return numericValue;
  }

  return trimmedValue;
}

function parseInlineList(rawValue: string): string[] {
  const content = rawValue.slice(1, -1).trim();

  if (!content) {
    return [];
  }

  return content
    .split(',')
    .map((part) => parseScalarValue(part))
    .map((part) => String(part))
    .filter(Boolean);
}

function parseFrontmatterEntries(frontmatterContent: string): EditorPropertyItem[] {
  const lines = frontmatterContent.split(/\r?\n/);
  const properties: EditorPropertyItem[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);

    if (!match) {
      continue;
    }

    const [, rawKey, rawValue] = match;
    const key = rawKey.trim();
    const inlineValue = rawValue.trim();

    if (inlineValue.startsWith('[') && inlineValue.endsWith(']')) {
      properties.push({ key, value: parseInlineList(inlineValue) });
      continue;
    }

    if (inlineValue) {
      properties.push({ key, value: parseScalarValue(inlineValue) });
      continue;
    }

    const listValues: string[] = [];
    let nestedIndex = index + 1;

    while (nestedIndex < lines.length) {
      const nestedLine = lines[nestedIndex];

      if (!nestedLine.trim()) {
        nestedIndex += 1;
        continue;
      }

      const listMatch = nestedLine.match(/^\s*-\s+(.*)$/);
      if (!listMatch) {
        break;
      }

      listValues.push(String(parseScalarValue(listMatch[1] ?? '')));
      nestedIndex += 1;
    }

    if (listValues.length > 0) {
      properties.push({ key, value: listValues });
      index = nestedIndex - 1;
      continue;
    }

    properties.push({ key, value: '' });
  }

  return properties;
}

function extractFrontmatter(content: string) {
  const match = FRONTMATTER_PATTERN.exec(content);

  if (!match) {
    return {
      body: content,
      frontmatterBlock: '',
      properties: [] as EditorPropertyItem[],
    };
  }

  const frontmatterBlock = match[0];
  const frontmatterContent = match[1] ?? '';

  return {
    body: content.slice(frontmatterBlock.length),
    frontmatterBlock,
    properties: parseFrontmatterEntries(frontmatterContent),
  };
}

function serializeFrontmatterValue(value: boolean | null | number | string | string[]) {
  if (Array.isArray(value)) {
    return value.length > 0 ? `[${value.join(', ')}]` : '[]';
  }

  if (value === null) {
    return '';
  }

  return String(value);
}

function serializeFrontmatter(properties: EditorPropertyItem[]) {
  if (properties.length === 0) {
    return '';
  }

  const content = properties
    .map((property) => `${property.key}: ${serializeFrontmatterValue(property.value)}`.trimEnd())
    .join('\n');

  return `---\n${content}\n---\n`;
}

function getMimeTypeForImage(path: string) {
  const normalizedPath = path.toLowerCase();

  if (normalizedPath.endsWith('.png')) return 'image/png';
  if (normalizedPath.endsWith('.jpg') || normalizedPath.endsWith('.jpeg')) return 'image/jpeg';
  if (normalizedPath.endsWith('.gif')) return 'image/gif';
  if (normalizedPath.endsWith('.webp')) return 'image/webp';
  if (normalizedPath.endsWith('.svg')) return 'image/svg+xml';
  if (normalizedPath.endsWith('.avif')) return 'image/avif';

  return 'application/octet-stream';
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function getPropertyValue(
  properties: EditorPropertyItem[],
  key: string
): EditorPropertyItem['value'] | undefined {
  return properties.find((property) => property.key === key)?.value;
}

function upsertProperty(
  properties: EditorPropertyItem[],
  key: string,
  value: EditorPropertyItem['value']
) {
  const propertyIndex = properties.findIndex((property) => property.key === key);

  if (propertyIndex === -1) {
    return [{ key, value }, ...properties];
  }

  return properties.map((property, index) =>
    index === propertyIndex ? { ...property, value } : property
  );
}

function removeProperty(properties: EditorPropertyItem[], key: string) {
  return properties.filter((property) => property.key !== key);
}

function getVisibleProperties(properties: EditorPropertyItem[]) {
  return properties;
}

function findTextRange(root: HTMLElement, searchText: string) {
  const normalizedSearchText = searchText.trim().toLowerCase();
  if (!normalizedSearchText) {
    return null;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const value = node.textContent ?? '';
      if (!value.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      const parentElement = node.parentElement;
      if (parentElement?.closest('[data-slate-placeholder="true"]')) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let currentNode = walker.nextNode();
  while (currentNode) {
    const nodeText = currentNode.textContent ?? '';
    const matchIndex = nodeText.toLowerCase().indexOf(normalizedSearchText);

    if (matchIndex >= 0) {
      const range = document.createRange();
      range.setStart(currentNode, matchIndex);
      range.setEnd(currentNode, matchIndex + searchText.trim().length);
      return range;
    }

    currentNode = walker.nextNode();
  }

  return null;
}

function NoteLoadingSkeleton() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden bg-background/94">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 px-16 pt-10 sm:px-[max(64px,calc(50%-350px))]">
        <div className="h-8 w-32 animate-pulse rounded-full bg-muted/70" />
        <div className="h-14 w-2/3 animate-pulse rounded-xl bg-muted/70" />
        <div className="space-y-3">
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-muted/60" />
        </div>
        <div className="space-y-3 pt-4">
          <div className="h-4 w-full animate-pulse rounded bg-muted/50" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-muted/50" />
          <div className="h-4 w-4/6 animate-pulse rounded bg-muted/50" />
          <div className="h-4 w-full animate-pulse rounded bg-muted/50" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" />
        </div>
      </div>
    </div>
  );
}

function NoteHeader({
  activeFilePath,
  commitRename,
  isRenaming,
  lastCommittedTitleRef,
  pageCover,
  pageIcon,
  pickCover,
  setTitleValue,
  shouldSkipRenameRef,
  titleValue,
  updateProperties,
}: {
  activeFilePath?: string;
  commitRename: () => Promise<void>;
  isRenaming: boolean;
  lastCommittedTitleRef: React.RefObject<string>;
  pageCover: string | null;
  pageIcon: string | null;
  pickCover: () => void | Promise<void>;
  setTitleValue: React.Dispatch<React.SetStateAction<string>>;
  shouldSkipRenameRef: React.RefObject<boolean>;
  titleValue: string;
  updateProperties: (
    updater: (currentProperties: EditorPropertyItem[]) => EditorPropertyItem[]
  ) => void;
}) {
  const { emojiPickerState, isOpen: isEmojiPickerOpen, setIsOpen: setIsEmojiPickerOpen } =
    useEmojiDropdownMenuState({
      closeOnSelect: true,
    });
  const emojiPicker = (
    <EmojiPicker
      {...emojiPickerState}
      isOpen={isEmojiPickerOpen}
      onSelectEmoji={(emoji: Emoji) => {
        updateProperties((currentProperties) =>
          upsertProperty(currentProperties, 'icon', emoji.skins[0].native)
        );
        emojiPickerState.onSelectEmoji(emoji);
        setIsEmojiPickerOpen(false);
      }}
      setIsOpen={setIsEmojiPickerOpen}
    />
  );

  return (
    <>
      <EditorHeaderActions
        coverControl={pageCover ? null : undefined}
        emojiControl={
          pageIcon ? null : (
            <EmojiPopover
              control={
              <Button
                className="h-7 rounded-full px-2.5 text-muted-foreground hover:text-foreground"
                size="sm"
                type="button"
                variant="ghost"
              >
                <SmilePlusIcon className="size-3.5" />
                Add emoji
              </Button>
              }
              isOpen={isEmojiPickerOpen}
              setIsOpen={setIsEmojiPickerOpen}
            >
              {emojiPicker}
            </EmojiPopover>
          )
        }
        onAddCover={pickCover}
      />
      <EditorTitleRow
        emojiSlot={
          pageIcon ? (
            <>
              <EmojiPopover
                control={
                  <button
                    className="flex size-12 items-center justify-center rounded-2xl bg-transparent text-4xl leading-none outline-none transition-colors hover:bg-muted/35 focus-visible:bg-muted/35"
                    style={{
                      fontFamily:
                        '"Apple Color Emoji", "Segoe UI Emoji", NotoColorEmoji, "Noto Color Emoji", "Segoe UI Symbol", "Android Emoji", EmojiSymbols',
                    }}
                    type="button"
                  >
                    {pageIcon}
                  </button>
                }
                isOpen={isEmojiPickerOpen}
                setIsOpen={setIsEmojiPickerOpen}
              >
                {emojiPicker}
              </EmojiPopover>
              <button
                className="mt-1 flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
                onClick={() => {
                  updateProperties((currentProperties) =>
                    removeProperty(currentProperties, 'icon')
                  );
                  setIsEmojiPickerOpen(false);
                }}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            </>
          ) : undefined
        }
      >
        <EditorTitleInput
          aria-label="File name"
          className="px-0 pt-3 sm:px-0"
          disabled={!activeFilePath || isRenaming}
          onBlur={() => {
            void commitRename();
          }}
          onChange={(event) => {
            setTitleValue(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              shouldSkipRenameRef.current = true;
              setTitleValue(lastCommittedTitleRef.current);
              event.currentTarget.blur();
            }
          }}
          placeholder="Untitled"
          spellCheck={false}
          value={titleValue}
        />
      </EditorTitleRow>
    </>
  );
}

export function PlateEditor({
  fileName,
  filePath,
  isActive: _isActive = false,
  zenMode = false,
}: PlateEditorProps) {
  const deferredFilePath = React.useDeferredValue(filePath);
  const [isLoading, setIsLoading] = React.useState(!!filePath);
  const [activeFilePath, setActiveFilePath] = React.useState(filePath);
  const [titleValue, setTitleValue] = React.useState(getBaseName(fileName ?? ''));
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [properties, setProperties] = React.useState<EditorPropertyItem[]>([]);
  const [hasFrontmatter, setHasFrontmatter] = React.useState(false);
  const [isSelectWikiOpen, setIsSelectWikiOpen] = React.useState(false);
  const [workspaceFiles, setWorkspaceFiles] = React.useState<WorkspaceFileEntry[]>([]);
  const [workspaceSearch, setWorkspaceSearch] = React.useState('');
  const [isWorkspaceFilesLoading, setIsWorkspaceFilesLoading] = React.useState(false);
  const [workspaceFilesError, setWorkspaceFilesError] = React.useState<string | null>(
    null
  );
  const switchTokenRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const loadWorkspaceTokenRef = React.useRef(0);
  const lastCommittedTitleRef = React.useRef(getBaseName(filePath ?? ''));
  const shouldSkipRenameRef = React.useRef(false);
  const activeFilePathRef = React.useRef<string | undefined>(filePath);
  const propertiesRef = React.useRef<EditorPropertyItem[]>([]);
  const hasFrontmatterRef = React.useRef(false);
  const skipAutosaveRef = React.useRef(true);
  const suppressNextOnValueChangeRef = React.useRef(false);
  const lastPersistedContentRef = React.useRef<string | null>(null);
  const hasUserEditRef = React.useRef(false);
  const editorElementRef = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    activeFilePathRef.current = activeFilePath;
  }, [activeFilePath]);

  React.useLayoutEffect(() => {
    propertiesRef.current = properties;
  }, [properties]);

  React.useLayoutEffect(() => {
    hasFrontmatterRef.current = hasFrontmatter;
  }, [hasFrontmatter]);

  const editor = usePlateEditor({
    chunking: {
      chunkSize: 1000,
      contentVisibilityAuto: false,
    },
    plugins: EditorKit,
    value: EMPTY_DOCUMENT,
  });
  const pageIconValue = getPropertyValue(properties, 'icon');
  const pageIcon = typeof pageIconValue === 'string' ? pageIconValue : null;
  const pageCoverValue = getPropertyValue(properties, 'cover');
  const pageCover = typeof pageCoverValue === 'string' ? pageCoverValue : null;
  const visibleProperties = React.useMemo(
    () => getVisibleProperties(properties),
    [properties]
  );
  const filteredWorkspaceFiles = React.useMemo(() => {
    const availableFiles = workspaceFiles.filter(
      (file) => !isSameFilePath(file.path, activeFilePath)
    );
    const query = workspaceSearch.trim().toLowerCase();

    if (!query) {
      return availableFiles.slice(0, 12);
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
      .slice(0, 20);
  }, [activeFilePath, workspaceFiles, workspaceSearch]);

  const applyEditorContent = React.useCallback(
    (content: string, path?: string) => {
      const cachedBlocks = path ? readParsedEditorBlocks(path, content) : null;
      const nodes =
        cachedBlocks ?? editor.getApi(MarkdownPlugin).markdown.deserialize(content);
      const nextValue = nodes.length > 0 ? nodes : EMPTY_DOCUMENT;

      skipAutosaveRef.current = true;
      suppressNextOnValueChangeRef.current = true;
      editor.tf.init({
        value: nextValue,
      });
      if (path) {
        cacheParsedEditorBlocks(path, content, nextValue as unknown[]);
      }
    },
    [editor]
  );

  const snapshotCurrentEditorState = React.useCallback(
    (pathOverride?: string) => {
      const path = pathOverride ?? activeFilePathRef.current;
      if (!path) return;

      const body = editor.getApi(MarkdownPlugin).markdown.serialize();
      const nextContent = hasFrontmatterRef.current
        ? `${serializeFrontmatter(propertiesRef.current)}${body}`
        : body;

      cacheEditorContent(path, nextContent);
      cacheParsedEditorBlocks(path, body, editor.children as unknown[]);
      logInstantFeel('snapshot-editor-state', {
        path,
        hasFrontmatter: hasFrontmatterRef.current,
      });
    },
    [editor]
  );

  const debouncedSave = React.useMemo(
    () =>
      debounce(() => {
        if (skipAutosaveRef.current) return;
        const path = activeFilePathRef.current;
        if (!path) return;

        void (async () => {
          try {
            const md = editor.getApi(MarkdownPlugin).markdown.serialize();
            const nextContent = hasFrontmatterRef.current
              ? `${serializeFrontmatter(propertiesRef.current)}${md}`
              : md;
            if (nextContent === lastPersistedContentRef.current) {
              cacheEditorContent(path, nextContent);
              cacheParsedEditorBlocks(path, md, editor.children as unknown[]);
              logInstantFeel('skipped-editor-save-unchanged', { path });
              return;
            }
            await writeTextFile(path, nextContent);
            cacheEditorContent(path, nextContent);
            cacheParsedEditorBlocks(path, md, editor.children as unknown[]);
            lastPersistedContentRef.current = nextContent;
            logInstantFeel('saved-editor-content', { path, source: 'autosave' });
            window.dispatchEvent(
              new CustomEvent('note-content-saved', {
                detail: {
                  path,
                },
              })
            );
          } catch (err) {
            console.error('[PlateEditor] Auto-save failed:', err);
          }
        })();
      }, AUTOSAVE_DEBOUNCE_MS),
    [editor]
  );

  const updateProperties = React.useCallback(
    (updater: (currentProperties: EditorPropertyItem[]) => EditorPropertyItem[]) => {
      hasUserEditRef.current = true;
      setProperties((currentProperties) => {
        const nextProperties = updater(currentProperties);
        propertiesRef.current = nextProperties;
        return nextProperties;
      });
      hasFrontmatterRef.current = true;
      setHasFrontmatter(true);
      debouncedSave();
    },
    [debouncedSave]
  );

  const pickCover = React.useCallback(async () => {
    const selected = await open({
      filters: [
        {
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'],
          name: 'Images',
        },
      ],
      multiple: false,
    });

    if (!selected || typeof selected !== 'string') {
      return;
    }

    const bytes = await readFile(selected);
    const mimeType = getMimeTypeForImage(selected);
    const base64Url = `data:${mimeType};base64,${bytesToBase64(bytes)}`;

    updateProperties((currentProperties) =>
      upsertProperty(currentProperties, 'cover', base64Url)
    );
  }, [updateProperties]);

  const handleSelectWikiFile = React.useCallback(
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

      setIsSelectWikiOpen(false);
      setWorkspaceSearch('');
    },
    [activeFilePath, editor]
  );

  React.useEffect(() => {
    debouncedSave.flush();
    debouncedSave.cancel();
    skipAutosaveRef.current = true;
    hasUserEditRef.current = false;
  }, [filePath, debouncedSave]);

  React.useEffect(() => {
    if (isLoading || !activeFilePath) return;
    const id = requestAnimationFrame(() => {
      skipAutosaveRef.current = false;
    });
    return () => cancelAnimationFrame(id);
  }, [isLoading, activeFilePath, debouncedSave]);

  React.useEffect(() => {
    return () => {
      skipAutosaveRef.current = false;
      debouncedSave.flush();
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  React.useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    const handleOpenSelectWiki = () => {
      setIsSelectWikiOpen(true);
      setWorkspaceSearch('');
    };

    window.addEventListener(OPEN_SELECT_WIKI_EVENT, handleOpenSelectWiki);
    return () => {
      window.removeEventListener(OPEN_SELECT_WIKI_EVENT, handleOpenSelectWiki);
    };
  }, []);

  React.useEffect(() => {
    if (!isSelectWikiOpen) {
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
          setWorkspaceFilesError('Open a workspace to select a wiki file.');
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
  }, [isSelectWikiOpen]);

  React.useEffect(() => {
    const handleWikiLinkFocusRequest = (event: Event) => {
      if (!_isActive) {
        return;
      }

      const detail = (event as CustomEvent<WikiLinkFocusRequestDetail>).detail;
      const taggedText = detail?.text?.trim();
      const editorElement = editorElementRef.current;

      if (!taggedText || !editorElement) {
        return;
      }

      const tryFocusTaggedText = () => {
        const range = findTextRange(editorElement, taggedText);
        if (!range) {
          return;
        }

        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        const targetElement =
          range.startContainer.nodeType === Node.TEXT_NODE
            ? range.startContainer.parentElement
            : (range.startContainer as HTMLElement);

        targetElement?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          tryFocusTaggedText();
        });
      });
    };

    window.addEventListener('wiki-link-focus-request', handleWikiLinkFocusRequest);
    return () => {
      window.removeEventListener('wiki-link-focus-request', handleWikiLinkFocusRequest);
    };
  }, [_isActive]);

  React.useEffect(() => {
    const handleExternalNoteContentChanged = (event: Event) => {
      const detail = (event as CustomEvent<ExternalNoteContentChangedDetail>).detail;
      const changedPath = detail?.path;
      const currentPath = activeFilePathRef.current;

      if (!_isActive || !changedPath || !currentPath || !isSameFilePath(changedPath, currentPath)) {
        console.debug('[PlateEditor] Ignored external note update', {
          changedPath,
          currentPath,
          isActive: _isActive,
          source: detail?.source ?? null,
        });
        return;
      }

      const loadExternalContent = async () => {
        try {
          console.debug('[PlateEditor] Applying external note update', {
            path: currentPath,
            source: detail.source ?? null,
            suppliedContent: typeof detail.content === 'string',
          });

          debouncedSave.cancel();
          skipAutosaveRef.current = true;
          hasUserEditRef.current = false;

          const content = typeof detail.content === 'string'
            ? detail.content
            : await readTextFile(currentPath);
          const { body, frontmatterBlock, properties: nextProperties } =
            extractFrontmatter(content);

          cacheEditorContent(currentPath, content);
          lastPersistedContentRef.current = content;
          applyEditorContent(body, currentPath);
          setProperties(nextProperties);
          setHasFrontmatter(Boolean(frontmatterBlock));
          setActiveFilePath(currentPath);

          requestAnimationFrame(() => {
            if (activeFilePathRef.current === currentPath) {
              skipAutosaveRef.current = false;
            }
          });

          window.dispatchEvent(
            new CustomEvent('note-content-saved', {
              detail: {
                path: currentPath,
              },
            })
          );
          console.debug('[PlateEditor] Applied external note update', {
            path: currentPath,
            source: detail.source ?? null,
          });
        } catch (error) {
          console.error('[PlateEditor] Failed to apply external note update:', error);
          skipAutosaveRef.current = false;
        }
      };

      void loadExternalContent();
    };

    window.addEventListener(
      NOTE_CONTENT_EXTERNAL_CHANGED_EVENT,
      handleExternalNoteContentChanged
    );
    return () => {
      window.removeEventListener(
        NOTE_CONTENT_EXTERNAL_CHANGED_EVENT,
        handleExternalNoteContentChanged
      );
    };
  }, [_isActive, applyEditorContent, debouncedSave]);

  React.useEffect(() => {
    const nextTitle = fileName ?? '';
    setTitleValue(getBaseName(nextTitle));
    lastCommittedTitleRef.current = getBaseName(nextTitle);
  }, [fileName, filePath]);

  React.useEffect(() => {
    if (filePath && deferredFilePath !== filePath) {
      snapshotCurrentEditorState();
      logInstantFeel('switching-note-begin', {
        currentPath: activeFilePathRef.current ?? null,
        nextPath: filePath,
      });
      setIsLoading(true);
      return;
    }

    if (!deferredFilePath) {
      setActiveFilePath(undefined);
      setIsLoading(false);
      setProperties([]);
      setHasFrontmatter(false);
      setTitleValue('');
      lastCommittedTitleRef.current = '';
      lastPersistedContentRef.current = null;
      hasUserEditRef.current = false;
      suppressNextOnValueChangeRef.current = true;
      editor.tf.init({
        value: EMPTY_DOCUMENT,
      });

      return;
    }

    const switchToken = ++switchTokenRef.current;
    const totalStart = performance.now();
    hasUserEditRef.current = false;
    const cachedContent = getCachedEditorContent(deferredFilePath);
    logInstantFeel(cachedContent ? 'cache-hit' : 'cache-miss', {
      path: deferredFilePath,
    });

    setIsLoading(!cachedContent);

    if (cachedContent != null) {
      const {
        body,
        frontmatterBlock: cachedFrontmatterBlock,
        properties: cachedProperties,
      } = extractFrontmatter(cachedContent);
      lastPersistedContentRef.current = cachedContent;
      applyEditorContent(body, deferredFilePath);
      setProperties(cachedProperties);
      setHasFrontmatter(Boolean(cachedFrontmatterBlock));
      setActiveFilePath(deferredFilePath);
      logSwitchMetric(deferredFilePath, 'cache-hit', performance.now() - totalStart);
    }

    void readTextFile(deferredFilePath)
      .then((content) => {
        if (switchToken !== switchTokenRef.current) return;

        const readEnd = performance.now();
        logSwitchMetric(deferredFilePath, 'read', readEnd - totalStart);

        cacheEditorContent(deferredFilePath, content);
        lastPersistedContentRef.current = content;

        const { body, frontmatterBlock: nextFrontmatterBlock, properties: nextProperties } =
          extractFrontmatter(content);

        if (content !== cachedContent) {
          const deserializeStart = performance.now();
          applyEditorContent(body, deferredFilePath);
          const deserializeEnd = performance.now();
          logSwitchMetric(deferredFilePath, 'deserialize+init', deserializeEnd - deserializeStart);
          logInstantFeel('disk-content-applied', {
            path: deferredFilePath,
            source: cachedContent == null ? 'cold-load' : 'reconcile',
          });
        } else {
          logInstantFeel('disk-content-matched-cache', {
            path: deferredFilePath,
          });
        }

        setProperties(nextProperties);
        setHasFrontmatter(Boolean(nextFrontmatterBlock));
        setActiveFilePath(deferredFilePath);
        setIsLoading(false);
        logInstantFeel('note-ready', {
          path: deferredFilePath,
          durationMs: Math.round(performance.now() - totalStart),
        });

        requestAnimationFrame(() => {
          if (!mountedRef.current || switchToken !== switchTokenRef.current) return;

          logSwitchMetric(deferredFilePath, 'total-to-paint', performance.now() - totalStart);
        });
      })
      .catch((err) => {
        if (switchToken !== switchTokenRef.current) return;

        console.error('[PlateEditor] Failed to load file:', err);
        warnInstantFeel('note-load-failed', {
          path: deferredFilePath,
          error: err instanceof Error ? err.message : String(err),
        });

        suppressNextOnValueChangeRef.current = true;
        editor.tf.init({
          value: EMPTY_DOCUMENT,
        });

        setProperties([]);
        setHasFrontmatter(false);
        setActiveFilePath(deferredFilePath);
        lastPersistedContentRef.current = null;
        hasUserEditRef.current = false;
        setIsLoading(false);
      });
  }, [applyEditorContent, deferredFilePath, editor, filePath]);

  const commitRename = React.useCallback(async () => {
    if (shouldSkipRenameRef.current) {
      shouldSkipRenameRef.current = false;
      setTitleValue(lastCommittedTitleRef.current);
      return;
    }

    const currentPath = activeFilePath;
    const trimmedTitle = titleValue.trim();
    const previousTitle = lastCommittedTitleRef.current;

    if (!currentPath || !trimmedTitle || trimmedTitle === previousTitle) {
      setTitleValue(previousTitle);
      return;
    }

    const ext = getBaseName(currentPath);
    const originalName = currentPath.split('/').pop() ?? '';
    const originalExt = originalName.slice(ext.length);
    const newName = trimmedTitle + originalExt;

    if (newName.includes('/') || newName.includes('\\')) {
      setTitleValue(previousTitle);
      return;
    }

    const parentDir = currentPath.split('/').slice(0, -1).join('/');
    const nextPath = `${parentDir}/${newName}`;

    if (nextPath === currentPath) {
      setTitleValue(previousTitle);
      return;
    }

    try {
      setIsRenaming(true);

      if (await exists(nextPath)) {
        throw new Error(`A file named "${newName}" already exists`);
      }

      await rename(currentPath, nextPath);
      moveEditorCachePath(currentPath, nextPath);
      snapshotCurrentEditorState(nextPath);
      logInstantFeel('renamed-note-cache-moved', {
        from: currentPath,
        to: nextPath,
      });

      setActiveFilePath(nextPath);
      setTitleValue(trimmedTitle);
      lastCommittedTitleRef.current = trimmedTitle;
      hasUserEditRef.current = false;

      window.dispatchEvent(
        new CustomEvent('file-renamed', {
          detail: {
            name: newName,
            nextPath,
            path: currentPath,
          },
        })
      );
    } catch (error) {
      console.error('[PlateEditor] Failed to rename file:', error);
      setTitleValue(previousTitle);
    } finally {
      setIsRenaming(false);
    }
  }, [activeFilePath, titleValue]);

  return (
    <Plate
      editor={editor}
      onValueChange={() => {
        if (suppressNextOnValueChangeRef.current) {
          suppressNextOnValueChangeRef.current = false;
          return;
        }
        if (!hasUserEditRef.current) {
          logInstantFeel('ignored-non-user-editor-change', {
            path: activeFilePathRef.current ?? null,
          });
          return;
        }
        debouncedSave();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <EditorContainer
          onBeforeInputCapture={() => {
            hasUserEditRef.current = true;
          }}
          onDropCapture={() => {
            hasUserEditRef.current = true;
          }}
          onPasteCapture={() => {
            hasUserEditRef.current = true;
          }}
          onKeyDownCapture={(event) => {
            if (event.metaKey || event.ctrlKey || event.altKey) {
              return;
            }
            if (
              event.key.length === 1 ||
              event.key === 'Backspace' ||
              event.key === 'Delete' ||
              event.key === 'Enter' ||
              event.key === 'Tab'
            ) {
              hasUserEditRef.current = true;
            }
          }}
          className={[
            "relative min-h-0 flex-1 overflow-y-auto bg-background",
            zenMode ? "" : "border-b border-border/60",
          ].join(" ")}
        >
          <EditorCoverImage
            onRemove={() => {
              updateProperties((currentProperties) =>
                removeProperty(currentProperties, 'cover')
              );
            }}
            src={pageCover}
          />
          {!zenMode && (
            <NoteHeader
              activeFilePath={activeFilePath}
              commitRename={commitRename}
              isRenaming={isRenaming}
              lastCommittedTitleRef={lastCommittedTitleRef}
              pageCover={pageCover}
              pageIcon={pageIcon}
              pickCover={pickCover}
              setTitleValue={setTitleValue}
              shouldSkipRenameRef={shouldSkipRenameRef}
              titleValue={titleValue}
              updateProperties={updateProperties}
            />
          )}
          <EditorPropertiesSection
            editable={hasFrontmatter}
            onPropertyChange={(key, value) => {
              updateProperties((currentProperties) =>
                currentProperties.map((property) =>
                  property.key === key ? { ...property, value } : property
                )
              );
            }}
            properties={visibleProperties}
          />
          <Editor ref={editorElementRef} renderChunk={renderEditorChunk} variant="default" />
          {isLoading ? <NoteLoadingSkeleton /> : null}
          {isRenaming && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-3">
              <div className="rounded-full border border-border/60 bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
                Renaming file…
              </div>
            </div>
          )}
        </EditorContainer>
        {!zenMode && <BottomEditorBar filePath={activeFilePath} />}
      </div>

      <Dialog
        open={isSelectWikiOpen}
        onOpenChange={(open) => {
          setIsSelectWikiOpen(open);
          if (!open) {
            setWorkspaceSearch('');
          }
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>Select Wiki</DialogTitle>
            <DialogDescription>
              Choose a workspace file to insert as a wiki reference.
            </DialogDescription>
          </DialogHeader>

          <Command shouldFilter={false}>
            <CommandInput
              autoFocus
              onValueChange={setWorkspaceSearch}
              placeholder="Search workspace files"
              value={workspaceSearch}
            />
            <CommandList className="max-h-80">
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
                        onSelect={() => handleSelectWikiFile(file)}
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
        </DialogContent>
      </Dialog>

      <React.Suspense fallback={null}>
        <LazySettingsDialog />
      </React.Suspense>
    </Plate>
  );
}
