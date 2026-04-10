import { useState } from "react"
import {
  CHECK_LIST,
  ELEMENT_TRANSFORMERS,
  MULTILINE_ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
} from "@lexical/markdown"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin"
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin"
import { TablePlugin } from "@lexical/react/LexicalTablePlugin"

import { ContentEditable } from "@/features/editor/editor-ui/content-editable"
import { ActionsPlugin } from "@/features/editor/plugins/actions/actions-plugin"
import { ClearEditorActionPlugin } from "@/features/editor/plugins/actions/clear-editor-plugin"
import { CounterCharacterPlugin } from "@/features/editor/plugins/actions/counter-character-plugin"
import { EditModeTogglePlugin } from "@/features/editor/plugins/actions/edit-mode-toggle-plugin"
import { ImportExportPlugin } from "@/features/editor/plugins/actions/import-export-plugin"
import { ShareContentPlugin } from "@/features/editor/plugins/actions/share-content-plugin"
import { SpeechToTextPlugin } from "@/features/editor/plugins/actions/speech-to-text-plugin"
import { AutoLinkPlugin } from "@/features/editor/plugins/auto-link-plugin"
import { CodeActionMenuPlugin } from "@/features/editor/plugins/code-action-menu-plugin"
import { CodeHighlightPlugin } from "@/features/editor/plugins/code-highlight-plugin"
import { ComponentPickerMenuPlugin } from "@/features/editor/plugins/component-picker-menu-plugin"
import { ContextMenuPlugin } from "@/features/editor/plugins/context-menu-plugin"
import { DragDropPastePlugin } from "@/features/editor/plugins/drag-drop-paste-plugin"
import { DraggableBlockPlugin } from "@/features/editor/plugins/draggable-block-plugin"
import { AutoEmbedPlugin } from "@/features/editor/plugins/embeds/auto-embed-plugin"
import { TwitterPlugin } from "@/features/editor/plugins/embeds/twitter-plugin"
import { YouTubePlugin } from "@/features/editor/plugins/embeds/youtube-plugin"
import { FloatingLinkEditorPlugin } from "@/features/editor/plugins/floating-link-editor-plugin"
import { FloatingTextFormatToolbarPlugin } from "@/features/editor/plugins/floating-text-format-plugin"
import { ImagesPlugin } from "@/features/editor/plugins/images-plugin"
import { LinkPlugin } from "@/features/editor/plugins/link-plugin"
import { ListMaxIndentLevelPlugin } from "@/features/editor/plugins/list-max-indent-level-plugin"
import { BulletedListPickerPlugin } from "@/features/editor/plugins/picker/bulleted-list-picker-plugin"
import { CheckListPickerPlugin } from "@/features/editor/plugins/picker/check-list-picker-plugin"
import { CodePickerPlugin } from "@/features/editor/plugins/picker/code-picker-plugin"
import { DividerPickerPlugin } from "@/features/editor/plugins/picker/divider-picker-plugin"
import { EmbedsPickerPlugin } from "@/features/editor/plugins/picker/embeds-picker-plugin"
import { HeadingPickerPlugin } from "@/features/editor/plugins/picker/heading-picker-plugin"
import { ImagePickerPlugin } from "@/features/editor/plugins/picker/image-picker-plugin"
import { NumberedListPickerPlugin } from "@/features/editor/plugins/picker/numbered-list-picker-plugin"
import { ParagraphPickerPlugin } from "@/features/editor/plugins/picker/paragraph-picker-plugin"
import { QuotePickerPlugin } from "@/features/editor/plugins/picker/quote-picker-plugin"
import {
  DynamicTablePickerPlugin,
  TablePickerPlugin,
} from "@/features/editor/plugins/picker/table-picker-plugin"
import { TabFocusPlugin } from "@/features/editor/plugins/tab-focus-plugin"
import { HR } from "@/features/editor/transformers/markdown-hr-transformer"
import { IMAGE } from "@/features/editor/transformers/markdown-image-transformer"
import { TABLE } from "@/features/editor/transformers/markdown-table-transformer"
import { TWEET } from "@/features/editor/transformers/markdown-tweet-transformer"
import { enableShareContent, enableSpeechToText } from "@/lib/core/vite-flags"

const placeholder = "Press / for commands..."

export function Plugins({}) {
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null)
  const [isLinkEditMode, setIsLinkEditMode] = useState<boolean>(false)

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem)
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <AutoFocusPlugin />
        <RichTextPlugin
          contentEditable={
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col" ref={onRef}>
                <ContentEditable
                  placeholder={placeholder}
                  className="ContentEditable__root relative block min-h-0 flex-1 overflow-auto px-8 py-4 focus:outline-none"
                />
              </div>
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />

        <ClickableLinkPlugin />
        <CheckListPlugin />
        <HorizontalRulePlugin />
        <TablePlugin />
        <ListPlugin />
        <TabIndentationPlugin />
        <HistoryPlugin />

        <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
        <ImagesPlugin />

        <AutoEmbedPlugin />
        <TwitterPlugin />
        <YouTubePlugin />

        <CodeHighlightPlugin />
        <CodeActionMenuPlugin anchorElem={floatingAnchorElem} />

        <MarkdownShortcutPlugin
          transformers={[
            TABLE,
            HR,
            IMAGE,
            TWEET,
            CHECK_LIST,
            ...ELEMENT_TRANSFORMERS,
            ...MULTILINE_ELEMENT_TRANSFORMERS,
            ...TEXT_FORMAT_TRANSFORMERS,
            ...TEXT_MATCH_TRANSFORMERS,
          ]}
        />
        <TabFocusPlugin />
        <AutoLinkPlugin />
        <LinkPlugin />

        <ComponentPickerMenuPlugin
          baseOptions={[
            ParagraphPickerPlugin(),
            HeadingPickerPlugin({ n: 1 }),
            HeadingPickerPlugin({ n: 2 }),
            HeadingPickerPlugin({ n: 3 }),
            TablePickerPlugin(),
            CheckListPickerPlugin(),
            NumberedListPickerPlugin(),
            BulletedListPickerPlugin(),
            QuotePickerPlugin(),
            CodePickerPlugin(),
            DividerPickerPlugin(),
            EmbedsPickerPlugin({ embed: "tweet" }),
            EmbedsPickerPlugin({ embed: "youtube-video" }),
            ImagePickerPlugin(),
          ]}
          dynamicOptionsFn={DynamicTablePickerPlugin}
        />

        <ContextMenuPlugin />
        <DragDropPastePlugin />

        <FloatingLinkEditorPlugin
          anchorElem={floatingAnchorElem}
          isLinkEditMode={isLinkEditMode}
          setIsLinkEditMode={setIsLinkEditMode}
        />
        <FloatingTextFormatToolbarPlugin
          anchorElem={floatingAnchorElem}
          setIsLinkEditMode={setIsLinkEditMode}
        />

        <ListMaxIndentLevelPlugin />
      </div>
      <ActionsPlugin>
        <div className="bg-background clear-both flex shrink-0 items-center justify-between gap-2 overflow-auto border-t p-1">
          <div className="flex flex-1 justify-start">
            <CounterCharacterPlugin charset="UTF-16" />
          </div>
          <div className="flex flex-1 justify-end">
            {enableSpeechToText ? <SpeechToTextPlugin /> : null}
            {enableShareContent ? <ShareContentPlugin /> : null}
            <ImportExportPlugin />
            <EditModeTogglePlugin />
            <>
              <ClearEditorActionPlugin />
              <ClearEditorPlugin />
            </>
          </div>
        </div>
      </ActionsPlugin>
    </div>
  )
}
