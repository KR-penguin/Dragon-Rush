import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { onlineLobbyStore, type OnlineLobbyStore } from '../store/onlineLobbyStore';
import {
  buildRoomView,
  nicknameError,
  roomCodeError,
  seatChoiceGroups,
} from '../types/onlineLobby';

/** Online lobby state for the Online page; connects on mount (which also resumes a previous room). */
export function useOnlineLobby(store: OnlineLobbyStore = onlineLobbyStore) {
  const state = useStore(store);
  const { room, playerId, models, nickname, joinCode } = state;

  useEffect(() => {
    void store.getState().connect();
  }, [store]);

  const view = useMemo(
    () => (room && playerId ? buildRoomView(room, playerId) : null),
    [room, playerId],
  );
  const seatGroups = useMemo(() => seatChoiceGroups(models), [models]);

  const actions = store.getState();
  return {
    connection: state.connection,
    resumeCode: state.resumeCode,
    busy: state.pending > 0,
    error: state.error,
    nickname,
    nicknameError: nicknameError(nickname),
    joinCode,
    joinCodeError: roomCodeError(joinCode),
    view,
    seatGroups,
    setNickname: actions.setNickname,
    setJoinCode: actions.setJoinCode,
    clearError: actions.clearError,
    connect: actions.connect,
    disconnect: actions.disconnect,
    createRoom: actions.createRoom,
    joinRoom: actions.joinRoom,
    leaveRoom: actions.leaveRoom,
    setMaxRounds: actions.setMaxRounds,
    configureSeat: actions.configureSeat,
    selectJob: actions.selectJob,
    setReady: actions.setReady,
    start: actions.start,
    rematch: actions.rematch,
    openGame: actions.openGame,
  };
}

export type OnlineLobby = ReturnType<typeof useOnlineLobby>;
