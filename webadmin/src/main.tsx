import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AppIntlProvider from './i18n/AppIntlProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppIntlProvider>
      <App />
    </AppIntlProvider>
  </StrictMode>,
)
