'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import PortalSidebarV2, { type PortalSidebarV2Props } from './PortalSidebarV2';

/**
 * Thin client wrapper that resolves `currentPath` via usePathname() and
 * forwards all other props to the pure PortalSidebarV2 component.
 * Import this from server components — PortalSidebarV2 directly is also a
 * client component, but this wrapper removes the need to pass currentPath
 * as a server-side prop.
 */
export default function PortalSidebarV2Client(
  props: Omit<PortalSidebarV2Props, 'currentPath' | 'currentSearch'>,
) {
  const currentPath = usePathname() ?? '';
  const searchParams = useSearchParams();
  const currentSearch = searchParams?.toString() ?? '';
  return <PortalSidebarV2 {...props} currentPath={currentPath} currentSearch={currentSearch} />;
}
