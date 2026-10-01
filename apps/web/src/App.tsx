import React from 'react';
import App from '@hugo/client/src/App';

/**
 * HUGO MUSIC — WEB APPLICATION ENTRYPOINT
 * -----------------------------------------------------------------------------
 * PLATFORM: Web Browsers (Chrome, Safari, Firefox, Edge).
 * UI LAYOUT:
 *    - Designed for desktop and laptop screens (wide display).
 *    - Left sidebar navigation (Home, Search, Library, Radio).
 *    - Expandable lyrics side panel on the right.
 *    - Full-featured bottom audio player (Deck A/B, Volume, Progress bar).
 * 
 * CONNECTIONS:
 *    - Uses shared Audio Engine (DJ Smart Transition) from `packages/client/src/audio/`.
 *    - Uses shared Global State Store from `packages/client/src/store/`.
 *    - App (packages/client/src/App.tsx) adds theme, navigation, safe areas and GET /api/meta.
 * -----------------------------------------------------------------------------
 */
export default function WebApp() {
  return <App />;
}
