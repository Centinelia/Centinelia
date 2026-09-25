# Directorio de servidores públicos del Municipio de Santiago NL

**Nota:** Este directorio es un ejemplo genérico. Reemplazar con los datos reales del municipio antes de subir al portal.

El formato de "Nombres para búsqueda" permite que Nia encuentre a la persona aunque el ciudadano use solo el primer nombre, el apellido, o un tratamiento informal. El sistema de embeddings indexa todas las variantes.

---

## Cómo usar este directorio

Nia puede identificar a un servidor público si el ciudadano menciona cualquiera de las variantes de nombre listadas. Si hay ambigüedad (dos servidores con el mismo primer nombre en distintas áreas), Nia preguntará el área o el apellido antes de dar información.

---

## Ejemplo de formato (reemplazar con datos reales)

### Dirección de Tránsito

- **Juan Pérez García**
  - Nombres para búsqueda: Juan, Juan Pérez, Pérez García, el señor Pérez, licenciado Pérez, el de tránsito
  - Puesto: Director de Tránsito
  - Área: Dirección de Tránsito
  - Extensión: 1234
  - Correo: juan.perez@santiago.gob.mx
  - Horario: lunes a viernes de 9:00 a 15:00 horas
  - Ubicación: Planta baja, ala norte

### Tesorería

- **María López González**
  - Nombres para búsqueda: María, María López, López González, la señora López, licenciada López, la tesorera
  - Puesto: Tesorera Municipal
  - Área: Tesorería
  - Extensión: 2001
  - Correo: maria.lopez@santiago.gob.mx
  - Horario: lunes a viernes de 8:30 a 15:00 horas
  - Ubicación: Planta baja, ventanilla 3

### Registro Civil

- **Carlos Martínez Robles**
  - Nombres para búsqueda: Carlos, Carlos Martínez, Martínez Robles, el señor Martínez, oficial Martínez
  - Puesto: Oficial del Registro Civil
  - Área: Registro Civil
  - Extensión: 3010
  - Correo: carlos.martinez@santiago.gob.mx
  - Horario: lunes a viernes de 9:00 a 14:00 horas (citas en línea recomendadas)

### Obras Públicas

- **Ana Rodríguez Vega**
  - Nombres para búsqueda: Ana, Ana Rodríguez, Rodríguez Vega, la señora Rodríguez, ingeniera Rodríguez
  - Puesto: Directora de Obras Públicas
  - Área: Dirección de Obras Públicas
  - Extensión: 4100
  - Correo: ana.rodriguez@santiago.gob.mx
  - Horario: lunes a viernes de 9:00 a 15:00 horas

---

## Notas para Nia

- Si el ciudadano menciona solo "el señor X" sin apellido y hay más de un servidor con ese primer nombre en distintas áreas, pregunta: "¿Sabe en qué departamento trabaja la persona que busca?"
- Si el ciudadano menciona un nombre que no aparece en este directorio, responde: "No tengo registro de esa persona en el directorio actual. Le recomiendo llamar a la línea general del municipio para que le orienten."
- No confirmes extensiones ni correos de memoria. La información oficial es la que está en este directorio.
