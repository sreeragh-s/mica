'use client';

import * as React from 'react';
import { createPlatePlugin } from 'platejs/react';

const LazyFloatingToolbar = React.lazy(async () => {
  const mod = await import('@/components/ui/floating-toolbar');
  return { default: mod.FloatingToolbar };
});

const LazyFloatingToolbarButtons = React.lazy(async () => {
  const mod = await import('@/components/ui/floating-toolbar-buttons');
  return { default: mod.FloatingToolbarButtons };
});

function DeferredFloatingToolbar() {
  return (
    <React.Suspense fallback={null}>
      <LazyFloatingToolbar>
        <LazyFloatingToolbarButtons />
      </LazyFloatingToolbar>
    </React.Suspense>
  );
}

export const FloatingToolbarKit = [
  createPlatePlugin({
    key: 'floating-toolbar',
    render: {
      afterEditable: DeferredFloatingToolbar,
    },
  }),
];
