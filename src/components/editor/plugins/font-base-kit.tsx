import type { SlatePluginConfig } from 'platejs';

import {
  BaseFontBackgroundColorPlugin,
  BaseFontColorPlugin,
  BaseFontFamilyPlugin,
} from '@platejs/basic-styles';
import { KEYS } from 'platejs';

const options = {
  inject: { targetPlugins: [KEYS.p] },
} satisfies SlatePluginConfig;

export const BaseFontKit = [
  BaseFontColorPlugin.configure(options),
  BaseFontBackgroundColorPlugin.configure(options),
  BaseFontFamilyPlugin.configure(options),
];
