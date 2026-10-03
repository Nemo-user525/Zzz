import React from 'react';
import {createRoot} from 'react-dom/client';
import ProductApp from './ProductApp';
import LegacyApp from './App';
import './style.css';
const view=new URLSearchParams(window.location.search).get('view');
createRoot(document.getElementById('root')!).render(<React.StrictMode>{['consumer','history','company','trade'].includes(view||'')?<LegacyApp/>:<ProductApp/>}</React.StrictMode>);
