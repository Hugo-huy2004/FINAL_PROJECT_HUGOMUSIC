import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { useStore } from '../../store/useStore';
import { showAlert } from '../../utils/alert';
import { GENRES } from '../../utils/genres';

// Self-contained: decides its own visibility from the logged-in user, and only asks
// for whichever fields are actually missing — for accounts that predate the
// registration wizard, or came in via Google (which only ever supplies
// email/name/picture, never DOB/genres/address). Render it once, unconditionally,
// anywhere inside the logged-in app shell (see navigation/HugoLayout.tsx) and it
// no-ops for any account that's already complete.
export default function CompleteProfileModal() {
  const user = useStore((state) => state.user);
  const completeProfile = useStore((state) => state.completeProfile);
  const logout = useStore((state) => state.logout);

  const [nickname, setNickname] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [country, setCountry] = useState('Việt Nam');
  const [province, setProvince] = useState('');
  const [ward, setWard] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Admins go through their own separate flow (see AdminScreen.tsx) — this modal is
  // for regular members only.
  if (!user || user.role === 'admin') return null;

  const missingNickname = !user.nickname;
  const missingDob = !user.dateOfBirth;
  const missingGenres = !user.musicGenres || user.musicGenres.length === 0;
  const missingAddress = !user.address?.country;
  const isIncomplete = missingNickname || missingDob || missingGenres || missingAddress;

  if (!isIncomplete) return null;

  const toggleGenre = (g: string) => setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  const canSubmit =
    (!missingNickname || nickname.trim()) &&
    (!missingDob || dateOfBirth) &&
    (!missingGenres || genres.length > 0) &&
    (!missingAddress || (country.trim() && province.trim() && ward.trim() && addressDetail.trim()));

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await completeProfile({
        nickname: missingNickname ? nickname.trim() : undefined,
        dateOfBirth: missingDob ? dateOfBirth : undefined,
        musicGenres: missingGenres ? genres : undefined,
        country: missingAddress ? country.trim() : undefined,
        province: missingAddress ? province.trim() : undefined,
        ward: missingAddress ? ward.trim() : undefined,
        addressDetail: missingAddress ? addressDetail.trim() : undefined,
      });
    } catch (e: any) {
      showAlert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent>
      <View style={styles.modalContainer}>
        <BlurView intensity={10} tint="dark" style={styles.modalBackdrop} />
        <View style={styles.modalContent}>
          <Text style={styles.title}>Hoàn tất hồ sơ</Text>
          <Text style={styles.subtitle}>
            Tài khoản của bạn còn thiếu vài thông tin bắt buộc — chỉ cần bổ sung phần còn thiếu dưới đây.
          </Text>

          <ScrollView style={{ width: '100%', maxHeight: 380 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {missingNickname && (
              <>
                <Text style={styles.label}>Biệt danh hiển thị</Text>
                <TextInput style={styles.input} value={nickname} onChangeText={setNickname} placeholder="Biệt danh" placeholderTextColor="#999" />
              </>
            )}

            {missingDob && (
              <>
                <Text style={styles.label}>Ngày sinh</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e: any) => setDateOfBirth(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    style={{ height: 50, borderRadius: 12, border: '1px solid #ccc', paddingLeft: 16, fontSize: 16, marginBottom: 16, width: '100%', boxSizing: 'border-box' }}
                  />
                ) : (
                  <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#999" value={dateOfBirth} onChangeText={setDateOfBirth} />
                )}
              </>
            )}

            {missingGenres && (
              <>
                <Text style={styles.label}>Sở thích nhạc</Text>
                <View style={styles.chipRow}>
                  {GENRES.map((g) => (
                    <TouchableOpacity key={g} style={[styles.chip, genres.includes(g) && styles.chipActive]} onPress={() => toggleGenre(g)}>
                      <Text style={[styles.chipText, genres.includes(g) && styles.chipTextActive]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {missingAddress && (
              <>
                <Text style={styles.label}>Nơi sinh sống</Text>
                <TextInput style={styles.input} placeholder="Quốc gia" placeholderTextColor="#999" value={country} onChangeText={setCountry} />
                <TextInput style={styles.input} placeholder="Tỉnh/Thành phố" placeholderTextColor="#999" value={province} onChangeText={setProvince} />
                <TextInput style={styles.input} placeholder="Phường/Xã" placeholderTextColor="#999" value={ward} onChangeText={setWard} />
                <TextInput style={styles.input} placeholder="Địa chỉ chi tiết" placeholderTextColor="#999" value={addressDetail} onChangeText={setAddressDetail} />
              </>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.submitButton, (!canSubmit || submitting) && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Hoàn tất</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={logout} style={{ marginTop: 14 }}>
            <Text style={styles.logoutText}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalBackdrop: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(10px)' } as any) : {}),
  },
  modalContent: {
    width: '90%',
    maxWidth: 440,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#000', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20, lineHeight: 20, textAlign: 'center' },
  label: { fontSize: 12, fontWeight: '600', color: '#999', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  chip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8,
  },
  chipActive: { backgroundColor: '#1CD8A9', borderColor: '#1CD8A9' },
  chipText: { fontSize: 13, color: '#333', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  submitButton: {
    backgroundColor: '#1CD8A9',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  disabledButton: { opacity: 0.5 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  logoutText: { color: '#999', fontSize: 13, textAlign: 'center', fontWeight: '600' },
});
