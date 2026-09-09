"""
Convierte los CSV de cheatsheet a XLSX con formato.
Uso: python scripts/format-cheatsheet-xlsx.py
"""
import csv
import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

OUT_DIR = r"C:\Users\Nazre\centinelia\scripts\output"

HEADER_FONT = Font(name='Segoe UI', size=11, bold=True, color='FFFFFF')
HEADER_FILL = PatternFill('solid', fgColor='6C3BFF')
BODY_FONT   = Font(name='Segoe UI', size=10)
INPUT_FILL  = PatternFill('solid', fgColor='FFF7CC')
DCA_FILL    = PatternFill('solid', fgColor='FFE1E1')
DONE_FILL   = PatternFill('solid', fgColor='E1F5D6')
ALT_FILL    = PatternFill('solid', fgColor='F8F5FF')
EMPTY_FILL  = PatternFill('solid', fgColor='EEEEEE')
THIN        = Side(border_style='thin', color='D8D0F0')
BORDER      = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

def style_header(ws, ncols):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=1, column=c)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
        cell.border = BORDER
    ws.row_dimensions[1].height = 34
    ws.freeze_panes = 'A2'

def autosize(ws, widths):
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

# ========== Sheet 1: block codes ==========
with open(os.path.join(OUT_DIR, "beatriz-block-codes.csv"), "r", encoding="utf-8") as f:
    rows = list(csv.reader(f))

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Codigos por bloque"

headers = ['Archivo', 'Bloque', 'Titulo del bloque',
           'Codigo que detecto Centinelia', 'Remisiones', 'Total Excel',
           'Codigo CONTPAQi confirmado por Beatriz', 'Notas']
ws.append(headers)
style_header(ws, len(headers))

for idx, r in enumerate(rows[1:], start=2):
    archivo, bloque, titulo, codigo_parser, remisiones, total_excel, codigo_correcto, notas = r
    # Pre-llenar codigo correcto con lo que el parser detecto, para que
    # Beatriz solo verifique en vez de teclear de cero.
    codigo_correcto_efectivo = codigo_correcto or codigo_parser or ''
    ws.cell(row=idx, column=1, value=archivo)
    ws.cell(row=idx, column=2, value=int(bloque))
    ws.cell(row=idx, column=3, value=titulo)
    ws.cell(row=idx, column=4, value=codigo_parser or '')
    ws.cell(row=idx, column=5, value=int(remisiones))
    ws.cell(row=idx, column=6, value=float(total_excel) if total_excel else None)
    ws.cell(row=idx, column=7, value=codigo_correcto_efectivo)
    ws.cell(row=idx, column=8, value=notas)

    is_dca = 'DCA' in titulo.upper()[:20]
    is_empty = int(remisiones) == 0

    for c in range(1, 9):
        cell = ws.cell(row=idx, column=c)
        cell.font = BODY_FONT
        cell.border = BORDER
        cell.alignment = Alignment(vertical='center', wrap_text=(c in (3, 8)))
        if c == 6 and cell.value is not None:
            cell.number_format = '"$"#,##0.00'

        if is_dca:
            cell.fill = DCA_FILL
        elif is_empty:
            cell.fill = EMPTY_FILL
        elif idx % 2 == 0:
            cell.fill = ALT_FILL

        if c == 7:
            cell.fill = DONE_FILL if codigo_correcto_efectivo else INPUT_FILL

    ws.row_dimensions[idx].height = 32

autosize(ws, [16, 10, 60, 16, 12, 14, 24, 45])

ws2 = wb.create_sheet("Como llenar")
ws2['A1'] = "Como llenar la hoja Codigos por bloque"
ws2['A1'].font = Font(name='Segoe UI', size=14, bold=True, color='6C3BFF')
lines = [
    "",
    "Objetivo: para cada bloque del Excel semanal, dejar registrado el codigo",
    "de CONTPAQi al que hay que timbrar el CFDI.",
    "",
    "Que significan las 2 columnas de codigo:",
    "",
    "  Codigo que detecto Centinelia (columna D):",
    "    Es lo que nuestro parser encontro solo, leyendo el titulo del bloque.",
    "    Por ejemplo, de 'CARDENAS ALIMENTOS (CTE. 045)' saco 045.",
    "    Esta columna la llenamos nosotros. Sirve como propuesta / borrador.",
    "",
    "  Codigo CONTPAQi confirmado por Beatriz (columna G):",
    "    Es el que vale al final. Va pre-llenado con lo que detecto Centinelia",
    "    cuando lo detecto, para que Beatriz solo verifique de un vistazo.",
    "    Los que estan VACIOS (amarillo) son bloques donde el parser no",
    "    encontro codigo (ej. 'DCA PABLO LIVAS') y Beatriz tiene que dictarlo.",
    "",
    "Colores:",
    "  Verde  = codigo ya llenado (por parser o por Beatriz). Verificar y ya.",
    "  Amarillo = pendiente, Beatriz tiene que dictar.",
    "  Rosa   = bloque DCA. Los 3 bloques DCA se timbran como 1 CFDI a la",
    "           misma razon social. Poner el mismo codigo en los 3 renglones.",
    "  Gris   = bloque vacio esta semana (sin remisiones). Igual conviene",
    "           registrar el codigo por si aparece la proxima semana.",
    "",
    "Al terminar: guardar y mandarle el archivo a Nazre.",
]
for i, n in enumerate(lines, start=2):
    c = ws2.cell(row=i, column=1, value=n)
    c.font = Font(name='Segoe UI', size=11)
