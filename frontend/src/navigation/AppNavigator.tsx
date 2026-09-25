import React from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HugoLayout from './HugoLayout';
import AdminScreen from '../screens/Admin/AdminScreen';

const Stack = createNativeStackNavigator();

const HomeRoute = () => <HugoLayout tab="home" />;
const SearchRoute = () => <HugoLayout tab="search" />;
const NewRoute = () => <HugoLayout tab="new" />;
const RadioRoute = () => <HugoLayout tab="radio" />;
const RecentlyAddedRoute = () => <HugoLayout tab="recently-added" />;
const GenresRoute = () => <HugoLayout tab="genres" />;
const CountriesRoute = () => <HugoLayout tab="countries" />;
const ArtistsRoute = () => <HugoLayout tab="artists" />;
const AlbumsRoute = () => <HugoLayout tab="albums" />;
const SongsRoute = () => <HugoLayout tab="songs" />;
const PlaylistsRoute = () => <HugoLayout tab="playlists" />;
const AccountRoute = () => <HugoLayout tab="account" />;
const PartyRoute = () => <HugoLayout tab="party" />;

const linking: LinkingOptions<any> = {
  prefixes: [],
  config: {
    screens: {
      Home: '',
      Search: 'search',
      New: 'new',
      Radio: 'radio',
      RecentlyAdded: 'recently-added',
      Genres: 'genres',
      Countries: 'countries',
      Artists: 'artists',
      Albums: 'albums',
      Songs: 'songs',
      Playlists: 'playlists',
      Account: 'account',
      Party: 'party',
      Admin: 'admin',
    },
  },
};

export default function AppNavigator() {
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeRoute} />
        <Stack.Screen name="Search" component={SearchRoute} />
        <Stack.Screen name="New" component={NewRoute} />
        <Stack.Screen name="Radio" component={RadioRoute} />
        <Stack.Screen name="RecentlyAdded" component={RecentlyAddedRoute} />
        <Stack.Screen name="Genres" component={GenresRoute} />
        <Stack.Screen name="Countries" component={CountriesRoute} />
        <Stack.Screen name="Artists" component={ArtistsRoute} />
        <Stack.Screen name="Albums" component={AlbumsRoute} />
        <Stack.Screen name="Songs" component={SongsRoute} />
        <Stack.Screen name="Playlists" component={PlaylistsRoute} />
        <Stack.Screen name="Account" component={AccountRoute} />
        <Stack.Screen name="Party" component={PartyRoute} />
        <Stack.Screen name="Admin" component={AdminScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
