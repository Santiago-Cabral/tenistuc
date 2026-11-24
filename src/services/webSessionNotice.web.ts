import { showAlert } from './appAlert';
import { supabase } from '../lib/supabase';

let explicitSignOut = false;

export function markExplicitSignOut(): void {
    explicitSignOut = true;
}

export function watchWebSessionLoss(): () => void {
    let hadSession = false;

    supabase.auth.getSession()
        .then(({ data }) => { hadSession = !!data.session; })
        .catch(() => { });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            hadSession = true;
            return;
        }

        if (event === 'SIGNED_OUT' && hadSession && !explicitSignOut) {
            showAlert(
                'Sesión finalizada',
                'Safari borró los datos de la PWA o el token venció. Ingresá de nuevo para continuar.'
            );
        }

        explicitSignOut = false;
        hadSession = false;
    });

    return () => subscription.unsubscribe();
}
