import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Modal, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { showAlert } from '../src/services/appAlert';
import { getOrCreateDoublesChat, keepDoublesTeam } from '../src/services/doublesService';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../src/theme/index';
import { Avatar, Badge, Card, Button } from '../src/components/ui';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/stores/authStore';
import { useLiveRefresh } from '../src/hooks/useLiveRefresh';
import DateTimePicker, { DateTimePickerEvent } from '../src/components/ui/DateTimeField';
import { VenueChips } from '../src/components/ui/VenueChips';
import { CUSTOM_VENUE } from '../src/constants/venues';

interface SetScore { p1: number; p2: number; }
interface ResultModalState {
  visible: boolean; matchId: string; opponentId: string; opponentName: string;
  matchFormat?: 'singles' | 'doubles';
  myHeaderId?: string;
  side1HeaderId?: string;
  side2HeaderId?: string;
}
interface DisputeModalState {
  visible: boolean; matchId: string; score: any; submitterName: string;
  matchFormat?: 'singles' | 'doubles';
  myHeaderId?: string;
  side1HeaderId?: string;
  side2HeaderId?: string;
}
interface ScheduleModalState { visible: boolean; matchId: string; }

interface MatchSide {
  headerId: string | null;
  header: any;
  partnerId: string | null;
  partner: any;
  players: any[];
  teamId: string | null;
  label: 'Pareja A' | 'Pareja B';
  isMine: boolean;
}

const isMatchDay = (scheduledAt: string | null): boolean => {
  if (!scheduledAt) return false;
  const matchDate = new Date(scheduledAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  matchDate.setHours(0, 0, 0, 0);
  return matchDate <= today;
};

const getSides = (m: any, myId: string): { a: MatchSide; b: MatchSide; mine: MatchSide; rival: MatchSide } => {
  const inA = !!myId && !!m && [m.player1_id, m.partner1_id].includes(myId);
  const inB = !!myId && !!m && [m.player2_id, m.partner2_id].includes(myId);
  const a: MatchSide = {
    headerId: m?.player1_id ?? null,
    header: m?.player1 ?? null,
    partnerId: m?.partner1_id ?? null,
    partner: m?.partner1 ?? null,
    players: [m?.player1, m?.partner1].filter(Boolean),
    teamId: m?.team1_id ?? null,
    label: 'Pareja A',
    isMine: inA,
  };
  const b: MatchSide = {
    headerId: m?.player2_id ?? null,
    header: m?.player2 ?? null,
    partnerId: m?.partner2_id ?? null,
    partner: m?.partner2 ?? null,
    players: [m?.player2, m?.partner2].filter(Boolean),
    teamId: m?.team2_id ?? null,
    label: 'Pareja B',
    isMine: inB,
  };
  return { a, b, mine: inB ? b : a, rival: inB ? a : b };
};

async function getOrCreateConversation(myId: string, otherId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('conversations').select('id')
    .or(`and(participant1_id.eq.${myId},participant2_id.eq.${otherId}),and(participant1_id.eq.${otherId},participant2_id.eq.${myId})`)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data: created, error } = await supabase
    .from('conversations').insert({ participant1_id: myId, participant2_id: otherId })
    .select('id').single();
  if (error) return null;
  return created?.id ?? null;
}

// ─── Modal: Programar Partido ─────────────────────────────────────────────────

