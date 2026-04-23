'use client';

import cloneDeep from 'lodash/cloneDeep.js';
import * as React from 'react';
import { BaseAIPlugin, withAIBatch } from '@platejs/ai';
import {
  AIChatPlugin,
  AIPlugin,
  applyAISuggestions,
  getInsertPreviewStart,
  streamInsertChunk,
  useChatChunk,
} from '@platejs/ai/react';
import { ElementApi, getPluginType, KEYS, PathApi } from 'platejs';
import { usePluginOption } from 'platejs/react';

import { AIAnchorElement, AILeaf } from '@/components/ui/ai-node';

import { useChat } from '../use-chat';

const LazyAIMenu = React.lazy(async () => {
  const mod = await import('@/components/ui/ai-menu');
  return { default: mod.AIMenu };
});

const LazyAILoadingBar = React.lazy(async () => {
  const mod = await import('@/components/ui/ai-menu');
  return { default: mod.AILoadingBar };
});

function DeferredAIMenu() {
  return (
    <React.Suspense fallback={null}>
      <LazyAIMenu />
    </React.Suspense>
  );
}

function DeferredAILoadingBar() {
  return (
    <React.Suspense fallback={null}>
      <LazyAILoadingBar />
    </React.Suspense>
  );
}

export const aiChatPlugin = AIChatPlugin.extend({
  options: {
    chatOptions: {
      api: '/api/ai/command',
      body: {},
    },
  },
  render: {
    afterContainer: DeferredAILoadingBar,
    afterEditable: DeferredAIMenu,
    node: AIAnchorElement,
  },
  shortcuts: { show: { keys: 'mod+shift+j' } },
  useHooks: ({ editor, getOption }) => {
    useChat();

    const mode = usePluginOption(AIChatPlugin, 'mode');
    const toolName = usePluginOption(AIChatPlugin, 'toolName');
    useChatChunk({
      onChunk: ({ chunk, isFirst, nodes, text: content }) => {
        if (isFirst && mode === 'insert') {
          const { startBlock, startInEmptyParagraph } =
            getInsertPreviewStart(editor);

          editor.getTransforms(BaseAIPlugin).ai.beginPreview({
            originalBlocks:
              startInEmptyParagraph &&
              startBlock &&
              ElementApi.isElement(startBlock)
                ? [cloneDeep(startBlock)]
                : [],
          });

          editor.tf.withoutSaving(() => {
            editor.tf.insertNodes(
              {
                children: [{ text: '' }],
                type: getPluginType(editor, KEYS.aiChat),
              },
              {
                at: PathApi.next(editor.selection!.focus.path.slice(0, 1)),
              }
            );
          });
          editor.setOption(AIChatPlugin, 'streaming', true);
        }

        if (mode === 'insert' && nodes.length > 0) {
          editor.tf.withoutSaving(() => {
            if (!getOption('streaming')) return;

            editor.tf.withScrolling(() => {
              streamInsertChunk(editor, chunk, {
                textProps: {
                  [getPluginType(editor, KEYS.ai)]: true,
                },
              });
            });
          });
        }

        if (toolName === 'edit' && mode === 'chat') {
          withAIBatch(
            editor,
            () => {
              applyAISuggestions(editor, content);
            },
            {
              split: isFirst,
            }
          );
        }
      },
      onFinish: () => {
        editor.setOption(AIChatPlugin, 'streaming', false);
        editor.setOption(AIChatPlugin, '_blockChunks', '');
        editor.setOption(AIChatPlugin, '_blockPath', null);
        editor.setOption(AIChatPlugin, '_mdxName', null);
      },
    });
  },
});

export const AIKit = [
  AIPlugin.withComponent(AILeaf),
  aiChatPlugin,
];
