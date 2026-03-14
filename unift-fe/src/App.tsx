import {
  LoginPage,
  FileBrowserPage,
  UploadPanelPage,
  MediaPlayerPage,
  TransferHistoryPage,
  AdminPermissionsPage,
  HomePage,
} from '@/pages';
import './App.css';

type Page =
  | 'home'
  | 'login'
  | 'browser'
  | 'upload'
  | 'player'
  | 'history'
  | 'admin';

function App() {
  const currentPage = (
    new URLSearchParams(window.location.search).get('page') ?? 'home'
  ) as Page;

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage />;
      case 'browser':
        return <FileBrowserPage />;
      case 'upload':
        return <UploadPanelPage />;
      case 'player':
        return <MediaPlayerPage />;
      case 'history':
        return <TransferHistoryPage />;
      case 'admin':
        return <AdminPermissionsPage />;
      case 'login':
      default:
        return <LoginPage />;
    }
  };

  return <div className="dark">{renderPage()}</div>;
}

export default App;
