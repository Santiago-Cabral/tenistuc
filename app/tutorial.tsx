import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    NativeScrollEvent,
    NativeSyntheticEvent,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { Colors, Radius, Spacing } from '../src/theme';
import { useAuthStore } from '../src/stores/authStore';
import { showAlert } from '../src/services/appAlert';

interface Slide {
    id: string;
    eyebrow: string;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    description: string;
}

const ATHLETE_SLIDES: Slide[] = [
    {
        id: 'ranking',
        eyebrow: 'EN TU RANKING',
        icon: 'trophy-outline',
        title: 'Tu ranking',
        description: 'Acá ves tu ELO, tu nivel y tu efectividad. El ranking se mueve cuando se confirman los resultados por puntos.',
    },
    {
        id: 'desafios',
        eyebrow: 'EN RIVALES',
        icon: 'flash-outline',
        title: 'Desafiá a otro jugador',
        description: 'Buscá rivales por nivel, ciudad o si están en línea y mandá un desafío con fecha y sede. Ellos pueden aceptarlo, rechazarlo o proponer otra fecha.',
    },
    {
        id: 'resultados',
        eyebrow: 'EN RESULTADOS',
        icon: 'tennisball-outline',
        title: 'Cargá y confirmá resultados',
        description: 'Cargá el resultado por sets y esperá a que tu rival lo confirme. Si no coincide, podés disputarlo con un motivo.',
    },
    {
        id: 'torneos',
        eyebrow: 'EN TORNEOS',
        icon: 'calendar-outline',
        title: 'Tus torneos',
        description: 'Inscribite cuando la lista esté abierta y seguí el fixture desde el detalle. El organizador habilita tu lugar y el campeón suma los puntos.',
    },
    {
        id: 'mensajes',
        eyebrow: 'EN MENSAJES',
        icon: 'chatbubble-outline',
        title: 'Mensajes y notificaciones',
        description: 'En Mensajes charlás con tus rivales y duplas. Las notificaciones te avisan de desafíos, resultados y novedades de torneos.',
    },
    {
        id: 'perfil',
        eyebrow: 'EN TU PERFIL',
        icon: 'person-outline',
        title: 'Completá tu perfil',
        description: 'Tocá Editar para ver tu información y agregar tu género (Mujer, Hombre u Otro) y tu categoría de edad (Libre, +30, +40, +50, +60, +70 u +80). Así es más fácil encontrar tu rival ideal.',
    },
];

