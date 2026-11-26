import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radius } from '../src/theme/index';

const SECTIONS: { title: string; body: string[] }[] = [
    {
        title: '1. Aceptación de los términos',
        body: [
            'Estos términos regulan el uso de TucuPlay, una plataforma para la comunidad de tenis de Tucumán (Argentina). Al crear una cuenta o utilizar la aplicación aceptás las condiciones que se detallan a continuación.',
            'Al registrarte confirmás que leíste y aceptás estos términos junto con la Política de Privacidad.',
        ],
    },
    {
        title: '2. Elegibilidad',
        body: [
            'TucuPlay está destinada a personas mayores de 13 años. Si sos menor, necesitás autorización de un adulto responsable. Al registrarte confirmás que cumplís con este requisito y que la información que proporcionás es verdadera.',
        ],
    },
    {
        title: '3. Tu cuenta y tu perfil',
        body: [
            '• Podés registrarte con tu correo electrónico y contraseña o mediante Google o Apple, según las opciones disponibles.',
            '• Sos responsable de mantener la confidencialidad de tus credenciales y de toda la actividad realizada desde tu cuenta.',
            '• Debés cargar datos veraces en tu perfil y actualizarlos cuando cambien. No está permitido suplantar a otro jugador ni crear cuentas falsas.',
            '• Tu perfil, resultados y ranking pueden ser visibles para otros usuarios de la plataforma.',
        ],
    },
    {
        title: '4. Uso permitido y conducta',
        body: [
            'Comprometés a usar TucuPlay de forma respetuosa y conforme a la ley. No está permitido:',
            '• Acosar, insultar, discriminar o amenazar a otros jugadores.',
            '• Publicar datos falsos, manipular resultados o rankings, o abusar del sistema de desafíos.',
            '• Difundir contenido ilegal, violento, pornográfico o que infrinja derechos de terceros.',
            '• Enviar spam, publicidad no solicitada o enlaces maliciosos.',
            '• Intentar acceder sin autorización a cuentas, sistemas o datos de otros usuarios.',
            '• Utilizar robots o scripts para extraer información o alterar el funcionamiento de la app.',
        ],
    },
    {
        title: '5. Partidos, torneos y rankings',
        body: [
            'TucuPlay facilita la organización de partidos y torneos, pero no interviene en los acuerdos entre jugadores. Los participantes son responsables de acordar fecha, lugar, condiciones de juego y de registrar resultados veraces.',
            'El ranking y los puntajes (ELO) son una referencia orientativa calculada a partir de la información cargada en la plataforma. TucuPlay no garantiza la exactitud de los datos que cargan los usuarios ni resuelve disputas entre jugadores.',
        ],
    },
    {
        title: '6. Inscripciones y pagos',
        body: [
            'La aplicación no procesa pagos ni guarda datos de tarjetas. Los pagos de inscripción a torneos se coordinan y realizan fuera de TucuPlay, directamente entre el jugador y el organizador. TucuPlay solo registra el estado de la inscripción y no responde por esas transacciones.',
        ],
    },
    {
        title: '7. Contenido que publicás',
        body: [
            'Conservás la titularidad del contenido que subís o enviás, como tu foto de perfil, biografía, mensajes y comentarios. Al publicarlo otorgás a TucuPlay una licencia no exclusiva y gratuita para alojarlo, mostrarlo y utilizarlo dentro de la plataforma, mientras tu cuenta esté activa.',
            'No debés publicar contenido que no tengas derecho a compartir ni material que vulnere la ley o los derechos de terceros. Podemos retirar contenido que infrinja estas condiciones.',
        ],
    },
    {
        title: '8. Propiedad intelectual',
        body: [
            'La aplicación, el diseño, los logos, los textos y demás elementos de TucuPlay son propiedad del equipo de TucuPlay o de sus licenciantes y están protegidos por la normativa vigente. No está permitido copiarlos, modificarlos, distribuirlos ni usarlos para fines comerciales sin autorización.',
        ],
    },
    {
        title: '9. Disponibilidad y cambios del servicio',
        body: [
            'Podemos agregar, modificar o eliminar funcionalidades para mejorar el servicio o por razones técnicas, legales o de seguridad. También podemos interrumpir el acceso temporalmente por mantenimiento o causas ajenas a nuestro control.',
        ],
    },
    {
        title: '10. Responsabilidad',
        body: [
            'TucuPlay se ofrece «tal cual». No garantizamos un funcionamiento ininterrumpido ni que la plataforma se adapte a todas las necesidades. En la medida permitida por la ley, no respondemos por daños derivados del uso de la app, de las relaciones entre jugadores ni de los pagos coordinados fuera de la plataforma.',
            'Nada de lo establecido aquí limita los derechos que correspondan al consumidor bajo la legislación argentina.',
        ],
    },
    {
        title: '11. Baja de cuenta y suspensión',
        body: [
            'Podés eliminar tu cuenta en cualquier momento desde la sección de perfil de la aplicación. También podemos suspender o dar de baja cuentas que incumplan estos términos, que generen riesgos para otros usuarios o cuya permanencia sea requerida por una autoridad competente.',
        ],
    },
    {
        title: '12. Privacidad',
        body: [
            'El tratamiento de tus datos personales se rige por la Política de Privacidad, que forma parte de estos términos.',
        ],
    },
    {
        title: '13. Ley aplicable',
        body: [
            'Estos términos se interpretan conforme a la legislación de la República Argentina. Ante cualquier controversia, las partes se someten a los tribunales competentes de la Argentina.',
        ],
    },
    {
        title: '14. Contacto',
        body: [
            'Ante dudas sobre estos términos, escribinos a soporte@tucuplay.com indicando tu nombre de usuario y el motivo de tu consulta.',
        ],
    },
];

export default function TermsScreen() {
    const router = useRouter();

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={styles.back}>← Volver</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Términos</Text>
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.title}>Términos y Condiciones</Text>
                <Text style={styles.updated}>Última actualización: 26 de noviembre de 2026</Text>

                <View style={styles.introCard}>
                    <Text style={styles.introText}>
                        Estos términos regulan el uso de TucuPlay. Al crear una cuenta y usar la
                        aplicación aceptás las condiciones descriptas a continuación.
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

                <TouchableOpacity onPress={() => router.push('/privacy-policy')}>
                    <Text style={styles.footerLink}>Ver la Política de Privacidad</Text>
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
