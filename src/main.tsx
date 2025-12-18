import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './globals.css'
import { registerSW } from './pwa/register-sw'

registerSW()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)