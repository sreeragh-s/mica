'use client';

import * as React from 'react';

import { Redo2Icon, Undo2Icon } from 'lucide-react';
import { useEditorRef, useEditorSelector } from 'platejs/react';

import { ToolbarButton } from './toolbar';

export interface UndoToolbarButtonProps extends React.ComponentProps<typeof ToolbarButton> {
  size?: 'xs' | 'sm' | 'default'
}

export interface RedoToolbarButtonProps extends React.ComponentProps<typeof ToolbarButton> {
  size?: 'xs' | 'sm' | 'default'
}

export function RedoToolbarButton(
  { size = 'sm', ...props }: RedoToolbarButtonProps
) {
  const editor = useEditorRef();
  const disabled = useEditorSelector(
    (editor) => editor.history.redos.length === 0,
    []
  );

  return (
    <ToolbarButton
      {...props}
      disabled={disabled}
      onClick={() => editor.redo()}
      onMouseDown={(e) => e.preventDefault()}
      tooltip="Redo"
      size={size}
    >
      <Redo2Icon />
    </ToolbarButton>
  );
}

export function UndoToolbarButton(
  { size = 'sm', ...props }: UndoToolbarButtonProps
) {
  const editor = useEditorRef();
  const disabled = useEditorSelector(
    (editor) => editor.history.undos.length === 0,
    []
  );

  return (
    <ToolbarButton
      {...props}
      disabled={disabled}
      onClick={() => editor.undo()}
      onMouseDown={(e) => e.preventDefault()}
      tooltip="Undo"
      size={size}
    >
      <Undo2Icon />
    </ToolbarButton>
  );
}
