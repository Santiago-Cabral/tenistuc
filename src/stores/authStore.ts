import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface Profile {
    id: string;
    username: string;
    full_name: string;
    avatar_url: string | null;
    role: 'athlete' | 'organizer';
    city: string | null;
    club: string | null;
    elo: number;
    globalRank: number;
    level:
    | 'Amateur I'
    | 'Amateur II'
    | 'Intermedio'
    | 'Avanzado'
    | 'Competitivo'
    | 'Semi-Pro I'
    | 'Semi-Pro II'
    | 'Pro I'
    | 'Pro II'
    | 'Elite'
    | 'Legendary';
    wins: number;
    losses: number;
    play_style: string[] | null;
    bio: string | null;
    is_online: boolean;
    last_seen: string;
    created_at: string;
}

interface AuthState {
    session: Session | null;
    profile: Profile | null;
    initialized: boolean;
    initialize: () => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (
        email: string,
        password: string,
        username: string,
        fullName: string,
        level?: string,
        role?: 'athlete' | 'organizer'
    ) => Promise<void>;
    signOut: () => Promise<void>;
    fetchProfile: () => Promise<void>;
    updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
    session: null,
    profile: null,
    initialized: false,

    initialize: async () => {
        if (get().initialized) return;

        const { data } = await supabase.auth.getSession();
        set({ session: data.session });

        if (data.session) {
            await get().fetchProfile();
        } else {
            set({ profile: null });
        }

        if (authSubscription) {
            authSubscription.unsubscribe();
            authSubscription = null;
        }

        const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
            set({ session });

            if (session) {
                await get().fetchProfile();
            } else {
                set({ profile: null });
            }
        });

        authSubscription = listener.subscription;
        set({ initialized: true });
    },

    signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    },

    signUp: async (email, password, username, fullName, level, role = 'athlete') => {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username, full_name: fullName, role, level },
            },
        });
        if (error) throw error;
    },

    signOut: async () => {
        await supabase.auth.signOut();
        set({ session: null, profile: null });
    },

    fetchProfile: async () => {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) return;

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) {
            console.warn('[authStore] fetchProfile error:', error.message);
            return;
        }

        set({ profile: data as Profile });
    },

    updateProfile: async (updates) => {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) return;

        const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', user.id)
            .select()
            .single();

        if (error) throw error;
        set({ profile: data as Profile });
    },
}));