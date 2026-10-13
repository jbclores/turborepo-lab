import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // The router plugin must come before react(): it generates src/routeTree.gen.ts from src/routes/
  // and splits each route's component into its own chunk.
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true, quoteStyle: 'single', semicolons: false }),
    react(),
    tailwindcss(),
  ],
})
