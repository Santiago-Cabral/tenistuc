import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import {
    getMyTeams, getReceivedInvites, getPermanentTeams,
    getOpenChallenges, getDirectChallenges,
    DoublesTeam, DoublesChallenge,
} from '../services/doublesService';

export interface DoublesData {
    myTeams: DoublesTeam[];
    receivedInvites: DoublesTeam[];
    permanentTeams: DoublesTeam[];
    openChallenges: DoublesChallenge[];
    directChallenges: DoublesChallenge[];
}

const EMPTY: DoublesData = {
    myTeams: [],
    receivedInvites: [],
    permanentTeams: [],
    openChallenges: [],
    directChallenges: [],
};

let doublesChannelSeq = 0;

export function useDoubles() {
    const { profile } = useAuthStore();
    const userId = profile?.id ?? null;
    const channelKeyRef = useRef(++doublesChannelSeq);
    const [data, setData] = useState<DoublesData>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!userId) return;
        try {
            const [myTeams, receivedInvites, permanentTeams, openChallenges, directChallenges] =
                await Promise.all([
                    getMyTeams(userId),
                    getReceivedInvites(userId),
                    getPermanentTeams(),
                    getOpenChallenges(),
                    getDirectChallenges(userId),
                ]);
            setData({ myTeams, receivedInvites, permanentTeams, openChallenges, directChallenges });
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo cargar el estado de dobles.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [userId]);

    useEffect(() => {
        if (!userId) {
            setData(EMPTY);
            setLoading(false);
            return;
        }
        setLoading(true);
        load();
    }, [userId, load]);

    useEffect(() => {
        if (!userId) return;

        const channel = supabase
            .channel(`doubles:${userId}:${channelKeyRef.current}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'doubles_teams' },
                () => { load(); }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'doubles_challenges' },
                () => { load(); }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, load]);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        await load();
    }, [load]);

    const activeTeam =
        data.myTeams.find((t) => t.status === 'ready') ??
        data.myTeams.find((t) => t.status === 'invited') ??
        null;

    return {
        ...data,
        activeTeam,
        loading,
        refreshing,
        error,
        reload: load,
        refresh,
    };
}
