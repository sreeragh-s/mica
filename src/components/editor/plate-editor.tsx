'use client';

import * as React from 'react';

import debounce from 'lodash/debounce.js';
import { exists, readTextFile, rename, writeTextFile } from '@tauri-apps/plugin-fs';
import { MarkdownPlugin } from '@platejs/markdown';
import { Plate, type PlateChunkProps, usePlateEditor } from 'platejs/react';

import { BottomEditorBar } from '@/components/editor/bottom-editor-bar';
import { EditorKit } from '@/components/editor/editor-kit';
import { Editor, EditorContainer, EditorTitleInput } from '@/components/ui/editor';

interface PlateEditorProps {
  fileName?: string;
  filePath?: string;
  isActive?: boolean;
  zenMode?: boolean;
}

type WikiLinkFocusRequestDetail = {
  text?: string | null;
};

const EMPTY_DOCUMENT = [{ type: 'p', children: [{ text: '' }] }];
const AUTOSAVE_DEBOUNCE_MS = 600;
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
  const switchTokenRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const lastCommittedTitleRef = React.useRef(getBaseName(filePath ?? ''));
  const shouldSkipRenameRef = React.useRef(false);
  const activeFilePathRef = React.useRef<string | undefined>(filePath);
  const skipAutosaveRef = React.useRef(true);
  const editorElementRef = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    activeFilePathRef.current = activeFilePath;
  }, [activeFilePath]);

  const editor = usePlateEditor({
    chunking: {
      chunkSize: 1000,
      contentVisibilityAuto: false,
    },
    plugins: EditorKit,
    value: EMPTY_DOCUMENT,
  });

  const applyEditorContent = React.useCallback(
    (content: string) => {
      const nodes = editor.getApi(MarkdownPlugin).markdown.deserialize(content);
      const nextValue = nodes.length > 0 ? nodes : EMPTY_DOCUMENT;

      skipAutosaveRef.current = true;
      editor.tf.init({
        value: nextValue,
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
            await writeTextFile(path, md);
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

  React.useEffect(() => {
    debouncedSave.flush();
    debouncedSave.cancel();
    skipAutosaveRef.current = true;
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
    const nextTitle = fileName ?? '';
    setTitleValue(getBaseName(nextTitle));
    lastCommittedTitleRef.current = getBaseName(nextTitle);
  }, [fileName, filePath]);

  React.useEffect(() => {
    if (filePath && deferredFilePath !== filePath) {
      setIsLoading(true);
      return;
    }

    if (!deferredFilePath) {
      setActiveFilePath(undefined);
      setIsLoading(false);
      setTitleValue('');
      lastCommittedTitleRef.current = '';
      editor.tf.init({
        value: EMPTY_DOCUMENT,
      });

      return;
    }

    const switchToken = ++switchTokenRef.current;
    const totalStart = performance.now();

    setIsLoading(true);

    void readTextFile(deferredFilePath)
      .then((content) => {
        if (switchToken !== switchTokenRef.current) return;

        const readEnd = performance.now();
        logSwitchMetric(deferredFilePath, 'read', readEnd - totalStart);

        const deserializeStart = performance.now();
        applyEditorContent(content);
        const deserializeEnd = performance.now();
        logSwitchMetric(deferredFilePath, 'deserialize+init', deserializeEnd - deserializeStart);

        setActiveFilePath(deferredFilePath);
        setIsLoading(false);

        requestAnimationFrame(() => {
          if (!mountedRef.current || switchToken !== switchTokenRef.current) return;

          logSwitchMetric(deferredFilePath, 'total-to-paint', performance.now() - totalStart);
        });
      })
      .catch((err) => {
        if (switchToken !== switchTokenRef.current) return;

        console.error('[PlateEditor] Failed to load file:', err);

        editor.tf.init({
          value: EMPTY_DOCUMENT,
        });

        setActiveFilePath(deferredFilePath);
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

      setActiveFilePath(nextPath);
      setTitleValue(trimmedTitle);
      lastCommittedTitleRef.current = trimmedTitle;

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
        debouncedSave();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <EditorContainer
          className={[
            "relative min-h-0 flex-1 overflow-y-auto bg-background",
            zenMode ? "" : "border-b border-border/60",
          ].join(" ")}
        >
          {!zenMode && (
            <EditorTitleInput
              aria-label="File name"
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
          )}
          <Editor ref={editorElementRef} renderChunk={renderEditorChunk} variant="default" />
          {(isLoading || isRenaming) && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3">
              <div className="rounded-full border border-border/60 bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
                {isRenaming ? 'Renaming file…' : 'Loading note…'}
              </div>
            </div>
          )}
        </EditorContainer>
        {!zenMode && <BottomEditorBar filePath={activeFilePath} />}
      </div>

      <React.Suspense fallback={null}>
        <LazySettingsDialog />
      </React.Suspense>
    </Plate>
  );
}
