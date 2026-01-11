import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './globals.css'
import { registerSW } from './pwa/register-sw'
import { getFaviconPublicUrl, applyFavicon } from '@/services/branding'

registerSW()

// Attempt to apply branding favicon on load (fallback to existing index.html link if not present)
;(async () => {
  try {
    const url = await getFaviconPublicUrl()
    if (url) applyFavicon(url)
  } catch {
    // ignore; keep default favicon
  }
})()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)