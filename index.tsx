// FIX: Replaced placeholder text with a valid React application entry point.
import React from 'react';
import ReactDOM from 'react-dom/client';

function App() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Welcome</h1>
      <p>This is a React application with Tailwind CSS.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
