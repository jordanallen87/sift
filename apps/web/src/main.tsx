/**
 * Vite/React entry point, referenced by `index.html`'s
 * `<script type="module" src="/src/main.tsx">`.
 *
 * Stylesheet import order matters: tokens.css defines every custom
 * property first, global.css consumes those tokens for the base
 * reset/typography, and tailwind.css's utility layer is imported last so
 * Tailwind's generated utility classes can still win the cascade over the
 * broad element-selector rules in global.css when a component opts into a
 * utility class (normal CSS layer/specificity ordering -- Tailwind's own
 * `layer(utilities)` block, declared in tailwind.css, keeps this
 * deterministic regardless of import order too, but ordering it last here
 * keeps the intent obvious to a reader).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import { AppProviders } from './app/AppProviders.js';
import './styles/tokens.css';
import './styles/global.css';
import './styles/tailwind.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element "#root" was not found in index.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
