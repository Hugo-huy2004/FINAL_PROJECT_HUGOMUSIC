import { Platform, Alert } from 'react-native';

// Plain `alert()`/`confirm()` only exist on web — React Native has no global with
// that name, so calling it on iOS/Android throws. This picks the right API per platform.
export const showAlert = (message: string) => {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert(message);
};

export const confirmAlert = (message: string): Promise<boolean> => {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => {
    Alert.alert('', message, [
      { text: 'Hủy', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Đồng ý', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
};
