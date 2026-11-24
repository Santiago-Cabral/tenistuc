import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { presenceService } from '../services/presenceService';
import { clearPushToken } from '../notifications/notificationService';
import { markExplicitSignOut } from '../services/webSessionNotice';
import type { Level } from '../constants/levels';
import type { AgeCategory } from '../constants/ageCategories';

// Columnas legibles de `profiles`. Se listan explícitamente y se excluye
// `expo_push_token`: esa columna está revocada para anon/authenticated
// (el token push solo lo lee el servidor con service_role).
const PROFILE_COLUMNS =
    'id, username, full_name, avatar_url, role, city, club, elo, level, age_category, gender, wins, losses, play_style, bio, is_online, last_seen, privacy_consented_at, privacy_policy_version, created_at';

export type UserRole = 'athlete' | 'organizer' | 'admin';

export interface Profile {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string | null;
    role: UserRole;
    city: string | null;
    club: string | null;
    elo: number;
    globalRank: number;
    level: Level;
    age_category: AgeCategory;
    gender: 'femenino' | 'masculino' | 'otro' | null;
    wins: number;
    losses: number;
    play_style: string[] | null;
    bio: string | null;
    is_online: boolean;
    last_seen: string;
    privacy_consented_at: string | null;
    privacy_policy_version: string | null;
    created_at: string;
}

interface AuthState {
    session: Session | null;
    profile: Profile | null;
    authError: string | null;
    initialized: boolean;
    initialize: () => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (
        email: string,
        password: string,
        username: string,
        fullName: string,
        level?: Level,
        ageCategory?: AgeCategory,
        role?: 'athlete' | 'organizer'
    ) => Promise<void>;
    signOut: () => Promise<void>;
    fetchProfile: () => Promise<void>;
    /** Aplica un parche parcial al perfil en memoria (sin ir a la BD). */
    patchProfile: (updates: Partial<Profile>) => void;
    updateProfile: (updates: Partial<Profile>) => Promise<void>;
    recordPrivacyConsent: () => Promise<void>;
    deleteAccount: () => Promise<void>;
}

let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
    session: null,
    profile: null,
    authError: null,
    initialized: false,

    initialize: async () => {
        if (get().initialized) return;

        try {
            const { data } = await supabase.auth.getSession();
            set({ session: data.session });

            if (data.session) {
                await get().fetchProfile();
            } else {
                set({ profile: null });
            }
        } catch (e) {
            console.warn('[authStore] initialize error:', e);
        } finally {
            if (authSubscription) {
                authSubscription.unsubscribe();
                authSubscription = null;
            }

            const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
                set({ session });

                if (session) {
                    try {
                        await get().fetchProfile();
                    } catch (e) {
                        console.warn('[authStore] onAuthStateChange fetchProfile error:', e);
                    }
                } else {
                    set({ profile: null });
                }
            });

            authSubscription = listener.subscription;
            set({ initialized: true });
        }
    },

    signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    },

    signUp: async (email, password, username, fullName, level, ageCategory = 'libre', role = 'athlete') => {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username, full_name: fullName, role, level, age_category: ageCategory },
            },
        });
        if (error) throw error;
    },

    signOut: async () => {
        const { profile } = get();
        if (profile?.id) {
            presenceService.markOffline(profile.id).catch(() => {});
            // El token de push es por dispositivo: si este usuario cierra sesión
            // en este teléfono, hay que sacarlo para que no le lleguen avisos
            // a un dispositivo que ya no usa.
            clearPushToken(profile.id).catch(() => {});
        }
        markExplicitSignOut();
        await supabase.auth.signOut();
        set({ session: null, profile: null, authError: null });
    },

    fetchProfile: async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;
        if (!user) return;

        const { data, error } = await supabase
            .from('profiles')
            .select(PROFILE_COLUMNS)
            .eq('id', user.id)
            .single();

        if (error) {
            console.warn('[authStore] fetchProfile error:', error.message);
            set({ authError: error.message });
            return;
        }

        set({ profile: data as unknown as Profile, authError: null });
    },

    patchProfile: (updates) => {
        set((state) => {
            if (!state.profile) return state;
            return { profile: { ...state.profile, ...updates } };
        });
    },

    updateProfile: async (updates) => {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;
        if (!user) return;

        const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', user.id)
            .select(PROFILE_COLUMNS)
            .single();

        if (error) throw error;
        set({ profile: data as unknown as Profile });
    },

    recordPrivacyConsent: async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;
        if (!user) return;

        const { data, error } = await supabase
            .from('profiles')
            .update({
                privacy_consented_at: new Date().toISOString(),
                privacy_policy_version: '1.0',
            })
            .eq('id', user.id)
            .select(PROFILE_COLUMNS)
            .single();

        if (error) {
            console.warn('[authStore] recordPrivacyConsent error:', error.message);
            return;
        }
        set({ profile: data as unknown as Profile });
    },

    deleteAccount: async () => {
        const { error } = await supabase.rpc('delete_account');
        if (error) throw error;
        const { profile } = get();
        if (profile?.id) {
            presenceService.markOffline(profile.id).catch(() => {});
        }
        markExplicitSignOut();
        await supabase.auth.signOut();
        set({ session: null, profile: null, authError: null });
    },
}));