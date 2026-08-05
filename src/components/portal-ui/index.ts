/**
 * Portal Design System — public entrypoint.
 *
 * Consumidores:
 *   import { KpiCard, DataTable, FilterBar } from '@/components/portal-ui';
 */

// ─── Layout (Fase 2A) ──────────────────────────────────────────────────
export { default as PageContainer } from './patterns/layout/PageContainer';
export { default as PageSection }   from './patterns/layout/PageSection';
export { default as GridStretch }   from './patterns/layout/GridStretch';

export type { PageContainerProps } from './patterns/layout/PageContainer';
export type { PageSectionProps }   from './patterns/layout/PageSection';
export type { GridStretchProps }   from './patterns/layout/GridStretch';

// ─── Primitives ────────────────────────────────────────────────────────
export { default as Icon }    from './primitives/Icon';
export { default as Button }  from './primitives/Button';
export { default as Badge }   from './primitives/Badge';
export { default as Chip }    from './primitives/Chip';
export { default as Avatar }  from './primitives/Avatar';
export { default as Divider } from './primitives/Divider';

export type { IconProps, IconSize }                     from './primitives/Icon';
export type { ButtonProps, ButtonVariant, ButtonSize }  from './primitives/Button';
export type { BadgeProps, BadgeVariant, BadgeSize }     from './primitives/Badge';
export type { ChipProps }                               from './primitives/Chip';
export type { AvatarProps, AvatarSize, AvatarStatus }   from './primitives/Avatar';
export type { DividerProps }                            from './primitives/Divider';

// ─── Patterns ──────────────────────────────────────────────────────────
export { default as Card }              from './patterns/Card';
export { default as SectionHeader }     from './patterns/SectionHeader';
export { default as EmptyState }        from './patterns/EmptyState';
export { default as StatChip }          from './patterns/StatChip';
export { default as ProgressBar }       from './patterns/ProgressBar';
export { default as FilterBar }         from './patterns/FilterBar';
export { default as Toolbar }           from './patterns/Toolbar';
export { default as KpiCard }           from './patterns/KpiCard';
export { default as RankRow }           from './patterns/RankRow';
export { default as ActivityEventCard } from './patterns/ActivityEventCard';
export { default as DataTable }         from './patterns/DataTable';

export type { CardProps }                              from './patterns/Card';
export type { SectionHeaderProps, HeadingLevel }       from './patterns/SectionHeader';
export type { EmptyStateProps, EmptyStateSize }        from './patterns/EmptyState';
export type { StatChipProps, StatChipTone }            from './patterns/StatChip';
export type { ProgressBarProps, ProgressBarSize }      from './patterns/ProgressBar';
export type { FilterOption, FilterBarProps }           from './patterns/FilterBar';
export type { ToolbarProps }                           from './patterns/Toolbar';
export type { KpiCardProps, KpiTrend }                 from './patterns/KpiCard';
export type { RankRowProps, RankRowMetric, RankRowIndicator } from './patterns/RankRow';
export type { ActivityEventCardProps, EventType }      from './patterns/ActivityEventCard';
export type { DataTableProps, DataTableColumn, SortDirection } from './patterns/DataTable';

// ─── Primitives (Fase 2B-3) ───────────────────────────────────────────
export { default as Label }    from './primitives/Label';
export { default as Input }    from './primitives/Input';
export { default as Textarea } from './primitives/Textarea';

export type { LabelProps }              from './primitives/Label';
export type { InputProps, InputSize }   from './primitives/Input';
export type { TextareaProps }           from './primitives/Textarea';

// ─── Overlays (Fase 2B-3) ──────────────────────────────────────────────
export { default as Dialog }   from './overlays/Dialog';
export { default as Dropdown } from './overlays/Dropdown';
export { default as Popover }  from './overlays/Popover';
export { default as Tabs }     from './overlays/Tabs';
export { default as Sheet }    from './overlays/Sheet';

export type { DialogProps, DialogSize } from './overlays/Dialog';
export type { SheetProps, SheetSide, SheetSize } from './overlays/Sheet';
export type { TabsVariant } from './overlays/Tabs';

// Toast: helper + provider
export { default as Toaster, toast } from './overlays/Toast';

// ─── Tokens JS ─────────────────────────────────────────────────────────
export { EVENT_TYPE_COLORS, AVATAR_SIZES, ICON_SIZES } from './tokens';
export type { IconSizeKey } from './tokens';
