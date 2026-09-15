# Runbook — Demo IPark, 2ª llamada

Guión concreto para 20 min. Asume screen-share + audio. Ajustable a video llamada de Zoom/Meet/Teams.

## Preparación 15 min antes

1. Cerrar todos los tabs excepto: (a) Portal demo IPark `/portal/{TOKEN}/oficina/bandeja`, (b) Portal Tortillería real (backup para bandeja "live"), (c) Este runbook en otra pantalla si tienes 2 monitores.
2. Correr el "reset demo" para que la bandeja tenga los 10 correos de `02-fixtures-correos.md` frescos, ninguno procesado todavía.
3. Modo mock del adapter InvoiceOne confirmado activo (`INVOICEONE_MOCK=true` o creds `demo/demo` en la org).
4. Mute notificaciones Slack/correo/WhatsApp.
5. Tener el PDF de propuesta abierto en background para adjuntar/mandar al cerrar.

## 0-2 min · Contexto + escuchar antes de mostrar

Abres con la respuesta a lo que preguntaste en la 1ª llamada, y le pides confirmar 2 datos rápidos.

> "Gracias por hacerse el tiempo. Antes de mostrarte lo que preparamos, quiero confirmar dos cosas rápido: (1) los 1,000 correos mensuales sí llegan a un solo inbox de facturación en Monterrey, ¿correcto? (2) el equipo que hoy los responde son 1-2 personas dedicadas a esto, o parte del tiempo de alguien que hace otras cosas también?"

Escucha. Si abre a un tema no anticipado, redirige suave: "perfecto, eso lo cubrimos exacto en la demo, déjame enseñarte".

## 2-4 min · Encuadre — qué NO haces, qué SÍ haces

Antes de compartir pantalla, tono conversacional.

> "Rápido antes de la demo, para que sepas qué vas a ver: los 34,000 CFDIs mensuales que hoy autoservicio maneja bien, no los tocamos. InvoiceOne sigue timbrando exactamente igual. La persona que hoy responde correos, tampoco la reemplazamos como cargo — lo que hacemos es que en vez de ejecutar 1,000 correos al mes, audita a Nala. Nala es una facturista digital que se conecta al correo de facturación de IPark, decide cuáles correos claramente piden factura, los procesa, timbra vía InvoiceOne bajo la cuenta de IPark, y responde al cliente con su CFDI. Los correos que no son de facturación los deja intactos para que el humano los siga viendo. Voy a mostrártelo con datos ficticios pero con casos idénticos a los que vive el equipo hoy."

## 4-13 min · Demo en vivo — bandeja Nala IPark

Compartes pantalla en `/portal/{TOKEN}/oficina/bandeja` con los 10 correos cargados.

### Paso 1 (4-6 min) — El filtro estricto

> "Aquí tienes lo que vería el inbox esta mañana. Diez correos entrando. Fíjate lo primero: Nala ya decidió cuáles va a abrir y cuáles no."

Señala los 5 correos marcados como "procesable" vs los 5 marcados como "ignorar / dejar al humano".

> "Estos cinco (señalas queja de rayón, marketing de limpieza, notificación BBVA, otros) Nala ni los toca. No son facturación. Se quedan en la bandeja para que la persona los siga viendo. Los otros cinco sí van a Nala."

### Paso 2 (6-9 min) — Caso happy path (Correo #1 — Grupo Mex)

Click en el correo de Laura Morales. Enseña que Nala extrajo RFC, folio, uso CFDI, CP.

> "Este correo tiene toda la info. RFC bien escrito, folio de boleto claro, régimen y uso especificados. Nala valida el RFC contra el catálogo del SAT, extrae los datos, y…"

Click "Procesar / Timbrar". El adapter mock retorna en 2-3 seg con UUID + XML + PDF.

> "…timbrado. Tiene UUID válido, sello, cadena original. Nala prepara la respuesta al cliente con el CFDI adjunto."

Enseña el draft de respuesta pre-cargado. Si quieres puedes leerlo en voz alta:

> "Listo, aquí tiene su factura por su estancia en IPark aeropuerto MTY. Cualquier ajuste me avisa."

> "Fíjate el tono: no menciona que es automático, no dice IA, no dice Centinelia. Es la facturación de IPark contestando. Punto."

### Paso 3 (9-11 min) — Caso info incompleta (Correo #2 — Héctor Villarreal)

Click en el correo de Héctor. Enseña que Nala detectó que falta régimen fiscal, uso CFDI y CP.

> "Este es distinto. Nala reconoce que es facturación pero le falta info fiscal para timbrar. Fíjate lo que hace: no timbra a medias, y no le manda un formulario largo. Solo pide lo faltante, en una línea."

Enseña el draft:

> "Para generar su factura me falta: régimen fiscal, uso CFDI y código postal fiscal. En cuanto me los mande le genero el CFDI de inmediato."

> "Cuando el cliente responda con esos datos, Nala continúa el mismo hilo y timbra."

### Paso 4 (11-13 min) — Caso escalación (Correo #5 — Patricia perdió boleto + mes vencido)

Click. Enseña que Nala clasificó esto como "requiere humano".

