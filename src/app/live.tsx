import { useCallback, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';

import {
  getActiveMatches, getWaitingPlayers, getAppConfig, getLastGroupmates, getOpenCourts, getCourts, getForcedPartners,
  type ActiveMatch, type WaitingPlayer, type Court,
} from '../db/db';
import { previewNextUp, minutesSince } from '../logic/matchmaking';
import { useColors } from '../theme';
import { Screen, Section } from '../components/ui/kit';
import { CourtGrid, NextUpList, WaitingList, type CourtItem } from '../components/live-venue';

function fmt(mins: number): string {
  const s = Math.max(0, Math.floor(mins * 60));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function LiveScreen() {
  const C = useColors();
  const wide = useWindowDimensions().width >= 900;

  const [now, setNow] = useState(() => new Date());
  const [matches, setMatches] = useState<ActiveMatch[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [pool, setPool] = useState<WaitingPlayer[]>([]);
  const [pairs, setPairs] = useState<Record<number, number>>({});
  const [cfg, setCfg] = useState(() => getAppConfig());

  const load = useCallback(() => {
    setMatches(getActiveMatches());
    setCourts(getCourts());
    setPool(getWaitingPlayers());
    setPairs(getForcedPartners());
    setCfg(getAppConfig());
  }, []);
  useFocusEffect(useCallback(() => {
    load();
    const id = setInterval(() => { setNow(new Date()); load(); }, 1000);
    return () => clearInterval(id);
  }, [load]));

  const nextUp = previewNextUp(pool, now, cfg.matchConfig, getLastGroupmates(), getOpenCourts().length, pairs);
  const nextIds = new Set(nextUp.map((p) => p.player_id));
  const waiting = pool.filter((p) => !nextIds.has(p.player_id));
  const nameById = new Map(pool.map((p) => [p.player_id, p.name]));
  const partnerName = (id: number) => (pairs[id] != null ? nameById.get(pairs[id]) : undefined);

  // Every non-closed court is shown; occupied ones show their match.
  const items: CourtItem[] = courts
    .filter((c) => c.status !== 'closed' || matches.some((m) => m.court_id === c.court_id))
    .map((c) => {
      const m = matches.find((x) => x.court_id === c.court_id);
      const el = m ? minutesSince(m.started_at, now) : 0;
      return { key: c.court_id, name: c.name, match: m, timer: fmt(el), over: !!m && el >= cfg.matchLimitMin };
    });

  const summary = `${matches.length} ${matches.length === 1 ? 'match' : 'matches'} in progress · ${pool.length} waiting`;

  const courtsSection = (
    <Section title="Courts" count={items.length}>
      <CourtGrid C={C} items={items} />
    </Section>
  );
  const queueSection = (
    <View style={{ gap: 28 }}>
      <NextUpList C={C} players={nextUp} partnerName={partnerName} />
      <WaitingList C={C} players={waiting} partnerName={partnerName} waitMinutes={(p) => Math.floor(minutesSince(p.waiting_since, now))} />
    </View>
  );

  return (
    <Screen title="Live" subtitle={summary}>
      {wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 24 }}>
          <View style={{ flex: 3 }}>{courtsSection}</View>
          <View style={{ flex: 2 }}>{queueSection}</View>
        </View>
      ) : (
        <View style={{ gap: 28 }}>
          {courtsSection}
          {queueSection}
        </View>
      )}
    </Screen>
  );
}
