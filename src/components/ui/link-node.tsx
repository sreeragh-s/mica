'use client';

import type { TInlineSuggestionData, TLinkElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { getLinkAttributes } from '@platejs/link';
import { SuggestionPlugin } from '@platejs/suggestion/react';
import { PlateElement } from 'platejs/react';

import { isWorkspaceRelativeLink, openWorkspaceLink } from '@/lib/wikilink-utils';
import { cn } from '@/lib/utils';

export function LinkElement(props: PlateElementProps<TLinkElement>) {
  const suggestionData = props.editor
    .getApi(SuggestionPlugin)
    .suggestion.suggestionData(props.element) as
    | TInlineSuggestionData
    | undefined;
  const linkAttributes = getLinkAttributes(props.editor, props.element);

  return (
    <PlateElement
      {...props}
      as="a"
      className={cn(
        'font-medium text-primary underline decoration-primary underline-offset-4',
        suggestionData?.type === 'remove' && 'bg-red-100 text-red-700',
        suggestionData?.type === 'insert' && 'bg-emerald-100 text-emerald-700'
      )}
      attributes={{
        ...props.attributes,
        ...linkAttributes,
        onClick: (event) => {
          const href = props.element.url || linkAttributes.href;

          if (!isWorkspaceRelativeLink(href)) {
            return;
          }

          if (event.metaKey || event.ctrlKey) {
            event.preventDefault();
            openWorkspaceLink(String(href));
            return;
          }

          event.preventDefault();
        },
        onMouseOver: (e) => {
          e.stopPropagation();
        },
      }}
    >
      {props.children}
    </PlateElement>
  );
}
