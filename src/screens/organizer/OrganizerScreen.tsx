import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Colors } from "../../theme";

export default function OrganizerScreen() {
    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Panel de Organizador</Text>

            <TouchableOpacity style={styles.card}>
                <Text style={styles.cardTitle}>Crear torneo</Text>
                <Text style={styles.cardText}>
                    Publica un nuevo torneo y comienza a recibir inscripciones.
                </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.card}>
                <Text style={styles.cardTitle}>Mis torneos</Text>
                <Text style={styles.cardText}>
                    Administra torneos creados, partidos y jugadores.
                </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.card}>
                <Text style={styles.cardTitle}>Inscripciones</Text>
                <Text style={styles.cardText}>
                    Revisa quién se anotó y arma los cuadros.
                </Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 20,
        backgroundColor: Colors.surface,
        flexGrow: 1,
    },
    title: {
        fontSize: 28,
        fontWeight: "bold",
        marginBottom: 25,
        color: Colors.primary,
    },
    card: {
        backgroundColor: "#fff",
        padding: 18,
        borderRadius: 14,
        marginBottom: 16,
        elevation: 3,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: "bold",
        marginBottom: 6,
    },
    cardText: {
        color: "#666",
    },
});