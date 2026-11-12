import { useState } from 'react';
import { Modal } from '../components/common/Modal';
import { ConnectionBadge } from '../components/lobby/ConnectionBadge';
import { ConnectPanel } from '../components/lobby/ConnectPanel';
import { LobbyError } from '../components/lobby/LobbyError';
import { LobbyFooter } from '../components/lobby/LobbyFooter';
import { RoomHeader } from '../components/lobby/RoomHeader';
import { RoomOptions } from '../components/lobby/RoomOptions';
import { RoomStatusBanner } from '../components/lobby/RoomStatusBanner';
import { SeatCard } from '../components/lobby/SeatCard';
import { useClipboard } from '../hooks/useClipboard';
import { useOnlineLobby } from '../hooks/useOnlineLobby';
import {
  inviteText,
  ONLINE_MAX_ROUND_OPTIONS,
  ROOM_STATUS_ICON,
  ROOM_STATUS_LABEL,
} from '../types/onlineLobby';
import '../styles/lobby.css';

interface OnlinePageProps {
  onBack: () => void;
}

/** Online play: connect (nickname, create / join by code), then the room lobby until the game starts. */
export function OnlinePage({ onBack }: OnlinePageProps) {
  const lobby = useOnlineLobby();
  const clipboard = useClipboard();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { view, busy } = lobby;
  const connected = lobby.connection === 'connected';

  const goHome = () => {
    lobby.disconnect();
    onBack();
  };
  const leave = () => {
    setConfirmLeave(false);
    void lobby.leaveRoom();
  };

  return (
    <main className="lobby">
      <header className="page-head lobby-head">
        {!view && (
          <button type="button" className="btn btn-ghost" onClick={goHome}>
            ← 처음으로
          </button>
        )}
        <div className="page-title">
          <span className="page-kicker">
            {view ? '원정대가 모이는 막사' : '방 코드로 모이는 원정대'}
          </span>
          <h1>온라인 게임</h1>
        </div>
        <ConnectionBadge status={lobby.connection} onRetry={() => void lobby.connect()} />
      </header>

      {lobby.error && <LobbyError message={lobby.error} onDismiss={lobby.clearError} />}

      {!view ? (
        <ConnectPanel
          nickname={lobby.nickname}
          nicknameError={lobby.nicknameError}
          joinCode={lobby.joinCode}
          joinCodeError={lobby.joinCodeError}
          ready={connected && !busy}
          resumeCode={lobby.resumeCode}
          onNickname={lobby.setNickname}
          onJoinCode={lobby.setJoinCode}
          onCreate={() => void lobby.createRoom()}
          onJoin={() => void lobby.joinRoom()}
        />
      ) : (
        <>
          <RoomHeader
            code={view.code}
            statusLabel={ROOM_STATUS_LABEL[view.status]}
            statusIcon={ROOM_STATUS_ICON[view.status]}
            hostName={view.hostName}
            codeCopied={clipboard.copied === 'code'}
            inviteCopied={clipboard.copied === 'invite'}
            busy={busy}
            onCopyCode={() => clipboard.copy('code', view.code)}
            onCopyInvite={() => clipboard.copy('invite', inviteText(view.code))}
            onLeave={() => (view.status === 'playing' ? setConfirmLeave(true) : leave())}
          />

          {view.status !== 'lobby' && (
            <RoomStatusBanner
              status={view.status}
              busy={busy || !connected}
              onOpenGame={lobby.openGame}
              onNewRoom={() => void lobby.createRoom()}
            />
          )}

          <RoomOptions
            isHost={view.isHost}
            editable={view.status === 'lobby' && connected}
            maxRounds={view.maxRounds}
            choices={ONLINE_MAX_ROUND_OPTIONS}
            activeCount={view.activeCount}
            onMaxRounds={(r) => void lobby.setMaxRounds(r)}
          />

          <div className="lobby-seats">
            {view.seats.map((seat) => (
              <SeatCard
                key={seat.seat}
                seat={seat}
                groups={lobby.seatGroups}
                disabled={!connected}
                onConfigure={(choice) => void lobby.configureSeat(seat.seat, choice)}
                onSelectJob={(job) => void lobby.selectJob(job, seat.isMe ? undefined : seat.seat)}
              />
            ))}
          </div>

          {view.status === 'lobby' && (
            <LobbyFooter
              isHost={view.isHost}
              hostName={view.hostName}
              me={view.me}
              start={view.start}
              busy={busy || !connected}
              onReady={(ready) => void lobby.setReady(ready)}
              onStart={() => void lobby.start()}
            />
          )}
        </>
      )}

      {confirmLeave && (
        <Modal
          className="modal-scroll"
          icon="exit"
          kicker="원정대 이탈"
          title="방에서 나갈까요?"
          onClose={() => setConfirmLeave(false)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmLeave(false)}
              >
                머무르기
              </button>
              <button type="button" className="btn btn-danger" onClick={leave}>
                나가기
              </button>
            </>
          }
        >
          <p>진행 중인 게임에서 나가면 남은 게임은 봇이 대신 플레이합니다.</p>
        </Modal>
      )}
    </main>
  );
}