export default function TutorialScreen() {
    const router = useRouter();
    const { profile, updateProfile } = useAuthStore();
    const listRef = useRef<FlatList<Slide>>(null);
    const [slideWidth, setSlideWidth] = useState(0);
    const [index, setIndex] = useState(0);
    const [finishing, setFinishing] = useState(false);

    const slides = ATHLETE_SLIDES;
    const safeIndex = Math.min(index, slides.length - 1);
    const isLast = safeIndex === slides.length - 1;

    const goTo = (next: number) => {
        if (next < 0 || next >= slides.length) return;
        setIndex(next);
        listRef.current?.scrollToIndex({ index: next, animated: true });
    };

    const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset } = event.nativeEvent;
        if (!slideWidth) return;
        const next = Math.round(contentOffset.x / slideWidth);
        setIndex(current => (current === next ? current : Math.min(Math.max(next, 0), slides.length - 1)));
    };

    const finish = async () => {
        if (finishing) return;
        setFinishing(true);

        if (profile && !profile.has_seen_tutorial) {
            try {
                await updateProfile({ has_seen_tutorial: true });
            } catch {
                setFinishing(false);
                showAlert('No se pudo guardar', 'No pudimos marcar el tutorial como visto. Intentá de nuevo.');
                return;
            }
        }

        router.replace('/');
    };

    if (!profile || profile.role !== 'athlete') {
        return <Redirect href="/" />;
    }

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.topRow}>
                <Text style={styles.counter}>{safeIndex + 1} de {slides.length}</Text>
                {!isLast && (
                    <TouchableOpacity onPress={finish} disabled={finishing} hitSlop={8}>
                        <Text style={styles.skipText}>Saltar</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View
                style={styles.listWrap}
                onLayout={event => setSlideWidth(event.nativeEvent.layout.width)}
            >
                {slideWidth > 0 && (
                    <FlatList
                        ref={listRef}
                        data={slides}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        onScroll={handleScroll}
                        scrollEventThrottle={16}
                        keyExtractor={item => item.id}
                        getItemLayout={(_, i) => ({ length: slideWidth, offset: slideWidth * i, index: i })}
                        renderItem={({ item }) => (
                            <View style={[styles.slide, { width: slideWidth }]}>
                                <View style={styles.iconBlock}>
                                    <Text style={styles.eyebrow}>{item.eyebrow}</Text>
                                    <View style={styles.iconWrap}>
                                        <Ionicons name={item.icon} size={44} color={Colors.primary} />
                                    </View>
                                </View>
                                <Text style={styles.title}>{item.title}</Text>
                                <Text style={styles.description}>{item.description}</Text>
                            </View>
                        )}
                    />
                )}
            </View>

            <View style={styles.bottom}>
                <View style={styles.dots}>
                    {slides.map((slide, dotIndex) => (
                        <TouchableOpacity
                            key={slide.id}
                            onPress={() => goTo(dotIndex)}
                            activeOpacity={0.7}
                            hitSlop={8}
                            style={[styles.dot, dotIndex === safeIndex && styles.dotActive]}
                        />
                    ))}
                </View>

                <TouchableOpacity style={styles.cta} onPress={() => (isLast ? void finish() : goTo(safeIndex + 1))} disabled={finishing}>
                    {finishing
                        ? <ActivityIndicator color={Colors.onPrimary} size="small" />
                        : <Text style={styles.ctaText}>{isLast ? 'Empezar' : 'Siguiente'}</Text>}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.base,
    },
    counter: {
        fontFamily: 'PlusJakartaSans_600SemiBold',
        fontSize: 13,
        color: Colors.onSurfaceVariant,
    },
    skipText: {
        fontFamily: 'PlusJakartaSans_600SemiBold',
        fontSize: 14,
        color: Colors.primary,
    },
    listWrap: { flex: 1, minHeight: 0 },
    slide: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.xxxl,
        gap: Spacing.lg,
    },
    iconBlock: { alignItems: 'center', gap: Spacing.md },
    eyebrow: {
        fontFamily: 'PlusJakartaSans_600SemiBold',
        fontSize: 12,
        letterSpacing: 1.2,
        color: Colors.primary,
        textAlign: 'center',
        textTransform: 'uppercase',
    },
    iconWrap: {
        width: 104,
        height: 104,
        borderRadius: Radius.full,
        backgroundColor: Colors.primaryContainer,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontFamily: 'Lexend_700Bold',
        fontSize: 26,
        lineHeight: 32,
        color: Colors.onSurface,
        textAlign: 'center',
    },
    description: {
        fontFamily: 'PlusJakartaSans_400Regular',
        fontSize: 15,
        lineHeight: 23,
        color: Colors.onSurfaceVariant,
        textAlign: 'center',
    },
    bottom: {
        paddingHorizontal: Spacing.xl,
        paddingBottom: Spacing.xl,
        gap: Spacing.lg,
    },
    dots: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: Radius.full,
        backgroundColor: Colors.surfaceContainerHighest,
    },
    dotActive: {
        width: 24,
        backgroundColor: Colors.primary,
    },
    cta: {
        minHeight: 52,
        borderRadius: Radius.full,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.xl,
    },
    ctaText: {
        fontFamily: 'PlusJakartaSans_600SemiBold',
        fontSize: 15,
        color: Colors.onPrimary,
    },
});
