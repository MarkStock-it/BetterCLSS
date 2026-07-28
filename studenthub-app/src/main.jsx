import React from 'react';
import { createRoot } from 'react-dom/client';
import StudentHubMobileDashboard from './StudentHubMobileDashboard';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StudentHubMobileDashboard />
  </React.StrictMode>
);
