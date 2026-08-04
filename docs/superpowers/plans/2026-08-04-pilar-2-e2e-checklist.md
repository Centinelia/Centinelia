# Pilar 2 Creatividad E2E Checklist

Setup: cuenta con Noah + Nelia + Nico + Naia activos, KB del org con descripción de servicios reales, contexto de cliente falso listo para probar.

## Modo chat (portal /oficina)

- [ ] Elegir Noah en el sidebar, mandar: "Genera una propuesta para ACME sobre implementación de CRM"
- [ ] Verificar respuesta con URL del PDF + resumen del contenido
- [ ] Abrir el PDF descargado, verificar branding (color, logo, footer) del org
- [ ] Row en ops_documents con template_type='propuesta'
- [ ] Repetir para cotizacion: "Cotiza CRM para ACME 50k MXN"
- [ ] Repetir con Nelia: "Genera one-pager sobre nuestro servicio de facturación"
- [ ] Repetir con Nico: "Genera correo estructurado para cliente moroso ACME sobre acuerdo de pago"

## Guardarraíles role gating

- [ ] Mandar a Nia (recepcionista) "Genera propuesta para X" → debe rechazar con mensaje "Nia no puede usar generar_propuesta_comercial. Delega a Noah usando delegar_tarea."
- [ ] Mandar a Nelia "Genera cotización" → debe rechazar (Nelia solo tiene one_pager y correo)
- [ ] Mandar a Naia "Genera one_pager" → debe rechazar (Naia solo tiene correo)

## Modo voz

- [ ] Llamar a Noah, decir: "Manda propuesta a ACME por CRM"
- [ ] Verificar por logs Vapi que se llamó /api/voice/tools/creativity con tool=generar_propuesta_comercial
- [ ] Verificar en portal que llegó el PDF a ops_documents

## Modo email

- [ ] Mandar correo al agente Noah pidiendo cotización de servicio X
- [ ] Verificar por logs de inbox-processor que llamó generar_cotizacion
- [ ] Verificar PDF generado en ops_documents

## Ops charge

- [ ] Antes de generar: nota ai_ops_used de Noah
- [ ] Genera 1 propuesta → ai_ops_used debe incrementar +5
- [ ] Genera 1 cotizacion → +4
- [ ] Genera 1 one_pager → +3
- [ ] Genera 1 correo → +2
- [ ] Cuando ai_ops_used > ai_ops_limit → tool responde 429 con mensaje sobre ops agotadas

## Custom template

- [ ] Portal /configurar de Noah → sección "Plantillas de documentos" → subir un .docx con {title} y {sections} marcadores
- [ ] Regenerar propuesta → PDF debe usar el custom template (verificar visualmente)
- [ ] Eliminar template desde UI → siguiente generación usa built-in default de nuevo

## Copy scan

- [ ] Todo el copy visible es español, sin em-dashes, sin emojis, sin "IA"
- [ ] Íconos son Lucide únicamente
