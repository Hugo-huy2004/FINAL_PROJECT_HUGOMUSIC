import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';

// Không bọc SafeAreaProvider: mọi màn tự chừa tai thỏ/thanh home bằng
// `const insets = useSafeAreaInsets()` + padding thủ công. Giá trị insets do native stack
// (react-navigation, SafeAreaProviderCompat) cung cấp cho mọi màn bên trong.
export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <AppNavigator />
    </View>
  );
}
