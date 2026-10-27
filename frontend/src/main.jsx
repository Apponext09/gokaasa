import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import './index.css';
import { App } from './App.jsx';
import { AuthProvider } from '@/features/auth/AuthContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="top-center"
          offset="6.625rem"
          mobileOffset="4.25rem"
          richColors
          closeButton
        />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
