import React from 'react';
import App from '@hugo/client/src/App';

/**
 * HUGO MUSIC — MOBILE APPLICATION ENTRYPOINT
 * -----------------------------------------------------------------------------
 * PLATFORM: Mobile Devices (iOS & Android).
 * UI LAYOUT:
 *    - Designed for touchscreens on phones and tablets.
 *    - Bottom tab bar for easy one-hand navigation.
 *    - Smooth swipe transitions between Home, New, Radio, and Library.
 *    - Supports notch and safe area insets for iOS and Android screens.
 *    - Offline music playback from device local storage.
 * 
 * CONNECTIONS:
 *    - Uses shared Audio Engine (DJ Smart Transition) from `packages/client/src/audio/`.
 *    - Uses shared Global State Store from `packages/client/src/store/`.
 *    - App (packages/client/src/App.tsx) adds theme, navigation, safe areas and GET /api/meta.
 * -----------------------------------------------------------------------------
 */
export default function MobileApp() {
  return <App />;
}
