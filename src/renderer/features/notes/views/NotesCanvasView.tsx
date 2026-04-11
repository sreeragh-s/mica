import { useCallback, useEffect, useMemo, type CSSProperties, type JSX } from 'react'
import type { SerializedEditorState } from 'lexical'

import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { FileText, PenLine, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DEFAULT_WORKSPACE_ID } from '@/lib/notes/notes-storage'
import type { SavedNote, Folder } from '@/lib/notes/notes-storage'
import { buildNoteLinkGraph } from '@/lib/notes/note-link-graph'
import { isDrawingNote } from '@/features/notes/notes-app-utils'

import { Editor } from '@/features/blocks/editor-00/editor'
import { ExcalidrawView } from '@/features/notes/views/ExcalidrawView'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NoteCanvasCardData = {
  note: SavedNote
  folderName: string
  allNotes: SavedNote[]
  allFolders: Folder[]
  onNoteSerializedChange: (id: string, serialized: SerializedEditorState) => void
  onExcalidrawSceneChange: (id: string, json: string) => void
  onSelectNote: (notePath: string) => void
  onSetNoteCover: (id: string, src: string | null) => void
  onSetNoteTitleEmoji: (id: string, emoji: string | null) => void
}

type NoteCanvasCardNode = Node<NoteCanvasCardData, 'noteCard'>

