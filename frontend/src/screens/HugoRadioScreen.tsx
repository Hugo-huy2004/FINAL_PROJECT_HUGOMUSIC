import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore, RadioStation as RealRadioStation } from '../store/useStore';
import CoverArt from '../components/CoverArt';
import { useAppTheme } from '../theme/theme';
import LiquidGlassButton from '../components/LiquidGlass/LiquidGlassButton';
import LiquidGlassCard from '../components/LiquidGlass/LiquidGlassCard';
import WaterDropletBadge from '../components/LiquidGlass/WaterDropletBadge';
import { useTranslation } from '../i18n/i18n';
import { useIsMobile } from '../utils/responsive';
import { getStationCover, getStationFallback } from '../utils/radioArtwork';
import { UserAvatar } from '../components/UserAvatar';

interface RadioStation {
  id: string;
  name: string;
  subtitle: string;
  tag: string;
  frequency?: string;
  coverArt: string;
  category: string;
  streamUrl?: string;
  description: string;
}

const PUBLIC_RADIO_STATIONS: RadioStation[] = [
  {
    id: 'hugo-1',
    name: 'Hugo 1 Radio Live',
    subtitle: 'Đài âm nhạc trực tiếp 24/7',
    tag: 'TRỰC TIẾP',
    frequency: '24/7',
    coverArt: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
    category: 'Hugo Top Hits',
    description: 'Tuyển chọn từ thư viện Hugo, phát liên tục cả ngày.',
  },
  {
    id: 'thanh-ca-live',
    name: 'Thánh Ca & Phụng Vụ Radio',
    subtitle: 'Kênh Công Giáo Trực Tuyến',
    tag: '24/7 LIVE',
    frequency: 'Thánh Ca Live',
    coverArt: 'https://images.unsplash.com/photo-1519817650390-64a93db51149?w=600&auto=format&fit=crop&q=80',
    category: 'Thánh Ca',
    description: 'Phát sóng liên tục tuyển tập Thánh Ca, kinh nguyện và giai điệu phụng vụ linh thiêng.',
  },
  {
    id: 'quoc-ca-live',
    name: 'Quốc Ca Các Quốc Gia Radio',
    subtitle: 'Tuyển tập Nhạc Lễ Thế Giới',
    tag: 'GLOBAL',
    frequency: '24/7',
    coverArt: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80',
    category: 'Quốc Ca',
    description: 'Quốc ca và nghi lễ chính thức của các quốc gia trên toàn cầu phát sóng liên tục.',
  },
  {
    id: 'lofi-chill',
    name: 'Lofi & Chillout Live Radio',
    subtitle: 'Giai điệu thư giãn & tập trung',
    tag: 'CHILL 24/7',
    frequency: '24/7',
    coverArt: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&auto=format&fit=crop&q=80',
    category: 'Nhạc Public',
    description: 'Âm thanh êm dịu, acoustic và lofi beats giúp thư giãn tinh thần và làm việc hiệu quả.',
  },
];

