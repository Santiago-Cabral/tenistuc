import { supabase } from '../lib/supabase';

export type OAuthProvider = 'google' | 'apple';

export function isGoogleSignInAvailable(): boolean {
    return true;
}

async function signInWithProvider(provider: OAuthProvider): Promise<boolean> {
    const redirectTo = typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback`
        : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
    });

    if (error) throw error;
    return true;
}

export async function signInWithGoogle(): Promise<boolean> {
    return signInWithProvider('google');
}

export const signInWithApple = () => signInWithProvider('apple');
