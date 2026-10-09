// Replica la función detectForcedTool con el input real de TEST-77777
const subject = "REGISTRAR OC TEST-77777— PRUEBA SAFETY NET";
const body = "Hola Nami,\n\nPor favor registra la OC TEST-77777 en el inventario...";
const attachments = [{ name: "OC_TEST-77777.pdf", url: "ms:...", type: "application/pdf", size: 131640 }];

// Replica el regex del inbox-processor
const availableToolNames = new Set(['inv_procesar_oc_qb', 'inv_agregar_equipo', 'inv_procesar_factura_trane', 'inv_importar_backlog']);

const hasAttachmentOfType = (rx: RegExp) =>
  attachments.some(a => rx.test((a.name ?? '').toLowerCase()) || rx.test((a.type ?? '').toLowerCase()));

const ocMatch = /\boc\s*[-#]?\s*[a-z0-9-]+\d/i.test(subject);
console.log('OC regex match:', ocMatch);
console.log('Attachment PDF match:', hasAttachmentOfType(/\.(pdf|xml|xlsx?)$|application\/(pdf|xml|vnd\.openxmlformats)/));
console.log('inv_procesar_oc_qb available:', availableToolNames.has('inv_procesar_oc_qb'));

if (ocMatch && hasAttachmentOfType(/\.(pdf|xml|xlsx?)$|application\/(pdf|xml|vnd\.openxmlformats)/) && availableToolNames.has('inv_procesar_oc_qb')) {
  console.log('\n✓ FORCE tool_choice=inv_procesar_oc_qb');
} else {
  console.log('\n✗ No force');
}
