import { registerRootComponent } from 'expo';
import MobileApp from './src/App';

/**
 * Mobile application entry point for iOS and Android.
 * Start command: npm run dev:mobile (or npm start inside the mobile directory).
 */
registerRootComponent(MobileApp);
