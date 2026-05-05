'use client';

import * as React from 'react';

import type { PlateEditor, PlateElementProps } from 'platejs/react';

import { AIChatPlugin } from '@platejs/ai/react';
import { PlaceholderPlugin } from '@platejs/media/react';
import {
  AudioLinesIcon,
  CalendarIcon,
  ChevronRightIcon,
  Code2,
  Columns3Icon,
  FileText,
  FileUpIcon,
  FilmIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  LightbulbIcon,
  ListIcon,
  ListOrdered,
  PenToolIcon,
  PilcrowIcon,
  Quote,
  RadicalIcon,
  SparklesIcon,
  Square,
  Table,
  TableOfContentsIcon,
} from 'lucide-react';
import { type TComboboxInputElement, KEYS } from 'platejs';
import { PlateElement } from 'platejs/react';

import {
  insertBlock,
  insertInlineElement,
} from '@/components/editor/transforms';

const OPEN_SELECT_WIKI_EVENT = 'open-select-wiki';

const MEDIA_ACCEPT: Record<string, string> = {
  [KEYS.img]: 'image/*',
  [KEYS.video]: 'video/*',
  [KEYS.audio]: 'audio/*',
  [KEYS.file]: '*',
};

function openMediaPicker(editor: PlateEditor, nodeType: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = MEDIA_ACCEPT[nodeType] ?? '*';
  input.multiple = true;
  input.onchange = () => {
    const files = input.files;
    if (files && files.length > 0) {
      editor.getTransforms(PlaceholderPlugin).insert.media(files);
    }
  };
  input.click();
}

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';

type Group = {
  group: string;
  items: {
    icon: React.ReactNode;
    value: string;
    onSelect: (editor: PlateEditor, value: string) => void;
    className?: string;
    focusEditor?: boolean;
    keywords?: string[];
    label?: string;
  }[];
};

const groups: Group[] = [
  {
    group: 'AI',
    items: [
      {
        focusEditor: false,
        icon: <SparklesIcon />,
        value: 'AI',
        onSelect: (editor) => {
          editor.getApi(AIChatPlugin).aiChat.show();
        },
      },
    ],
  },
  {
    group: 'Basic blocks',
    items: [
      {
        icon: <PilcrowIcon />,
        keywords: ['paragraph'],
        label: 'Text',
        value: KEYS.p,
      },
      {
        icon: <Heading1Icon />,
        keywords: ['title', 'h1'],
        label: 'Heading 1',
        value: KEYS.h1,
      },
      {
        icon: <Heading2Icon />,
        keywords: ['subtitle', 'h2'],
        label: 'Heading 2',
        value: KEYS.h2,
      },
      {
        icon: <Heading3Icon />,
        keywords: ['subtitle', 'h3'],
        label: 'Heading 3',
        value: KEYS.h3,
      },
      {
        icon: <ListIcon />,
        keywords: ['unordered', 'ul', '-'],
        label: 'Bulleted list',
        value: KEYS.ul,
      },
      {
        icon: <ListOrdered />,
        keywords: ['ordered', 'ol', '1'],
        label: 'Numbered list',
        value: KEYS.ol,
      },
      {
        icon: <Square />,
        keywords: ['checklist', 'task', 'checkbox', '[]'],
        label: 'To-do list',
        value: KEYS.listTodo,
      },
      {
        icon: <ChevronRightIcon />,
        keywords: ['collapsible', 'expandable'],
        label: 'Toggle',
        value: KEYS.toggle,
      },
      {
        icon: <Code2 />,
        keywords: ['```'],
        label: 'Code Block',
        value: KEYS.codeBlock,
      },
      {
        icon: <Table />,
        label: 'Table',
        value: KEYS.table,
      },
      {
        icon: <Quote />,
        keywords: ['citation', 'blockquote', 'quote', '>'],
        label: 'Blockquote',
        value: KEYS.blockquote,
      },
      {
        description: 'Insert a highlighted block.',
        icon: <LightbulbIcon />,
        keywords: ['note'],
        label: 'Callout',
        value: KEYS.callout,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value, { upsert: true });
      },
    })),
  },
  {
    group: 'Advanced blocks',
    items: [
      {
        icon: <TableOfContentsIcon />,
        keywords: ['toc'],
        label: 'Table of contents',
        value: KEYS.toc,
      },
      {
        icon: <Columns3Icon />,
        label: '3 columns',
        value: 'action_three_columns',
      },
      {
        focusEditor: false,
        icon: <RadicalIcon />,
        label: 'Equation',
        value: KEYS.equation,
      },
      {
        icon: <PenToolIcon />,
        keywords: ['excalidraw'],
        label: 'Excalidraw',
        value: KEYS.excalidraw,
      },
      {
        icon: <Code2 />,
        keywords: [
          'code-drawing',
          'diagram',
          'plantuml',
          'graphviz',
          'flowchart',
          'mermaid',
        ],
        label: 'Code Drawing',
        value: KEYS.codeDrawing,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value, { upsert: true });
      },
    })),
  },
  {
    group: 'Inline',
    items: [
      {
        focusEditor: false,
        icon: <FileText />,
        keywords: ['wiki', 'wikilink', 'reference', 'file', 'link'],
        label: 'Select Wiki',
        value: 'select_wiki',
        onSelect: () => {
          window.dispatchEvent(new CustomEvent(OPEN_SELECT_WIKI_EVENT));
        },
      },
      {
        focusEditor: true,
        icon: <CalendarIcon />,
        keywords: ['time'],
        label: 'Date',
        value: KEYS.date,
      },
      {
        focusEditor: false,
        icon: <RadicalIcon />,
        label: 'Inline Equation',
        value: KEYS.inlineEquation,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertInlineElement(editor, value);
      },
    })),
  },
  {
    group: 'Media',
    items: [
      {
        focusEditor: false,
        icon: <ImageIcon />,
        keywords: ['picture', 'photo', 'img'],
        label: 'Image',
        value: KEYS.img,
      },
      {
        focusEditor: false,
        icon: <FilmIcon />,
        keywords: ['movie', 'mp4'],
        label: 'Video',
        value: KEYS.video,
      },
      {
        focusEditor: false,
        icon: <AudioLinesIcon />,
        keywords: ['mp3', 'sound', 'music'],
        label: 'Audio',
        value: KEYS.audio,
      },
      {
        focusEditor: false,
        icon: <FileUpIcon />,
        keywords: ['attachment', 'upload', 'document'],
        label: 'File',
        value: KEYS.file,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        openMediaPicker(editor, value);
      },
    })),
  },
];

export function SlashInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent>
          <InlineComboboxEmpty>No results</InlineComboboxEmpty>

          {groups.map(({ group, items }) => (
            <InlineComboboxGroup key={group}>
              <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>

              {items.map(
                ({ focusEditor, icon, keywords, label, value, onSelect }) => (
                  <InlineComboboxItem
                    key={value}
                    value={value}
                    onClick={() => onSelect(editor, value)}
                    label={label}
                    focusEditor={focusEditor}
                    group={group}
                    keywords={keywords}
                  >
                    <div className="mr-2 text-muted-foreground">{icon}</div>
                    {label ?? value}
                  </InlineComboboxItem>
                )
              )}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
