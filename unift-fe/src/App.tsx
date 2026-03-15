
import './App.css';
import { AuthPage, HomePage } from '@/pages';
import { useAuthStore } from '@/store/authStore';

// ─── Page union — extend as features are added ─────────────────────────────
type Page = 'login' | 'home';

function getPage(): Page {
  const param = new URLSearchParams(window.location.search).get('page');
  if (param === 'home') return 'home';
  return 'login';
}

// ─── Router ────────────────────────────────────────────────────────────────
function renderPage(page: Page, isAuthenticated: boolean): React.ReactNode {
  if (!isAuthenticated && page !== 'login') {
    window.location.replace('?page=login');
    return null;
  }

  switch (page) {
    case 'login': return <AuthPage />;
    case 'home':  return <HomePage />;
  }
}

export function App() {
  const { isAuthenticated } = useAuthStore();
  const page = getPage();

  if (isAuthenticated && page === 'login') {
    window.location.replace('?page=home');
    return null;
  }

  return (
    <div className="dark">
      {renderPage(page, isAuthenticated)}
    </div>
  );
}

export default App;
