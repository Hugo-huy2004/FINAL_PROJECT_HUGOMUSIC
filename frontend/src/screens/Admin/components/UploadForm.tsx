import { useState } from 'react';
import { View, Text, Platform, Image } from 'react-native';
import LicensePicker from './LicensePicker';
import { C, Btn, Field, ErrorLine, s as ui } from '../ui';

const AUDIO_MAX = 50 * 1024 * 1024;
const COVER_MAX = 5 * 1024 * 1024;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

// Tải bài vào kho → hàng chờ duyệt. Bắt buộc: tệp nhạc, giấy phép, URL nguồn (thiếu thì không bao giờ qua tầng
// bản quyền). Tuỳ chọn: ảnh bìa riêng (không có thì lấy ảnh nhúng trong tệp), album, tên/nghệ sĩ (không nhập thì
// đọc từ thẻ ID3). Kiểm tra loại/cỡ tệp ngay trên máy trước khi tốn băng thông tải lên.
export default function UploadForm({ isUploading, onUpload }: { isUploading: boolean; onUpload: (form: FormData) => Promise<boolean> }) {
  const [f, setF] = useState({ title: '', artist: '', genre: '', category: '', albumTitle: '', albumYear: '', trackNo: '', sourceUrl: '', licenseUrl: '', attribution: '' });
  const [licenseType, setLicenseType] = useState('');
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: k === 'albumYear' || k === 'trackNo' ? v.replace(/\D/g, '') : v }));
  const sourceOk = /^https?:\/\/\S+$/i.test(f.sourceUrl.trim());
  const ready = !!audio && !!licenseType && sourceOk && !isUploading;

  if (Platform.OS !== 'web') {
    return <Text style={ui.rowSub}>Mở trang quản trị trên trình duyệt web để tải bài hát lên (cần chọn tệp từ máy).</Text>;
  }

  const pickAudio = (e: any) => {
    const file: File | undefined = e.target.files?.[0];
    setError(null);
    if (!file) return setAudio(null);
    if (!file.type.startsWith('audio/')) { setError('Tệp nhạc phải là định dạng âm thanh (mp3, flac, ogg, wav…)'); return setAudio(null); }
    if (file.size > AUDIO_MAX) { setError(`Tệp nhạc ${mb(file.size)} — tối đa 50 MB`); return setAudio(null); }
    setAudio(file);
  };
  const pickCover = (e: any) => {
    const file: File | undefined = e.target.files?.[0];
    setError(null);
    if (!file) { setCover(null); setCoverPreview(null); return; }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError('Ảnh bìa phải là JPEG, PNG hoặc WebP'); return; }
    if (file.size > COVER_MAX) { setError(`Ảnh bìa ${mb(file.size)} — tối đa 5 MB`); return; }
    setCover(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const submit = async () => {
    if (!ready) return;
    const form = new FormData();
    form.append('audio', audio!);
    if (cover) form.append('cover', cover);
    form.append('licenseType', licenseType);
    Object.entries(f).forEach(([k, v]) => { if (v.trim()) form.append(k, v.trim()); });
    if (await onUpload(form)) {
      setF({ title: '', artist: '', genre: '', category: '', albumTitle: '', albumYear: '', trackNo: '', sourceUrl: '', licenseUrl: '', attribution: '' });
      setLicenseType('');
      setAudio(null);
      setCover(null);
      setCoverPreview(null);
    }
  };

  const fileBox = (label: string, hint: string, accept: string, onChange: (e: any) => void, picked: File | null) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={ui.fieldLabel}>{label}</Text>
      <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, borderRadius: 10, padding: 12, backgroundColor: C.sunken }}>
        <input type="file" accept={accept} onChange={onChange} style={{ color: C.text, fontSize: 13 }} />
        <Text style={[ui.rowSub, { marginTop: 6 }]}>{picked ? `${picked.name} · ${mb(picked.size)}` : hint}</Text>
      </View>
    </View>
  );

  const section = (t: string) => <Text style={{ fontSize: 12, fontWeight: '800', color: C.faint, letterSpacing: 0.4, marginTop: 8, marginBottom: 8 }}>{t}</Text>;

  return (
    <View>
      <ErrorLine message={error} />
      {section('TỆP')}
      {fileBox('Tệp nhạc *', 'mp3, flac, ogg, wav… tối đa 50 MB', 'audio/*', pickAudio, audio)}
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>{fileBox('Ảnh bìa', 'JPEG/PNG/WebP ≤ 5 MB — để trống thì lấy ảnh nhúng trong tệp nhạc', 'image/jpeg,image/png,image/webp', pickCover, cover)}</View>
        {coverPreview && <Image source={{ uri: coverPreview }} style={{ width: 88, height: 88, borderRadius: 8, marginTop: 22 }} />}
      </View>

      {section('THÔNG TIN BÀI (để trống → đọc từ thẻ ID3 của tệp)')}
      <Field label="Tên bài" value={f.title} onChange={set('title')} />
      <Field label="Nghệ sĩ" value={f.artist} onChange={set('artist')} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Field label="Thể loại" value={f.genre} onChange={set('genre')} placeholder="vd. Electronic" /></View>
        <View style={{ flex: 1 }}><Field label="Danh mục" value={f.category} onChange={set('category')} placeholder="vd. Nhạc Quốc Tế" /></View>
      </View>

      {section('ALBUM')}
      <Field label="Tên album" value={f.albumTitle} onChange={set('albumTitle')} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Field label="Năm phát hành" value={f.albumYear} onChange={set('albumYear')} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Field label="Số thứ tự trong album" value={f.trackNo} onChange={set('trackNo')} keyboardType="number-pad" /></View>
      </View>

      {section('BẢN QUYỀN (bắt buộc để qua duyệt)')}
      <Text style={ui.fieldLabel}>Giấy phép *</Text>
      <LicensePicker value={licenseType} onChange={setLicenseType} />
      <View style={{ height: 8 }} />
      <Field label="URL nguồn *" value={f.sourceUrl} onChange={set('sourceUrl')} placeholder="https://archive.org/details/…" />
      {!!f.sourceUrl && !sourceOk && <Text style={{ color: C.danger, fontSize: 12, marginTop: -8, marginBottom: 8 }}>URL phải bắt đầu bằng http:// hoặc https://</Text>}
      <Field label="URL giấy phép" value={f.licenseUrl} onChange={set('licenseUrl')} placeholder="https://creativecommons.org/licenses/…" />
      <Field label="Ghi công tác giả" value={f.attribution} onChange={set('attribution')} placeholder="Mặc định: tên nghệ sĩ" />

      <Btn variant="primary" icon="cloud-upload-outline" label={isUploading ? 'Đang tải lên…' : 'Tải lên và đưa vào hàng chờ duyệt'} onPress={submit} disabled={!ready} loading={isUploading} />
      {!ready && !isUploading && <Text style={[ui.rowSub, { marginTop: 8 }]}>Cần: tệp nhạc, giấy phép và URL nguồn hợp lệ.</Text>}
    </View>
  );
}
