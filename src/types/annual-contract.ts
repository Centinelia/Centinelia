// Tipos compartidos para contratos anuales prepagados (gobierno + enterprise).
// Ver docs/superpowers/specs/2026-08-02-annual-contracts-design.md.

export type ContractStatus = 'draft' | 'active' | 'expired' | 'cancelled';
export type PaymentStatus  = 'pending' | 'received' | 'overdue';
export type BillingModel   = 'stripe' | 'annual_prepaid' | 'expired';

export interface AnnualContract {
  id:                          string;
  organization_email:          string;
  contract_folio:              string;
  status:                      ContractStatus;
  start_date:                  string;    // ISO date YYYY-MM-DD
  end_date:                    string;
  amount_mxn:                  number;
  monthly_minutes_pool:        number;
  monthly_ops_pool:            number;
  included_employees:          number | null;
  invoice_folio:               string | null;
  invoice_pdf_url:             string | null;
  payment_status:              PaymentStatus;
  payment_received_at:         string | null;
  renewal_reminder_60d_sent:   boolean;
  renewal_reminder_15d_sent:   boolean;
  notes:                       string | null;
  created_by:                  string | null;
  created_at:                  string;
  cancelled_at:                string | null;
  cancelled_reason:            string | null;
}

export interface OrganizationBillingState {
  portal_email:            string;
  name:                    string | null;
  billing_model:           BillingModel;
  active_contract_id:      string | null;
  monthly_minutes_used:    number;
  monthly_ops_used:        number;
  pool_reset_date:         string | null;
  overage_minutes:         number;
  overage_ops:             number;
  stripe_customer_id:      string | null;
}

// Input para crear un contrato (POST /api/admin/annual-contracts)
export interface CreateAnnualContractInput {
  organization_email:      string;
  contract_folio:          string;
  start_date:              string;
  end_date:                string;
  amount_mxn:              number;
  monthly_minutes_pool:    number;
  monthly_ops_pool:        number;
  included_employees?:     number | null;
  invoice_folio?:          string | null;
  payment_received_at?:    string | null;
  payment_status?:         PaymentStatus;
  notes?:                  string | null;
  activate?:               boolean;  // si true, activa inmediato al crear
}