export default function HugoRadioScreen({ onNavigate }: { onNavigate?: (tabId: string) => void }) {
  const user = useStore((state) => state.user);
  const isPlaying = useStore((state) => state.isPlaying);
  const activeRadioStationId = useStore((state) => state.activeRadioStationId);
  const tuneInRadio = useStore((state) => state.tuneInRadio);

  const radioStations = useStore((state) => state.radioStations);
  const fetchRadioStations = useStore((state) => state.fetchRadioStations);
  const playLiveRadio = useStore((state) => state.playLiveRadio);
  const currentSong = useStore((state) => state.currentSong);
  const [liveTuningId, setLiveTuningId] = useState<string | null>(null);

  const isMobile = useIsMobile();
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();

  useEffect(() => {
    fetchRadioStations();
  }, [fetchRadioStations]);

  const handlePlayLiveStation = async (station: RealRadioStation) => {
    setLiveTuningId(station._id);
    try {
      await playLiveRadio(station);
    } finally {
      setLiveTuningId(null);
    }
  };

  const [tuningStationId, setTuningStationId] = useState<string | null>(null);

  const handlePlayStation = async (station: RadioStation) => {
    setTuningStationId(station.id);
    try {
      await tuneInRadio(station.id);
    } finally {
      setTuningStationId(null);
    }
  };

  const featuredStation = PUBLIC_RADIO_STATIONS[0];
  const otherStations = PUBLIC_RADIO_STATIONS.slice(1);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView 
        contentContainerStyle={[
          styles.content, 
          { 
            paddingHorizontal: isMobile ? 16 : 28,
            paddingTop: isMobile ? 16 : 24,
            paddingBottom: isMobile ? 160 : 100,
          }
        ]} 
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Title and Optional Party Sync / Profile Actions */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={[styles.pageTitle, { color: colors.text, fontSize: isMobile ? 28 : 34 }]}>
              {t('radio')}
            </Text>
            <Text style={[styles.pageSubTitle, { color: colors.textSecondary }]}>
              {t('radioSubtitle')}
            </Text>
          </View>

          <View style={styles.headerRightActions}>
            {/* User Profile Avatar Button on Mobile */}
            {isMobile && onNavigate && (
              <TouchableOpacity
                style={[styles.headerAvatarBtn, { borderColor: colors.border }]}
                onPress={() => onNavigate('account')}
                activeOpacity={0.7}
              >
                {user ? (
                  <UserAvatar
                    avatarUrl={user.avatarUrl}
                    username={user.username}
                    nickname={user.nickname}
                    size={32}
                  />
                ) : (
                  <View style={[styles.headerAvatarPlaceholder, { backgroundColor: colors.activeItemBg }]}>
                    <Ionicons name="person" size={15} color={colors.accent} />
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Featured Live Broadcast Station */}
        <View style={styles.featuredSection}>
          <Text style={[styles.sectionSubtitle, { color: colors.textTertiary }]}>
            {t('featuredLiveBroadcast')}
          </Text>

          {isMobile ? (
            /* Mobile Featured Card: Full-width broadcast billboard with Liquid Glass */
            <LiquidGlassCard
              borderRadius={20}
              onPress={() => handlePlayStation(featuredStation)}
              style={[styles.featuredHeroCardMobile, { padding: 0 }]}
              glowColor="#FF3B30"
            >
              <View style={styles.featuredHeroBannerWrapper}>
                <Image
                  source={{ uri: featuredStation.coverArt }}
                  style={styles.featuredHeroBannerImg}
                />
                <View style={styles.featuredHeroBannerOverlay}>
                  <WaterDropletBadge
                    label={featuredStation.tag}
                    color="#FF3B30"
                    size="sm"
                    pulsing={true}
                  />
                  <Text style={styles.liveFreqBadgeText}>
                    {featuredStation.frequency}
                  </Text>
                </View>
              </View>

              <View style={styles.featuredHeroMobileInfo}>
                <Text style={[styles.featuredHeroTitle, { color: colors.text }]} numberOfLines={1}>
                  {featuredStation.name}
                </Text>
                <Text style={[styles.featuredHeroDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                  {featuredStation.description}
                </Text>

                <View style={styles.featuredHeroMobileActionRow}>
                  <LiquidGlassButton
                    variant="primary"
                    size="sm"
                    title={t('listenLive')}
                    onPress={() => handlePlayStation(featuredStation)}
                    icon={
                      tuningStationId === featuredStation.id ? (
                        <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 4 }} />
                      ) : (
                        <Ionicons name="play" size={15} color="#ffffff" style={{ marginRight: 4 }} />
                      )
                    }
                  />
                  <Text style={[styles.stationCategoryTag, { color: colors.textTertiary }]} numberOfLines={1}>
                    {featuredStation.subtitle}
                  </Text>
                </View>
              </View>
            </LiquidGlassCard>
          ) : (
            /* Desktop Featured Card: Horizontal Row with Liquid Glass */
            <LiquidGlassCard
              borderRadius={20}
              onPress={() => handlePlayStation(featuredStation)}
              style={styles.featuredHeroCard}
              glowColor="#FF3B30"
            >
              <CoverArt uri={featuredStation.coverArt} size={150} radius={12} />
              <View style={styles.featuredHeroInfo}>
                <View style={styles.liveIndicatorRow}>
                  <WaterDropletBadge
                    label={featuredStation.tag}
                    color="#FF3B30"
                    size="sm"
                    pulsing={true}
                  />
                  <Text style={[styles.liveFreqText, { color: colors.textTertiary, marginLeft: 8 }]}>
                    • {featuredStation.frequency}
                  </Text>
                </View>

                <Text style={[styles.featuredHeroTitle, { color: colors.text }]}>
                  {featuredStation.name}
                </Text>
                <Text style={[styles.featuredHeroDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                  {featuredStation.description}
                </Text>

                <View style={styles.featuredHeroActionRow}>
                  <LiquidGlassButton
                    variant="primary"
                    size="sm"
                    title={t('listenLive')}
                    onPress={() => handlePlayStation(featuredStation)}
                    icon={
                      tuningStationId === featuredStation.id ? (
                        <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 4 }} />
                      ) : (
                        <Ionicons name="play" size={15} color="#ffffff" style={{ marginRight: 4 }} />
                      )
                    }
                  />
                  <Text style={[styles.stationCategoryTag, { color: colors.textTertiary }]} numberOfLines={1}>
                    {featuredStation.subtitle}
                  </Text>
                </View>
              </View>
            </LiquidGlassCard>
          )}
        </View>

        {/* Public Stations Section */}
        <View style={styles.stationsSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('publicStations')}</Text>
          <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
            {t('publicStationsDesc')}
          </Text>

          <View style={isMobile ? styles.stationsListMobile : styles.stationsGrid}>
            {otherStations.map((station) => {
              const isCurrent = activeRadioStationId === station.id && isPlaying;
              const isTuning = tuningStationId === station.id;

              return (
                <LiquidGlassCard
                  key={station.id}
                  borderRadius={16}
                  onPress={() => handlePlayStation(station)}
                  glowColor={isCurrent ? colors.accent : undefined}
                  tint={isCurrent ? 'rgba(16, 185, 129, 0.16)' : undefined}
                  style={[
                    isMobile ? styles.stationRowMobile : styles.stationCard,
                    isCurrent ? { borderColor: colors.accent } : null,
                  ]}
                >
                  <View style={styles.stationCoverWrapper}>
                    <CoverArt uri={station.coverArt} size={isMobile ? 64 : 110} radius={10} />
                    <View style={{ position: 'absolute', top: 6, left: 6 }}>
                      <WaterDropletBadge
                        label={station.tag}
                        color={isCurrent ? colors.accent : '#FF3B30'}
                        size="sm"
                        pulsing={isCurrent}
                      />
                    </View>
                  </View>

                  <View style={styles.stationDetails}>
                    <View>
                      <Text style={[styles.stationName, { color: colors.text }]} numberOfLines={1}>
                        {station.name}
                      </Text>
                      <Text style={[styles.stationSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                        {station.subtitle}
                      </Text>
                      {!isMobile && (
                        <Text style={[styles.stationDescText, { color: colors.textTertiary }]} numberOfLines={2}>
                          {station.description}
                        </Text>
                      )}
                    </View>

                    <View style={styles.stationBottomRow}>
                      <View style={[styles.stationPlayIconCircle, { backgroundColor: isCurrent ? colors.accent : colors.activeItemBg }]}>
                        {isTuning ? (
                          <ActivityIndicator size="small" color={isCurrent ? '#ffffff' : colors.accent} />
                        ) : (
                          <Ionicons
                            name={isCurrent ? 'pause' : 'play'}
                            size={14}
                            color={isCurrent ? '#ffffff' : colors.accent}
                            style={{ marginLeft: isCurrent ? 0 : 2 }}
                          />
                        )}
                      </View>
                      <Text style={[styles.tuneInText, { color: isCurrent ? colors.accent : colors.textSecondary, fontWeight: isCurrent ? '700' : '600' }]}>
                        {isTuning ? t('tuningIn') : isCurrent ? t('liveNow') : t('tuneIn')}
                      </Text>
                    </View>
                  </View>
                </LiquidGlassCard>
              );
            })}
          </View>
        </View>

        {/* Real World Live Radio Stations */}
        {radioStations.length > 0 && (
          <View style={styles.stationsSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('worldRadio')}
            </Text>
            <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
              {t('worldRadioDesc')}
            </Text>

            <View style={isMobile ? styles.stationsListMobile : styles.stationsGrid}>
              {radioStations.map((station) => {
                const isCurrent = currentSong?._id === `radio-${station._id}` && isPlaying;
                const isTuning = liveTuningId === station._id;

                return (
                  <LiquidGlassCard
                    key={station._id}
                    borderRadius={16}
                    onPress={() => handlePlayLiveStation(station)}
                    glowColor={isCurrent ? colors.accent : undefined}
                    tint={isCurrent ? 'rgba(16, 185, 129, 0.16)' : undefined}
                    style={[
                      isMobile ? styles.stationRowMobile : styles.stationCard,
                      isCurrent ? { borderColor: colors.accent } : null,
                    ]}
                  >
                    <View style={styles.stationCoverWrapper}>
                      <CoverArt
                        uri={getStationCover(station)}
                        fallbackUri={getStationFallback(station)}
                        fallbackIcon="radio"
                        size={isMobile ? 56 : 100}
                        radius={10}
                      />
                      <View style={{ position: 'absolute', top: 6, left: 6 }}>
                        <WaterDropletBadge
                          label={station.countryCode || 'LIVE'}
                          color={isCurrent ? colors.accent : '#FF3B30'}
                          size="sm"
                          pulsing={isCurrent}
                        />
                      </View>
                    </View>

                    <View style={styles.stationDetails}>
                      <View>
                        <Text style={[styles.stationName, { color: colors.text }]} numberOfLines={1}>
                          {station.name}
                        </Text>
                        <Text style={[styles.stationSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                          {station.country || 'Radio'}{station.genre ? ` · ${station.genre}` : ''}
                        </Text>
                        {!isMobile && (
                          <Text style={[styles.stationDescText, { color: colors.textTertiary }]} numberOfLines={1}>
                            {station.codec}{station.bitrate ? ` ${station.bitrate}kbps` : ''}
                          </Text>
                        )}
                      </View>

                      <View style={styles.stationBottomRow}>
                        <View style={[styles.stationPlayIconCircle, { backgroundColor: isCurrent ? colors.accent : colors.activeItemBg }]}>
                          {isTuning ? (
                            <ActivityIndicator size="small" color={isCurrent ? '#ffffff' : colors.accent} />
                          ) : (
                            <Ionicons
                              name={isCurrent ? 'pause' : 'play'}
                              size={14}
                              color={isCurrent ? '#ffffff' : colors.accent}
                              style={{ marginLeft: isCurrent ? 0 : 2 }}
                            />
                          )}
                        </View>
                        <Text style={[styles.tuneInText, { color: isCurrent ? colors.accent : colors.textSecondary, fontWeight: isCurrent ? '700' : '600' }]}>
                          {isTuning
                            ? t('connecting')
                            : isCurrent
                            ? t('liveNow')
                            : t('tuneIn')}
                        </Text>
                      </View>
                    </View>
                  </LiquidGlassCard>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    // padding applied dynamically
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pageTitle: {
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  pageSubTitle: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  headerAvatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerAvatarImg: {
    width: '100%',
    height: '100%',
  },
  headerAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredSection: {
    marginBottom: 28,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  // Desktop Featured Hero
  featuredHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  featuredHeroInfo: {
    flex: 1,
    marginLeft: 18,
  },
  // Mobile Featured Hero Billboard
  featuredHeroCardMobile: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  featuredHeroBannerWrapper: {
    position: 'relative',
    width: '100%',
    height: 150,
  },
  featuredHeroBannerImg: {
    width: '100%',
    height: '100%',
    backgroundColor: '#222',
  },
  featuredHeroBannerOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveIndicatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 5,
  },
  liveFreqBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  featuredHeroMobileInfo: {
    padding: 14,
  },
  featuredHeroMobileActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  liveIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  liveTagText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  liveFreqText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  featuredHeroTitle: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  featuredHeroDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  featuredHeroActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stationCategoryTag: {
    fontSize: 12,
    fontWeight: '500',
  },
  stationsSection: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  sectionDesc: {
    fontSize: 13,
    marginTop: 3,
    marginBottom: 14,
  },
  // Desktop Grid
  stationsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  stationCard: {
    minWidth: 280,
    flex: 1,
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  stationCardActive: {
    borderWidth: 1.5,
  },
  // Mobile Station List
  stationsListMobile: {
    flexDirection: 'column',
    gap: 10,
  },
  stationRowMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  stationCoverWrapper: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
  },
  stationTagBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  liveDotSmall: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  stationTagText: {
    fontSize: 9,
    fontWeight: '700',
  },
  stationDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
    minHeight: 56,
  },
  stationName: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  stationSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  stationDescText: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 4,
  },
  stationBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  stationPlayIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tuneInText: {
    fontSize: 11.5,
  },
});
