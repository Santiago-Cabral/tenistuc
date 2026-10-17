// src/screens/shared/ChatScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../theme';
import { Avatar } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { isActuallyOnline } from '../../services/presenceService';
import { markMessageNotificationsRead } from '../../services/notificationService';

interface Message {
    id: string;
    sender_id: string;
    content: string;
    created_at: string;
}

interface OtherUser {
    id: string;
    full_name: string;
    avatar_url: string | null;
    is_online?: boolean;
    last_seen?: string;
}

export default function ChatScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { profile } = useAuthStore();
    const [messages, setMessages] = useState<Message[]>([]);
    const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        if (!id || !profile) return;
        loadConversation();
        loadMessages();

        const channel = supabase
            .channel(`chat:${id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
                (payload) => {
                    setMessages((prev) => [...prev, payload.new as Message]);
                    markMessageNotificationsRead(id);
                    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
                },
            )
            .subscribe();

        const presenceChannel = supabase
            .channel(`chat:${id}:presence`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
                const upd = payload.new as { id?: string; is_online?: boolean; last_seen?: string } | null;
                if (!upd?.id) return;
                setOtherUser((prev) =>
                    prev && prev.id === upd.id
                        ? {
                            ...prev,
                            is_online: upd.is_online ?? prev.is_online,
                            last_seen: upd.last_seen ?? prev.last_seen,
                        }
                        : prev
                );
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(presenceChannel);
        };
    }, [id, profile]);

    const loadConversation = async () => {
        const { data } = await supabase
            .from('conversations')
            .select(`
                id,
                p1:profiles!conversations_participant1_id_fkey(id, full_name, avatar_url, is_online, last_seen),
                p2:profiles!conversations_participant2_id_fkey(id, full_name, avatar_url, is_online, last_seen)
            `)
            .eq('id', id)
            .single();

        if (data) {
            const p1 = Array.isArray(data.p1) ? data.p1[0] : data.p1;
            const p2 = Array.isArray(data.p2) ? data.p2[0] : data.p2;
            setOtherUser(p1?.id === profile?.id ? p2 : p1);
        }
    };

    const loadMessages = async () => {
        const { data } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', id)
            .order('created_at', { ascending: true });

        if (data) setMessages(data);
        markMessageNotificationsRead(id);
        setLoading(false);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    };

    const sendMessage = async () => {
        if (!text.trim() || !profile || sending) return;
        const content = text.trim();
        setText('');
        setSending(true);

        await supabase.from('messages').insert({
            conversation_id: id,
            sender_id: profile.id,
            content,
        });

        await supabase
            .from('conversations')
            .update({ last_message: content, last_message_at: new Date().toISOString() })
            .eq('id', id);

        setSending(false);
    };

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    };

    const lastSeenLabel = (iso?: string) => {
        if (!iso) return '';
        const diffMs = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'última vez ahora';
        if (mins < 60) return `última vez hace ${mins}min`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `última vez hace ${hours}h`;
        return `última vez ${new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })}`;
    };

    const otherOnline = isActuallyOnline(otherUser);

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={24} color={Colors.primary} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.headerProfile}
                    onPress={() => otherUser && router.push(`/profile/${otherUser.id}` as any)}
                    activeOpacity={0.7}
                >
                    <Avatar uri={otherUser?.avatar_url} size={38} online={otherOnline} />
                    <View style={styles.headerInfo}>
                        <Text style={styles.headerName} numberOfLines={1}>
                            {otherUser?.full_name ?? 'Chat'}
                        </Text>
                        <Text style={[styles.headerStatus, !otherOnline && styles.headerStatusOffline]}>
                            {otherOnline
                                ? 'En línea'
                                : (lastSeenLabel(otherUser?.last_seen) || 'Fuera de línea')}
                        </Text>
                    </View>
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                {loading ? (
                    <View style={styles.loader}>
                        <ActivityIndicator color={Colors.primary} size="large" />
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={(m) => m.id}
                        contentContainerStyle={styles.messagesList}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item: msg }) => {
                            const isMe = msg.sender_id === profile?.id;
                            return (
                                <View style={[styles.bubbleWrap, isMe && styles.bubbleWrapMe]}>
                                    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                                        <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
                                            {msg.content}
                                        </Text>
                                    </View>
                                    <Text style={[styles.timeText, isMe && styles.timeTextMe]}>
                                        {formatTime(msg.created_at)}
                                    </Text>
                                </View>
                            );
                        }}
                        ListEmptyComponent={
                            <View style={styles.empty}>
                                <Ionicons name="chatbubbles-outline" size={44} color={Colors.onSurfaceVariant} />
                                <Text style={styles.emptyText}>¡Empezá la conversación!</Text>
                            </View>
                        }
                    />
                )}

                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.input}
                        value={text}
                        onChangeText={setText}
                        placeholder="Escribí un mensaje..."
                        placeholderTextColor={Colors.onSurfaceVariant}
                        multiline
                        maxLength={500}
                        returnKeyType="send"
                        onSubmitEditing={sendMessage}
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
                        onPress={sendMessage}
                        disabled={!text.trim() || sending}
                        activeOpacity={0.8}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color={Colors.onPrimary} />
                        ) : (
                            <Ionicons name="arrow-up" size={20} color={Colors.onPrimary} />
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.surface },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        gap: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.surfaceContainerHighest,
        backgroundColor: Colors.surfaceContainerLowest,
    },
    backBtn: { padding: 4 },
    headerProfile: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
    headerInfo: { flex: 1 },
    headerName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 16, color: Colors.onSurface },
    headerStatus: { ...Typography.bodySm, color: Colors.primary, fontSize: 12 },
    headerStatusOffline: { color: Colors.onSurfaceVariant },
    loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    messagesList: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg, gap: Spacing.md },
    bubbleWrap: { alignItems: 'flex-start', gap: 3 },
    bubbleWrapMe: { alignItems: 'flex-end' },
    bubble: {
        maxWidth: '78%',
        paddingHorizontal: Spacing.base,
        paddingVertical: Spacing.md,
        borderRadius: Radius.xl,
    },
    bubbleOther: {
        backgroundColor: Colors.surfaceContainerLowest,
        borderBottomLeftRadius: Radius.sm,
        borderWidth: 1,
        borderColor: Colors.surfaceContainerHighest,
    },
    bubbleMe: {
        backgroundColor: Colors.primary,
        borderBottomRightRadius: Radius.sm,
    },
    bubbleText: { ...Typography.bodyMd, color: Colors.onSurface, lineHeight: 20 },
    bubbleTextMe: { color: Colors.onPrimary },
    timeText: { ...Typography.bodySm, color: Colors.onSurfaceVariant, fontSize: 10 },
    timeTextMe: { textAlign: 'right' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: Spacing.md },
    emptyText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        gap: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: Colors.surfaceContainerHighest,
        backgroundColor: Colors.surfaceContainerLowest,
    },
    input: {
        flex: 1,
        minHeight: 44,
        maxHeight: 120,
        backgroundColor: Colors.surfaceContainer,
        borderRadius: Radius.xl,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        ...Typography.bodyMd,
        color: Colors.onSurface,
        borderWidth: 1,
        borderColor: Colors.outlineVariant,
    },
    sendBtn: {
        width: 44, height: 44,
        borderRadius: 22,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: Colors.surfaceContainerHigh },
});