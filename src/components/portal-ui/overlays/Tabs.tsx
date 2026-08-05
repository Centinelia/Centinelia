'use client';

import * as RadixTabs from '@radix-ui/react-tabs';
import { createContext, useContext } from 'react';

/**
 * Tabs — dos variants: pill (rounded bg) o underline (border-b active).
 *
 * Uso:
 *   <Tabs.Root defaultValue="a" variant="pill">
 *     <Tabs.List>
 *       <Tabs.Trigger value="a">Uno</Tabs.Trigger>
 *       <Tabs.Trigger value="b">Dos</Tabs.Trigger>
 *     </Tabs.List>
 *     <Tabs.Content value="a">Contenido A</Tabs.Content>
 *     <Tabs.Content value="b">Contenido B</Tabs.Content>
 *   </Tabs.Root>
 */

export type TabsVariant = 'pill' | 'underline';

const VariantCtx = createContext<TabsVariant>('pill');

interface RootProps extends React.ComponentProps<typeof RadixTabs.Root> {
  variant?: TabsVariant;
}

const Root: React.FC<RootProps> = ({ variant = 'pill', className, children, ...rest }) => (
  <VariantCtx.Provider value={variant}>
    <RadixTabs.Root className={className} {...rest}>
      {children}
    </RadixTabs.Root>
  </VariantCtx.Provider>
);

const List: React.FC<React.ComponentProps<typeof RadixTabs.List>> = ({
  className,
  ...rest
}) => {
  const variant = useContext(VariantCtx);
  const base = variant === 'pill'
    ? 'inline-flex items-center gap-1 rounded-lg bg-[var(--surface-sunken)] p-1'
    : 'inline-flex items-center gap-1 border-b border-[var(--border-subtle)]';
  return (
    <RadixTabs.List
      className={[base, className ?? ''].filter(Boolean).join(' ')}
      {...rest}
    />
  );
};

const Trigger: React.FC<React.ComponentProps<typeof RadixTabs.Trigger>> = ({
  className,
  ...rest
}) => {
  const variant = useContext(VariantCtx);
  const base = variant === 'pill'
    ? 'inline-flex h-8 items-center rounded-md px-3 text-[var(--fs-sm)] font-medium text-[var(--text-secondary)] data-[state=active]:bg-[var(--surface-elevated)] data-[state=active]:text-[var(--text-accent)] data-[state=active]:shadow-[var(--shadow-xs)]'
    : 'inline-flex h-9 items-center border-b-2 border-transparent px-3 text-[var(--fs-sm)] font-medium text-[var(--text-secondary)] -mb-px data-[state=active]:border-[var(--accent-default)] data-[state=active]:text-[var(--text-accent)]';
  return (
    <RadixTabs.Trigger
      className={[
        base,
        'transition-colors duration-[var(--motion-fast)] ease-[var(--ease-default)] motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]',
        'cursor-pointer',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
};

const Content: React.FC<React.ComponentProps<typeof RadixTabs.Content>> = ({
  className,
  ...rest
}) => (
  <RadixTabs.Content
    className={['pt-4 focus-visible:outline-none', className ?? ''].filter(Boolean).join(' ')}
    {...rest}
  />
);

const Tabs = { Root, List, Trigger, Content };
export default Tabs;
