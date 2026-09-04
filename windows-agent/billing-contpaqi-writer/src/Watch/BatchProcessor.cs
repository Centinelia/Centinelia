using System.Text.Json;
using Centinelia.BillingContpaqi.Writer.Sdk;
using Centinelia.BillingContpaqi.Writer.Watch.Storage;
using Microsoft.Extensions.Logging;

namespace Centinelia.BillingContpaqi.Writer.Watch;

/// <summary>
/// Procesa un archivo XML de importación multi-factura contra CONTPAQi vía
/// una <see cref="ContpaqiSession"/> ya abierta. Por cada factura del lote:
/// resuelve RFC→código, crea el documento, agrega líneas, timbra con retry y
/// extrae el XML timbrado. Los CFDIs individuales se escriben al outbox via
/// el <see cref="IInboxStorage"/> inyectado. Al final produce un
/// <see cref="BatchReport"/> que el <see cref="WatchLoop"/> usa para decidir
/// dónde mover el archivo original.
///
/// El procesador NO abre/cierra la sesión CONTPAQi — asume que el caller
/// (el watcher loop) reusa una sesión durante toda la vida del proceso,
/// porque abrir sesión toma segundos y no queremos pagarlo por archivo.
/// </summary>
public sealed class BatchProcessor
{
    private readonly ContpaqiSession _session;
    private readonly CatalogLookup   _catalog;
    private readonly IInboxStorage   _storage;
    private readonly string          _concepto;
    private readonly string          _csdPassword;
    private readonly ILogger         _logger;

    public BatchProcessor(
        ContpaqiSession session,
        CatalogLookup catalog,
        IInboxStorage storage,
        string concepto,
        string csdPassword,
        ILogger logger)
    {
        _session     = session;
        _catalog     = catalog;
        _storage     = storage;
        _concepto    = concepto;
        _csdPassword = csdPassword;
        _logger      = logger;
    }

    /// <summary>
    /// Procesa un archivo de lote leyéndolo del storage. Escribe los XMLs
    /// timbrados al subdir <c>timbrados/</c> con nombre <c>{basename}_{serie}{folio}.xml</c>.
    /// Devuelve el reporte con resultado por factura para que el caller decida
    /// dónde mover el archivo original (procesados o errores).
    /// </summary>
    public async Task<BatchReport> ProcessAsync(string filename, CancellationToken ct)
    {
        var basename = Path.GetFileNameWithoutExtension(filename);
        var text     = await _storage.ReadInboxTextAsync(filename, ct);
        var invoices = ImportXmlParser.Parse(text);

        var results = new List<InvoiceResult>();
        var index   = 0;

        foreach (var invoice in invoices)
        {
            if (ct.IsCancellationRequested) break;
            try
            {
                var codigoCliente = _catalog.FindClientCodeByRfc(invoice.RfcReceptor)
                    ?? throw new InvalidOperationException(
                        $"RFC '{invoice.RfcReceptor}' no existe en admClientes de la empresa abierta");

                _session.FindCliente(codigoCliente);
                foreach (var line in invoice.Lines)
                {
                    _session.FindProducto(line.CodigoProducto);
                }

                var header = new InvoiceHeader
                {
                    CodigoConcepto = _concepto,
                    Serie          = invoice.Serie,
                    CodigoCliente  = codigoCliente,
                    // CONTPAQi acepta MM/dd/yyyy. Convertimos desde el YYYY-MM-DD que
                    // emite Nala. InvariantCulture obligatorio: en Windows es-MX
                    // (máquina de Beatriz) el parser default puede interpretar
                    // fechas ISO alternativas de forma incorrecta. Auditoría 2026-09-04.
                    Fecha          = ParseNalaDate(invoice.Fecha).ToString("MM/dd/yyyy", System.Globalization.CultureInfo.InvariantCulture),
                    Referencia     = $"nala:{basename}#{index}",
                };
                var (idDoc, _) = _session.CreateDocumentHeader(header);

                // fAltaDocumento no propaga el folio al struct; queryeamos SQL.
                var folio = _catalog.GetFolioByDocumentId(idDoc);

                foreach (var line in invoice.Lines)
                {
                    _session.AddLine(idDoc, new InvoiceLine
                    {
                        CodigoProducto = line.CodigoProducto,
                        Cantidad       = line.Cantidad,
                        PrecioUnitario = line.PrecioUnitario,
                        CodigoAlmacen  = "1",
                    });
                }

                var stampLabel = $"stamp {_concepto}-{invoice.Serie}-{folio} rfc={invoice.RfcReceptor}";
                // uuidCheck permite al RetryPolicy detectar "el timbre entró
                // aunque el PAC devolvió error de red" y evitar duplicado fiscal.
                RetryPolicy.Stamp(
                    () => _session.StampDocument(_concepto, invoice.Serie, folio, _csdPassword),
                    _logger,
                    stampLabel,
                    uuidCheck: () =>
                    {
                        try
                        {
                            var u = _session.GetDocumentUuid(_concepto, invoice.Serie, folio);
                            return string.IsNullOrEmpty(u) ? null : u;
                        }
                        catch { return null; }
                    });
                var uuid = _session.GetDocumentUuid(_concepto, invoice.Serie, folio);
                var xml  = _session.FetchTimbradoXml(_concepto, invoice.Serie, folio);

                // Formato invariante para que la cultura del OS (es-MX usa coma decimal)
                // no meta un separador en el nombre del archivo. Folios de CONTPAQi son
                // enteros consecutivos, pero mejor defensivo que sorpresa a las 2 AM.
                var folioStr = folio.ToString("0", System.Globalization.CultureInfo.InvariantCulture);
                var timbradoName = $"{basename}_{invoice.Serie}{folioStr}.xml";
                await _storage.WriteOutboxTextAsync("timbrados", timbradoName, xml, ct);

                results.Add(new InvoiceResult(
                    Index: index,
                    Rfc:   invoice.RfcReceptor,
                    Ok:    true,
                    Serie: invoice.Serie,
                    Folio: folio,
                    Uuid:  uuid,
                    TimbradoPath: timbradoName,
                    Kind:  ErrorKind.Other, // ignored when Ok=true
                    HumanMessage: null,
                    Error: null));
                _logger.LogInformation(
                    "[batch] {basename}#{index} rfc={rfc} timbrada como {serie}{folio} uuid={uuid}",
                    basename, index, invoice.RfcReceptor, invoice.Serie, folio, uuid);
            }
            catch (Exception ex)
            {
                var (kind, humanMsg) = ErrorClassifier.Classify(ex);
                results.Add(new InvoiceResult(
                    Index: index,
                    Rfc:   invoice.RfcReceptor,
                    Ok:    false,
                    Serie: invoice.Serie,
                    Folio: 0,
                    Uuid:  null,
                    TimbradoPath: null,
                    Kind:  kind,
                    HumanMessage: humanMsg,
                    Error: $"{ex.GetType().Name}: {ex.Message}"));
                _logger.LogError(ex,
                    "[batch] {basename}#{index} rfc={rfc} kind={kind}: {msg}",
                    basename, index, invoice.RfcReceptor, kind, humanMsg);
            }
            index++;
        }

        return new BatchReport(
            SourceFile:  filename,
            ProcessedAt: DateTime.UtcNow,
            Results:     results,
            AllOk:       results.All(r => r.Ok));
    }

