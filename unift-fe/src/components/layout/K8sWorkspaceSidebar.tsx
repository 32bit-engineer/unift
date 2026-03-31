// Dedicated Kubernetes workspace sidebar — shown when the user is in a K8s workspace.
// Groups navigation into WORKLOADS, NETWORKING, CONFIG, and CLUSTER sections.
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

const K8S_NAV_WORKLOADS: NavItem[] = [
  { id: 'ws-k8s-dashboard',    label: 'Dashboard',     icon: 'dashboard' },
  { id: 'ws-k8s-pods',         label: 'Pods',           icon: 'deployed_code' },
  { id: 'ws-k8s-deployments',  label: 'Deployments',   icon: 'rocket_launch' },
  { id: 'ws-k8s-statefulsets', label: 'StatefulSets',  icon: 'storage' },
  { id: 'ws-k8s-daemonsets',   label: 'DaemonSets',    icon: 'settings_suggest' },
];

const K8S_NAV_NETWORKING: NavItem[] = [
  { id: 'ws-k8s-services',  label: 'Services',  icon: 'hub' },
  { id: 'ws-k8s-ingresses', label: 'Ingresses', icon: 'lan' },
];

const K8S_NAV_CONFIG: NavItem[] = [
  { id: 'ws-k8s-configmaps', label: 'ConfigMaps', icon: 'text_snippet' },
];

const K8S_NAV_CLUSTER: NavItem[] = [
  { id: 'ws-k8s-nodes', label: 'Nodes', icon: 'dns' },
];

interface K8sWorkspaceSidebarProps {
  sessionName: string;
  activeItem: string;
  onSelectItem: (id: string) => void;
  onBack: () => void;
  availableTypes: WorkspaceType[];
  onSwitchType: (type: WorkspaceType) => void;
}

export function K8sWorkspaceSidebar({
  sessionName,
  activeItem,
  onSelectItem,
  onBack,
  availableTypes,
  onSwitchType,
}: K8sWorkspaceSidebarProps) {
  const sections = useMemo(() => [
    { label: 'Workloads',   items: K8S_NAV_WORKLOADS },
    { label: 'Networking',  items: K8S_NAV_NETWORKING },
    { label: 'Config',      items: K8S_NAV_CONFIG },
    { label: 'Cluster',     items: K8S_NAV_CLUSTER },
  ], []);

  return (
    <SidebarShell>
      <SessionIndicator sessionName={sessionName} onBack={onBack} />
      <WorkspaceTypeSwitcher
        currentType="kubernetes"
        availableTypes={availableTypes}
        onSwitch={onSwitchType}
      />
      {sections.map(section => (
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
