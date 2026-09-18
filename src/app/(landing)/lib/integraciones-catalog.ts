export interface Integracion {
  key:     string;
  label:   string;
  logoSrc: string | null;
}

export const INTEGRACIONES: Integracion[] = [
  { key: 'gmail',        label: 'Gmail / Google Workspace',    logoSrc: null },
  { key: 'outlook',      label: 'Outlook / Microsoft 365',     logoSrc: null },
  { key: 'sheets',       label: 'Google Sheets',                logoSrc: null },
  { key: 'drive',        label: 'Google Drive',                 logoSrc: null },
  { key: 'dropbox',      label: 'Dropbox',                      logoSrc: null },
  { key: 'onedrive',     label: 'OneDrive',                     logoSrc: null },
  { key: 'quickbooks',   label: 'QuickBooks Online',            logoSrc: null },
  { key: 'facturama',    label: 'Facturama',                    logoSrc: null },
  { key: 'contpaqi',     label: 'ContPAQi',                     logoSrc: null },
  { key: 'invoiceone',   label: 'InvoiceOne',                   logoSrc: null },
  { key: 'sf',           label: 'Solución Factible',            logoSrc: null },
  { key: 'notion',       label: 'Notion',                       logoSrc: null },
];
