import { isPortalV2Enabled } from '@/lib/portal/portal-v2-flag';
import PortalHeader          from './PortalHeader';
import PortalSidebarV2Client from './PortalSidebarV2Client';

export interface PortalShellProps {
  orgId: string;                          // portal_email — PK of organizations
  token: string;
  businessName: string;
  logoUrl?: string | null;
  hasOpsAgent: boolean;
  showOutbound: boolean;
  isOwner?: boolean;
  modules?: string[];
  minutesRemain?: number | null;
  minutesIncluded?: number | null;
  headerActions?: React.ReactNode;        // right slot of V2 header
  main: React.ReactNode;                  // page content
}

/**
 * Server component that conditionally renders the V2 navigation shell.
 *
 * When portal_v2_enabled is ON for the org: renders PortalHeader + PortalSidebarV2Client
 * wrapped around `main`.
 *
 * When OFF: returns null — the calling page keeps its own V1 header + PortalSidebar.
 */
export default async function PortalShell(props: PortalShellProps): Promise<React.JSX.Element | null> {
  const {
    orgId,
    token,
    businessName,
    logoUrl,
    hasOpsAgent,
    showOutbound,
    isOwner,
    modules,
    minutesRemain,
    minutesIncluded,
    headerActions,
    main,
  } = props;

  const v2Enabled = await isPortalV2Enabled(orgId);
  if (!v2Enabled) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader businessName={businessName} logoUrl={logoUrl ?? null}>
        {headerActions}
      </PortalHeader>
      <div className="flex flex-1">
        <PortalSidebarV2Client
          token={token}
          hasOpsAgent={hasOpsAgent}
          showOutbound={showOutbound}
          isOwner={isOwner ?? true}
          modules={modules}
          status={{
            minutesRemain:   minutesRemain ?? null,
            minutesIncluded: minutesIncluded ?? null,
          }}
        />
        <main className="flex-1 min-w-0">{main}</main>
      </div>
    </div>
  );
}
