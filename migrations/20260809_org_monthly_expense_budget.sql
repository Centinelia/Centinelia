-- Presupuesto mensual de gastos operativos de la organización.
-- Consumido por evaluar_limite_gasto tool antes de aprobar_gasto.
-- NULL = sin presupuesto configurado (tool devuelve warning, no bloquea).

alter table organizations
  add column if not exists monthly_expense_budget numeric;

comment on column organizations.monthly_expense_budget is
  'Presupuesto mensual de gastos operativos en MXN. Usado por evaluar_limite_gasto para verificar antes de aprobar_gasto. NULL = sin presupuesto (tool no bloquea, solo avisa al empleado).';
