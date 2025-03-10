import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsxInject: `import React from 'react'`,
    loader: 'jsx',
    include: [
      '**/*.js',
      '**/*.jsx'
    ]
  }
});