ws2.column_dimensions['A'].width = 95

out_path = os.path.join(OUT_DIR, "beatriz-block-codes.xlsx")
wb.save(out_path)
print(f"OK: {out_path} ({len(rows)-1} bloques)")

# ========== Sheet 2: product mapping ==========
with open(os.path.join(OUT_DIR, "beatriz-product-mapping.csv"), "r", encoding="utf-8") as f:
    rows = list(csv.reader(f))

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Productos"

headers = ['Columna del Excel', 'Precio tipico', 'Visto en clientes',
           'SKU CONTPAQi', 'Nombre CONTPAQi', 'Clave SAT', 'Unidad SAT', 'Notas']
ws.append(headers)
style_header(ws, len(headers))

for idx, r in enumerate(rows[1:], start=2):
    columna, precio, visto, sku, nombre, clave, unidad, notas = r
    ws.cell(row=idx, column=1, value=columna)
    ws.cell(row=idx, column=2, value=float(precio))
    ws.cell(row=idx, column=3, value=visto)
    ws.cell(row=idx, column=4, value=sku)
    ws.cell(row=idx, column=5, value=nombre)
    ws.cell(row=idx, column=6, value=clave)
    ws.cell(row=idx, column=7, value=unidad)
    ws.cell(row=idx, column=8, value=notas)

    for c in range(1, 9):
        cell = ws.cell(row=idx, column=c)
        cell.font = BODY_FONT
        cell.border = BORDER
        cell.alignment = Alignment(vertical='center', wrap_text=(c in (3, 8)))
        if c == 2:
            cell.number_format = '"$"#,##0.00'

        if idx % 2 == 0:
            cell.fill = ALT_FILL

        if c in (4, 5, 6, 7):
            cell.fill = DONE_FILL if ws.cell(row=idx, column=c).value else INPUT_FILL

    ws.row_dimensions[idx].height = 30

autosize(ws, [22, 14, 60, 16, 35, 14, 14, 30])

ws2 = wb.create_sheet("Como llenar")
ws2['A1'] = "Como llenar la hoja Productos"
ws2['A1'].font = Font(name='Segoe UI', size=14, bold=True, color='6C3BFF')
lines = [
    "",
    "Objetivo: mapear cada combinacion unica de (columna Excel + precio) al SKU",
    "correspondiente en CONTPAQi. La misma columna con distinto precio puede",
    "ser un SKU distinto.",
    "",
    "Ejemplo: ESTRELLA 1/2 al $22.10 vs ESTRELLA 1/2 al $27.00 son 2 SKUs",
    "  distintos aunque el nombre display coincida.",
    "",
    "Columnas obligatorias:",
    "  - SKU CONTPAQi: el codigo del producto en CONTPAQi (ej. 021, 013).",
    "",
    "Columnas opcionales (ayudan a validar):",
    "  - Nombre CONTPAQi: para doble-verificacion.",
    "  - Clave SAT: usual 50161509 para tortilla, 50131701 para salsas.",
    "  - Unidad SAT: usual KGM para kilos.",
    "",
    "Referencia: la columna Visto en clientes muestra en que clientes aparece",
    "esta combinacion columna+precio en los Excels de esta semana.",
    "",
    "Verde = ya esta llenado. Amarillo = pendiente.",
    "",
    "Al terminar: guardar y mandarle el archivo a Nazre.",
]
for i, n in enumerate(lines, start=2):
    c = ws2.cell(row=i, column=1, value=n)
    c.font = Font(name='Segoe UI', size=11)
ws2.column_dimensions['A'].width = 95

out_path = os.path.join(OUT_DIR, "beatriz-product-mapping.xlsx")
wb.save(out_path)
print(f"OK: {out_path} ({len(rows)-1} productos)")
