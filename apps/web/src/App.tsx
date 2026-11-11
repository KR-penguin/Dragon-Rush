import { useBgm } from './hooks/useAudio';
import { useNavActions, useRoute } from './hooks/useNav';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
import { LocalSetupPage } from './pages/LocalSetupPage';
import { OnlinePage } from './pages/OnlinePage';

/** State-based navigation: Home → LocalSetup / Online → Game. */
export function App() {
  const route = useRoute();
  const nav = useNavActions();
  useBgm(route.page === 'game' ? undefined : 'lobby');

  switch (route.page) {
    case 'home':
      return <HomePage onLocal={() => nav.go('localSetup')} onOnline={() => nav.go('online')} />;
    case 'localSetup':
      return <LocalSetupPage onBack={() => nav.go('home')} />;
    case 'online':
      return <OnlinePage onBack={() => nav.go('home')} />;
    case 'game': {
      const { session } = route;
      return (
        <GamePage
          key={session.id}
          session={session}
          onExit={() => nav.go(session.exitTo)}
          onRestart={session.restart ? nav.restartGame : null}
        />
      );
    }
  }
}
