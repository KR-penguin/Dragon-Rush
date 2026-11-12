import { useId, type FormEvent } from 'react';
import { NICKNAME_MAX, ROOM_CODE_LENGTH } from '../../types/onlineLobby';
import { GameIcon } from '../icons/GameIcon';

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

/** Nickname tag plus the "방 만들기" / "방 참가" wooden menu cards. */
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
  const ids = useId();
  const canEnter = ready && nicknameError === null && resumeCode === null;
  const codeComplete = joinCode.length === ROOM_CODE_LENGTH;
  const showNickError = nickname !== '' && nicknameError !== null;
  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    if (canEnter && joinCodeError === null) onJoin();
  };

  return (
    <div className="lobby-connect">
      {resumeCode && (
        <p className="lobby-resume" role="status">
          <GameIcon name="cooldown" className="lobby-resume-icon" />
          <span>
            이전 방 <strong>{resumeCode}</strong>(으)로 돌아가는 중…
          </span>
        </p>
      )}

      <section className="lobby-nick parchment">
        <label className="lobby-field">
          <span className="lobby-field-label">
            <GameIcon name="human" /> 닉네임
          </span>
          <input
            value={nickname}
            maxLength={NICKNAME_MAX}
            placeholder={`1~${NICKNAME_MAX}자`}
            autoComplete="nickname"
            aria-invalid={showNickError}
            aria-describedby={`${ids}-nick-hint`}
            onChange={(e) => onNickname(e.target.value)}
          />
        </label>
        <p id={`${ids}-nick-hint`} className={`lobby-hint${showNickError ? ' is-error' : ''}`}>
          {showNickError
            ? nicknameError
            : '다른 플레이어에게 보이는 이름입니다. 이 브라우저에 저장됩니다.'}
        </p>
      </section>

      <div className="lobby-entry">
        <section className="lobby-entry-card">
          <span className="menu-icon" aria-hidden="true">
            <GameIcon name="castle" />
          </span>
          <h2>방 만들기</h2>
          <p className="lobby-entry-text">방장이 되어 좌석과 봇을 정하고 친구를 초대합니다.</p>
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

        <form className="lobby-entry-card" onSubmit={submitJoin}>
          <span className="menu-icon" aria-hidden="true">
            <GameIcon name="key" />
          </span>
          <h2>방 참가</h2>
          <label className="lobby-field lobby-code-field">
            <span className="lobby-field-label">방 코드 ({ROOM_CODE_LENGTH}자리)</span>
            <input
              value={joinCode}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABC234"
              aria-invalid={codeComplete && joinCodeError !== null}
              aria-describedby={codeComplete && joinCodeError ? `${ids}-code-hint` : undefined}
              onChange={(e) => onJoinCode(e.target.value)}
            />
          </label>
          {codeComplete && joinCodeError && (
            <p id={`${ids}-code-hint`} className="lobby-hint is-error">
              {joinCodeError}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-lg"
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
