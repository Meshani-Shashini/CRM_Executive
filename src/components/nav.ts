import { LayoutDashboard, KanbanSquare, Globe2, FolderKanban, Radar, ShieldCheck } from 'lucide-react';

export type PageId = 'hud' | 'pipeline' | 'compliance' | 'workspace';

export interface NavItem {
  id: PageId;
  label: string;
  icon: typeof LayoutDashboard;
  hint: string;
}

export const navItems: NavItem[] = [
  { id: 'hud', label: 'Executive HUD', icon: LayoutDashboard, hint: 'Global wallboard' },
  { id: 'pipeline', label: 'Deals Pipeline', icon: KanbanSquare, hint: 'Kanban board' },
  { id: 'compliance', label: 'Jurisdiction & Compliance', icon: Globe2, hint: 'MIRA / GST config' },
  { id: 'workspace', label: 'Deal Workspace', icon: FolderKanban, hint: 'Three-pane CRM' },
];

export { LayoutDashboard, KanbanSquare, Globe2, FolderKanban, Radar, ShieldCheck };
