import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import LiquidGlassButton from '../../../components/LiquidGlass/LiquidGlassButton';
import LicensePicker from './LicensePicker';

// Bài tải lên vào thẳng hàng chờ duyệt. Giấy phép và URL nguồn là bắt buộc:
// thiếu chúng thì bài không bao giờ qua được tầng bản quyền.
export default function UploadForm({
  isUploading,
  onUpload,
}: {
  isUploading: boolean;
  onUpload: (form: FormData) => Promise<boolean>;
}) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [licenseType, setLicenseType] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [attribution, setAttribution] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const sourceOk = /^https?:\/\/\S+$/i.test(sourceUrl.trim());

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tải bài hát lên</Text>
        <Text style={styles.hint}>Mở trang quản trị trên trình duyệt web để tải bài hát lên.</Text>
      </View>
    );
  }

  const handlePickFile = (e: any) => setFile(e.target.files?.[0] ?? null);

  const onSubmit = async () => {
    if (!file || !licenseType || !sourceOk) return;
    const form = new FormData();
    form.append('audio', file);
    form.append('licenseType', licenseType);
    form.append('sourceUrl', sourceUrl.trim());
    if (title.trim()) form.append('title', title.trim());
    if (artist.trim()) form.append('artist', artist.trim());
    if (genre.trim()) form.append('genre', genre.trim());
    if (attribution.trim()) form.append('attribution', attribution.trim());

    const success = await onUpload(form);
    if (success) {
      setTitle('');
      setArtist('');
      setGenre('');
      setLicenseType('');
      setSourceUrl('');
      setAttribution('');
      setFile(null);
      // Reset file input value
      const fileInput = document.getElementById('audioUploadInput') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Thêm bài vào kho</Text>
      <Text style={styles.hint}>Bài mới vào hàng chờ duyệt, chưa hiện với người nghe.</Text>
      <TextInput 
        style={styles.input} 
        placeholder="Tên bài hát (tùy chọn - tự nhận diện)" 
        placeholderTextColor="#888" 
        value={title} 
        onChangeText={setTitle} 
      />
      <TextInput 
        style={styles.input} 
        placeholder="Nghệ sĩ (tùy chọn - tự nhận diện)" 
        placeholderTextColor="#888" 
        value={artist} 
        onChangeText={setArtist} 
      />
      <TextInput 
        style={styles.input} 
        placeholder="Thể loại (tùy chọn - tự nhận diện)" 
        placeholderTextColor="#888" 
        value={genre} 
        onChangeText={setGenre} 
      />
      <Text style={styles.label}>Giấy phép *</Text>
      <LicensePicker value={licenseType} onChange={setLicenseType} />
      <TextInput
        style={styles.input}
        placeholder="URL nguồn * (vd. https://archive.org/details/...)"
        placeholderTextColor="#888"
        value={sourceUrl}
        onChangeText={setSourceUrl}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Ghi công tác giả (mặc định: tên nghệ sĩ)"
        placeholderTextColor="#888"
        value={attribution}
        onChangeText={setAttribution}
      />
      
      {/* Native web file input */}
      <input 
        id="audioUploadInput"
        type="file" 
        accept="audio/*" 
        onChange={handlePickFile} 
        style={{ marginBottom: 16, color: '#333' }} 
      />
      
      <LiquidGlassButton
        variant="primary"
        size="lg"
        title={isUploading ? undefined : 'Tải lên và gửi duyệt'}
        icon={isUploading ? <ActivityIndicator color="#fff" /> : undefined}
        onPress={onSubmit}
        disabled={!file || !licenseType || !sourceOk || isUploading}
        style={{ width: '100%', marginTop: 8 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#000', marginBottom: 16 },
  hint: { color: '#999', fontSize: 14, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 15,
    marginBottom: 16,
    color: '#333',
    backgroundColor: '#fafafa',
  },
});
