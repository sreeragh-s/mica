'use client';

import type { PlatePluginConfig } from 'platejs/react';

import {
  FontBackgroundColorPlugin,
  FontColorPlugin,
  FontFamilyPlugin,
} from '@platejs/basic-styles/react';
import { KEYS } from 'platejs';

const options = {
  inject: { targetPlugins: [KEYS.p] },
} satisfies PlatePluginConfig;

export const FontKit = [
  FontColorPlugin.configure({
    inject: {
      ...options.inject,
      nodeProps: {
        defaultNodeValue: 'black',
      },
    },
  }),
  FontBackgroundColorPlugin.configure(options),
  FontFamilyPlugin.configure(options),
];
