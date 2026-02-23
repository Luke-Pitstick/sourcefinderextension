import React from 'react';
import { createRoot } from 'react-dom/client';
import { Options } from './Options';
import './options.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element for options page.');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>,
);
