import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { useEffect } from 'react';
import { HugoProvider, type ArtworkProps } from 'hugo-music';
import AppNavigator from './navigation/AppNavigator';
import CoverArt from './components/CoverArt';
import { loadMeta } from './lib/meta';
import { useStore } from './store/useStore';

// Every hugo-music component draws covers through CoverArt (R2 → CDN rewrite, generated fallback).
const renderArtwork = ({ uri, title, size, radius }: ArtworkProps) => <CoverArt uri={uri} title={title} size={size} radius={radius} />;

// Do not wrap the SafeAreaProvider: all screens leave the bunny ears/flat home bar
// `const insets = useSafeAreaInsets()` + manual padding. Value insets due to native stack
// (react-navigation, SafeAreaProviderCompat) provided to all internal screens.
export default function App() {
  const themeMode = useStore((s) => s.themeMode); // Light / Dark / Auto chosen in the account screen
  useEffect(() => { loadMeta(); }, []); // genres, licenses… from GET /api/meta (lib/meta.ts)
  return (
    <HugoProvider scheme={themeMode === 'auto' ? 'system' : themeMode} renderArtwork={renderArtwork}>
      <View style={{ flex: 1 }}>
        <StatusBar style="auto" />
        <AppNavigator />
      </View>
    </HugoProvider>
  );
}
