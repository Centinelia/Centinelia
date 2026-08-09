import PortalHeader          from './PortalHeader';
import PortalSidebarV2Client from './PortalSidebarV2Client';
import PortalMobileNav       from './PortalMobileNav';

export interface PortalShellProps {
  token: string;
  businessName: string;
  logoUrl?: string | null;
  hasOpsAgent: boolean;
  showOutbound: boolean;
  isOwner?: boolean;
  modules?: string[];
  minutesRemain?: number | null;
  minutesIncluded?: number | null;
  aiOpsUsed?: number | null;
  aiOpsLimit?: number | null;
  hasStripe?: boolean;
  accountSerial?: string | null;
  headerActions?: React.ReactNode;
  main: React.ReactNode;
}

export default function PortalShell(props: PortalShellProps): React.JSX.Element {
  const {
    token,
    businessName,
    logoUrl,
    hasOpsAgent,
    showOutbound,
    isOwner,
    modules,
    minutesRemain,
    minutesIncluded,
    aiOpsUsed,
    aiOpsLimit,
    hasStripe,
    accountSerial,
    headerActions,
    main,
  } = props;

  const sidebarProps = {
    token,
    hasOpsAgent,
    showOutbound,
    isOwner: isOwner ?? true,
    modules,
    status: {
      minutesRemain:   minutesRemain ?? null,
      minutesIncluded: minutesIncluded ?? null,
      aiOpsUsed:       aiOpsUsed ?? null,
      aiOpsLimit:      aiOpsLimit ?? null,
      hasStripe:       hasStripe ?? false,
    },
  };

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader
        businessName={businessName}
        logoUrl={logoUrl ?? null}
        mobileNav={<PortalMobileNav {...sidebarProps} accountSerial={accountSerial ?? null} />}
      >
        {headerActions}
      </PortalHeader>
      <div className="flex flex-1">
        <div className="hidden lg:flex">
          <PortalSidebarV2Client {...sidebarProps} />
        </div>
        <main className="flex-1 min-w-0 flex flex-col">{main}</main>
      </div>
    </div>
  );
}
