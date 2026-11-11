import type { FormEvent } from 'react';
import { NICKNAME_MAX, ROOM_CODE_LENGTH } from '../../types/onlineLobby';

interface ConnectPanelProps {
  nickname: string;
  nicknameError: string | null;
  joinCode: string;
  joinCodeError: string | null;
  /** Connected and no command in flight. */
  ready: boolean;
  resumeCode: string | null;
  onNickname: (value: string) => void;
  onJoinCode: (value: string) => void;
  onCreate: () => void;
  onJoin: () => void;
}

/** Nickname plus "방 만들기" / "방 참가". */
export function ConnectPanel({
  nickname,
  nicknameError,
  joinCode,
  joinCodeError,
  ready,
  resumeCode,
  onNickname,
  onJoinCode,
  onCreate,
  onJoin,
}: ConnectPanelProps) {
  const canEnter = ready && nicknameError === null && resumeCode === null;
  const codeComplete = joinCode.length === ROOM_CODE_LENGTH;
  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    if (canEnter && joinCodeError === null) onJoin();
  };

  return (
    <div className="lobby-connect">
      {resumeCode && (
        <p className="lobby-resume" role="status">
          이전 방 <strong>{resumeCode}</strong>(으)로 돌아가는 중…
        </p>
      )}

      <section className="panel lobby-nick">
        <label className="field">
          <span>닉네임</span>
          <input
            value={nickname}
            maxLength={NICKNAME_MAX}
            placeholder={`1~${NICKNAME_MAX}자`}
            autoComplete="nickname"
            aria-invalid={nickname !== '' && nicknameError !== null}
            onChange={(e) => onNickname(e.target.value)}
          />
        </label>
        <p className={`lobby-hint${nickname !== '' && nicknameError ? ' is-error' : ''}`}>
          {nickname !== '' && nicknameError
            ? nicknameError
            : '다른 플레이어에게 보이는 이름입니다. 이 브라우저에 저장됩니다.'}
        </p>
      </section>

      <div className="lobby-entry">
        <section className="panel lobby-entry-card">
          <span className="menu-icon" aria-hidden="true">
            🏰
          </span>
          <h2>방 만들기</h2>
          <p className="muted">방장이 되어 좌석과 봇을 정하고 친구를 초대합니다.</p>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!canEnter}
            title={nicknameError ?? undefined}
            onClick={onCreate}
          >
            방 만들기
          </button>
        </section>

        <form className="panel lobby-entry-card" onSubmit={submitJoin}>
          <span className="menu-icon" aria-hidden="true">
            🗝️
          </span>
          <h2>방 참가</h2>
          <label className="field lobby-code-field">
            <span>방 코드 ({ROOM_CODE_LENGTH}자리)</span>
            <input
              value={joinCode}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABC234"
              aria-invalid={codeComplete && joinCodeError !== null}
              onChange={(e) => onJoinCode(e.target.value)}
            />
          </label>
          {codeComplete && joinCodeError && <p className="lobby-hint is-error">{joinCodeError}</p>}
          <button
            type="submit"
            className="btn btn-lg"
            disabled={!canEnter || joinCodeError !== null}
            title={nicknameError ?? joinCodeError ?? undefined}
          >
            참가하기
          </button>
        </form>
      </div>
    </div>
  );
}
