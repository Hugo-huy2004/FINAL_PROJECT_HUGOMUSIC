import React from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AppLayout from './AppLayout';
import AdminScreen from '../screens/Admin/AdminScreen';
import DeveloperScreen from '../screens/Developer/DeveloperScreen';

const DeveloperComponents = () => <DeveloperScreen section="components" />;
const DeveloperApi = () => <DeveloperScreen section="api" />;

const Stack = createNativeStackNavigator();

// Route name → path. Five main destinations + accounts; old paths (before merging
// tab) remains so that the shared link does not die — AppLayout automatically resolves to the correct place (resolveTab).
const PATHS: Record<string, string> = {
  Home: '',
  Search: 'search',
  Radio: 'radio',
  Library: 'library',
  Account: 'account',
  New: 'new',
  Party: 'party',
  Genres: 'genres',
  Countries: 'countries',
  Songs: 'songs',
  Albums: 'albums',
  Artists: 'artists',
  Playlists: 'playlists',
  RecentlyAdded: 'recently-added',
};

const screenComponents: Record<string, React.FC> = {};
Object.entries(PATHS).forEach(([name, path]) => {
  const Component: React.FC = () => <AppLayout tab={path || 'home'} />;
  Component.displayName = `Route_${name}`;
  screenComponents[name] = Component;
});

const linking: LinkingOptions<any> = {
  prefixes: [],
  // Developer docs: one URL per page; /developer alone opens the component library.
  config: { screens: { ...PATHS, Admin: 'admin', DeveloperComponents: 'developer/components/:item?', DeveloperApi: 'developer/api/:item?', Developer: 'developer' } },
};

export default function AppNavigator() {
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {Object.entries(PATHS).map(([name]) => (
          <Stack.Screen key={name} name={name} component={screenComponents[name]} />
        ))}
        <Stack.Screen name="Admin" component={AdminScreen} />
        <Stack.Screen name="DeveloperComponents" component={DeveloperComponents} options={{ title: 'Hugo Music · Component library' }} />
        <Stack.Screen name="DeveloperApi" component={DeveloperApi} options={{ title: 'Hugo Music · API reference' }} />
        <Stack.Screen name="Developer" component={DeveloperComponents} options={{ title: 'Hugo Music · Component library' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
