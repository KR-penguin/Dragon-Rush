import { JOB_IDS } from '@dragon-rush/engine';
import type { CSSProperties } from 'react';
import { JobArt } from '../components/icons/Art';
import { AssetImage } from '../components/common/AssetImage';
import { GameIcon } from '../components/icons/GameIcon';
import { JOB_LABEL, seatColor } from '../types/labels';

interface HomePageProps {
  onLocal: () => void;
  onOnline: () => void;
}

export function HomePage({ onLocal, onOnline }: HomePageProps) {
  return (
    <main className="home">
      <div className="home-embers" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <div className="home-hero">
        <div className="home-dragon-wrap">
          <span className="home-dragon-glow" aria-hidden="true" />
          <AssetImage
            path="images/brand/dragon-head-v2.png"
            alt="용의 머리"
            className="home-dragon"
            fallback={<GameIcon name="dragon" />}
          />
        </div>
        <h1 className="home-title">
          <AssetImage
            path="images/brand/dragon-rush-wordmark.png"
            alt="드래곤 러쉬"
            className="home-title-art"
            fallback={<span className="home-title-ko">드래곤 러쉬</span>}
          />
          <span className="home-title-en">DRAGON RUSH</span>
        </h1>
        <p className="home-tagline">룰렛을 돌려 강해지고, 결투에서 살아남아, 용을 쓰러뜨려라.</p>
        <ul className="home-jobs" aria-label="직업">
          {JOB_IDS.map((j, i) => (
            <li
              key={j}
              style={{ '--seat-color': seatColor(i) } as CSSProperties}
              title={JOB_LABEL[j]}
            >
              <JobArt job={j} className="home-job-art" />
              <span>{JOB_LABEL[j]}</span>
            </li>
          ))}
        </ul>
      </div>
      <nav className="home-menu">
        <button type="button" className="menu-card" onClick={onLocal}>
          <span className="menu-icon">
            <GameIcon name="local" />
          </span>
          <strong>로컬 게임</strong>
          <small>한 화면에서 친구·봇과 2~4인 대전</small>
        </button>
        <button type="button" className="menu-card" onClick={onOnline}>
          <span className="menu-icon">
            <GameIcon name="online" />
          </span>
          <strong>온라인 게임</strong>
          <small>방 코드로 모여 함께 플레이</small>
        </button>
      </nav>
      <footer className="home-credits">
        아이콘:{' '}
        <a href="https://game-icons.net/" target="_blank" rel="noreferrer">
          game-icons.net
        </a>{' '}
        (Lorc, Delapouite 외 기여자,{' '}
        <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
          CC BY 3.0
        </a>
        ) · 글꼴: Hahmlet, Black Han Sans, Noto Sans KR, Gowun Batang (SIL OFL 1.1)
      </footer>
    </main>
  );
}
