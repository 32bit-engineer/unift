// Dedicated SSH workspace sidebar — shown when the user is in an SSH workspace.
// Contains: session indicator, workspace type switcher, SSH nav items (Overview,
// Terminal, File Browser, Monitoring, Logs).
import { useMemo } from 'react';
import {
  SidebarShell,
  SessionIndicator,
  WorkspaceTypeSwitcher,
  SectionLabel,
  NavButton,
} from './SidebarShell';
import type { NavItem } from './SidebarShell';
import type { WorkspaceType } from '@/utils/remoteConnectionAPI';

const SSH_NAV: NavItem[] = [
  { id: 'ws-overview',  label: 'Overview',      icon: 'dashboard' },
];

const OBSERVABILITY_NAV: NavItem[] = [
  { id: 'ws-monitoring', label: 'Monitoring', icon: 'monitoring' },
  { id: 'ws-logs',       label: 'Logs',       icon: 'list_alt' },
];

interface SshWorkspaceSidebarProps {
  sessionName: string;
  activeItem: string;
  onSelectItem: (id: string) => void;
  onBack: () => void;
  availableTypes: WorkspaceType[];
  onSwitchType: (type: WorkspaceType) => void;
}

export function SshWorkspaceSidebar({
  sessionName,
  activeItem,
  onSelectItem,
  onBack,
  availableTypes,
  onSwitchType,
}: SshWorkspaceSidebarProps) {
  const navItems = useMemo(() => [...SSH_NAV], []);
  const obsItems = useMemo(() => [...OBSERVABILITY_NAV], []);

  return (
    <SidebarShell>
      <SessionIndicator sessionName={sessionName} onBack={onBack} />
      <WorkspaceTypeSwitcher
        currentType="ssh"
        availableTypes={availableTypes}
        onSwitch={onSwitchType}
      />
      <SectionLabel>Workspace</SectionLabel>
      <div className="flex flex-col gap-0.5 px-1">
        {navItems.map(item => (
          <NavButton
            key={item.id}
            item={item}
            isActive={activeItem === item.id}
            onClick={() => onSelectItem(item.id)}
          />
        ))}
      </div>

      <SectionLabel>Observability</SectionLabel>
      <div className="flex flex-col gap-0.5 px-1">
        {obsItems.map(item => (
          <NavButton
            key={item.id}
            item={item}
            isActive={activeItem === item.id}
            onClick={() => onSelectItem(item.id)}
          />
        ))}
      </div>
    </SidebarShell>
  );
}
