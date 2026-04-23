'use client';

import { LinkPlugin } from '@platejs/link/react';
import { isUrl as isDefaultUrl } from 'platejs';

import { LinkElement } from '@/components/ui/link-node';
import { LinkFloatingToolbar } from '@/components/ui/link-toolbar';
import { isLinkInputValid, normalizeLinkInput } from '@/lib/link-utils';

export const LinkKit = [
  LinkPlugin.configure({
    options: {
      transformInput: normalizeLinkInput,
      isUrl: (value: string) => isDefaultUrl(value) || isLinkInputValid(value),
    },
    render: {
      node: LinkElement,
      afterEditable: () => <LinkFloatingToolbar />,
    },
  }),
];
