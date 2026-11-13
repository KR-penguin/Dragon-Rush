import { lazy, Suspense, useLayoutEffect, type ReactNode } from 'react';
import { useBgm } from './hooks/useAudio';
import { useNavActions, useRoute } from './hooks/useNav';
import { useMotionAttributes } from './hooks/useReducedMotion';
import { HomePage } from './pages/HomePage';

const GamePage = lazy(() =>
  import('./pages/GamePage').then((page) => ({ default: page.GamePage })),
);
const LocalSetupPage = lazy(() =>
  import('./pages/LocalSetupPage').then((page) => ({ default: page.LocalSetupPage })),
);
const OnlinePage = lazy(() =>
  import('./pages/OnlinePage').then((page) => ({ default: page.OnlinePage })),
);

/** State-based navigation: Home → LocalSetup / Online → Game. */
export function App() {
  const route = useRoute();
  const nav = useNavActions();
  const routeKey = route.page === 'game' ? `game-${route.session.id}` : route.page;
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);
  useBgm(route.page === 'game' ? undefined : 'lobby');
  useMotionAttributes();

  let content: ReactNode;
  switch (route.page) {
    case 'home':
      content = <HomePage onLocal={() => nav.go('localSetup')} onOnline={() => nav.go('online')} />;
      break;
    case 'localSetup':
      content = <LocalSetupPage onBack={() => nav.go('home')} />;
      break;
    case 'online':
      content = <OnlinePage onBack={() => nav.go('home')} />;
      break;
    case 'game': {
      const { session } = route;
      content = (
        <GamePage
          key={session.id}
          session={session}
          onExit={() => nav.go(session.exitTo)}
          onRestart={session.restart ? nav.restartGame : null}
        />
      );
      break;
    }
  }
  return (
    <Suspense
      fallback={
        <main className="game-loading" role="status">
          게임을 불러오는 중…
        </main>
      }
    >
      {content}
    </Suspense>
  );
}
