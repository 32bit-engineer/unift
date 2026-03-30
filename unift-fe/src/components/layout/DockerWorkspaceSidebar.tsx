// Dedicated Docker workspace sidebar — shown when the user is in a Docker workspace.
// Contains: session indicator, workspace type switcher, Docker nav items (Dashboard,
// Containers, Images).
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

const DOCKER_NAV: NavItem[] = [
  { id: 'ws-docker-dashboard',   label: 'Dashboard',  icon: 'dashboard' },
  { id: 'ws-docker-containers',  label: 'Containers', icon: 'view_in_ar' },
  { id: 'ws-docker-images',      label: 'Images',     icon: 'layers' },
];

interface DockerWorkspaceSidebarProps {
  sessionName: string;
  activeItem: string;
  onSelectItem: (id: string) => void;
  onBack: () => void;
  availableTypes: WorkspaceType[];
  onSwitchType: (type: WorkspaceType) => void;
}

export function DockerWorkspaceSidebar({
  sessionName,
  activeItem,
  onSelectItem,
  onBack,
  availableTypes,
  onSwitchType,
}: DockerWorkspaceSidebarProps) {
  const navItems = useMemo(() => [...DOCKER_NAV], []);

  return (
    <SidebarShell>
      <SessionIndicator sessionName={sessionName} onBack={onBack} />
      <WorkspaceTypeSwitcher
        currentType="docker"
        availableTypes={availableTypes}
        onSwitch={onSwitchType}
      />
      <SectionLabel>Docker</SectionLabel>
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
    </SidebarShell>
  );
}
