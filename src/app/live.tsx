import { useState } from 'react';
import { Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useIsFocused } from 'expo-router';

import {
  clearDraft, createDraftMatch, draftSeatCount, randomFillDraft, freePlayers, matchIsMixed, playerById, gamesWarning, readyMatch, recordWinner, setDraftSeat, startGame, playersToStart, useStore,
  type Match, type State,
} from '../state/store';
import { isMixedLevels } from '../logic/matchmaking';
import { Alert } from '../lib/alert';
import { useColors } from '../theme';
import { Button, Dialog, EmptyText, FrostedCover, Glass, Grid, List, ListRow, Screen, Section, TextField } from '../components/ui/kit';
import {
  CourtGrid, DraftCard, MatchCard, WaitingPool,
  type CourtItem, type DraftSeats, type Member, type MatchView, type WaitingItem,
} from '../components/live-venue';
import { EditButton, SwapOverlay, SwapProvider, useIsDragging, useSwap } from '../components/swap-layer';

/** A player as the cards draw them (name + level). */
function memberOf(s: State, id: number, onCourt = false): Member {
  const p = playerById(s, id);
  // Wait time shows only after "Start Game" and pauses while the player is on court.
  const since = s.started && !onCourt && p ? p.waitingSince : undefined;
  return { player_id: id, name: p?.name ?? 'Removed player', level: p?.level ?? 'Beginner', since, games: p?.games };
}

/** Turns a stored match (player ids) into something the cards can draw (names + levels). */
function toView(s: State, m: Match): MatchView {
  const member = (id: number) => memberOf(s, id, m.stage === 'playing' || m.stage === 'finished');
  return {
    id: m.id, round: m.round, stage: m.stage, queueNo: m.queueNo, winner: m.winner,
    team1: m.team1.map(member), team2: m.team2.map(member), mixed: matchIsMixed(s, m), manual: !!m.manual,
  };
}

export default function LiveScreen() {
  // Web: the court animations redraw through React every frame. While another tab is
  // showing, Live is paused (not drawn) so switching tabs stays instant.
  const focused = useIsFocused();
  if (Platform.OS === 'web' && !focused) return <View style={{ flex: 1 }} />;
  return (
    <View style={{ flex: 1 }}>
      <SwapProvider>
        <LiveContent />
      </SwapProvider>
      <StartGate />
    </View>
  );
}

