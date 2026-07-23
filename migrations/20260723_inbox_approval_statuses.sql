-- Extend ops_inbox status check to include escalated and info_requested
alter table ops_inbox
  drop constraint if exists ops_inbox_status_check;

alter table ops_inbox
  add constraint ops_inbox_status_check
  check (status in ('pending', 'approved', 'rejected', 'skipped', 'auto_replied', 'escalated', 'info_requested'));
