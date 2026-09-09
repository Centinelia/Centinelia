"""
Aplica el mapping SKU dictado por Beatriz al CSV de productos.
Luego llamamos a format-cheatsheet-xlsx.py para regenerar el XLSX con formato.
"""
import csv
import os

OUT_DIR = r"C:\Users\Nazre\centinelia\scripts\output"

# Mapping dictado por Beatriz. Key = (columna_normalizada, precio) o (columna_normalizada, '*')
# donde '*' significa "cualquier precio".
# Value = (sku, nombre_contpaqi, notas)
MAPPING = {
    # ROJA (tortilla para enchilada, no importa precio)
    ('ROJA', '*'):          ('004', 'TORTILLA PARA ENCHILADA', ''),

    # ESTRELLA 1KG (kilo Blanca) — nombres varios que apuntan al mismo SKU
    ('ESTRELLA', '*'):      ('001', 'TORTILLA DE MAIZ MARCA ESTRELLA', ''),
    ('ESTRELLA 1', '*'):    ('001', 'TORTILLA DE MAIZ MARCA ESTRELLA', 'header truncado, mismo SKU que ESTRELLA'),
    ('ESTRELLA 1KG', '*'):  ('001', 'TORTILLA DE MAIZ MARCA ESTRELLA', ''),

    # ESTRELLA 1/2 (paquete 500g Blanca)
    ('ESTRELLA 1/2', '*'):  ('021', 'PAQ 500 GMS TORTILLA MAIZ ESTRELLA', ''),

    # RANCHO 1KG (kilo Amarilla)
    ('RANCHO', '*'):        ('002', 'TORTILLA DE MAIZ MARCA RANCHO', ''),
    ('RANCHO 1KG', '*'):    ('002', 'TORTILLA DE MAIZ MARCA RANCHO', ''),

    # RANCHO 1/2 (paquete 500g Amarilla)
    ('RANCHO 1/2', '*'):    ('022', 'PAQ 500 GMS TORTILLA MAIZ RANCHO', ''),

    # FRIJOL
    ('FRIJOL', '*'):        ('005', 'FRIJOL COCIDO 500g', ''),

    # SALSA (varias abreviaturas)
    ('SALSA .500', '*'):    ('006', 'SALSA 500g', ''),
    ('SALSA 500', '*'):     ('006', 'SALSA 500g', ''),

    # GELITA 1KG (tortilla maiz)
    ('GELITA', '*'):        ('015', 'TORTILLA DE MAIZ 1K MARCA DOÑA GELITA', ''),
    ('GELITA 1KG', '*'):    ('015', 'TORTILLA DE MAIZ 1K MARCA DOÑA GELITA', ''),
    ('GELITA ESD', '*'):    ('015', 'TORTILLA DE MAIZ 1K MARCA DOÑA GELITA', 'PENDIENTE Beatriz manana: asumimos kilo (015), confirmar si es una presentacion distinta'),
    ('S GELITA', '*'):      ('015', 'TORTILLA DE MAIZ 1K MARCA DOÑA GELITA', 'PENDIENTE Beatriz manana: asumimos kilo (015), confirmar si es una presentacion distinta'),

    # TACO 1KG
    ('TACO', '*'):          ('017', 'TAQUERA DE 1 KG/RANCHO', ''),
    ('TACO 1 KG', '*'):     ('017', 'TAQUERA DE 1 KG/RANCHO', ''),
    ('TACO 1KG', '*'):      ('017', 'TAQUERA DE 1 KG/RANCHO', ''),
    ('TACO 1KG.', '*'):     ('017', 'TAQUERA DE 1 KG/RANCHO', ''),

    # MI ESTRELLA (harina 20 pzas)
    ('MI ESTRELLA', '*'):   ('054', 'TORTILLA DE TRIGO MARCA MI ESTRELLA 20 PZ 500 GRS', ''),

    # SIN MARCA (varias abreviaturas — Beatriz dijo VTSM Harina 30pzs)
    ('S/MARCA', '*'):       ('VTSM', 'TORTILLA SIN MARCA 30pzs.', ''),
    ('SN MARCA', '*'):      ('VTSM', 'TORTILLA SIN MARCA 30pzs.', ''),
}

def normalize(col):
    return col.upper().strip()

def lookup(col, precio):
    col_norm = normalize(col)
    # Preferir match con precio especifico si existiera; fallback a wildcard
    if (col_norm, str(precio)) in MAPPING:
        return MAPPING[(col_norm, str(precio))]
    if (col_norm, '*') in MAPPING:
        return MAPPING[(col_norm, '*')]
    return None

src = os.path.join(OUT_DIR, "beatriz-product-mapping.csv")
with open(src, "r", encoding="utf-8") as f:
    rows = list(csv.reader(f))

matched = 0
unmatched = []
for r in rows[1:]:
    columna, precio, visto, sku, nombre, clave, unidad, notas = r
    hit = lookup(columna, precio)
    if hit:
        sku_val, nombre_val, notas_val = hit
        r[3] = sku_val
        r[4] = nombre_val
        # Clave SAT solo para tortilla (50161509 lo dijo Beatriz al inicio como respaldo)
        if any(k in nombre_val.upper() for k in ('TORTILLA', 'TAQUERA')):
            r[5] = '50161509'
        elif 'SALSA' in nombre_val.upper():
            r[5] = '50131701'
        elif 'FRIJOL' in nombre_val.upper():
            r[5] = '50131700'
        # Unidad SAT: kilos para todo lo que es al kilo, PZA para paquetes/pzas
        if 'KG' in nombre_val.upper() or 'MAIZ MARCA' in nombre_val.upper():
            r[6] = 'KGM'
        elif 'PZ' in nombre_val.upper() or 'PAQ' in nombre_val.upper() or 'SIN MARCA' in nombre_val.upper():
            r[6] = 'H87'  # Piezas
        elif 'g' in nombre_val or 'G' in nombre_val:
            r[6] = 'KGM'
        r[7] = notas_val
        matched += 1
    else:
        unmatched.append((columna, precio))

with open(src, "w", encoding="utf-8", newline='') as f:
    csv.writer(f).writerows(rows)

print(f"Matcheados: {matched} / {len(rows)-1}")
if unmatched:
    print("Pendientes (Beatriz aclarar):")
    for c, p in unmatched:
        print(f"  - {c!r} @ ${p}")
