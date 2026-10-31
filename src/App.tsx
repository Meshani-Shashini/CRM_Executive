import { useEffect, useState } from 'react';
import { AppProvider } from './store/AppContext';
import Sidebar, { type NavKey } from './components/Sidebar';
import Topbar from './components/Topbar';
import DashboardPage from './pages/DashboardPage';
import LeadsPage from './pages/LeadsPage';
import ClientsPage from './pages/ClientsPage';
import DealsPage from './pages/DealsPage';
import InvoicesPage from './pages/InvoicesPage';
import PaymentsPage from './pages/PaymentsPage';
import QSlipsPage from './pages/QSlipsPage';
import MiraPage from './pages/MiraPage';
import SettingsPage from './pages/SettingsPage';
import CalendarPage from './pages/CalendarPage';
import Placeholder from './pages/Placeholder';
import PipelinesPage from './pages/PipelinesPage';
import FunnelsPage from './pages/FunnelsPage';
import LoginPage from './pages/LoginPage';
import { useApp } from './store/AppContext';
import type { Role } from './types';

const accessMap: Record<NavKey, Role[]> = {
  dashboard: ['admin', 'sales', 'finance'],
  plans: ['admin', 'sales'],
  leads: ['admin', 'sales'],
  deals: ['admin', 'sales'],
  clients: ['admin', 'sales', 'finance', 'client'],
  calendar: ['admin', 'sales'],
  reports: ['admin', 'finance'],
  documents: ['admin', 'sales', 'finance', 'client'],
  quotations: ['admin', 'sales'],
  qslips: ['admin', 'sales'],
  'internal-slips': ['admin', 'sales'],
  invoices: ['admin', 'finance', 'client'],
  payments: ['admin', 'finance', 'client'],
  'pay-requests': ['admin', 'finance'],
  renewals: ['admin', 'sales'],
  'info-requests': ['admin', 'sales'],
  'rate-cards': ['admin', 'sales'],
  settings: ['admin'],
  funnels: ['admin', 'sales', 'finance'],
  pipelines: ['admin', 'sales'],
  targets: ['admin'],
  'audit-log': ['admin'],
  mira: ['admin', 'finance'],
};

function pageFromHash(hash: string): NavKey | null {
  const candidate = hash.replace(/^#\/?/, '').split('?')[0];
  return Object.prototype.hasOwnProperty.call(accessMap, candidate)
    ? candidate as NavKey
    : null;
}

const placeholders: Partial<Record<NavKey, { title: string; subtitle: string }>> = {
  plans: { title: 'My Plans', subtitle: 'Sales targets and personal plan tracking.' },
  reports: { title: 'Reports', subtitle: 'Custom brokerage performance reports.' },
  documents: { title: 'Documents', subtitle: 'Policy documents, endorsements and certificates.' },
  quotations: { title: 'Quotations', subtitle: 'Track quotations issued to clients and insurers.' },
  'internal-slips': { title: 'Internal Slips', subtitle: 'Internal underwriting slips and cover notes.' },
  'pay-requests': { title: 'Payment Requests', subtitle: 'Outbound payment requests to finance.' },
  renewals: { title: 'Renewals', subtitle: 'Upcoming policy renewals with 30/60/90 day tracking.' },
  'info-requests': { title: 'Info Requests', subtitle: 'Requests for additional underwriting information.' },
  'rate-cards': { title: 'Commission Rate Cards', subtitle: 'Insurer commission and brokerage rate cards.' },
  targets: { title: 'Targets', subtitle: 'Monthly and annual targets for sales staff.' },
};

function Shell() {
  const { user, authLoading, hasAccess, persistenceError } = useApp();
  const [page, setPage] = useState<NavKey>(() => pageFromHash(window.location.hash) ?? 'dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const syncPageFromHash = () => {
      const nextPage = pageFromHash(window.location.hash);
      if (nextPage) {
        setPage(nextPage);
        return;
      }

      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#/dashboard`,
      );
      setPage('dashboard');
    };

    syncPageFromHash();
    window.addEventListener('hashchange', syncPageFromHash);
    return () => window.removeEventListener('hashchange', syncPageFromHash);
  }, []);

  if (authLoading) {
    return <div className="flex h-screen items-center justify-center bg-ink-950 text-sm text-muted">Checking your session…</div>;
  }
  if (!user.id) return <LoginPage />;

  const renderPage = () => {
    if (!hasAccess(accessMap[page])) {
      return (
        <Placeholder
          title="Access Restricted"
          subtitle="Your account role does not have permission to view this module. Contact a System Admin if you need access."
        />
      );
    }
    switch (page) {
      case 'dashboard': return <DashboardPage />;
      case 'leads': return <LeadsPage />;
      case 'clients': return <ClientsPage />;
      case 'deals': return <DealsPage />;
      case 'invoices': return <InvoicesPage />;
      case 'payments': return <PaymentsPage />;
      case 'qslips': return <QSlipsPage />;
      case 'mira': return <MiraPage />;
      case 'settings': return <SettingsPage />;
      case 'audit-log': return <SettingsPage initialTab="audit" />;
      case 'calendar': return <CalendarPage />;
      case 'pipelines': return <PipelinesPage />;
      case 'funnels': return <FunnelsPage />;
      default: {
        const p = placeholders[page];
        return <Placeholder title={p?.title ?? 'Module'} subtitle={p?.subtitle ?? 'Coming soon.'} />;
      }
    }
  };

  return (
    <div className="flex h-screen bg-ink-950 overflow-hidden">
      <Sidebar active={page} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar page={page} onMenu={() => setSidebarOpen(true)} />
        {persistenceError && <div role="alert" className="border-b border-hot/30 bg-hot/10 px-4 py-2 text-sm text-hot">{persistenceError}</div>}
        <main className={`flex-1 overflow-y-auto p-4 lg:p-6 animate-fadeIn ${page === 'leads' ? '!pt-1 lg:!pt-2' : ''}`}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
