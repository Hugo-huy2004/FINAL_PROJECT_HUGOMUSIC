import { StatusBar } from 'expo-status-bar';
import React from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LiquidGlassContainerView } from '@callstack/liquid-glass';

export default function App() {
  return (
    <SafeAreaProvider>
      <LiquidGlassContainerView style={{ flex: 1 }}>
        <StatusBar style="auto" />
        <AppNavigator />
      </LiquidGlassContainerView>
    </SafeAreaProvider>
  );
}
