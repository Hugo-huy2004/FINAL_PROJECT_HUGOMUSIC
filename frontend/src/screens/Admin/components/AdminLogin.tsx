import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useAdminAuth } from '../hooks/useAdminAuth';

export default function AdminLogin() {
  const { isAuthLoading, authError, pendingOtpToken, handleLogin, handleVerifyOtp } = useAdminAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');

  return (
    <View style={styles.adminLoginContainer}>
      {/* Faded Background Logo */}
      <View style={styles.bgLogoContainer}>
        <Ionicons name="headset" size={400} color="rgba(0,0,0,0.03)" />
      </View>

      <View style={styles.loginWhiteCard}>
        <View style={styles.cardHeader}>
          <Image 
            source={require('../../../../assets/logo.png')} 
            style={{ width: 60, height: 60, resizeMode: 'contain', marginBottom: 12 }} 
            defaultSource={{ uri: 'https://via.placeholder.com/60?text=HM' }}
          />
          <View style={styles.brandTextContainer}>
            {Platform.OS === 'web' ? (
              <Text style={[styles.logoHugo, {
                backgroundImage: 'linear-gradient(45deg, #FDF100, #1CD8A9, #0082FB)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'transparent',
              } as any]}>
                Hugo
              </Text>
            ) : (
              <MaskedView
                style={{ flexDirection: 'row', height: 26 }}
                maskElement={<Text style={styles.logoHugo}>Hugo</Text>}
              >
                <LinearGradient
                  colors={['#FDF100', '#1CD8A9', '#0082FB']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ flex: 1 }}
                >
                  <Text style={[styles.logoHugo, { opacity: 0 }]}>Hugo</Text>
                </LinearGradient>
              </MaskedView>
            )}
            <Text style={styles.logoMusic}> Music</Text>
            <Text style={styles.logoDashboard}> Dashboard</Text>
          </View>
        </View>

        {pendingOtpToken ? (
          <View style={styles.formContainer}>
            <TextInput
              style={styles.bottomBorderInput}
              placeholder="Nhập mã OTP (Telegram)"
              placeholderTextColor="#999"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
            />
            {authError && <Text style={styles.errorTextAuth}>{authError}</Text>}
            <TouchableOpacity
              style={styles.fullWidthButton}
              onPress={() => handleVerifyOtp(otp)}
              disabled={isAuthLoading || otp.trim().length !== 6}
            >
              {isAuthLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.fullWidthButtonText}>XÁC NHẬN</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.forgotLink}>
              <Text style={styles.forgotLinkText}>Gửi lại mã?</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.formContainer}>
            <TextInput
              style={styles.bottomBorderInput}
              placeholder="Tài khoản (Username / Email)"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="default"
            />
            <TextInput
              style={styles.bottomBorderInput}
              placeholder="Password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            {authError && <Text style={styles.errorTextAuth}>{authError}</Text>}
            <TouchableOpacity
              style={styles.fullWidthButton}
              onPress={() => handleLogin(email, password)}
              disabled={isAuthLoading}
            >
              {isAuthLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.fullWidthButtonText}>LOGIN</Text>}
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.forgotLink}>
              <Text style={styles.forgotLinkText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.footerContainer}>
        <Text style={styles.footerText}>© HUGO MUSIC 2026</Text>
        <Text style={styles.footerSubText}>Hugo Music enables artists and creators to connect and scale their musical impact globally.</Text>
        <Text style={styles.footerDev}>Build V1.0.0_ADMIN</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  adminLoginContainer: { 
    flex: 1, 
    backgroundColor: '#1CD8A9',
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 24,
    position: 'relative',
    height: '100vh' as any,
    width: '100vw' as any,
  },
  bgLogoContainer: {
    position: 'absolute',
    top: '15%',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    zIndex: 0,
  },
  loginWhiteCard: { 
    width: '100%', 
    maxWidth: 400, 
    backgroundColor: '#fff',
    padding: 40,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    zIndex: 1,
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  brandTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoHugo: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  logoMusic: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -0.5,
  },
  logoDashboard: {
    fontSize: 22,
    fontWeight: '300',
    color: '#333',
    letterSpacing: -0.5,
  },
  formContainer: {
    width: '100%',
  },
  bottomBorderInput: {
    width: '100%',
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    fontSize: 15,
    marginBottom: 24,
    color: '#333',
    paddingHorizontal: 4,
  },
  errorTextAuth: { 
    color: '#FF3B30', 
    fontSize: 13, 
    marginBottom: 16, 
    textAlign: 'center' 
  },
  fullWidthButton: {
    width: '100%',
    backgroundColor: '#1CD8A9',
    height: 48,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  fullWidthButtonText: { 
    color: '#fff', 
    fontWeight: '600', 
    fontSize: 14,
    letterSpacing: 1,
  },
  forgotLink: {
    alignItems: 'center',
    marginTop: 24,
  },
  forgotLinkText: {
    color: '#1CD8A9',
    fontSize: 14,
  },
  footerContainer: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 1,
  },
  footerText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '400',
    opacity: 0.85,
    marginBottom: 4,
  },
  footerSubText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 9.5,
    textAlign: 'center',
    maxWidth: 500,
    marginBottom: 10,
  },
  footerDev: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 8.5,
  }
});
