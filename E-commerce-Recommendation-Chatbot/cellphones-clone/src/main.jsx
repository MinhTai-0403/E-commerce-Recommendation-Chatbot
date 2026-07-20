import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={<div className="route-loading" role="status">Đang tải trang...</div>}>
      <App />
    </Suspense>
  </StrictMode>,
)
