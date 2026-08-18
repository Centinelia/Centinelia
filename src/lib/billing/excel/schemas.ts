export interface ExcelColumn {
  key: string;
  header: string;
  width?: number;
}

export interface ExcelSchema {
  sheets: Array<{ name: string; columns: ExcelColumn[] }>;
}

export const DailySalesSchema: ExcelSchema = {
  sheets: [
    {
      name: 'Ventas',
      columns: [
        { key: 'num', header: '#', width: 6 },
        { key: 'hora', header: 'Hora', width: 8 },
        { key: 'cliente', header: 'Cliente', width: 40 },
        { key: 'rfc', header: 'RFC', width: 15 },
        { key: 'productos', header: 'Productos', width: 40 },
        { key: 'total', header: 'Total', width: 12 },
        { key: 'metodo', header: 'Metodo', width: 15 },
        { key: 'status', header: 'Status', width: 25 },
        { key: 'factura', header: 'Factura/Folio', width: 15 },
      ],
    },
  ],
};

export const PendingClientSchema: ExcelSchema = {
  sheets: [
    {
      name: 'Pendientes',
      columns: [
        { key: 'num', header: '#', width: 6 },
        { key: 'fecha', header: 'Fecha', width: 12 },
        { key: 'productos', header: 'Productos', width: 40 },
        { key: 'total', header: 'Total', width: 12 },
        { key: 'metodo', header: 'Metodo', width: 15 },
        { key: 'ventasSources', header: 'Referencia', width: 25 },
      ],
    },
  ],
};

const MONTH_SHEETS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

export const HistoryMonthlySchema: ExcelSchema = {
  sheets: MONTH_SHEETS.map(m => ({
    name: m,
    columns: [
      { key: 'fechaCorte', header: 'Fecha corte', width: 12 },
      { key: 'folio', header: 'Folio CFDI', width: 20 },
      { key: 'periodo', header: 'Periodo', width: 25 },
      { key: 'lineas', header: 'Lineas de detalle', width: 60 },
      { key: 'total', header: 'Total', width: 12 },
      { key: 'ventasSources', header: 'Fuentes', width: 40 },
    ],
  })),
};
