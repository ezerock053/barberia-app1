import React from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './style.css';
import App from './App.jsx';
import { readInitialCatalog } from './catalog/initialCatalog.js';

const initialCatalog = readInitialCatalog(document);
createRoot(document.getElementById('root')).render(<React.StrictMode><App initialCatalog={initialCatalog} /></React.StrictMode>);
