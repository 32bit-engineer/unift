// Dedicated Docker workspace sidebar — shown when the user is in a Docker workspace.
// Contains: session indicator, workspace type switcher, Docker nav items (Dashboard,
// Containers, Images).
import {
  SidebarShell,
  SessionIndicator,
  WorkspaceTypeSwitcher,
  SectionLabel,
  NavButton,
} from './SidebarShell';
import type { NavItem } from './SidebarShell';
import type { WorkspaceType } from '@/utils/remoteConnectionAPI';

const DOCKER_NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Containers',
    items: [
      { id: 'ws-docker-dashboard',   label: 'Dashboard',  icon: 'dashboard' },
      { id: 'ws-docker-containers',  label: 'Containers', icon: 'view_in_ar' },
      { id: 'ws-docker-images',      label: 'Images',     icon: 'layers' },
    ],
  },
  {
    label: 'Networking',
    items: [
      { id: 'ws-docker-networks',    label: 'Networks',   icon: 'hub' },
    ],
  },
  {
    label: 'Storage',
    items: [
      { id: 'ws-docker-volumes',     label: 'Volumes',    icon: 'hard_drive' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'ws-docker-compose',     label: 'Compose',    icon: 'description' },
    ],
  },
  {
    label: 'Observability',
    items: [
      { id: 'ws-docker-monitoring',  label: 'Monitoring', icon: 'monitoring' },
      { id: 'ws-docker-logs',        label: 'Logs',       icon: 'list_alt' },
    ],
  },
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
  return (
    <SidebarShell>
      <SessionIndicator sessionName={sessionName} onBack={onBack} />
      <WorkspaceTypeSwitcher
        currentType="docker"
        availableTypes={availableTypes}
        onSwitch={onSwitchType}
      />
      {DOCKER_NAV_SECTIONS.map(section => (
        <div key={section.label}>
          <SectionLabel>{section.label}</SectionLabel>
          <div className="flex flex-col gap-0.5 px-1">
            {section.items.map(item => (
              <NavButton
                key={item.id}
                item={item}
                isActive={activeItem === item.id}
                onClick={() => onSelectItem(item.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </SidebarShell>
  );
}
