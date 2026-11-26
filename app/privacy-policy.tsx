import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../src/theme/index';

const SECTIONS: { title: string; body: string[] }[] = [
    {
        title: '1. Responsable',
        body: [
            'TucuPlay es una plataforma para la comunidad de tenis de Tucumán (Argentina). Al usar la aplicación gestionás y participás en torneos, organizás partidos entre jugadores y accedés a rankings.',
        ],
    },
    {
        title: '2. Datos que recopilamos',
        body: [
            '• Datos de cuenta: nombre, nombre de usuario, email, nivel de juego, ciudad, club y foto de perfil.',
            '• Datos de uso: partidos jugados, resultados, desafíos, mensajes en el chat y puntos de ranking (ELO).',
            '• Datos técnicos: token de notificaciones push y, si iniciás sesión con Google o Apple, la información básica que ese proveedor comparte.',
        ],
    },
    {
        title: '3. Para qué usamos tus datos',
        body: [
            '• Crear y mantener tu cuenta y tu perfil público dentro de la app.',
            '• Calcular el ranking, registrar resultados y mantener la clasificación de torneos.',
            '• Enviarte notificaciones push sobre desafíos, torneos, mensajes y resultados.',
            '• Permitirte inscribirte en torneos y que el organizador habilite tu lugar.',
            '• Mejorar la aplicación, detectar errores y dar soporte.',
        ],
    },
    {
        title: '4. Inscripciones a torneos',
        body: [
            'La app no procesa pagos ni almacena datos de tarjetas. Cuando te inscribís a un torneo, el organizador habilita tu lugar manualmente y coordina con vos el pago de la inscripción por fuera de la aplicación (efectivo, transferencia u otro medio). TucuPlay sólo registra el estado de tu inscripción (pendiente o habilitada).',
        ],
    },
    {
        title: '5. Almacenamiento y seguridad',
        body: [
            'Tus datos se almacenan de forma segura en servicios en la nube (Supabase). Aplicamos medidas razonables para proteger tu información: autenticación, control de acceso por rol y cifrado en tránsito.',
        ],
    },
    {
        title: '6. Compartir con terceros',
        body: [
            'No vendemos ni alquilamos tus datos. Sólo los compartimos con:',
            '• Otros usuarios de TucuPlay (perfil, resultados, ranking y mensajes).',
            '• Proveedores de servicio necesarios para el funcionamiento (Supabase, Expo/notificaciones push, Google y Apple si usás esa vía de ingreso).',
        ],
    },
    {
        title: '7. Tus derechos',
        body: [
            'De acuerdo con la Ley Nacional 25.326 de Protección de Datos Personales (Argentina), podés solicitar el acceso, la rectificación o la supresión de tus datos personales, así como revocar el consentimiento otorgado, escribiéndonos al contacto indicado abajo. También podés eliminar tu cuenta en cualquier momento.',
        ],
    },
    {
        title: '8. Menores de edad',
        body: [
            'La aplicación está destinada a mayores de 13 años. Si sos menor, deberás tener autorización de un adulto responsable para registrarte.',
        ],
    },
    {
        title: '9. Cambios en esta política',
        body: [
            'Podremos actualizar esta política de privacidad para reflejar cambios en el servicio o en la normativa. Cuando haya cambios relevantes, te lo haremos saber dentro de la aplicación. El uso continuado de TucuPlay luego de una actualización implica la aceptación de la nueva versión.',
        ],
    },
    {
        title: '10. Contacto',
        body: [
            'Ante dudas sobre esta política o el tratamiento de tus datos personales, escribinos a soporte@tucuplay.com indicando tu nombre de usuario y el motivo de tu consulta.',
        ],
    },
];

export default function PrivacyPolicyScreen() {
    const router = useRouter();

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={styles.back}>← Volver</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Privacidad</Text>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.title}>Política de Privacidad</Text>
                <Text style={styles.updated}>Última actualización: 26 de noviembre de 2026</Text>

                <View style={styles.introCard}>
                    <Text style={styles.introText}>
                        En TucuPlay respetamos tu privacidad. Esta política explica qué datos recopilamos,
                        cómo los usamos y los derechos que tenés sobre ellos. Al registrarte y usar la
                        aplicación aceptás los términos descriptos a continuación.
                    </Text>
                </View>

                {SECTIONS.map((section) => (
                    <View key={section.title} style={styles.section}>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        {section.body.map((line, i) => (
                            <Text key={i} style={styles.sectionBody}>
                                {line}
                            </Text>
                        ))}
                    </View>
                ))}

                <TouchableOpacity onPress={() => router.push('/terms')}>
                    <Text style={styles.footerLink}>Ver los Términos y Condiciones</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.base,
        borderBottomWidth: 1,
        borderBottomColor: Colors.outlineVariant,
    },
    back: {
        ...Typography.bodyMd,
        color: Colors.primary,
        fontFamily: 'PlusJakartaSans_600SemiBold',
    },
    headerTitle: {
        ...Typography.labelLg,
        color: Colors.onSurfaceVariant,
    },
    content: {
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.xl,
        paddingBottom: Spacing.xxxl,
    },
    title: {
        fontFamily: 'Lexend_800ExtraBold',
        fontSize: 26,
        lineHeight: 32,
        color: Colors.primary,
        letterSpacing: -0.5,
    },
    updated: {
        ...Typography.bodySm,
        color: Colors.onSurfaceVariant,
        marginTop: 4,
        marginBottom: Spacing.lg,
    },
    introCard: {
        backgroundColor: Colors.surfaceContainerLowest,
        borderRadius: Radius.xl,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
        padding: Spacing.lg,
        marginBottom: Spacing.xl,
    },
    introText: {
        ...Typography.bodyMd,
        color: Colors.onSurfaceVariant,
        lineHeight: 22,
    },
    section: { marginBottom: Spacing.xl, gap: Spacing.sm },
    sectionTitle: {
        ...Typography.labelLg,
        color: Colors.onSurface,
        fontFamily: 'PlusJakartaSans_700Bold',
    },
    sectionBody: {
        ...Typography.bodyMd,
        color: Colors.onSurfaceVariant,
        lineHeight: 22,
    },
    footerLink: {
        ...Typography.bodyMd,
        color: Colors.primary,
        fontFamily: 'PlusJakartaSans_700Bold',
        marginTop: Spacing.sm,
    },
});