> "Este es el caso donde Nala NO se mete a resolverlo. Mes vencido, boleto perdido, dos condiciones que requieren criterio humano. Nala hace dos cosas: primero, responde al cliente diciendo que va a verificarlo y le responde hoy — no lo deja colgado. Y segundo…"

Enseña la tarjeta escalada a `centinelia.dev@gmail.com` (o al humano configurado):

> "…le manda un resumen ejecutivo al equipo humano con todo el contexto: correo original, qué intentó, por qué no procedió, y qué proponer. El humano abre el mail, ya tiene todo hecho para decidir. En vez de leer 1,000 correos al mes, revisa 50-100 que sí requieren su cerebro."

## 13-16 min · Los números — qué esperar

Cierras la demo en vivo, vuelves a cámara.

> "Traducido a números para el caso IPark: si Nala procesa auto el 80-85% de esos 1,000 correos mensuales, tu equipo humano pasa de responder 1,000 a auditar 150-200. En tiempo, eso son 100+ horas al mes que dejan de irse en trabajo mecánico. La persona (o el equipo) que hoy vive en ese inbox puede dedicarse a cosas que sí mueven la aguja: casos difíciles, mejorar el flujo, atender clientes premium."

Anticipa la pregunta que suele venir aquí:

> "Sobre precio y siguientes pasos: lo que proponemos es POC de 30 días en el que Nala corre en paralelo con el equipo — primeros 15 días el humano audita cada respuesta antes de que salga, y los siguientes 15 Nala responde directa. Al final tenemos métricas reales: porcentaje resuelto sin escalar, tiempo promedio, satisfacción del cliente, y horas humanas ahorradas. Sobre esos números cotizamos operación mensual. El POC es simbólico, entre $3 y 5 mil pesos, solo cubre el setup técnico."

## 16-18 min · La pregunta que tiene que quedar en el aire

> "Antes de cerrar quiero preguntarte algo importante: ¿quién en IPark toma la decisión sobre esto? ¿Es Bernardo directo, alguien de finanzas, alguien de operaciones? Para saber a quién te ayudo a preparar la información y en qué formato la quiere."

Esta pregunta hace tres cosas: (1) revela el decisor real, (2) te posiciona como facilitador no como vendedor insistente, (3) abre el siguiente contacto natural.

## 18-20 min · Cierre y siguiente paso concreto

> "Te mando ahora mismo el PDF con la propuesta resumida (una página) para que la tengas de referencia y para que se la puedas pasar a quien decida. En cuanto me confirmes que quieren avanzar al POC, arrancamos con setup técnico — necesitamos que IPark nos comparta su cuenta InvoiceOne y acceso al inbox de facturación (por reenvío, no cambio de dirección). Setup real toma 3-5 días. ¿Cuándo crees que podamos tener la respuesta?"

Esperas cierre. Idealmente sale de la llamada con:
- Nombre del decisor
- Fecha aproximada de respuesta
- Compromiso implícito de escalarle la propuesta a quien decida

## Post-llamada (dentro de 15 min de colgar)

1. Manda el PDF por correo. Asunto: "Propuesta Nala facturista para IPark — resumen 1 pág".
2. Body corto: "Gracias por el tiempo. Adjunto el resumen que comentamos. Quedo pendiente de tu respuesta esta semana. Cualquier duda me marcas."
3. Agenda recordatorio para follow-up en 4 días laborales si no responde.
4. Update handoff en memoria: nombre real de la asistente, decisor identificado, fecha compromiso.

## Objeciones frecuentes y respuestas

**"Ya tenemos InvoiceOne, ¿para qué esto?"**
> "InvoiceOne timbra excelente. Lo que no hace ninguno de los PACs es leer el correo de facturación de IPark y decidir qué hacer con cada mensaje. Eso lo hace tu equipo humano hoy. Nala lo hace por ellos."

**"Y si Nala se equivoca?"**
> "Buena pregunta. Los primeros 15 días del POC un humano audita cada respuesta antes de que salga al cliente. Nada sale sin visto bueno. Después de que se calibra, Nala responde directa. Y aún así, si detecta cualquier duda o caso raro, escala automáticamente al humano — más vale escalar de más que timbrar mal."

**"¿Cuánto cuesta al mes cuando ya esté corriendo?"**
> "Depende del volumen real que salga del POC. Como rango, mensualidades similares están entre 8 y 15 mil pesos al mes, cotizamos exacto con los datos que arroje el POC. Ancla útil: si hoy una persona dedica 20-30 horas al mes a esos correos, el costo prorrateado ya supera esa mensualidad. Y Nala trabaja 24/7 sin pedir aumento ni faltar."

**"¿Está listo para arrancar mañana?"**
> "Setup técnico son 3-5 días desde que IPark comparte credenciales InvoiceOne y da acceso al inbox. La configuración inicial de Nala con el contexto específico de IPark la tenemos calibrada ya. Después son 30 días de POC. Al día 45 estamos en operación estable."

**"¿Los datos fiscales quedan seguros?"**
> "Nala corre en infraestructura Centinelia con encriptación de credenciales en reposo. Los CSDs y credenciales de InvoiceOne nunca salen del ambiente cifrado. Firmamos NDA si lo requieres. Además, Nala nunca comparte credenciales por correo con nadie, ni siquiera con el equipo interno de IPark — está bloqueado en el prompt."
