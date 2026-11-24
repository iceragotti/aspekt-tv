import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const isSupabaseConfigured =
  typeof supabaseUrl === 'string' &&
  supabaseUrl.length > 0 &&
  typeof supabaseAnonKey === 'string' &&
  supabaseAnonKey.length > 0;

const fallbackSupabaseUrl = 'http://127.0.0.1:54321';
const fallbackSupabaseAnonKey = 'missing-supabase-anon-key';

const webStorage = {
  getItem: (key: string) => {
    if (typeof globalThis.localStorage === 'undefined') return null;
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    if (typeof globalThis.localStorage === 'undefined') return;
    try {
      globalThis.localStorage.setItem(key, value);
    } catch {}
  },
  removeItem: (key: string) => {
    if (typeof globalThis.localStorage === 'undefined') return;
    try {
      globalThis.localStorage.removeItem(key);
    } catch {}
  },
};

const nativeStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : fallbackSupabaseUrl,
  isSupabaseConfigured ? supabaseAnonKey : fallbackSupabaseAnonKey,
  {
  auth: {
    storage: Platform.OS === 'web' ? webStorage : nativeStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
  },
);