    /// <summary>
    /// Parseo estricto de la fecha que emite Nala en el XML (formato ISO
    /// YYYY-MM-DD o timestamp UTC ISO). InvariantCulture obligatorio para no
    /// depender de la cultura del OS (es-MX interpreta formatos diferente).
    /// </summary>
    private static DateTime ParseNalaDate(string s)
    {
        var invariant = System.Globalization.CultureInfo.InvariantCulture;
        var formats = new[]
        {
            "yyyy-MM-dd",
            "yyyy-MM-ddTHH:mm:ss",
            "yyyy-MM-ddTHH:mm:ssZ",
            "yyyy-MM-ddTHH:mm:ss.fffZ",
            "yyyy-MM-dd HH:mm:ss",
        };
        if (DateTime.TryParseExact(s, formats, invariant,
                System.Globalization.DateTimeStyles.AssumeUniversal |
                System.Globalization.DateTimeStyles.AdjustToUniversal,
                out var dt))
            return dt;
        // Fallback tolerante también con InvariantCulture (no CurrentCulture).
        return DateTime.Parse(s, invariant,
            System.Globalization.DateTimeStyles.AssumeUniversal |
            System.Globalization.DateTimeStyles.AdjustToUniversal);
    }
}

public sealed record BatchReport(
    string SourceFile,
    DateTime ProcessedAt,
    List<InvoiceResult> Results,
    bool AllOk)
{
    public string ToJson() => JsonSerializer.Serialize(this, new JsonSerializerOptions
    {
        WriteIndented = true,
        // camelCase para que el consumer JS (Nala) lo consuma sin ceremonias.
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        // ErrorKind se serializa como string ('rfcNotFound', 'pacError', ...)
        // en vez de int; mucho más útil para Nala hacer switch por tipo.
        Converters =
        {
            new System.Text.Json.Serialization.JsonStringEnumConverter(JsonNamingPolicy.CamelCase),
        },
    });
}

public sealed record InvoiceResult(
    int Index,
    string Rfc,
    bool Ok,
    string Serie,
    double Folio,
    string? Uuid,
    string? TimbradoPath,
    /// <summary>Categoría del error para que Nala decida acción (reintento, reply, escalar).</summary>
    ErrorKind Kind,
    /// <summary>Mensaje en español dirigido al operador Centinelia (Nala lo adapta para el cliente).</summary>
    string? HumanMessage,
    /// <summary>Detalle técnico (tipo + mensaje) para debug.</summary>
    string? Error);
