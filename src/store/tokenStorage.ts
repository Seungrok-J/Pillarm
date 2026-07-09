import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * 인증 토큰 전용 저장소.
 * 네이티브는 SecureStore(iOS Keychain / Android Keystore)에 암호화 저장하고,
 * SecureStore 를 지원하지 않는 웹은 AsyncStorage 로 폴백한다.
 */

// SecureStore 키는 영숫자와 "." "-" "_" 만 허용된다 (기존 "@pillarm/..." 형식 사용 불가)
const ACCESS_KEY  = 'pillarm.access_token';
const REFRESH_KEY = 'pillarm.refresh_token';

// 구버전에서 AsyncStorage 에 평문 저장하던 키 — 최초 접근 시 SecureStore 로 이관
const LEGACY_ACCESS_KEY  = '@pillarm/access_token';
const LEGACY_REFRESH_KEY = '@pillarm/refresh_token';

const useSecure = Platform.OS !== 'web';

async function getItem(key: string): Promise<string | null> {
  return useSecure ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key);
}

async function setItem(key: string, value: string): Promise<void> {
  return useSecure ? SecureStore.setItemAsync(key, value) : AsyncStorage.setItem(key, value);
}

async function removeItem(key: string): Promise<void> {
  return useSecure ? SecureStore.deleteItemAsync(key) : AsyncStorage.removeItem(key);
}

/** 새 저장소에 없으면 레거시 AsyncStorage 값을 이관 후 반환한다. */
async function getWithLegacyMigration(key: string, legacyKey: string): Promise<string | null> {
  const value = await getItem(key);
  if (value != null) return value;

  const legacy = await AsyncStorage.getItem(legacyKey);
  if (legacy == null) return null;

  await setItem(key, legacy);
  await AsyncStorage.removeItem(legacyKey);
  return legacy;
}

export function getAccessToken(): Promise<string | null> {
  return getWithLegacyMigration(ACCESS_KEY, LEGACY_ACCESS_KEY);
}

export function getRefreshToken(): Promise<string | null> {
  return getWithLegacyMigration(REFRESH_KEY, LEGACY_REFRESH_KEY);
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    setItem(ACCESS_KEY, accessToken),
    setItem(REFRESH_KEY, refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    removeItem(ACCESS_KEY),
    removeItem(REFRESH_KEY),
    AsyncStorage.removeItem(LEGACY_ACCESS_KEY),
    AsyncStorage.removeItem(LEGACY_REFRESH_KEY),
  ]);
}
