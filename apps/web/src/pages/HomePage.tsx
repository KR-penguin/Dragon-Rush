import { JOB_IDS } from '@hero-dice/engine';
import { DRAGON_IMAGE_PATH } from '../types/assetPaths';
import { DRAGON_ICON, JOB_ICON } from '../types/labels';
import { AssetImage } from '../components/common/AssetImage';

interface HomePageProps {
  onLocal: () => void;
  onOnline: () => void;
}

export function HomePage({ onLocal, onOnline }: HomePageProps) {
  return (
    <main className="home">
      <div className="home-hero">
        <AssetImage
          className="home-dragon"
          path={DRAGON_IMAGE_PATH}
          fallback={DRAGON_ICON}
          alt="용"
        />
        <h1 className="home-title">용사의 주사위</h1>
        <p className="home-tagline">주사위를 굴려 강해지고, 결투에서 살아남아, 용을 쓰러뜨려라.</p>
        <div className="home-jobs" aria-hidden="true">
          {JOB_IDS.map((j) => (
            <span key={j}>{JOB_ICON[j]}</span>
          ))}
        </div>
      </div>
      <nav className="home-menu">
        <button type="button" className="menu-card" onClick={onLocal}>
          <span className="menu-icon">🏰</span>
          <strong>로컬 게임</strong>
          <small>한 화면에서 친구·봇과 2~4인 대전</small>
        </button>
        <button type="button" className="menu-card" onClick={onOnline}>
          <span className="menu-icon">🌐</span>
          <strong>온라인 게임</strong>
          <small>방 코드로 모여 함께 플레이</small>
        </button>
      </nav>
    </main>
  );
}
