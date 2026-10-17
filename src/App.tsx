import { useState } from 'react';
import { Sidebar, TopBar } from '@/components/Shell';
import { type PageId } from '@/components/nav';
import { HudPage } from '@/pages/HudPage';
import { PipelinePage } from '@/pages/PipelinePage';
import { CompliancePage } from '@/pages/CompliancePage';
import { WorkspacePage } from '@/pages/WorkspacePage';

function App() {
  const [page, setPage] = useState<PageId>('hud');

  return (
    <div className="min-h-screen bg-base-bg text-slate-200 flex">
      {/* Ambient glow background */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 20% 0%, rgba(99,102,241,0.08), transparent), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(16,185,129,0.05), transparent)',
        }}
      />
      <div className="relative z-10 flex w-full">
        <Sidebar active={page} onSelect={setPage} />
        <div className="flex-1 min-w-0 flex flex-col">
          <TopBar />
          <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full">
            {page === 'hud' && <HudPage />}
            {page === 'pipeline' && <PipelinePage />}
            {page === 'compliance' && <CompliancePage />}
            {page === 'workspace' && <WorkspacePage />}
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
