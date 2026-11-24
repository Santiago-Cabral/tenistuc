import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Shadow, Typography } from '../../theme';

const DISMISS_KEY = 'tenistuc:install-dismissed';

export default function InstallPrompt() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const nav = navigator as Navigator & { standalone?: boolean };
        const isIOS = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
        const isStandalone = nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
        const dismissed = window.localStorage.getItem(DISMISS_KEY) === '1';
        setVisible(isIOS && !isStandalone && !dismissed);
    }, []);

    if (!visible) return null;

    const dismiss = () => {
        window.localStorage.setItem(DISMISS_KEY, '1');
        setVisible(false);
    };

    return (
        <View style={styles.banner}>
            <View style={{ flex: 1 }}>
                <Text style={styles.title}>Instalar TenisTuc</Text>
                <Text style={styles.body}>En Safari, tocá Compartir y después Agregar a pantalla de inicio.</Text>
            </View>
            <TouchableOpacity onPress={dismiss} style={styles.button} hitSlop={8}>
                <Text style={styles.buttonText}>Entendido</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: Radius.lg,
        backgroundColor: Colors.surfaceContainerLowest,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
        ...Shadow.float,
    },
    title: { ...Typography.titleMd, color: Colors.onSurface },
    body: { ...Typography.bodySm, color: Colors.onSurfaceVariant, marginTop: 2 },
    button: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md, backgroundColor: Colors.primary },
    buttonText: { ...Typography.labelMd, color: Colors.onPrimary },
});
