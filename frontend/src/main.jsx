import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  return <main><h1>Barbería</h1><p>Frontend listo para comenzar.</p></main>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
