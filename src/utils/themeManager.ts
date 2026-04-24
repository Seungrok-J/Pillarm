import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Theme {
  id: string;
  name: string;
  price: number;
  /** 기본 강조색 (버튼, 배지, FAB) */
  primary: string;
  /** 강조색 연한 버전 (뱃지 배경 등) */
  primaryLight: string;
  /** 앱 배경 */
  background: string;
  /** 카드/표면 색 */
  surface: string;
  /** 본문 텍스트 */
  text: string;
  textSecondary: string;
}

export const THEMES: Theme[] = [
  {
    id: 'default', name: '기본', price: 0,
    primary: '#3b82f6', primaryLight: '#eff6ff',
    background: '#f9fafb', surface: '#ffffff',
    text: '#111827', textSecondary: '#6b7280',
  },
  {
    id: 'mint', name: '민트', price: 100,
    primary: '#10b981', primaryLight: '#d1fae5',
    background: '#f0fdf4', surface: '#ffffff',
    text: '#111827', textSecondary: '#6b7280',
  },
  {
    id: 'coral', name: '코랄', price: 150,
    primary: '#f43f5e', primaryLight: '#ffe4e8',
    background: '#fff1f2', surface: '#ffffff',
    text: '#111827', textSecondary: '#6b7280',
  },
  {
    id: 'lavender', name: '라벤더', price: 200,
    primary: '#8b5cf6', primaryLight: '#ede9fe',
    background: '#f5f3ff', surface: '#ffffff',
    text: '#111827', textSecondary: '#6b7280',
  },
  {
    id: 'sunset', name: '선셋', price: 300,
    primary: '#f97316', primaryLight: '#ffedd5',
    background: '#fff7ed', surface: '#ffffff',
    text: '#111827', textSecondary: '#6b7280',
  },
];

const THEME_KEY = '@pillarm/active_theme';

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

/** 선택 테마를 AsyncStorage 에 저장하고 NativeWind 색상 변수를 갱신한다. */
export async function applyTheme(themeId: string): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, themeId);
}

export async function loadSavedThemeId(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(THEME_KEY)) ?? 'default';
  } catch {
    return 'default';
  }
}
