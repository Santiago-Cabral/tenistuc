// src/services/authService.ts
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import {
    GoogleSignin,
    isErrorWithCode,
    isSuccessResponse,
    statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from '../lib/supabase';

// Cierra la sesión de navegador que quedó abierta (evita warnings en web/iOS).
WebBrowser.maybeCompleteAuthSession();

const SCHEME = 'tenistuc';
const CALLBACK_PATH = 'auth/callback';

export type OAuthProvider = 'google' | 'apple';

// ─── Google nativo ────────────────────────────────────────────────────────────
// Usa el selector de cuentas del sistema (no abre navegador), así que Google
// no muestra el dominio de Supabase. Requiere un build de EAS (no Expo Go).

GoogleSignin.configure({
    // Client ID de tipo "Web application" de Google Cloud (el mismo que está
    // cargado en Supabase → Authentication → Providers → Google).
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

/**
 * Devuelve `true` si se inició sesión, `false` si el usuario canceló.
 * Cualquier otro error se lanza para que la pantalla lo muestre.
 */
export async function signInWithGoogle(): Promise<boolean> {
    try {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const response = await GoogleSignin.signIn();

        if (!isSuccessResponse(response)) return false; // canceló

        const idToken = response.data.idToken;
        if (!idToken) throw new Error('Google no devolvió el token de identidad');

        const { error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: idToken,
        });
        if (error) throw error;

        return true;
    } catch (e: any) {
        if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return false;
        throw e;
    }
}

// ─── Apple (flujo web, sin cambios) ───────────────────────────────────────────
/**
 * Flujo OAuth para apps móviles con Supabase (PKCE):
 *   1. pedimos la URL de autorización del proveedor (sin abrir el navegador)
 *   2. la abrimos en una sesión de navegador segura
 *   3. el proveedor vuelve a `tenistuc://auth/callback?code=...`
 *   4. canjeamos el `code` por una sesión
 *
 * Requiere `flowType: 'pkce'` en el cliente de Supabase (ver src/lib/supabase.ts).
 */
async function signInWithProvider(provider: OAuthProvider): Promise<boolean> {
    const redirectTo = Linking.createURL(CALLBACK_PATH, { scheme: SCHEME });

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo,
            skipBrowserRedirect: true,
        },
    });

    if (error) throw error;
    if (!data?.url) throw new Error('No se recibió la URL de autenticación');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    // El usuario cerró el navegador o canceló el flujo.
    if (result.type !== 'success') return false;

    const { queryParams } = Linking.parse(result.url);

    const pick = (key: string): string | undefined => {
        const value = queryParams?.[key];
        return Array.isArray(value) ? value[0] : value;
    };

    const providerError = pick('error_description') ?? pick('error');
    if (providerError) throw new Error(providerError);

    const code = pick('code');
    if (!code) throw new Error('No se recibió el código de autenticación');

    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
    if (sessionError) {
        // Puede que la pantalla /auth/callback ya haya canjeado el mismo code.
        const { data: { session } } = await supabase.auth.getSession();
        if (session) return true;
        throw sessionError;
    }

    return true;
}

export const signInWithApple = () => signInWithProvider('apple');