'use client';

import * as React from 'react';

import type {
  CodeDrawingType,
  ViewMode,
} from '@platejs/code-drawing';
import {
  VIEW_MODE,
  CODE_DRAWING_TYPE_ARRAY,
  VIEW_MODE_ARRAY,
  renderCodeDrawing,
  RENDER_DEBOUNCE_DELAY,
  downloadImage,
  DOWNLOAD_FILENAME,
} from '@platejs/code-drawing';
import debounce from 'lodash/debounce.js';
import mermaid from 'mermaid';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

import { useIsMobile } from '@/hooks/use-mobile';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BottomDrawingBar } from '@/components/editor/bottom-drawing-bar';

const AUTOSAVE_DEBOUNCE_MS = 600;
let mermaidInitialized = false;

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(svg)))}`;
}

async function renderMermaidDiagram(content: string) {
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
    });
    mermaidInitialized = true;
  }

  const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
  const { svg } = await mermaid.render(id, content);

  if (!svg) {
    throw new Error('Mermaid rendering failed');
  }

  return svgToDataUrl(svg);
}

type CodeDrawingData = {
  code: string;
  drawingType: CodeDrawingType;
  drawingMode: ViewMode;
};

type CodeDrawingFileViewProps = {
  filePath: string;
};

function CodeDrawingPreview({
  code,
  drawingType,
  drawingMode,
  image,
  loading,
  onCodeChange,
  onDrawingTypeChange,
  onDrawingModeChange,
  readOnly = false,
  isMobile = false,
}: {
  code: string;
  drawingType: CodeDrawingType;
  drawingMode: ViewMode;
  image: string;
  loading: boolean;
  onCodeChange: (code: string) => void;
  onDrawingTypeChange: (type: CodeDrawingType) => void;
  onDrawingModeChange: (mode: ViewMode) => void;
  readOnly?: boolean;
  isMobile?: boolean;
}) {
  const viewMode = drawingMode;
  const showLeftPanel = viewMode === VIEW_MODE.Both || viewMode === VIEW_MODE.Code;
  const showBorder = viewMode === VIEW_MODE.Both;
  const isImageMode = viewMode === VIEW_MODE.Image;

  return (
    <div
      className={`flex ${isMobile ? 'flex-col-reverse' : 'flex-col'} h-full w-full items-stretch bg-background md:flex-row`}
    >
      {showLeftPanel && (
        <div
          className={`${
            isMobile ? 'w-full' : 'min-w-0 flex-1'
          } flex flex-col ${showBorder && !isMobile ? 'border-r' : ''}`}
        >
          {!readOnly && (
            <div className="flex justify-end px-2 pt-2">
              <div className="flex items-center gap-2">
                <Select
                  value={drawingType}
                  onValueChange={onDrawingTypeChange}
                >
                  <SelectTrigger className="h-8 w-[120px] border-0 bg-muted/50 text-xs shadow-none hover:bg-zinc-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    {CODE_DRAWING_TYPE_ARRAY.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={viewMode}
                  onValueChange={(v) => onDrawingModeChange(v as ViewMode)}
                >
                  <SelectTrigger className="h-8 w-[80px] border-0 bg-muted/50 text-xs shadow-none hover:bg-zinc-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    {VIEW_MODE_ARRAY.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="relative flex-1 rounded-md">
            <pre
              className="m-0 flex h-full overflow-x-auto p-8 pr-4 font-mono text-sm leading-[normal] [tab-size:2] print:break-inside-avoid"
            >
              <code className="flex h-full w-full">
                <textarea
                  value={code}
                  onChange={(e) => onCodeChange(e.target.value)}
                  readOnly={readOnly}
                  className="m-0 h-full w-full resize-none overflow-auto border-0 bg-transparent p-0 font-mono text-sm outline-none"
                  placeholder="Enter your code here..."
                  spellCheck={false}
                />
              </code>
            </pre>
          </div>
        </div>
      )}

      {(viewMode === VIEW_MODE.Both || viewMode === VIEW_MODE.Image) && (
        <div
          className={`flex h-full min-w-0 flex-1 flex-col ${isMobile || isImageMode ? '' : 'relative'}`}
        >
          {isImageMode && !readOnly && (
            <div className="flex justify-end px-2 pt-2">
              <div className="flex items-center gap-2">
                <Select
                  value={drawingType}
                  onValueChange={onDrawingTypeChange}
                >
                  <SelectTrigger className="h-8 w-[120px] border-0 bg-muted/50 text-xs shadow-none hover:bg-zinc-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    {CODE_DRAWING_TYPE_ARRAY.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={viewMode}
                  onValueChange={(v) => onDrawingModeChange(v as ViewMode)}
                >
                  <SelectTrigger className="h-8 w-[80px] border-0 bg-muted/50 text-xs shadow-none hover:bg-zinc-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    {VIEW_MODE_ARRAY.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex h-full items-center justify-center rounded-md bg-background p-4">
            {loading && <div className="text-muted-foreground">Loading...</div>}
            {!loading && image && (
              <img
                src={image}
                alt="Code drawing"
                className="max-h-full max-w-full object-contain"
              />
            )}
            {!loading && !image && (
              <div className="text-muted-foreground">
                {code.trim() ? 'Rendering...' : 'Preview will appear here'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const CodeDrawingFileView = React.memo(function CodeDrawingFileView({
  filePath,
}: CodeDrawingFileViewProps) {
  const isMobile = useIsMobile();
  const [initialData, setInitialData] = React.useState<CodeDrawingData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [image, setImage] = React.useState('');
  const [code, setCode] = React.useState('');
  const [drawingType, setDrawingType] = React.useState<CodeDrawingType>('Mermaid');
  const [drawingMode, setDrawingMode] = React.useState<ViewMode>('Both');

  const filePathRef = React.useRef(filePath);
  const skipAutosaveRef = React.useRef(true);
  const lastRequestRef = React.useRef(0);

  React.useLayoutEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  const debouncedRender = React.useMemo(
    () =>
      debounce(
        async (code: string, drawingType: CodeDrawingType) => {
          lastRequestRef.current += 1;
          const requestId = lastRequestRef.current;

          if (!code?.trim()) {
            setImage('');
            setLoading(false);
            return;
          }

          setLoading(true);

          try {
            const imageData =
              drawingType === 'Mermaid'
                ? await renderMermaidDiagram(code)
                : await renderCodeDrawing(drawingType, code);

            if (lastRequestRef.current === requestId) {
              setImage(imageData);
            }
          } catch {
            if (lastRequestRef.current === requestId) {
              setImage('');
            }
          } finally {
            if (lastRequestRef.current === requestId) {
              setLoading(false);
            }
          }
        },
        RENDER_DEBOUNCE_DELAY
      ),
    []
  );

  const debouncedSave = React.useMemo(
    () =>
      debounce(
        async (data: CodeDrawingData) => {
          if (skipAutosaveRef.current) return;

          const path = filePathRef.current;
          if (!path) return;

          try {
            await writeTextFile(path, JSON.stringify(data, null, 2));
          } catch (err) {
            console.error('[CodeDrawingFileView] Auto-save failed:', err);
          }
        },
        AUTOSAVE_DEBOUNCE_MS
      ),
    []
  );

  const updateData = React.useCallback(
    (newCode: string, newDrawingType: CodeDrawingType, newDrawingMode: ViewMode) => {
      setCode(newCode);
      setDrawingType(newDrawingType);
      setDrawingMode(newDrawingMode);
      debouncedSave({ code: newCode, drawingType: newDrawingType, drawingMode: newDrawingMode });
      debouncedRender(newCode, newDrawingType);
    },
    [debouncedSave, debouncedRender]
  );

  const handleCodeChange = React.useCallback(
    (newCode: string) => {
      updateData(newCode, drawingType, drawingMode);
    },
    [updateData, drawingType, drawingMode]
  );

  const handleDrawingTypeChange = React.useCallback(
    (newType: CodeDrawingType) => {
      updateData(code, newType, drawingMode);
    },
    [updateData, code, drawingMode]
  );

  const handleDrawingModeChange = React.useCallback(
    (newMode: ViewMode) => {
      updateData(code, drawingType, newMode);
    },
    [updateData, code, drawingType]
  );

  const handleDownload = React.useCallback(() => {
    if (!image) return;
    downloadImage(image, DOWNLOAD_FILENAME);
  }, [image]);

  React.useEffect(() => {
    debouncedSave.flush();
    debouncedSave.cancel();
    skipAutosaveRef.current = true;
  }, [debouncedSave, filePath]);

  React.useEffect(() => {
    if (isLoading || !initialData) return;

    const id = requestAnimationFrame(() => {
      skipAutosaveRef.current = false;
    });

    return () => cancelAnimationFrame(id);
  }, [initialData, isLoading]);

  React.useEffect(() => {
    return () => {
      skipAutosaveRef.current = false;
      debouncedSave.flush();
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  React.useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    void readTextFile(filePath)
      .then((content) => {
        if (cancelled) return;

        const parsed = JSON.parse(content) as CodeDrawingData;

        setInitialData(parsed);
        setCode(parsed.code ?? '');
        setDrawingType(parsed.drawingType ?? 'Mermaid');
        setDrawingMode(parsed.drawingMode ?? 'Both');
        debouncedRender(parsed.code ?? '', parsed.drawingType ?? 'Mermaid');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[CodeDrawingFileView] Failed to load file:', err);
        setError('Unable to open this Code Drawing file.');
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, debouncedRender]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  if (isLoading || !initialData) {
    return (
      <div className="flex h-full items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        Loading drawing...
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1">
        <CodeDrawingPreview
          code={code}
          drawingType={drawingType}
          drawingMode={drawingMode}
          image={image}
          loading={loading}
          onCodeChange={handleCodeChange}
          onDrawingTypeChange={handleDrawingTypeChange}
          onDrawingModeChange={handleDrawingModeChange}
          readOnly={false}
          isMobile={isMobile}
        />
      </div>
      <BottomDrawingBar
        onDownload={image ? handleDownload : undefined}
        showDownload={!!image}
      />
    </div>
  );
});