export type NotesCanvasViewProps = {
  notes: SavedNote[]
  folders: Folder[]
  isMacNotelab: boolean
  macTitlebarStyles: { noDrag: CSSProperties }
  onSelectNote: (notePath: string) => void
  onClose: () => void
  onNoteSerializedChange: (id: string, serialized: SerializedEditorState) => void
  onExcalidrawSceneChange: (id: string, json: string) => void
  onRenameNote: (id: string, title: string) => void
  onSetNoteCover: (id: string, src: string | null) => void
  onSetNoteTitleEmoji: (id: string, emoji: string | null) => void
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const COLS = 3
const SPACING_X = 780
const SPACING_Y = 680
const NODE_MAX_W = 680
const NODE_MAX_H = 560

// ---------------------------------------------------------------------------
// Custom node component — embeds the actual Editor / ExcalidrawView
// ---------------------------------------------------------------------------

function NoteCanvasCard({ data }: NodeProps<NoteCanvasCardNode>): JSX.Element {
  const {
    note,
    folderName,
    allNotes,
    allFolders,
    onNoteSerializedChange,
    onExcalidrawSceneChange,
    onSelectNote,
    onSetNoteCover,
    onSetNoteTitleEmoji
  } = data
  const title = note.title.trim() || 'Untitled'
  const drawing = isDrawingNote(note)

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-foreground/40 !h-2.5 !w-2.5"
      />
      {/* nodrag on outer wrapper — only the header (with .canvas-drag-handle) initiates drag */}
      <div
        className={cn(
          'nodrag border-border bg-card text-card-foreground flex flex-col overflow-hidden rounded-xl border shadow-md',
          'hover:ring-2 hover:ring-primary/40'
        )}
        style={{
          width: NODE_MAX_W,
          maxWidth: NODE_MAX_W,
          height: NODE_MAX_H,
          maxHeight: NODE_MAX_H
        }}
      >
        {/* Title bar — this is the only drag handle */}
        <div className="canvas-drag-handle bg-muted/50 flex h-9 shrink-0 cursor-grab items-center gap-1.5 border-b px-3 active:cursor-grabbing">
          {drawing ? (
            <PenLine className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          ) : (
            <FileText className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          )}
          {note.titleEmoji && <span className="text-sm">{note.titleEmoji}</span>}
          <span className="truncate text-[13px] font-medium leading-tight" title={title}>
            {title}
          </span>
          <span className="text-muted-foreground ml-auto text-[10px] font-medium uppercase tracking-wide opacity-60">
            {folderName}
          </span>
        </div>

        {/* Embedded editor / excalidraw — nowheel so scroll stays inside the editor */}
        <div className="nowheel min-h-0 flex-1 overflow-auto">
          {drawing ? (
            <ExcalidrawView
              notePath={note.path}
              sceneJson={note.excalidrawScene ?? null}
              onSceneJsonChange={(json) => onExcalidrawSceneChange(note.path, json)}
            />
          ) : (
            <Editor
              key={note.path}
              editorSerializedState={note.content ?? undefined}
              onSerializedChange={(s) => onNoteSerializedChange(note.path, s)}
              className="min-h-0 flex-1"
              notelabEditor={{
                notes: allNotes,
                folders: allFolders,
                currentNoteId: note.path,
                onOpenInternalNote: onSelectNote
              }}
              coverImageSrc={note.kind === 'note' ? note.coverImageSrc : undefined}
              onCoverChange={(src) => onSetNoteCover(note.path, src)}
              titleEmoji={note.kind === 'note' ? note.titleEmoji : undefined}
              onTitleEmojiChange={(emoji) => onSetNoteTitleEmoji(note.path, emoji)}
            />
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-muted-foreground/40 !h-2.5 !w-2.5"
      />
    </>
  )
}

/** Stable reference — must be declared outside the component to avoid re-registration. */
const nodeTypes = { noteCard: NoteCanvasCard }

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function NotesCanvasViewInner({
  notes,
  folders,
  isMacNotelab,
  macTitlebarStyles,
  onSelectNote,
  onClose,
  onNoteSerializedChange,
  onExcalidrawSceneChange,
  onSetNoteCover,
  onSetNoteTitleEmoji
}: NotesCanvasViewProps): JSX.Element {
  const graph = useMemo(() => buildNoteLinkGraph(notes), [notes])
  const noteMap = useMemo(() => new Map(notes.map((n) => [n.path, n])), [notes])
  const folderNameById = useMemo(() => {
    const m = new Map<string, string>()
    m.set(DEFAULT_WORKSPACE_ID, 'Root')
    for (const f of folders) m.set(f.folder, f.name)
    return m
  }, [folders])

  const [initialNodes, initialEdges] = useMemo(() => {
    const rfNodes: NoteCanvasCardNode[] = graph.nodes.map((gn, i) => ({
      id: gn.id,
      type: 'noteCard' as const,
      dragHandle: '.canvas-drag-handle',
      position: {
        x: (i % COLS) * SPACING_X,
        y: Math.floor(i / COLS) * SPACING_Y
      },
      data: {
        note: noteMap.get(gn.id)!,
        folderName: folderNameById.get(gn.folder) ?? 'Root',
        allNotes: notes,
        allFolders: folders,
        onNoteSerializedChange,
        onExcalidrawSceneChange,
        onSelectNote,
        onSetNoteCover,
        onSetNoteTitleEmoji
      }
    }))

    const rfEdges: Edge[] = graph.links.map((gl) => ({
      id: `${gl.source}->${gl.target}`,
      source: gl.source,
      target: gl.target,
      type: 'smoothstep',
      animated: true,
      style: { stroke: 'var(--color-muted-foreground)', strokeWidth: 1.5, opacity: 0.4 }
    }))

    return [rfNodes, rfEdges] as const
  }, [
    graph,
    noteMap,
    folderNameById,
    notes,
    folders,
    onNoteSerializedChange,
    onExcalidrawSceneChange,
    onSelectNote,
    onSetNoteCover,
    onSetNoteTitleEmoji
  ])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync when notes change
  useEffect(() => {
    setNodes(initialNodes)
  }, [initialNodes, setNodes])

  useEffect(() => {
    setEdges(initialEdges)
  }, [initialEdges, setEdges])

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectNote(node.id)
      onClose()
    },
    [onSelectNote, onClose]
  )

  return (
    <div className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <div
        className="border-border flex h-10 shrink-0 items-center gap-2 border-b px-3"
        style={isMacNotelab ? macTitlebarStyles.noDrag : undefined}
      >
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          aria-label="Close canvas"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </Button>
        <div className="min-w-0">
          <span className="text-foreground text-sm font-medium">Infinity canvas</span>
          <span className="text-muted-foreground ml-2 text-xs">
            {notes.length} notes &middot; double-click title bar to open in editor
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div className="min-h-0 min-w-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDoubleClick={onNodeDoubleClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.05}
          maxZoom={2}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          proOptions={{ hideAttribution: false }}
        >
          <Background />
          <Controls />
          <MiniMap nodeColor={() => 'var(--color-muted-foreground)'} maskColor="rgba(0,0,0,0.08)" />
        </ReactFlow>
      </div>
    </div>
  )
}

export function NotesCanvasView(props: NotesCanvasViewProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <NotesCanvasViewInner {...props} />
    </ReactFlowProvider>
  )
}
