import React from 'react';
import { createRoot } from 'react-dom/client';
import StudentHubMobileDashboard from './StudentHubMobileDashboard';
import './styles.css';

let savedTheme = null;
try {
  savedTheme = localStorage.getItem('bclss_theme');
} catch {
  // Safari can deny storage access in private or restricted browsing contexts.
}
const theme = savedTheme === 'light' || savedTheme === 'dark'
  ? savedTheme
  : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
document.documentElement.dataset.theme = theme;
document.querySelector('meta[name="theme-color"]')?.setAttribute(
  'content',
  theme === 'light' ? '#f1f3fb' : '#070913'
);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StudentHubMobileDashboard />
  </React.StrictMode>
);
