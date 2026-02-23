import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './sidepanel.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element for side panel.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
