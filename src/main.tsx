import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Hide initial loader
const loader = document.getElementById('app-loader');
if (loader) loader.style.display = 'none';

// Mount app
createRoot(document.getElementById("root")!).render(<App />);

// Register service worker after load
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}