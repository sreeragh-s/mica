import { ExportToolbarButton } from "@/components/ui/export-toolbar-button";
import { RedoToolbarButton, UndoToolbarButton } from "@/components/ui/history-toolbar-button";
import { ImportToolbarButton } from "@/components/ui/import-toolbar-button";
import { ModeToolbarButton } from "@/components/ui/mode-toolbar-button";
import { Separator } from "@/components/ui/separator";
import { Toolbar } from "@/components/ui/toolbar";
import { useEditorSelector } from "platejs/react";

interface BottomEditorBarProps {
  filePath?: string;
}

export function BottomEditorBar(_props: BottomEditorBarProps) {
  const characterCount = useEditorSelector(
    (editor) => {
      let count = 0
      const getText = (nodes: unknown[]): void => {
        for (const node of nodes) {
          const n = node as { text?: string; children?: unknown[] }
          if (n.text !== undefined) {
            count += n.text.length
          }
          if (n.children) {
            getText(n.children)
          }
        }
      }
      getText(editor.children as unknown[])
      return count
    },
    []
  );

  return (
    <div className="bottom-bar bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex items-center gap-0.5 h-full">
        <Toolbar className="h-full gap-0.5">
          <ImportToolbarButton size="xs" />
          <ExportToolbarButton size="xs" />

          <Separator orientation="vertical" className="mx-1 h-4 self-center" />

          <UndoToolbarButton size="xs" />
          <RedoToolbarButton size="xs" />

          <Separator orientation="vertical" className="mx-1 h-4 self-center" />

          <ModeToolbarButton size="xs" />
        </Toolbar>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-3 h-full">
        <span className="text-xs text-muted-foreground">
          {characterCount.toLocaleString()} characters
        </span>
      </div>
    </div>
  );
}
