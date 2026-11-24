import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
        '❌ Faltan variables de entorno.\n' +
        'Asegurate de tener EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en tu .env'
    );
}

const memoryStorage = new Map<string, string>();

const webStorage = {
    getItem: (key: string): string | null => {
        try {
            if (typeof window !== 'undefined') return window.localStorage.getItem(key);
        } catch { }
        return memoryStorage.get(key) ?? null;
    },
    setItem: (key: string, value: string): void => {
        memoryStorage.set(key, value);
        try {
            if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
        } catch { }
    },
    removeItem: (key: string): void => {
        memoryStorage.delete(key);
        try {
            if (typeof window !== 'undefined') window.localStorage.removeItem(key);
        } catch { }
    },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: webStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
    },
});