/** Before "Start Game": Live is blurred and nothing runs, so every wait timer starts at the same moment. */
function StartGate() {
  const C = useColors();
  const s = useStore();
  if (s.started) return null;
  const n = s.players.length;
  const need = playersToStart(s);
  const short = need - n;
  return (
    <FrostedCover>
      <Glass strong radius={20} style={{ width: '100%', maxWidth: 380, padding: 22, gap: 14, alignItems: 'center' }}>
        <Text style={{ color: C.text, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>Ready to play?</Text>
        <Text style={{ color: C.muted, fontSize: 14, textAlign: 'center' }}>
          {short > 0
            ? `You need at least ${need} players to start (${n} added). Add ${short} more in Admin.`
            : `${n} players ready. Every wait timer starts at the same moment.`}
        </Text>
        <Button title="Start Game" onPress={startGame} disabled={short > 0} style={{ alignSelf: 'stretch' }} />
      </Glass>
    </FrostedCover>
  );
}

function LiveContent() {
  const C = useColors();
  const wide = useWindowDimensions().width >= 900;
  const s = useStore();
  const swap = useSwap();
  const dragging = useIsDragging();
  const [confirm, setConfirm] = useState<{ match: MatchView; team: 1 | 2 } | null>(null);
  const [picking, setPicking] = useState<{ team: 1 | 2; index: number } | null>(null);
  const [search, setSearch] = useState('');

  const onCourt = s.matches.filter((m) => m.stage === 'playing' || m.stage === 'finished');
  const queued = s.matches.filter((m) => m.stage === 'queued').sort((a, b) => (a.queueNo ?? 0) - (b.queueNo ?? 0));
  const proposed = s.matches.filter((m) => m.stage === 'proposed').sort((a, b) => a.round - b.round || a.id - b.id);

  // Every open court is shown; closed courts only while their match is still on.
  const items: CourtItem[] = s.courts
    .filter((c) => !c.closed || onCourt.some((m) => m.courtId === c.court_id))
    .map((c) => {
      const m = onCourt.find((x) => x.courtId === c.court_id);
      return { key: c.court_id, name: c.name, match: m ? toView(s, m) : undefined };
    });

  const waiting: WaitingItem[] = freePlayers(s)
    .map((p) => ({
      player_id: p.player_id, name: p.name, level: p.level, games: p.games, priority: p.carryOver, waitingSince: p.waitingSince,
      since: s.started ? p.waitingSince : undefined,
      // Already played this round: they wait for the next one.
      nextRound: s.started && p.lastDoneRound >= s.round ? s.round + 1 : undefined,
    }))
    // priority first, then fewest games, then whoever has waited longest
    .sort((a, b) => Number(b.priority) - Number(a.priority) || a.games - b.games || a.waitingSince - b.waitingSince);

  const playing = onCourt.length;
  const summary = `Round ${s.round} · ${playing} ${playing === 1 ? 'match' : 'matches'} on court · ${waiting.length} waiting`;

  // Build a match: seats → names and levels.
  const seatCount = draftSeatCount(s);
  const seatView = (ids: (number | null)[]) => ids.map((id) => (id == null ? null : memberOf(s, id)));
  const draftSeats: DraftSeats = { team1: seatView(s.draft.team1), team2: seatView(s.draft.team2) };
  const levelsOf = (ms: (Member | null)[]) => ms.slice(0, seatCount).filter((m): m is Member => !!m).map((m) => m.level);
  const draftFull = [...draftSeats.team1.slice(0, seatCount), ...draftSeats.team2.slice(0, seatCount)].every(Boolean);
  const draftMixed = draftFull && isMixedLevels(levelsOf(draftSeats.team1), levelsOf(draftSeats.team2));

  const q = search.trim().toLowerCase();
  const pickList = q ? waiting.filter((p) => p.name.toLowerCase().includes(q)) : waiting;
  function closePicker() { setPicking(null); setSearch(''); }
  function pick(playerId: number) {
    if (!picking) return;
    const { team, index } = picking;
    closePicker();
    const seat = (team === 1 ? s.draft.team1 : s.draft.team2)[index];
    const warning = gamesWarning({ kind: 'pool', playerId }, { kind: 'draft', team, index, playerId: seat });
    if (!warning) { setDraftSeat(team, index, playerId); return; }
    Alert.alert('Already played', warning, [
      { text: 'Wait', style: 'cancel' },
      { text: 'Replace', onPress: () => setDraftSeat(team, index, playerId) },
    ]);
  }
  const pickingCurrent = picking ? (picking.team === 1 ? s.draft.team1 : s.draft.team2)[picking.index] : null;

  const names = (m: MatchView, team: 1 | 2) => (team === 1 ? m.team1 : m.team2).map((p) => p.name).join(' & ');

  const editBar = swap.editMode ? (
    <List>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
        <EditButton />
        <Text style={{ flex: 1, color: C.text, fontSize: 14 }}>
          Edit mode is on. Tap two players to swap them, or press and hold one and drag onto another. Results are turned off.
        </Text>
      </View>
    </List>
  ) : null;

  const courtsSection = (
    <Section title={`${items.length} ${items.length === 1 ? 'Court' : 'Courts'}`}>
      <CourtGrid C={C} items={items} onTeamPress={(match, team) => setConfirm({ match, team })} />
    </Section>
  );
  const queueSection = (
    <View style={{ gap: 28 }}>
      <Section title="Queue" count={queued.length}>
        {queued.length === 0 ? (
          <List><EmptyText>No queues yet. Press Ready on a proposed match.</EmptyText></List>
        ) : (
          <Grid min={340}>{queued.map((m) => <MatchCard key={m.id} C={C} match={toView(s, m)} />)}</Grid>
        )}
      </Section>
      <Section title="Proposed matches" count={proposed.length}>
        {proposed.length === 0 ? (
          <List><EmptyText>{s.players.length < 4 ? 'Add players in Admin to get matches.' : 'Waiting for enough players of nearby levels.'}</EmptyText></List>
        ) : (
          <Grid min={340}>{proposed.map((m) => <MatchCard key={m.id} C={C} match={toView(s, m)} onReady={() => readyMatch(m.id)} />)}</Grid>
        )}
        <DraftCard
          C={C}
          seats={draftSeats}
          seatCount={seatCount}
          mixed={draftMixed}
          onPickSeat={(team, index) => setPicking({ team, index })}
          onRemove={(team, index) => setDraftSeat(team, index, null)}
          onCreate={() => createDraftMatch()}
          onClear={clearDraft}
          onRandom={randomFillDraft}
          canRandom={waiting.length > 0 || draftFull}
        />
      </Section>
      <Section title="Waiting" count={waiting.length} footer="Press and hold a player to drag them onto someone in a match.">
        <WaitingPool C={C} players={waiting} />
      </Section>
    </View>
  );

  return (
    <Screen title="Live" subtitle={summary} scrollEnabled={!dragging} overlay={<SwapOverlay />} scrollBind={swap.scrollBind}>
      {editBar}
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

      <Dialog
        visible={picking !== null}
        onClose={closePicker}
        title={picking ? `Choose a player for Team ${picking.team === 1 ? 'A' : 'B'}` : ''}
        subtitle="Search by name, then tap a player."
        actions={
          <>
            {pickingCurrent != null ? (
              <Button title="Empty this seat" variant="plainDestructive" onPress={() => { if (picking) setDraftSeat(picking.team, picking.index, null); closePicker(); }} />
            ) : null}
            <View style={{ flex: 1 }} />
            <Button title="Cancel" variant="secondary" onPress={closePicker} />
          </>
        }
      >
        <TextField placeholder="Search by name" value={search} onChangeText={setSearch} autoCorrect={false} autoFocus clearButtonMode="while-editing" />
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          <List>
            {pickList.length === 0 ? (
              <EmptyText>{waiting.length === 0 ? 'Nobody is waiting.' : 'No waiting player matches that name.'}</EmptyText>
            ) : (
              pickList.map((p, i) => (
                <ListRow
                  key={p.player_id}
                  title={p.name}
                  level={p.level}
                  subtitle={[`${p.games} ${p.games === 1 ? 'game' : 'games'}`, p.priority ? 'Priority' : '', p.nextRound ? `Waiting for Round ${p.nextRound}` : ''].filter(Boolean).join(' · ')}
                  wait={p.since}
                  onPress={() => pick(p.player_id)}
                  last={i === pickList.length - 1}
                />
              ))
            )}
          </List>
        </ScrollView>
      </Dialog>

      <Dialog
        visible={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? `(${names(confirm.match, confirm.team)}) won the game?` : ''}
        actions={
          <>
            <Button title="No" variant="secondary" onPress={() => setConfirm(null)} style={{ flex: 1 }} />
            <Button
              title="Yes"
              onPress={() => { if (confirm) recordWinner(confirm.match.id, confirm.team); setConfirm(null); }}
              style={{ flex: 1 }}
            />
          </>
        }
      />
    </Screen>
  );
}
