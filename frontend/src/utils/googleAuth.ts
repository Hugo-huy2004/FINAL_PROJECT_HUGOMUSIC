// Google Identity Services (GIS) integration — web only. Renders Google's own sign-in
// button into a DOM node and hands back the signed ID token, which the backend verifies
// in controllers/authController.js (googleAuth). No expo-auth-session dependency needed
// for the web target; add that (+ native OAuth client setup) if a native build needs
// Google Sign-In too — not covered here since this app has only been tested on web.

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (resp: { credential: string }) => void }) => void;
          renderButton: (container: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;

const loadGisScript = (): Promise<void> => {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
};

export const renderGoogleButton = async (
  clientId: string,
  container: HTMLElement,
  onCredential: (idToken: string) => void
) => {
  await loadGisScript();
  window.google!.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => onCredential(response.credential),
  });
  window.google!.accounts.id.renderButton(container, { theme: 'outline', size: 'large', width: 320 });
};