function ScheduleModal({ state, onClose, onSaved }: {
  state: ScheduleModalState; onClose: () => void; onSaved: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [customVenue, setCustomVenue] = useState('');
  const [saving, setSaving] = useState(false);

  const onDateChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      const combined = selectedDate ? new Date(selectedDate) : new Date();
      combined.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      setSelectedDate(combined);
      setTimeout(() => setShowTimePicker(true), 300);
    }
  };

  const onTimeChange = (_: DateTimePickerEvent, time?: Date) => {
    setShowTimePicker(false);
    if (time && selectedDate) {
      const combined = new Date(selectedDate);
      combined.setHours(time.getHours(), time.getMinutes());
      setSelectedDate(combined);
    }
  };

  const getFinalVenue = () => {
    if (selectedVenue === CUSTOM_VENUE) return customVenue.trim() || null;
    return selectedVenue;
  };

  const formatSelectedDate = () => {
    if (!selectedDate) return null;
    return selectedDate.toLocaleDateString('es', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('matches').update({
      scheduled_at: selectedDate?.toISOString() ?? null,
      location: getFinalVenue(),
    }).eq('id', state.matchId);
    setSaving(false);
    if (error) {
      showAlert('Error', 'No se pudo guardar la fecha.');
    } else {
      showAlert('Listo', 'Partido programado.', [{ text: 'OK', onPress: onSaved }]);
    }
  };

  return (
    <Modal visible={state.visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <Text style={modalStyles.title}>Programar Partido</Text>

          <Text style={schedStyles.sectionLabel}>Fecha y hora</Text>
          <TouchableOpacity style={schedStyles.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.8}>
            <Ionicons
              name={selectedDate ? 'calendar' : 'calendar-outline'} size={20}
              color={selectedDate ? Colors.primary : Colors.onSurfaceVariant}
            />
            <Text style={[schedStyles.dateBtnText, selectedDate && schedStyles.dateBtnTextActive]}>
              {selectedDate ? formatSelectedDate() : 'Elegir fecha y hora'}
            </Text>
            {selectedDate && (
              <TouchableOpacity onPress={() => setSelectedDate(null)}>
                <Ionicons name="close-circle" size={18} color={Colors.onSurfaceVariant} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={selectedDate ?? new Date()} mode="date" minimumDate={new Date()}
              onChange={onDateChange} display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            />
          )}
          {showTimePicker && (
            <DateTimePicker
              value={selectedDate ?? new Date()} mode="time"
              onChange={onTimeChange} display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            />
          )}

          <Text style={schedStyles.sectionLabel}>Club / Cancha</Text>
          <ScrollView style={schedStyles.venueScroll} showsVerticalScrollIndicator={false}>
            <VenueChips
              selected={selectedVenue}
              onSelect={v => setSelectedVenue(prev => prev === v ? null : v)}
            />
          </ScrollView>

          {selectedVenue === CUSTOM_VENUE && (
            <TextInput
              style={schedStyles.input} placeholder="Escribí el lugar..."
              placeholderTextColor={Colors.onSurfaceVariant}
              value={customVenue} onChangeText={setCustomVenue}
            />
          )}

          <View style={modalStyles.btnRow}>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
              <Text style={modalStyles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.submitBtn, saving && modalStyles.submitBtnDisabled]}
              onPress={handleSave} disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={modalStyles.submitBtnText}>Guardar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Modal: Cargar Resultado ──────────────────────────────────────────────────

function ResultModal({ state, myId, onClose, onSubmitted }: {
  state: ResultModalState; myId: string; onClose: () => void; onSubmitted: () => void;
}) {
  const [sets, setSets] = useState<SetScore[]>([{ p1: 0, p2: 0 }]);
  const [submitting, setSubmitting] = useState(false);

  const updateSet = (index: number, side: 'p1' | 'p2', value: string) => {
    const num = Math.max(0, parseInt(value) || 0);
    setSets(prev => prev.map((s, i) => i === index ? { ...s, [side]: num } : s));
  };

  const addSet = () => { if (sets.length < 5) setSets(prev => [...prev, { p1: 0, p2: 0 }]); };
  const removeSet = () => { if (sets.length > 1) setSets(prev => prev.slice(0, -1)); };

  const isDoubles = state.matchFormat === 'doubles';
  const myHeaderId = state.myHeaderId ?? myId;

  const getWinnerId = (): string | null => {
    let p1Wins = 0, p2Wins = 0;
    sets.forEach(s => { if (s.p1 > s.p2) p1Wins++; else if (s.p2 > s.p1) p2Wins++; });
    if (p1Wins > p2Wins) return state.side1HeaderId ?? myHeaderId;
    if (p2Wins > p1Wins) return state.side2HeaderId ?? state.opponentId;
    return null;
  };

  const winnerId = getWinnerId();
  const iWon = winnerId === myHeaderId;
  const winnerLabel = isDoubles
    ? winnerId === state.side1HeaderId ? 'Ganó Pareja A'
      : winnerId === state.side2HeaderId ? 'Ganó Pareja B'
        : null
    : winnerId === myId
      ? 'Vos ganaste'
      : winnerId === state.opponentId
        ? `Ganó ${state.opponentName.split(' ')[0]}`
        : null;

  const handleSubmit = async () => {
    if (!winnerId) {
      showAlert('Resultado inválido', 'Hay un empate en sets. Revisá los puntajes.');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('matches').update({
      score: { sets, winner_id: winnerId },
      status: 'in_progress',
      submitted_by: myId,
      played_at: new Date().toISOString(),
    }).eq('id', state.matchId);
    setSubmitting(false);
    if (error) {
      showAlert('Error', 'No se pudo guardar el resultado.');
    } else {
      showAlert('Resultado enviado', 'Tu rival recibirá una notificación para confirmar.',
        [{ text: 'OK', onPress: onSubmitted }]);
    }
  };

  return (
    <Modal visible={state.visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <Text style={modalStyles.title}>Cargar Resultado</Text>
          <Text style={modalStyles.subtitle}>
            {isDoubles ? 'Pareja A vs. Pareja B' : `vs. ${state.opponentName}`}
          </Text>

          <View style={modalStyles.setRow}>
            <View style={modalStyles.setNumCol} />
            <Text style={modalStyles.colLabel}>
              {isDoubles ? 'Pareja A' : 'Vos'}
            </Text>
            <View style={modalStyles.separator} />
            <Text style={modalStyles.colLabel}>
              {isDoubles ? 'Pareja B' : state.opponentName.split(' ')[0]}
            </Text>
          </View>

          <View style={modalStyles.setsContainer}>
            {sets.map((set, i) => (
              <View key={i} style={modalStyles.setRow}>
                <View style={modalStyles.setNumCol}>
                  <Text style={modalStyles.setNum}>SET {i + 1}</Text>
                </View>
                <TextInput
                  style={[modalStyles.setInput,
                  set.p1 > set.p2 && modalStyles.setInputWin,
                  set.p1 < set.p2 && modalStyles.setInputLoss]}
                  value={String(set.p1)} onChangeText={v => updateSet(i, 'p1', v)}
                  keyboardType="number-pad" maxLength={2} selectTextOnFocus
                />
                <View style={modalStyles.separator}>
                  <Text style={modalStyles.dash}>–</Text>
                </View>
                <TextInput
                  style={[modalStyles.setInput,
                  set.p2 > set.p1 && modalStyles.setInputWin,
                  set.p2 < set.p1 && modalStyles.setInputLoss]}
                  value={String(set.p2)} onChangeText={v => updateSet(i, 'p2', v)}
                  keyboardType="number-pad" maxLength={2} selectTextOnFocus
                />
              </View>
            ))}
          </View>

          <View style={modalStyles.setControls}>
            <TouchableOpacity style={modalStyles.setControlBtn} onPress={removeSet} disabled={sets.length <= 1}>
              <Ionicons name="remove-circle-outline" size={20}
                color={sets.length <= 1 ? Colors.surfaceContainerHigh : Colors.error} />
              <Text style={[modalStyles.setControlText, sets.length <= 1 && { color: Colors.surfaceContainerHigh }]}>
                Quitar set
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.setControlBtn} onPress={addSet} disabled={sets.length >= 5}>
              <Ionicons name="add-circle-outline" size={20}
                color={sets.length >= 5 ? Colors.surfaceContainerHigh : Colors.primary} />
              <Text style={[modalStyles.setControlText, { color: sets.length >= 5 ? Colors.surfaceContainerHigh : Colors.primary }]}>
                Agregar set
              </Text>
            </TouchableOpacity>
          </View>

          {winnerLabel && (
            <View style={[modalStyles.resultBanner, iWon ? modalStyles.bannerWin : modalStyles.bannerLoss]}>
              <Ionicons name="trophy" size={16} color={iWon ? Colors.primary : Colors.error} />
              <Text style={[modalStyles.resultText, iWon ? modalStyles.resultTextWin : modalStyles.resultTextLoss]}>
                {winnerLabel}
              </Text>
            </View>
          )}

          <View style={modalStyles.btnRow}>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
              <Text style={modalStyles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.submitBtn, (!winnerId || submitting) && modalStyles.submitBtnDisabled]}
              onPress={handleSubmit} disabled={!winnerId || submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={modalStyles.submitBtnText}>Enviar resultado</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Modal: Confirmar / Disputar ──────────────────────────────────────────────

function ConfirmResultModal({ state, myId, onClose, onResolved }: {
  state: DisputeModalState; myId: string; onClose: () => void; onResolved: () => void;
}) {
  const [disputeReason, setDisputeReason] = useState('');
  const [showDisputeInput, setShowDisputeInput] = useState(false);
  const [loading, setLoading] = useState(false);

  const scoreStr = state.score?.sets?.map((s: any) => `${s.p1}–${s.p2}`).join('  ') ?? '—';
  const winnerId = state.score?.winner_id;
  const isDoubles = state.matchFormat === 'doubles';
  const iWon = winnerId === (state.myHeaderId ?? myId);
  const winnerName = isDoubles
    ? winnerId === state.side1HeaderId ? 'Pareja A'
      : winnerId === state.side2HeaderId ? 'Pareja B'
        : '—'
    : state.submitterName.split(' ')[0];

  const handleConfirm = async () => {
    setLoading(true);
    const { error } = await supabase.from('matches').update({
      status: 'completed', confirmed_by: myId,
      confirmed_at: new Date().toISOString(),
    }).eq('id', state.matchId);
    setLoading(false);
    if (error) {
      showAlert('Error', 'No se pudo confirmar el resultado.');
    } else {
      showAlert('Resultado confirmado', 'El partido quedó registrado.',
        [{ text: 'OK', onPress: onResolved }]);
    }
  };

  const handleDispute = async () => {
    if (!disputeReason.trim()) {
      showAlert('Motivo requerido', 'Explicá brevemente por qué disputás el resultado.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('matches').update({
      status: 'pending', score: null, submitted_by: null,
      played_at: null, disputed_by: myId, dispute_reason: disputeReason.trim(),
    }).eq('id', state.matchId);
    setLoading(false);
    if (error) {
      showAlert('Error', 'No se pudo disputar el resultado.');
    } else {
      showAlert('Resultado disputado', 'El partido volvió a estado pendiente.',
        [{ text: 'OK', onPress: onResolved }]);
    }
  };

  return (
    <Modal visible={state.visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <Text style={modalStyles.title}>Confirmar Resultado</Text>
          <Text style={modalStyles.subtitle}>
            {isDoubles ? state.submitterName : state.submitterName.split(' ')[0]} cargó el siguiente resultado:
          </Text>

          <View style={confirmStyles.scoreCard}>
            <Text style={confirmStyles.scoreStr}>{scoreStr}</Text>
            <View style={[confirmStyles.winnerBadge, iWon ? confirmStyles.winnerBadgeGreen : confirmStyles.winnerBadgeRed]}>
              <Ionicons name="trophy" size={13} color={iWon ? Colors.primary : Colors.error} />
              <Text style={[confirmStyles.winnerBadgeText, iWon ? confirmStyles.winnerTextGreen : confirmStyles.winnerTextRed]}>
                {iWon ? (isDoubles ? 'Ganó tu pareja' : 'Vos ganaste') : `Ganó ${winnerName}`}
              </Text>
            </View>
          </View>

          {showDisputeInput && (
            <View style={confirmStyles.disputeBox}>
              <Text style={confirmStyles.disputeLabel}>Motivo de la disputa</Text>
              <TextInput
                style={confirmStyles.disputeInput}
                placeholder="Ej: El marcador es incorrecto, fue 6-4 6-3..."
                placeholderTextColor={Colors.onSurfaceVariant}
                value={disputeReason} onChangeText={setDisputeReason}
                multiline maxLength={300} textAlignVertical="top"
              />
            </View>
          )}

          {!showDisputeInput ? (
            <View style={modalStyles.btnRow}>
              <TouchableOpacity style={confirmStyles.disputeBtn} onPress={() => setShowDisputeInput(true)}>
                <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
                <Text style={confirmStyles.disputeBtnText}>Disputar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.submitBtn, loading && modalStyles.submitBtnDisabled]}
                onPress={handleConfirm} disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={modalStyles.submitBtnText}>Confirmar</Text>
                  </>}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={modalStyles.btnRow}>
              <TouchableOpacity style={modalStyles.cancelBtn}
                onPress={() => { setShowDisputeInput(false); setDisputeReason(''); }}>
                <Text style={modalStyles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[confirmStyles.disputeSubmitBtn, loading && modalStyles.submitBtnDisabled]}
                onPress={handleDispute} disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={modalStyles.submitBtnText}>Enviar disputa</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const TABS = ['Próximos', 'Historial', 'Retos'];

const matchQuery = `
    id, type, match_format, status, scheduled_at, location, score, notes,
    player1_id, player2_id, partner1_id, partner2_id, team1_id, team2_id, created_by,
    submitted_by, played_at, confirmed_by, confirmed_at,
    disputed_by, dispute_reason, elo_delta_p1, elo_delta_p2,
    player1:profiles!matches_player1_id_fkey(id, full_name, avatar_url),
    player2:profiles!matches_player2_id_fkey(id, full_name, avatar_url),
    partner1:profiles!matches_partner1_id_fkey(id, full_name, avatar_url),
    partner2:profiles!matches_partner2_id_fkey(id, full_name, avatar_url)
`;

export default function MatchesScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const [activeTab, setActiveTab] = useState(0);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const pendingConfirmCount = upcoming.filter(
    m => m.status === 'in_progress' && m.submitted_by !== profile?.id
  ).length;

  const [resultModal, setResultModal] = useState<ResultModalState>({
    visible: false, matchId: '', opponentId: '', opponentName: '',
  });
  const [confirmModal, setConfirmModal] = useState<DisputeModalState>({
    visible: false, matchId: '', score: null, submitterName: '',
  });
  const [scheduleModal, setScheduleModal] = useState<ScheduleModalState>({
    visible: false, matchId: '',
  });

  const loadData = async () => {
    if (!profile) return;
    const myMatchFilter = `player1_id.eq.${profile.id},player2_id.eq.${profile.id},` +
      `partner1_id.eq.${profile.id},partner2_id.eq.${profile.id}`;
    const [{ data: u }, { data: h }, { data: c }] = await Promise.all([
      supabase.from('matches').select(matchQuery)
        .or(myMatchFilter)
        .in('status', ['pending', 'confirmed', 'in_progress'])
        .order('scheduled_at', { ascending: true }),
      supabase.from('matches').select(matchQuery)
        .or(myMatchFilter)
        .eq('status', 'completed')
        .order('played_at', { ascending: false })
        .limit(20),
      supabase.from('challenges').select(`
                id, challenger_id, challenged_id, status, created_at,
                proposed_date, proposed_venue, message, match_id, match_type,
                challenger:profiles!challenges_challenger_id_fkey(full_name, avatar_url),
                challenged:profiles!challenges_challenged_id_fkey(full_name, avatar_url)
            `)
        .or(`challenger_id.eq.${profile.id},challenged_id.eq.${profile.id}`)
        .in('status', ['pending'])
        .order('created_at', { ascending: false }),
    ]);
    if (u) setUpcoming(u);
    if (h) setHistory(h);
    if (c) setChallenges(c);
  };

  useEffect(() => { loadData(); }, [profile]);

  // Estado en vivo: cuando el rival acepta, agenda, manda el resultado o
  // confirma, la lista se actualiza sola (sin pull-to-refresh).
  useLiveRefresh('matches', () => { loadData(); });
  useLiveRefresh('challenges', () => { loadData(); });

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getOpponent = (m: any) => m.player1_id === profile?.id ? m.player2 : m.player1;
  const getResult = (m: any) => {
    const myHeaderId = getSides(m, profile?.id ?? '').mine.headerId ?? profile?.id;
    return m.score?.winner_id === myHeaderId ? 'VICTORIA' : 'DERROTA';
  };

  const openChat = async (opponentId: string) => {
    if (!profile?.id) return;
    setLoadingId(`chat-${opponentId}`);
    const convId = await getOrCreateConversation(profile.id, opponentId);
    setLoadingId(null);
    if (convId) router.push(`/chat/${convId}` as any);
    else showAlert('Error', 'No se pudo abrir el chat.');
  };

  const openTeamChat = async (teamId: string) => {
    setLoadingId(`team-chat-${teamId}`);
    try {
      const convId = await getOrCreateDoublesChat(teamId);
      router.push(`/chat/${convId}` as any);
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'No se pudo abrir el chat de la dupla.');
    } finally {
      setLoadingId(null);
    }
  };

  const confirmMatch = async (matchId: string) => {
    setLoadingId(matchId);
    const { error } = await supabase.from('matches').update({ status: 'confirmed' }).eq('id', matchId);
    setLoadingId(null);
    if (error) showAlert('Error', 'No se pudo confirmar el partido.');
    else loadData();
  };

  const handleKeepTeam = async (teamId: string, matchId: string) => {
    setLoadingId(`keep-${matchId}`);
    try {
      const kept = await keepDoublesTeam(teamId);
      showAlert(
        kept ? 'Dupla conservada' : 'Esperando a tu compañero',
        kept ? 'Sigan jugando juntos.' : 'Tu compañero todavía no aceptó conservar la dupla.'
      );
    } catch (e: any) {
      showAlert('No se pudo conservar la dupla', e.message ?? 'Intentá de nuevo.');
    } finally {
      setLoadingId(null);
    }
  };

  const cancelMatch = (matchId: string) => {
    showAlert('Rechazar partido', '¿Estás seguro?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, rechazar', style: 'destructive',
        onPress: async () => {
          setLoadingId(matchId);
          const { error } = await supabase.from('matches').update({ status: 'cancelled' }).eq('id', matchId);
          setLoadingId(null);
          if (error) showAlert('Error', 'No se pudo rechazar el partido.');
          else { showAlert('Listo', 'Partido rechazado.'); loadData(); }
        },
      },
    ]);
  };

  const acceptChallenge = async (c: any) => {
    setLoadingId(c.id);
    try {
      const { data: match, error: matchErr } = await supabase
        .from('matches')
        .insert({
          player1_id: c.challenger_id,
          player2_id: c.challenged_id,
          // Se conserva la modalidad del desafío: si era 'competitive' ("por
          // puntos") el partido tiene que quedar como 'competitive' para que
          // el motor de ELO lo tenga en cuenta al confirmarse el resultado.
          type: c.match_type ?? 'friendly',
          status: 'confirmed',
          scheduled_at: c.proposed_date ?? null,
          location: c.proposed_venue ?? null,
          notes: c.message ?? null,
          created_by: profile?.id,
        })
        .select('id').single();
      if (matchErr) throw matchErr;
      await supabase.from('challenges').update({ status: 'accepted', match_id: match.id }).eq('id', c.id);
      loadData();
    } catch (e: any) {
      showAlert('Error', e.message ?? 'No se pudo aceptar el reto.');
    } finally {
      setLoadingId(null);
    }
  };

  const rejectChallenge = (challengeId: string) => {
    showAlert('Rechazar reto', '¿Estás seguro?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, rechazar', style: 'destructive',
        onPress: async () => {
          setLoadingId(challengeId);
          const { error } = await supabase.from('challenges').update({ status: 'rejected' }).eq('id', challengeId);
          setLoadingId(null);
          if (error) showAlert('Error', 'No se pudo rechazar el reto.');
          else { showAlert('Listo', 'Reto rechazado.'); loadData(); }
        },
      },
    ]);
  };

  // ── Renders ───────────────────────────────────────────────────────────────

  const renderUpcoming = () => upcoming.map(m => {
    const opp = getOpponent(m);
    const isDoubles = m.match_format === 'doubles';
    const sides = getSides(m, profile?.id ?? '');
    const rival = sides.rival;
    const chatTarget = isDoubles ? rival.header : opp;
    const isLoading = loadingId === m.id;
    const isChatLoading = loadingId === `chat-${chatTarget?.id}`;
    const matchDay = isMatchDay(m.scheduled_at);
    const isPending = m.status === 'pending';
    const isConfirmed = m.status === 'confirmed';
    const isInProgress = m.status === 'in_progress';
    const iSubmitted = isInProgress && (
      isDoubles
        ? [sides.mine.headerId, sides.mine.partnerId].includes(m.submitted_by)
        : m.submitted_by === profile?.id
    );
    const rivalSubmitted = isInProgress && !iSubmitted;
    const hasSchedule = !!m.scheduled_at;
    const submitterSide = isDoubles
      ? [sides.a.headerId, sides.a.partnerId].includes(m.submitted_by) ? sides.a : sides.b
      : null;
    const submitterLabel = submitterSide?.label ?? opp?.full_name ?? 'Rival';
    const scoreWinnerLabel = isDoubles
      ? m.score?.winner_id === sides.a.headerId ? 'Ganó Pareja A'
        : m.score?.winner_id === sides.b.headerId ? 'Ganó Pareja B'
          : '—'
      : m.score?.winner_id === profile?.id ? 'Ganaste' : `Ganó ${opp?.full_name?.split(' ')[0]}`;

    return (
      <Card key={m.id} style={[styles.matchCard, rivalSubmitted && styles.matchCardHighlight]}>
        <View style={styles.matchTop}>
          <Badge label={m.type.toUpperCase()} color={Colors.primaryContainer} textColor={Colors.primary} />
          <Badge
            label={
              iSubmitted ? 'ESPERANDO RIVAL' :
                rivalSubmitted ? 'CONFIRMAR RESULTADO' :
                  isConfirmed ? 'CONFIRMADO' : 'PENDIENTE'
            }
            color={
              iSubmitted ? '#FFF3CD' :
                rivalSubmitted ? Colors.primary :
                  isConfirmed ? Colors.primaryContainer : Colors.tertiaryContainer
            }
            textColor={
              iSubmitted ? '#856404' :
                rivalSubmitted ? '#fff' :
                  isConfirmed ? Colors.primary : Colors.tertiary
            }
          />
          {matchDay && isConfirmed && (
            <Badge label="HOY" color={Colors.primary} textColor="#fff" />
          )}
        </View>

        <View style={styles.matchInfoRow}>
          <Ionicons name="calendar-outline" size={14} color={Colors.onSurfaceVariant} />
          <Text style={styles.matchDate}>
            {hasSchedule ? formatDate(m.scheduled_at) : 'Sin fecha'}
          </Text>
          <TouchableOpacity
            style={styles.editDateBtn}
            onPress={() => setScheduleModal({ visible: true, matchId: m.id })}
          >
            <Ionicons name="pencil-outline" size={13} color={Colors.primary} />
            <Text style={styles.editDateText}>
              {hasSchedule ? 'Editar' : 'Agregar'}
            </Text>
          </TouchableOpacity>
        </View>

        {m.location && (
          <View style={styles.matchInfoRow}>
            <Ionicons name="location-outline" size={14} color={Colors.onSurfaceVariant} />
            <Text style={styles.matchDate}>{m.location}</Text>
          </View>
        )}

        {isDoubles ? (
          <View style={styles.doublesVs}>
            {[sides.a, sides.b].map((side, sideIndex) => (
              <React.Fragment key={side.label}>
                {sideIndex === 1 && <Text style={styles.vsText}>VS</Text>}
                <View style={styles.doublesSide}>
                  <Text style={[styles.doublesSideLabel, side.isMine && styles.doublesSideLabelMine]}>
                    {side.label}{side.isMine ? ' (vos)' : ''}
                  </Text>
                  {side.players.map((p, playerIndex) => (
                    <View key={`${side.label}-${playerIndex}`} style={styles.doublesPlayer}>
                      <Avatar uri={p?.avatar_url} size={36} />
                      <Text style={styles.doublesPlayerName} numberOfLines={1}>
                        {p?.full_name ?? '?'}
                      </Text>
                    </View>
                  ))}
                </View>
              </React.Fragment>
            ))}
          </View>
        ) : (
          <View style={styles.matchVs}>
            <View style={styles.matchPlayer}>
              <Avatar uri={profile?.avatar_url} size={48} />
              <Text style={styles.playerName}>Tú</Text>
            </View>
            <Text style={styles.vsText}>VS</Text>
            <View style={styles.matchPlayer}>
              <Avatar uri={opp?.avatar_url} size={48} />
              <Text style={styles.playerName}>{opp?.full_name ?? '?'}</Text>
            </View>
          </View>
        )}

        {isPending && (
          <View style={styles.btnRow}>
            <Button label="Rechazar" variant="secondary"
              onPress={() => cancelMatch(m.id)} disabled={isLoading} style={{ flex: 1 }} />
            <Button label={isLoading ? 'Confirmando...' : 'Confirmar'}
              onPress={() => confirmMatch(m.id)} disabled={isLoading} style={{ flex: 1 }} />
          </View>
        )}

        {isConfirmed && (
          <View style={styles.btnStack}>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.iconBtn}
                onPress={() => chatTarget?.id && openChat(chatTarget.id)} disabled={isChatLoading}>
                {isChatLoading
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Ionicons name="chatbubble-outline" size={18} color={Colors.primary} />}
                <Text style={styles.iconBtnText}>Mensaje</Text>
              </TouchableOpacity>
              {isDoubles && sides.mine.teamId && (
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => openTeamChat(sides.mine.teamId as string)}
                  disabled={loadingId === `team-chat-${sides.mine.teamId}`}
                >
                  {loadingId === `team-chat-${sides.mine.teamId}`
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <Ionicons name="people-outline" size={18} color={Colors.primary} />}
                  <Text style={styles.iconBtnText}>Chat dupla</Text>
                </TouchableOpacity>
              )}
            </View>
            {matchDay && (
              <TouchableOpacity
                style={[styles.iconBtn, styles.iconBtnPrimaryFull]}
                onPress={() => setResultModal({
                  visible: true, matchId: m.id,
                  opponentId: (isDoubles ? rival.headerId : opp?.id) ?? '',
                  opponentName: (isDoubles ? rival.label : opp?.full_name) ?? 'Rival',
                  matchFormat: isDoubles ? 'doubles' : 'singles',
                  myHeaderId: sides.mine.headerId ?? profile?.id ?? '',
                  side1HeaderId: sides.a.headerId ?? '',
                  side2HeaderId: sides.b.headerId ?? '',
                })}
              >
                <Ionicons name="trophy-outline" size={18} color="#fff" />
                <Text style={[styles.iconBtnText, { color: '#fff' }]}>Cargar resultado</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {iSubmitted && (
          <View style={styles.waitingBanner}>
            <Ionicons name="time-outline" size={16} color="#856404" />
            <View style={{ flex: 1 }}>
              <Text style={styles.waitingText}>
                Esperando que {isDoubles ? rival.label : (opp?.full_name?.split(' ')[0] ?? 'tu rival')} confirme
              </Text>
              <Text style={styles.waitingScore}>
                {m.score?.sets?.map((s: any) => `${s.p1}–${s.p2}`).join('  ')}
              </Text>
            </View>
          </View>
        )}

        {rivalSubmitted && (
          <View style={styles.confirmBanner}>
            <View style={styles.confirmBannerTop}>
              <Ionicons name="alert-circle" size={18} color={Colors.primary} />
              <Text style={styles.confirmBannerTitle}>
                {submitterLabel.split(' ')[0]} cargó un resultado
              </Text>
            </View>
            <Text style={styles.confirmBannerScore}>
              {m.score?.sets?.map((s: any) => `${s.p1}–${s.p2}`).join('  ')}
              {'   '}
              {scoreWinnerLabel}
            </Text>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.disputeBtn}
                onPress={() => setConfirmModal({
                  visible: true, matchId: m.id,
                  score: m.score, submitterName: submitterLabel,
                  matchFormat: isDoubles ? 'doubles' : 'singles',
                  myHeaderId: sides.mine.headerId ?? profile?.id ?? '',
                  side1HeaderId: sides.a.headerId ?? '',
                  side2HeaderId: sides.b.headerId ?? '',
                })}>
                <Ionicons name="alert-circle-outline" size={16} color={Colors.error} />
                <Text style={styles.disputeBtnText}>Disputar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn}
                onPress={() => setConfirmModal({
                  visible: true, matchId: m.id,
                  score: m.score, submitterName: submitterLabel,
                  matchFormat: isDoubles ? 'doubles' : 'singles',
                  myHeaderId: sides.mine.headerId ?? profile?.id ?? '',
                  side1HeaderId: sides.a.headerId ?? '',
                  side2HeaderId: sides.b.headerId ?? '',
                })}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={styles.confirmBtnText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Card>
    );
  });

  const renderHistory = () => history.map(m => {
    const opp = getOpponent(m);
    const isDoubles = m.match_format === 'doubles';
    const sides = getSides(m, profile?.id ?? '');
    const result = getResult(m);
    const isWin = result === 'VICTORIA';
    const scoreStr = m.score?.sets?.map((s: any) => `${s.p1}-${s.p2}`).join(', ') ?? '—';
    const eloDelta = sides.mine.headerId === m.player1_id ? m.elo_delta_p1 : m.elo_delta_p2;
    const keepTeamId = isDoubles ? sides.mine.teamId : null;
    const eloRow = eloDelta !== undefined && eloDelta !== 0 && (
      <View style={styles.eloDeltaRow}>
        <Ionicons
          name={eloDelta > 0 ? 'arrow-up' : 'arrow-down'} size={12}
          color={eloDelta > 0 ? '#4ade80' : '#f87171'}
        />
        <Text style={[styles.eloDelta, eloDelta > 0 ? styles.eloPos : styles.eloNeg]}>
          {Math.abs(eloDelta)} ELO
        </Text>
      </View>
    );
    const resultBadge = (
      <Badge
        label={result}
        color={isWin ? Colors.primaryContainer : '#FFE5E5'}
        textColor={isWin ? Colors.primary : Colors.error}
      />
    );

    if (isDoubles) {
      return (
        <Card key={m.id} style={styles.historyDoublesCard}>
          <View style={styles.historyDoublesTeams}>
            {[sides.a, sides.b].map((side, sideIndex) => (
              <React.Fragment key={side.label}>
                {sideIndex === 1 && <Text style={styles.vsText}>VS</Text>}
                <View style={styles.doublesSide}>
                  <Text style={[styles.doublesSideLabel, side.isMine && styles.doublesSideLabelMine]}>
                    {side.label}{side.isMine ? ' (vos)' : ''}
                  </Text>
                  {side.players.map((p, playerIndex) => (
                    <View key={`${side.label}-${playerIndex}`} style={styles.doublesPlayer}>
                      <Avatar uri={p?.avatar_url} size={32} />
                      <Text style={styles.doublesPlayerName} numberOfLines={1}>
                        {p?.full_name ?? '?'}
                      </Text>
                    </View>
                  ))}
                </View>
              </React.Fragment>
            ))}
          </View>
          <Text style={styles.historyMeta}>
            {m.type} • {formatDate(m.played_at ?? m.scheduled_at)}
          </Text>
          <View style={styles.historyDoublesFooter}>
            <View style={styles.historyRight}>
              <Text style={styles.historyScore}>{scoreStr}</Text>
              {resultBadge}
              {eloRow}
            </View>
            {keepTeamId && (
              <TouchableOpacity
                style={styles.keepTeamBtn}
                onPress={() => handleKeepTeam(keepTeamId, m.id)}
                disabled={loadingId === `keep-${m.id}`}
              >
                {loadingId === `keep-${m.id}`
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <>
                    <Ionicons name="people-outline" size={16} color={Colors.primary} />
                    <Text style={styles.keepTeamText}>Conservar dupla</Text>
                  </>}
              </TouchableOpacity>
            )}
          </View>
        </Card>
      );
    }

    return (
      <Card key={m.id} style={styles.historyCard}>
        <View style={styles.historyLeft}>
          <Avatar uri={opp?.avatar_url} size={44} />
          <View>
            <Text style={styles.historyOpponent}>vs. {opp?.full_name ?? '?'}</Text>
            <Text style={styles.historyMeta}>
              {m.type} • {formatDate(m.played_at ?? m.scheduled_at)}
            </Text>
          </View>
        </View>
        <View style={styles.historyRight}>
          <Text style={styles.historyScore}>{scoreStr}</Text>
          {resultBadge}
          {eloRow}
        </View>
      </Card>
    );
  });

  const renderChallenges = () => challenges.map(c => {
    const isChallenger = c.challenger_id === profile?.id;
    const other = isChallenger ? c.challenged : c.challenger;
    return (
      <Card key={c.id} style={styles.challengeCard}>
        <View style={styles.challengeHeader}>
          <Badge
            label={isChallenger ? 'ENVIADO' : 'RECIBIDO'}
            color={isChallenger ? Colors.surfaceContainerHigh : Colors.primaryContainer}
            textColor={isChallenger ? Colors.onSurfaceVariant : Colors.primary}
          />
          <Text style={styles.challengeDate}>{formatDate(c.created_at)}</Text>
        </View>
        <View style={styles.challengeBody}>
          <Avatar uri={other?.avatar_url} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.challengeName}>{other?.full_name ?? '?'}</Text>
            {c.proposed_date && (
              <View style={styles.challengeMetaRow}>
                <Ionicons name="calendar-outline" size={13} color={Colors.onSurfaceVariant} />
                <Text style={styles.challengeMeta}>{formatDate(c.proposed_date)}</Text>
              </View>
            )}
            {c.proposed_venue && (
              <View style={styles.challengeMetaRow}>
                <Ionicons name="location-outline" size={13} color={Colors.onSurfaceVariant} />
                <Text style={styles.challengeMeta}>{c.proposed_venue}</Text>
              </View>
            )}
            {c.message && <Text style={styles.challengeMsg}>"{c.message}"</Text>}
          </View>
        </View>
        {!isChallenger && (
          <View style={styles.btnRow}>
            <Button label="Rechazar" variant="secondary"
              onPress={() => rejectChallenge(c.id)} disabled={loadingId === c.id} style={{ flex: 1 }} />
            <Button label={loadingId === c.id ? 'Aceptando...' : 'Aceptar'}
              onPress={() => acceptChallenge(c)} disabled={loadingId === c.id} style={{ flex: 1 }} />
          </View>
        )}
        {isChallenger && (
          <Button label="Cancelar reto" variant="secondary"
            onPress={() => rejectChallenge(c.id)} disabled={loadingId === c.id} />
        )}
      </Card>
    );
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Mis Partidos</Text>
      </View>

      <View style={styles.tabsRow}>
        {TABS.map((t, i) => {
          const badgeCount = i === 0 ? pendingConfirmCount : i === 2 ? challenges.length : 0;
          return (
            <TouchableOpacity key={t}
              style={[styles.tab, activeTab === i && styles.tabActive]}
              onPress={() => setActiveTab(i)}
            >
              <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>{t}</Text>
              {badgeCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{badgeCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {activeTab === 0 && (upcoming.length === 0
          ? <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={Colors.onSurfaceVariant} />
            <Text style={styles.emptyText}>Sin partidos próximos</Text>
          </View>
          : renderUpcoming()
        )}
        {activeTab === 1 && (history.length === 0
          ? <View style={styles.empty}>
            <Ionicons name="tennisball-outline" size={48} color={Colors.onSurfaceVariant} />
            <Text style={styles.emptyText}>Sin historial aún</Text>
          </View>
          : renderHistory()
        )}
        {activeTab === 2 && (challenges.length === 0
          ? <View style={styles.empty}>
            <Ionicons name="flash-outline" size={48} color={Colors.onSurfaceVariant} />
            <Text style={styles.emptyText}>Sin retos pendientes</Text>
          </View>
          : renderChallenges()
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      <ScheduleModal
        state={scheduleModal}
        onClose={() => setScheduleModal(s => ({ ...s, visible: false }))}
        onSaved={() => { setScheduleModal(s => ({ ...s, visible: false })); loadData(); }}
      />
      <ResultModal
        state={resultModal}
        myId={profile?.id ?? ''}
        onClose={() => setResultModal(s => ({ ...s, visible: false }))}
        onSubmitted={() => { setResultModal(s => ({ ...s, visible: false })); loadData(); }}
      />
      <ConfirmResultModal
        state={confirmModal}
        myId={profile?.id ?? ''}
        onClose={() => setConfirmModal(s => ({ ...s, visible: false }))}
        onResolved={() => { setConfirmModal(s => ({ ...s, visible: false })); loadData(); }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.sm, gap: Spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontFamily: 'Lexend_700Bold', fontSize: 24, color: Colors.onSurface, letterSpacing: -0.3 },
  tabsRow: { flexDirection: 'row', paddingHorizontal: Spacing.xl, paddingBottom: Spacing.base, gap: Spacing.sm },
  tab: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: Radius.full, backgroundColor: Colors.surfaceContainerHigh, gap: 6,
  },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { ...Typography.labelMd, color: Colors.onSurfaceVariant },
  tabTextActive: { color: Colors.primaryContainer },
  tabBadge: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.primaryContainer,
    alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeText: { ...Typography.labelSm, color: Colors.primary, fontSize: 10 },
  content: { paddingHorizontal: Spacing.xl, gap: Spacing.md, paddingTop: Spacing.sm },
  matchCard: { gap: Spacing.md },
  matchCardHighlight: { borderWidth: 1.5, borderColor: Colors.primary + '55' },
  matchTop: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  matchInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  matchDate: { ...Typography.bodySm, color: Colors.onSurfaceVariant, flex: 1 },
  editDateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: Radius.full, backgroundColor: Colors.primaryContainer,
  },
  editDateText: { ...Typography.labelSm, color: Colors.primary },
  matchVs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  matchPlayer: { alignItems: 'center', gap: 6, flex: 1 },
  playerName: { ...Typography.titleMd, color: Colors.onSurface },
  vsText: { ...Typography.labelLg, color: Colors.onSurfaceVariant },
  doublesVs: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  doublesSide: { flex: 1, gap: 4 },
  doublesSideLabel: { ...Typography.labelSm, color: Colors.onSurfaceVariant, textAlign: 'center' },
  doublesSideLabelMine: { color: Colors.primary },
  doublesPlayer: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  doublesPlayerName: { ...Typography.bodySm, color: Colors.onSurface, flexShrink: 1 },
  historyDoublesCard: { gap: Spacing.sm },
  historyDoublesTeams: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  historyDoublesFooter: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: Spacing.md,
  },
  keepTeamBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.full, backgroundColor: Colors.primaryContainer,
  },
  keepTeamText: { ...Typography.labelMd, color: Colors.primary },
  btnStack: { gap: Spacing.md },
  btnRow: { flexDirection: 'row', gap: Spacing.md },
  iconBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, minHeight: 44, paddingVertical: 11, borderRadius: Radius.xl,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1, borderColor: Colors.surfaceContainerHigh,
  },
  iconBtnPrimaryFull: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  iconBtnText: { ...Typography.labelMd, color: Colors.primary },
  waitingBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: '#FFF3CD', borderRadius: Radius.lg, padding: Spacing.md,
  },
  waitingText: { ...Typography.bodySm, color: '#856404' },
  waitingScore: { fontFamily: 'Lexend_600SemiBold', fontSize: 13, color: '#856404', marginTop: 2 },
  confirmBanner: {
    backgroundColor: Colors.primaryContainer + '22',
    borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.primary + '44',
  },
  confirmBannerTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  confirmBannerTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: Colors.onSurface, flex: 1 },
  confirmBannerScore: { fontFamily: 'Lexend_600SemiBold', fontSize: 14, color: Colors.onSurface },
  disputeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: Radius.xl,
    backgroundColor: '#FFE5E5', borderWidth: 1, borderColor: Colors.error + '44',
  },
  disputeBtnText: { ...Typography.labelMd, color: Colors.error },
  confirmBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: Radius.xl, backgroundColor: Colors.primary,
  },
  confirmBtnText: { ...Typography.labelMd, color: '#fff' },
  historyCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  historyLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  historyOpponent: { ...Typography.titleMd, color: Colors.onSurface },
  historyMeta: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
  historyRight: { alignItems: 'flex-end', gap: 4 },
  historyScore: { fontFamily: 'Lexend_600SemiBold', fontSize: 16, color: Colors.onSurface },
  eloDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  eloDelta: { fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' },
  eloPos: { color: '#4ade80' },
  eloNeg: { color: '#f87171' },
  challengeCard: { gap: Spacing.md },
  challengeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  challengeDate: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
  challengeBody: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  challengeName: { ...Typography.titleMd, color: Colors.onSurface, marginBottom: 4 },
  challengeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  challengeMeta: { ...Typography.bodySm, color: Colors.onSurfaceVariant },
  challengeMsg: { ...Typography.bodySm, color: Colors.onSurfaceVariant, fontStyle: 'italic', marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  emptyText: { ...Typography.bodyMd, color: Colors.onSurfaceVariant },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
    padding: Spacing.xl, paddingBottom: 44, gap: Spacing.lg, maxHeight: '90%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceContainerHigh,
    alignSelf: 'center', marginBottom: 4,
  },
  title: { fontFamily: 'Lexend_700Bold', fontSize: 20, color: Colors.onSurface, letterSpacing: -0.3 },
  subtitle: { ...Typography.bodyMd, color: Colors.onSurfaceVariant, marginTop: -Spacing.md },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  setNumCol: { width: 52 },
  setNum: { ...Typography.labelSm, color: Colors.onSurfaceVariant },
  colLabel: { flex: 1, textAlign: 'center', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: Colors.onSurface },
  separator: { width: 24, alignItems: 'center' },
  dash: { ...Typography.labelLg, color: Colors.onSurfaceVariant },
  setsContainer: { gap: Spacing.sm },
  setInput: {
    flex: 1, height: 56,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.surfaceContainerHigh,
    textAlign: 'center', fontFamily: 'Lexend_700Bold', fontSize: 24, color: Colors.onSurface,
  },
  setInputWin: { borderColor: Colors.primary, backgroundColor: Colors.primaryContainer + '40', color: Colors.primary },
  setInputLoss: { borderColor: Colors.error, backgroundColor: '#FFE5E540', color: Colors.error },
  setControls: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  setControlBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4 },
  setControlText: { ...Typography.labelMd, color: Colors.onSurfaceVariant },
  resultBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: Radius.xl, paddingVertical: Spacing.md,
  },
  bannerWin: { backgroundColor: Colors.primaryContainer },
  bannerLoss: { backgroundColor: '#FFE5E5' },
  resultText: { fontFamily: 'Lexend_700Bold', fontSize: 16 },
  resultTextWin: { color: Colors.primary },
  resultTextLoss: { color: Colors.error },
  btnRow: { flexDirection: 'row', gap: Spacing.md, marginTop: 4 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: Radius.xl,
    backgroundColor: Colors.surfaceContainerHigh, alignItems: 'center',
  },
  cancelBtnText: { ...Typography.labelLg, color: Colors.onSurfaceVariant },
  submitBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: Radius.xl, backgroundColor: Colors.primary,
  },
  submitBtnDisabled: { backgroundColor: Colors.surfaceContainerHigh },
  submitBtnText: { ...Typography.labelLg, color: '#fff' },
});

const confirmStyles = StyleSheet.create({
  scoreCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl, padding: Spacing.xl,
    alignItems: 'center', gap: Spacing.md,
    borderWidth: 1, borderColor: Colors.surfaceContainerHigh,
  },
  scoreStr: { fontFamily: 'Lexend_700Bold', fontSize: 28, color: Colors.onSurface, letterSpacing: -0.5 },
  winnerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: Radius.full,
  },
  winnerBadgeGreen: { backgroundColor: Colors.primaryContainer },
  winnerBadgeRed: { backgroundColor: '#FFE5E5' },
  winnerBadgeText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 },
  winnerTextGreen: { color: Colors.primary },
  winnerTextRed: { color: Colors.error },
  disputeBox: { gap: Spacing.sm },
  disputeLabel: { ...Typography.labelMd, color: Colors.onSurface },
  disputeInput: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.surfaceContainerHigh,
    padding: Spacing.md, height: 100,
    ...Typography.bodyMd, color: Colors.onSurface,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  disputeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: Radius.xl, backgroundColor: '#FFE5E5',
  },
  disputeBtnText: { ...Typography.labelLg, color: Colors.error },
  disputeSubmitBtn: {
    flex: 2, paddingVertical: 14, borderRadius: Radius.xl,
    backgroundColor: Colors.error, alignItems: 'center',
  },
});

const schedStyles = StyleSheet.create({
  sectionLabel: {
    fontFamily: 'Lexend_600SemiBold', fontSize: 14,
    color: Colors.onSurface, letterSpacing: -0.2,
  },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.xl,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderWidth: 1, borderColor: Colors.surfaceContainerHigh,
  },
  dateBtnText: { flex: 1, ...Typography.bodyMd, color: Colors.onSurfaceVariant },
  dateBtnTextActive: { color: Colors.onSurface },
  venueScroll: { maxHeight: 260 },
  input: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: Radius.xl,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderWidth: 1, borderColor: Colors.surfaceContainerHigh,
    ...Typography.bodyMd, color: Colors.onSurface,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
});