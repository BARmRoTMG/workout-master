import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/big-shoulders-display'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Ask the browser not to evict the workout log under storage pressure.
void navigator.storage?.persist?.()
