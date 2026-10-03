import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './ProductApp';
import './style.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
