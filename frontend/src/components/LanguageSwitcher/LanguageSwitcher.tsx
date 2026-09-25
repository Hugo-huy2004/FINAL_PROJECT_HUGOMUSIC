import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation, LanguageMeta } from '../../i18n/i18n';
import { useAppTheme } from '../../theme/theme';

interface LanguageSwitcherProps {
  /** 'expanded' for Personal Settings (MemberDashboard), 'pill' for compact view */
  variant?: 'pill' | 'expanded';
}

export default function LanguageSwitcher({ variant = 'expanded' }: LanguageSwitcherProps) {
  const { language, setLanguage, supportedLanguages, currentLanguageMeta, t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Primary languages shown directly in the settings card (VI & EN)
  const primaryLanguages = useMemo(() => {
    const list = supportedLanguages.slice(0, 2);
    if (!list.some((l) => l.code === language)) {
      const currentMeta = supportedLanguages.find((l) => l.code === language);
      if (currentMeta) list.push(currentMeta);
    }
    return list;
  }, [supportedLanguages, language]);

  const filteredLanguages = useMemo(() => {
    if (!searchQuery.trim()) return supportedLanguages;
    const q = searchQuery.toLowerCase().trim();
    return supportedLanguages.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
    );
  }, [supportedLanguages, searchQuery]);

  const handleSelectLanguage = (code: string) => {
    setLanguage(code);
    setIsModalOpen(false);
    setSearchQuery('');
  };

  // -------------------------------------------------------------------------
  // Expanded Layout: Used directly inside Personal Settings (MemberDashboard)
  // -------------------------------------------------------------------------
  if (variant === 'expanded') {
    return (
      <View style={styles.expandedContainer}>
        {/* Primary Language Option Cards */}
        <View style={styles.primaryGrid}>
          {primaryLanguages.map((lang) => {
            const isSelected = language === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                onPress={() => handleSelectLanguage(lang.code)}
                activeOpacity={0.75}
                style={[
                  styles.langCard,
                  {
                    backgroundColor: isSelected
                      ? (isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.10)')
                      : (isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'),
                    borderColor: isSelected ? colors.accent : colors.cardBorder,
                  },
                ]}
              >
                <View style={styles.langCardInfo}>
                  <Text
                    style={[
                      styles.langCardNativeName,
                      { color: isSelected ? colors.accent : colors.text },
                      isSelected && { fontWeight: '700' },
                    ]}
                  >
                    {lang.nativeName}
                  </Text>
                  <Text style={[styles.langCardSubName, { color: colors.textSecondary }]}>
                    {lang.name} ({lang.code.toUpperCase()})
                  </Text>
                </View>

                <View
                  style={[
                    styles.radioCircle,
                    {
                      borderColor: isSelected ? colors.accent : colors.cardBorder,
                      backgroundColor: isSelected ? colors.accent : 'transparent',
                    },
                  ]}
                >
                  {isSelected && <Ionicons name="checkmark" size={13} color="#ffffff" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Button to browse and pick from 100+ languages */}
        {supportedLanguages.length > 2 && (
          <TouchableOpacity
            onPress={() => setIsModalOpen(true)}
            activeOpacity={0.75}
            style={[
              styles.browseAllBtn,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Ionicons name="globe-outline" size={16} color={colors.accent} style={{ marginRight: 8 }} />
            <Text style={[styles.browseAllBtnText, { color: colors.text }]}>
              {t('moreLanguages')} ({supportedLanguages.length})
            </Text>
            <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        )}

        {/* Scalable Modal Picker for 100+ languages (NO flags) */}
        <Modal
          visible={isModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsModalOpen(false)}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setIsModalOpen(false)}
          >
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: isDark ? 'rgba(28, 28, 32, 0.96)' : 'rgba(255, 255, 255, 0.98)',
                  borderColor: colors.cardBorder,
                },
                Platform.OS === 'web'
                  ? ({
                      backdropFilter: 'blur(35px) saturate(190%)',
                      WebkitBackdropFilter: 'blur(35px) saturate(190%)',
                      boxShadow: '0 20px 48px rgba(0, 0, 0, 0.45)',
                    } as any)
                  : null,
              ]}
              onStartShouldSetResponder={() => true}
            >
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="globe-outline" size={18} color={colors.accent} style={{ marginRight: 8 }} />
                  <Text style={[styles.modalTitle, { color: colors.text }]}>
                    {t('switchLanguage')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsModalOpen(false)}
                  style={[styles.modalCloseBtn, { backgroundColor: colors.activeItemBg }]}
                >
                  <Ionicons name="close" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Search Bar for 100+ Languages */}
              <View style={[styles.searchBox, { backgroundColor: colors.activeItemBg, borderColor: colors.cardBorder }]}>
                <Ionicons name="search" size={15} color={colors.textTertiary} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder={t('searchLanguagePlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus={Platform.OS === 'web'}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Scalable FlatList with NO Flags */}
              <FlatList
                data={filteredLanguages}
                keyExtractor={(item) => item.code}
                style={styles.langList}
                showsVerticalScrollIndicator={true}
                renderItem={({ item }) => {
                  const isSelected = language === item.code;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.langRow,
                        isSelected && [styles.langRowSelected, { backgroundColor: colors.activeItemBg }],
                      ]}
                      onPress={() => handleSelectLanguage(item.code)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.langNativeName,
                            { color: isSelected ? colors.accent : colors.text },
                            isSelected && { fontWeight: '700' },
                          ]}
                        >
                          {item.nativeName}
                        </Text>
                        <Text style={[styles.langSubName, { color: colors.textSecondary }]}>
                          {item.name} · {item.code.toUpperCase()}
                        </Text>
                      </View>

                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Compact Pill Layout: Fallback for small inline contexts (NO flags)
  // -------------------------------------------------------------------------
  return (
    <View
      style={[
        styles.pillContainer,
        {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
          borderColor: colors.cardBorder,
        },
      ]}
    >
      {primaryLanguages.map((lang, idx) => {
        const isSelected = language === lang.code;
        return (
          <React.Fragment key={lang.code}>
            {idx > 0 && <Text style={[styles.separator, { color: colors.textTertiary }]}>|</Text>}
            <TouchableOpacity
              onPress={() => handleSelectLanguage(lang.code)}
              activeOpacity={0.7}
              style={[
                styles.pillBtn,
                isSelected && [styles.pillBtnActive, { backgroundColor: colors.accent }],
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: isSelected ? '#ffffff' : colors.textSecondary },
                ]}
              >
                {lang.code.toUpperCase()}
              </Text>
            </TouchableOpacity>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Expanded Settings Card Styles
  expandedContainer: {
    width: '100%',
  },
  primaryGrid: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  langCard: {
    flex: 1,
    minWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      } as any,
      default: {},
    }),
  },
  langCardInfo: {
    flex: 1,
    marginRight: 10,
  },
  langCardNativeName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  langCardSubName: {
    fontSize: 12,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  browseAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      } as any,
      default: {},
    }),
  },
  browseAllBtnText: {
    fontSize: 13.5,
    fontWeight: '500',
  },

  // Modal Styles (Searchable 100+ Languages, No Flags)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: 520,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    padding: 0,
  },
  langList: {
    maxHeight: 340,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      } as any,
      default: {},
    }),
  },
  langRowSelected: {},
  langNativeName: {
    fontSize: 14.5,
    fontWeight: '500',
  },
  langSubName: {
    fontSize: 12,
    marginTop: 2,
  },

  // Compact Pill Styles
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 18,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pillBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  pillBtnActive: {
    shadowColor: '#10B981',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  separator: {
    fontSize: 10,
    marginHorizontal: 2,
    opacity: 0.5,
  },
});
