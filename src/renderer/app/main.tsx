import '../assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { TooltipProvider } from '@/components/ui/tooltip'
import { applyUiFontToDocument, loadUiFont } from '@/lib/theme/appearance-storage'

applyUiFontToDocument(loadUiFont())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>
)
