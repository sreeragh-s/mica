import { useRef, useState } from "react"
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

import { ContentEditable } from "@/components/editor/editor-ui/content-editable"
import { ActionsPlugin } from "@/components/editor/plugins/actions/actions-plugin"
import { ClearEditorActionPlugin } from "@/components/editor/plugins/actions/clear-editor-plugin"
import { CounterCharacterPlugin } from "@/components/editor/plugins/actions/counter-character-plugin"
import { EditModeTogglePlugin } from "@/components/editor/plugins/actions/edit-mode-toggle-plugin"
import { ImportExportPlugin } from "@/components/editor/plugins/actions/import-export-plugin"
import { ShareContentPlugin } from "@/components/editor/plugins/actions/share-content-plugin"
import { SpeechToTextPlugin } from "@/components/editor/plugins/actions/speech-to-text-plugin"
import { AutoLinkPlugin } from "@/components/editor/plugins/auto-link-plugin"
import { CodeActionMenuPlugin } from "@/components/editor/plugins/code-action-menu-plugin"
import { CodeHighlightPlugin } from "@/components/editor/plugins/code-highlight-plugin"
import { ComponentPickerMenuPlugin } from "@/components/editor/plugins/component-picker-menu-plugin"
import { ContextMenuPlugin } from "@/components/editor/plugins/context-menu-plugin"
import { DragDropPastePlugin } from "@/components/editor/plugins/drag-drop-paste-plugin"
import { DraggableBlockPlugin } from "@/components/editor/plugins/draggable-block-plugin"
import { AutoEmbedPlugin } from "@/components/editor/plugins/embeds/auto-embed-plugin"
import { TwitterPlugin } from "@/components/editor/plugins/embeds/twitter-plugin"
import { YouTubePlugin } from "@/components/editor/plugins/embeds/youtube-plugin"
import { FloatingLinkEditorPlugin } from "@/components/editor/plugins/floating-link-editor-plugin"
import { FloatingTextFormatToolbarPlugin } from "@/components/editor/plugins/floating-text-format-plugin"
import { InternalNoteLinkClickPlugin } from "@/components/editor/plugins/internal-note-link-click-plugin"
import { LinkHoverPreviewPlugin } from "@/components/editor/plugins/link-hover-preview-plugin"
import { MarkdownPastePlugin } from "@/components/editor/plugins/markdown-paste-plugin"
import {
  ImageSourceTabs,
  ImagesPlugin,
} from "@/components/editor/plugins/images-plugin"
import { LinkPlugin } from "@/components/editor/plugins/link-plugin"
import { ListMaxIndentLevelPlugin } from "@/components/editor/plugins/list-max-indent-level-plugin"
import { BulletedListPickerPlugin } from "@/components/editor/plugins/picker/bulleted-list-picker-plugin"
import { CheckListPickerPlugin } from "@/components/editor/plugins/picker/check-list-picker-plugin"
import { CodePickerPlugin } from "@/components/editor/plugins/picker/code-picker-plugin"
import { DividerPickerPlugin } from "@/components/editor/plugins/picker/divider-picker-plugin"
import { EmbedsPickerPlugin } from "@/components/editor/plugins/picker/embeds-picker-plugin"
import { HeadingPickerPlugin } from "@/components/editor/plugins/picker/heading-picker-plugin"
import { ImagePickerPlugin } from "@/components/editor/plugins/picker/image-picker-plugin"
import { NumberedListPickerPlugin } from "@/components/editor/plugins/picker/numbered-list-picker-plugin"
import { ParagraphPickerPlugin } from "@/components/editor/plugins/picker/paragraph-picker-plugin"
import { QuotePickerPlugin } from "@/components/editor/plugins/picker/quote-picker-plugin"
import {
  DynamicTablePickerPlugin,
  TablePickerPlugin,
} from "@/components/editor/plugins/picker/table-picker-plugin"
import { TabFocusPlugin } from "@/components/editor/plugins/tab-focus-plugin"
import { HR } from "@/components/editor/transformers/markdown-hr-transformer"
import { IMAGE } from "@/components/editor/transformers/markdown-image-transformer"
import { TABLE } from "@/components/editor/transformers/markdown-table-transformer"
import { TWEET } from "@/components/editor/transformers/markdown-tweet-transformer"
import { enableShareContent, enableSpeechToText } from "@/lib/vite-flags"
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
  title: initialTitle,
  onTitleChange,
  coverImageSrc,
  onCoverChange,
  titleEmoji,
  onTitleEmojiChange,
  bottomChromePortal,
}: {
  title?: string
  onTitleChange?: (title: string) => void
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
  const [titleValue, setTitleValue] = useState(initialTitle ?? "")
  const [coverDialogOpen, setCoverDialogOpen] = useState(false)
  const [emojiToolbarPopoverOpen, setEmojiToolbarPopoverOpen] = useState(false)
  const [emojiEditPopoverOpen, setEmojiEditPopoverOpen] = useState(false)
  const contentEditableContainerRef = useRef<HTMLDivElement>(null)

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem)
    }
  }

  const handleTitleChange = (value: string) => {
    setTitleValue(value)
    onTitleChange?.(value)
  }

  const handleTitleBlur = () => {
    if (!titleValue.trim()) {
      setTitleValue('')
      onTitleChange?.('')
    }
  }

  const focusEditor = () => {
    const ce = contentEditableContainerRef.current?.querySelector<HTMLElement>('[contenteditable="true"]')
    ce?.focus()
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
              <div className="mx-auto min-h-full w-full max-w-3xl">
                <div className="relative flex min-h-full flex-col" ref={onRef}>
                  {onTitleChange !== undefined && (
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
                      <div
                        className={cn(
                          "flex items-center gap-2 px-8 pb-2",
                          showTopMediaBar ? "pt-2" : "pt-8"
                        )}
                      >
                        {onTitleEmojiChange && titleEmoji ? (
                          <div className="flex shrink-0 items-center gap-0.5">
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
                        <input
                          type="text"
                          value={titleValue}
                          onChange={(e) => handleTitleChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "ArrowDown") {
                              e.preventDefault()
                              focusEditor()
                            }
                          }}
                          onBlur={handleTitleBlur}
                          placeholder="Enter title here"
                          className="min-w-0 flex-1 bg-transparent text-3xl font-extrabold text-foreground placeholder:text-muted-foreground/50 focus:outline-none lg:text-4xl"
                        />
                      </div>
                    </>
                  )}
                  <div ref={contentEditableContainerRef} className="relative">
                    <ContentEditable
                      placeholder={placeholder}
                      className="ContentEditable__root relative block min-h-full px-8 py-4 focus:outline-none"
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
        <LinkHoverPreviewPlugin />
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
        <MarkdownPastePlugin />
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
      {bottomChromePortal === undefined ? (
        <ActionsPlugin>{editorBottomBar}</ActionsPlugin>
      ) : bottomChromePortal ? (
        createPortal(editorBottomBar, bottomChromePortal)
      ) : null}
    </div>
  )
}
