import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform, ActivityIndicator, ScrollView, Image } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../../store/useStore';
import { showAlert } from '../../utils/alert';
import { GENRES } from '../../utils/genres';
import LiquidGlassButton from '../../components/LiquidGlass/LiquidGlassButton';

const TOTAL_STEPS = 6;

type StepProps = {
  onNext: () => void;
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
};

function StepFooter({ onNext, onBack, nextLabel = 'Tiếp tục', nextDisabled, nextLoading }: StepProps) {
  return (
    <View style={styles.footerRow}>
      {onBack ? (
        <LiquidGlassButton
          variant="glass"
          size="md"
          title="Quay lại"
          onPress={onBack}
        />
      ) : (
        <View />
      )}
      <LiquidGlassButton
        variant="primary"
        size="md"
        title={nextLoading ? undefined : nextLabel}
        icon={nextLoading ? <ActivityIndicator color="#fff" /> : undefined}
        onPress={onNext}
        disabled={nextDisabled || nextLoading}
      />
    </View>
  );
}

export default function RegisterWizard({ onClose }: { onClose: () => void }) {
  const isAuthLoading = useStore((state) => state.isAuthLoading);
  const authError = useStore((state) => state.authError);
  const sendRegistrationOtp = useStore((state) => state.sendRegistrationOtp);
  const verifyRegistrationOtp = useStore((state) => state.verifyRegistrationOtp);
  const completeRegistration = useStore((state) => state.completeRegistration);
  const resetRegistration = useStore((state) => state.resetRegistration);

  const [step, setStep] = useState(1);

  // Step 1
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Step 2
  const [otp, setOtp] = useState('');
  // Step 3
  const [avatarFile, setAvatarFile] = useState<any>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  // Step 4
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  // Step 5
  const [country, setCountry] = useState('Việt Nam');
  const [province, setProvince] = useState('');
  const [ward, setWard] = useState('');
  const [addressDetail, setAddressDetail] = useState('');

  const handleClose = () => {
    resetRegistration();
    onClose();
  };

  const goStep1Next = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showAlert('Email không hợp lệ.');
    if (password.length < 6) return showAlert('Mật khẩu tối thiểu 6 ký tự.');
    if (password !== confirmPassword) return showAlert('Mật khẩu xác nhận không khớp.');
    try {
      await sendRegistrationOtp(email.trim());
      setStep(2);
    } catch (e: any) {
      showAlert(e.message);
    }
  };

  const goStep2Next = async () => {
    if (otp.trim().length !== 6) return;
    try {
      await verifyRegistrationOtp(otp.trim());
      setStep(3);
    } catch (e: any) {
      showAlert(e.message);
    }
  };

  const handlePickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setAvatarPreview(asset.uri);
        if (Platform.OS === 'web') {
          const res = await fetch(asset.uri);
          const blob = await res.blob();
          const file = new File([blob], asset.fileName || 'avatar.jpg', {
            type: asset.mimeType || 'image/jpeg',
          });
          setAvatarFile(file);
        } else {
          const fileObj = {
            uri: asset.uri,
            name: asset.fileName || 'avatar.jpg',
            type: asset.mimeType || 'image/jpeg',
          };
          setAvatarFile(fileObj as any);
        }
      }
    } catch (err: any) {
      showAlert(err.message || 'Không thể chọn ảnh');
    }
  };

  const toggleGenre = (g: string) => {
    setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  const handleFinish = async () => {
    const form = new FormData();
    form.append('password', password);
    form.append('nickname', nickname.trim());
    form.append('dateOfBirth', dateOfBirth);
    form.append('musicGenres', JSON.stringify(genres));
    form.append('country', country.trim());
    form.append('province', province.trim());
    form.append('ward', ward.trim());
    form.append('addressDetail', addressDetail.trim());
    if (avatarFile) form.append('avatar', avatarFile);

    try {
      await completeRegistration(form);
      onClose();
    } catch (e: any) {
      showAlert(e.message);
    }
  };

  return (
    <View style={styles.modalContainer}>
      <BlurView intensity={10} tint="dark" style={styles.modalBackdrop} />
      <View style={styles.modalContent}>
        <View style={styles.header}>
          <Text style={styles.stepIndicator}>Bước {step}/{TOTAL_STEPS}</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={22} color="#999" />
          </TouchableOpacity>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
        </View>

        <ScrollView contentContainerStyle={styles.body} style={{ width: '100%' }}>
          {step === 1 && (
            <>
              <Text style={styles.title}>Tạo tài khoản</Text>
              <Text style={styles.subtitle}>Nhập email và mật khẩu để bắt đầu.</Text>
              <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#999" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
              <TextInput style={styles.input} placeholder="Mật khẩu (tối thiểu 6 ký tự)" placeholderTextColor="#999" value={password} onChangeText={setPassword} secureTextEntry />
              <TextInput style={styles.input} placeholder="Xác nhận mật khẩu" placeholderTextColor="#999" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
              {authError && <Text style={styles.errorText}>{authError}</Text>}
              <StepFooter onNext={goStep1Next} nextLoading={isAuthLoading} nextLabel="Gửi mã xác minh" />
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.title}>Xác minh email</Text>
              <Text style={styles.subtitle}>Mã gồm 6 số đã được gửi tới {email}.</Text>
              <TextInput
                style={[styles.input, styles.otpInput]}
                placeholder="000000"
                placeholderTextColor="#999"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
              />
              {authError && <Text style={styles.errorText}>{authError}</Text>}
              <StepFooter onNext={goStep2Next} onBack={() => setStep(1)} nextDisabled={otp.trim().length !== 6} nextLoading={isAuthLoading} nextLabel="Xác nhận" />
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.title}>Hồ sơ của bạn</Text>
              <Text style={styles.subtitle}>Ảnh đại diện và biệt danh hiển thị với mọi người.</Text>
              <View style={styles.avatarPicker}>
                <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8} style={{ alignItems: 'center' }}>
                  {avatarPreview ? (
                    <Image source={{ uri: avatarPreview }} style={styles.avatarPreviewImage} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Ionicons name="camera-outline" size={28} color="#999" />
                    </View>
                  )}
                  <Text style={styles.avatarPickText}>{avatarPreview ? 'Đổi ảnh' : 'Chọn ảnh đại diện (tùy chọn)'}</Text>
                </TouchableOpacity>
              </View>
              <TextInput style={styles.input} placeholder="Biệt danh hiển thị (ví dụ: Nam Nguyễn)" placeholderTextColor="#999" value={nickname} onChangeText={setNickname} />
              <StepFooter onNext={() => setStep(4)} onBack={() => setStep(2)} nextDisabled={!nickname.trim()} />
            </>
          )}

          {step === 4 && (
            <>
              <Text style={styles.title}>Về bạn</Text>
              <Text style={styles.subtitle}>Ngày sinh và sở thích nhạc giúp gợi ý nội dung phù hợp.</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e: any) => setDateOfBirth(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  style={{ height: 50, borderRadius: 12, border: '1px solid #ccc', paddingLeft: 16, fontSize: 16, marginBottom: 20, width: '100%', boxSizing: 'border-box' }}
                />
              ) : (
                <TextInput style={styles.input} placeholder="Ngày sinh (YYYY-MM-DD)" placeholderTextColor="#999" value={dateOfBirth} onChangeText={setDateOfBirth} />
              )}
              <Text style={styles.label}>Sở thích nhạc</Text>
              <View style={styles.chipRow}>
                {GENRES.map((g) => (
                  <TouchableOpacity key={g} style={[styles.chip, genres.includes(g) && styles.chipActive]} onPress={() => toggleGenre(g)}>
                    <Text style={[styles.chipText, genres.includes(g) && styles.chipTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <StepFooter onNext={() => setStep(5)} onBack={() => setStep(3)} nextDisabled={!dateOfBirth || genres.length === 0} />
            </>
          )}

          {step === 5 && (
            <>
              <Text style={styles.title}>Nơi bạn sinh sống</Text>
              <TextInput style={styles.input} placeholder="Quốc gia" placeholderTextColor="#999" value={country} onChangeText={setCountry} />
              <TextInput style={styles.input} placeholder="Tỉnh/Thành phố" placeholderTextColor="#999" value={province} onChangeText={setProvince} />
              <TextInput style={styles.input} placeholder="Phường/Xã" placeholderTextColor="#999" value={ward} onChangeText={setWard} />
              <TextInput style={styles.input} placeholder="Địa chỉ chi tiết" placeholderTextColor="#999" value={addressDetail} onChangeText={setAddressDetail} />
              <StepFooter
                onNext={() => setStep(6)}
                onBack={() => setStep(4)}
                nextDisabled={!country.trim() || !province.trim() || !ward.trim() || !addressDetail.trim()}
              />
            </>
          )}

          {step === 6 && (
            <>
              <Text style={styles.title}>Xác nhận</Text>
              <View style={styles.reviewCard}>
                <ReviewRow label="Email" value={email} />
                <ReviewRow label="Biệt danh" value={nickname} />
                <ReviewRow label="Ngày sinh" value={dateOfBirth} />
                <ReviewRow label="Sở thích nhạc" value={genres.join(', ')} />
                <ReviewRow label="Địa chỉ" value={[addressDetail, ward, province, country].filter(Boolean).join(', ')} />
                <ReviewRow label="Gói hiện tại" value="Miễn phí" />
              </View>
              {authError && <Text style={styles.errorText}>{authError}</Text>}
              <StepFooter onNext={handleFinish} onBack={() => setStep(5)} nextLoading={isAuthLoading} nextLabel="Hoàn tất" />
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalBackdrop: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(10px)' } as any) : {}),
  },
  modalContent: {
    width: '90%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 32,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 20,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepIndicator: { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase' },
  closeButton: { padding: 4 },
  progressTrack: { height: 4, backgroundColor: '#eee', borderRadius: 2, marginTop: 12, marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: '#1CD8A9', borderRadius: 2 },
  body: { paddingVertical: 16, alignItems: 'stretch' },
  title: { fontSize: 22, fontWeight: '800', color: '#000', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '600', color: '#999', textTransform: 'uppercase', marginBottom: 8 },
  hint: { fontSize: 13, color: '#999', marginBottom: 16 },
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
  otpInput: { textAlign: 'center', fontSize: 22, letterSpacing: 8, fontWeight: '700' },
  errorText: { color: '#1CD8A9', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  avatarPicker: { alignItems: 'center', marginBottom: 20 },
  avatarPreviewImage: { width: 88, height: 88, borderRadius: 44, marginBottom: 10, backgroundColor: '#eee' },
  avatarPlaceholder: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: '#f0f0f0',
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  avatarPickText: { color: '#1CD8A9', fontWeight: '600', fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  chip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8,
  },
  chipActive: { backgroundColor: '#1CD8A9', borderColor: '#1CD8A9' },
  chipText: { fontSize: 13, color: '#333', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  reviewCard: { backgroundColor: '#f9f9f9', borderRadius: 14, padding: 16, marginBottom: 16 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  reviewLabel: { fontSize: 13, color: '#888' },
  reviewValue: { fontSize: 13, color: '#000', fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  backButton: { paddingVertical: 14, paddingHorizontal: 4 },
  backButtonText: { color: '#666', fontWeight: '600', fontSize: 15 },
  nextButton: {
    backgroundColor: '#1CD8A9', height: 50, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, marginLeft: 'auto',
  },
  disabledButton: { opacity: 0.5 },
  nextButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
