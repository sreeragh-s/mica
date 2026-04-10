import { useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { EmojiPicker } from "frimousse"
import { ImageIcon, Smile, X } from "lucide-react"
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
import { InternalNoteLinkClickPlugin } from "@/features/editor/plugins/internal-note-link-click-plugin"
import { LinkHoverPreviewPlugin } from "@/features/editor/plugins/link-hover-preview-plugin"
import { WikiLinkPlugin } from "@/features/editor/plugins/wiki-link-plugin"
import { MarkdownPastePlugin } from "@/features/editor/plugins/markdown-paste-plugin"
import {
  ImageSourceTabs,
  ImagesPlugin,
} from "@/features/editor/plugins/images-plugin"
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
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const placeholder = "Press / for commands..."

function TitleEmojiPickerContent({
  onPick,
}: {
  onPick: (emoji: string) => void
}) {
  return (
    <EmojiPicker.Root
      className="flex h-[min(360px,50vh)] w-[min(320px,92vw)] flex-col gap-2 p-2"
      onEmojiSelect={(item) => {
        onPick(item.emoji)
      }}
    >
      <EmojiPicker.Search
        className="border-input bg-background placeholder:text-muted-foreground h-9 rounded-md border px-2.5 text-sm"
        placeholder="Search…"
      />
      <EmojiPicker.Viewport className="min-h-0 flex-1">
        <EmojiPicker.Loading className="text-muted-foreground flex items-center justify-center text-sm">
          Loading…
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="text-muted-foreground flex items-center justify-center text-sm">
          No emoji found.
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="select-none"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div
                {...props}
                className="bg-background/95 text-muted-foreground sticky top-0 px-1 py-1.5 text-[10px] font-medium uppercase tracking-wide"
              >
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div {...props} className="flex flex-wrap gap-0.5 py-0.5">
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button
                {...props}
                type="button"
                className="hover:bg-accent flex size-8 items-center justify-center rounded-md text-lg hover:text-accent-foreground"
              >
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  )
}

export function Plugins({
  header,
  coverImageSrc,
  onCoverChange,
  titleEmoji,
  onTitleEmojiChange,
  bottomChromePortal,
}: {
  header?: ReactNode
  coverImageSrc?: string | null
  onCoverChange?: (src: string | null) => void
  titleEmoji?: string | null
  onTitleEmojiChange?: (emoji: string | null) => void
  /** When provided, the full bottom bar (stats + tools) portals here (e.g. below terminal). */
  bottomChromePortal?: HTMLElement | null
}) {
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null)
  const [isLinkEditMode, setIsLinkEditMode] = useState<boolean>(false)
  const [isFloatingLinkEditorOpen, setIsFloatingLinkEditorOpen] =
    useState(false)
  const [coverDialogOpen, setCoverDialogOpen] = useState(false)
  const [emojiToolbarPopoverOpen, setEmojiToolbarPopoverOpen] = useState(false)
  const [emojiEditPopoverOpen, setEmojiEditPopoverOpen] = useState(false)

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem)
    }
  }

  const showCoverAdd = Boolean(onCoverChange && !coverImageSrc)
  const showEmojiAdd = Boolean(onTitleEmojiChange && !titleEmoji)
  const showTopMediaBar = showCoverAdd || showEmojiAdd

  const editorBottomBar = (
    <div className="bg-background clear-both flex shrink-0 items-center justify-between gap-2 overflow-x-auto border-t p-1">
      <div className="flex min-w-0 flex-1 justify-start">
        <CounterCharacterPlugin charset="UTF-16" />
      </div>
      <div className="flex shrink-0 flex-nowrap items-center justify-end gap-0.5">
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
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        <AutoFocusPlugin />
        <RichTextPlugin
          contentEditable={
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {coverImageSrc && onCoverChange && (
                <div className="relative w-full shrink-0">
                  <img
                    src={coverImageSrc}
                    alt=""
                    className="max-h-[min(26vh,280px)] w-full object-cover"
                  />
                  <div className="absolute top-3 right-3 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="shadow-sm"
                      onClick={() => setCoverDialogOpen(true)}
                    >
                      Change cover
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="shadow-sm"
                      onClick={() => onCoverChange(null)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}
              <div className="mx-auto min-h-full w-full max-w-4xl">
                <div className="relative flex min-h-full flex-col" ref={onRef}>
                  {(onCoverChange || onTitleEmojiChange) && (
                    <>
                      <Dialog open={coverDialogOpen} onOpenChange={setCoverDialogOpen}>
                        <DialogContent className="sm:max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Add cover</DialogTitle>
                          </DialogHeader>
                          <ImageSourceTabs
                            onConfirm={(payload) => {
                              onCoverChange?.(payload.src)
                              setCoverDialogOpen(false)
                            }}
                          />
                        </DialogContent>
                      </Dialog>
                      {showTopMediaBar ? (
                        <div
                          className={cn(
                            "flex flex-wrap items-center gap-2 px-6 pb-1",
                            coverImageSrc ? "pt-2" : "pt-8"
                          )}
                        >
                          {showEmojiAdd ? (
                            <Popover
                              open={emojiToolbarPopoverOpen}
                              onOpenChange={setEmojiToolbarPopoverOpen}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground h-8 gap-1.5 px-2"
                                >
                                  <Smile className="size-4" aria-hidden />
                                  Add emoji
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="start"
                                className="border-border w-auto p-0 shadow-lg"
                                onOpenAutoFocus={(e) => e.preventDefault()}
                              >
                                <TitleEmojiPickerContent
                                  onPick={(emoji) => {
                                    onTitleEmojiChange?.(emoji)
                                    setEmojiToolbarPopoverOpen(false)
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                          ) : null}
                          {showCoverAdd ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground -ml-2 h-8 gap-1.5 px-2"
                              onClick={() => setCoverDialogOpen(true)}
                            >
                              <ImageIcon className="size-4" aria-hidden />
                              Add cover
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                      {onTitleEmojiChange && titleEmoji ? (
                        <div
                          className={cn(
                            "flex shrink-0 items-center gap-0.5 px-8",
                            showTopMediaBar ? "pt-2" : "pt-8"
                          )}
                        >
                          <Popover
                            open={emojiEditPopoverOpen}
                            onOpenChange={setEmojiEditPopoverOpen}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="hover:bg-muted/60 flex items-center justify-center rounded-md p-0.5 transition-colors"
                                aria-label="Change emoji"
                              >
                                <span className="text-3xl leading-none select-none lg:text-4xl">
                                  {titleEmoji}
                                </span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="border-border w-auto p-0 shadow-lg"
                              onOpenAutoFocus={(e) => e.preventDefault()}
                            >
                              <TitleEmojiPickerContent
                                onPick={(emoji) => {
                                  onTitleEmojiChange(emoji)
                                  setEmojiEditPopoverOpen(false)
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground size-8 shrink-0"
                            aria-label="Remove emoji"
                            onClick={() => onTitleEmojiChange(null)}
                          >
                            <X className="size-4" aria-hidden />
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                  {header ? <div className="shrink-0">{header}</div> : null}
                  <div className="relative">
                    <ContentEditable
                      placeholder={placeholder}
                      className={cn(
                        "ContentEditable__root relative block min-h-full px-8 pb-4 focus:outline-none",
                        showTopMediaBar || (onTitleEmojiChange && titleEmoji)
                          ? "pt-2"
                          : "pt-4"
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ClickableLinkPlugin />
        <InternalNoteLinkClickPlugin />
        <LinkHoverPreviewPlugin disabled={isFloatingLinkEditorOpen} />
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

        <WikiLinkPlugin />
        <ContextMenuPlugin />
        <MarkdownPastePlugin />
        <DragDropPastePlugin />

        <FloatingLinkEditorPlugin
          anchorElem={floatingAnchorElem}
          isLinkEditMode={isLinkEditMode}
          setIsLinkEditMode={setIsLinkEditMode}
          onOpenChange={setIsFloatingLinkEditorOpen}
        />
        <FloatingTextFormatToolbarPlugin
          anchorElem={floatingAnchorElem}
          setIsLinkEditMode={setIsLinkEditMode}
        />

        <ListMaxIndentLevelPlugin />
      </div>
      {bottomChromePortal === undefined ? (
        <ActionsPlugin>{editorBottomBar}</ActionsPlugin>
      ) : bottomChromePortal ? (
        createPortal(editorBottomBar, bottomChromePortal)
      ) : null}
    </div>
  )
}
