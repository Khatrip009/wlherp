// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Define chunk groups with their corresponding packages
          const groups = {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            query: ['@tanstack/react-query'],
            supabase: ['@supabase/supabase-js'],
            charts: ['recharts'],
            pdf: ['jspdf', 'jspdf-autotable', 'html2canvas'],
            ui: ['lucide-react', 'react-hot-toast'],
          };

          // Check if the module belongs to any defined group
          for (const [chunkName, packages] of Object.entries(groups)) {
            if (packages.some(pkg => id.includes(pkg))) {
              return chunkName;
            }
          }
          // All other modules follow Vite's default chunking
        },
      },
    },
  },
})