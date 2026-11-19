import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './desk-mobile.css'
import './mobile-ops-home.css'
import { setupDeskPwa } from './desk-pwa'

setupDeskPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
