import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/big-shoulders-display'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Ask the browser not to evict the workout log under storage pressure.
void navigator.storage?.persist?.()

// Offline copy of the app. A home-screen app on iPhone usually resumes rather
// than relaunching, so look for a new version whenever it comes back to the
// front (and hourly). When one installs, the page reloads into it; workouts
// live in IndexedDB, so nothing in progress is lost.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => {
      if (navigator.onLine) void reg.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    setInterval(check, 60 * 60 * 1000)
  },
})
