import { useState } from 'react';
import { View, Text, ScrollView, Image, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { C, Btn, Segmented } from '../Admin/ui';
import ComponentLibrary from './ComponentLibrary';
import ApiReference from './ApiReference';

// /developer — tài liệu cho người phát triển Hugo Music: thư viện giao diện (component thật đang dùng) và tài
// liệu API tự sinh từ route đang chạy. Chỉ đọc/thử — không có thao tác nào khác với ứng dụng thường.
export default function DeveloperScreen({ route }: { route?: { params?: { tab?: string } } }) {
  const [tab, setTab] = useState(route?.params?.tab === 'api' ? 'api' : 'components');
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = width >= 900 ? 32 : 16;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: pad, paddingTop: 24 + insets.top, paddingBottom: 48 + insets.bottom, maxWidth: 1100, width: '100%', alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Image source={require('../../../assets/logo.png')} style={{ width: 40, height: 40, borderRadius: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: -0.5 }}>Hugo Music · Nhà phát triển</Text>
            <Text style={{ fontSize: 14, color: C.sub }}>Thư viện giao diện React Native và tài liệu API của dự án</Text>
          </View>
          <Btn small variant="ghost" icon="home-outline" a11y="Về trang nghe nhạc" onPress={() => navigation.navigate('Home')} />
        </View>
        <Segmented value={tab} onChange={setTab} options={[{ key: 'components', label: 'Thư viện giao diện' }, { key: 'api', label: 'Tài liệu API' }]} />
        {tab === 'components' ? <ComponentLibrary /> : <ApiReference />}
      </ScrollView>
    </View>
  );
}
