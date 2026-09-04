using System.Text.Json;
using Centinelia.BillingContpaqi.Writer.Sdk;

namespace Centinelia.BillingContpaqi.Writer.Watch;

/// <summary>
/// Procesa un archivo XML de importación multi-factura contra CONTPAQi vía
/// una <see cref="ContpaqiSession"/> ya abierta. Por cada factura del lote:
/// resuelve RFC→código, crea el documento, agrega líneas, timbra y extrae
/// el XML timbrado. Al final produce un <see cref="BatchReport"/>.
///
/// El procesador NO abre/cierra la sesión — asume que el caller (el watcher
/// loop) reusa una sesión durante toda la vida del proceso, porque abrir
/// sesión CONTPAQi toma segundos y no queremos pagarlo por archivo.
/// </summary>
public sealed class BatchProcessor
{
    private readonly ContpaqiSession _session;
    private readonly CatalogLookup   _catalog;
    private readonly string          _concepto;
    private readonly string          _csdPassword;
    private readonly string          _timbradosDir;

    public BatchProcessor(
        ContpaqiSession session,
        CatalogLookup catalog,
        string concepto,
        string csdPassword,
        string timbradosDir)
    {
        _session      = session;
        _catalog      = catalog;
        _concepto     = concepto;
        _csdPassword  = csdPassword;
        _timbradosDir = timbradosDir;
    }

    /// <summary>
    /// Procesa un archivo de lote. Escribe los XMLs timbrados a <c>{timbradosDir}</c>
    /// con nombre <c>{basename}_{serie}{folio}.xml</c>. Devuelve el reporte con
    /// resultado por factura.
    /// </summary>
    public BatchReport Process(string sourcePath)
    {
        var basename = Path.GetFileNameWithoutExtension(sourcePath);
        var invoices = ImportXmlParser.Parse(File.ReadAllText(sourcePath));

        var results = new List<InvoiceResult>();
        var index   = 0;

        foreach (var invoice in invoices)
        {
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
                    // CONTPAQi acepta MM/dd/yyyy. Convertimos desde el YYYY-MM-DD que emite Nala.
                    Fecha          = DateTime.Parse(invoice.Fecha).ToString("MM/dd/yyyy"),
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

                _session.StampDocument(_concepto, invoice.Serie, folio, _csdPassword);
                var uuid = _session.GetDocumentUuid(_concepto, invoice.Serie, folio);
                var xml  = _session.FetchTimbradoXml(_concepto, invoice.Serie, folio);

                Directory.CreateDirectory(_timbradosDir);
                var outPath = Path.Combine(_timbradosDir, $"{basename}_{invoice.Serie}{folio}.xml");
                File.WriteAllText(outPath, xml);

                results.Add(new InvoiceResult(
                    Index: index,
                    Rfc:   invoice.RfcReceptor,
                    Ok:    true,
                    Serie: invoice.Serie,
                    Folio: folio,
                    Uuid:  uuid,
                    TimbradoPath: outPath,
                    Error: null));
            }
            catch (Exception ex)
            {
                results.Add(new InvoiceResult(
                    Index: index,
                    Rfc:   invoice.RfcReceptor,
                    Ok:    false,
                    Serie: invoice.Serie,
                    Folio: 0,
                    Uuid:  null,
                    TimbradoPath: null,
                    Error: $"{ex.GetType().Name}: {ex.Message}"));
            }
            index++;
        }

        return new BatchReport(
            SourceFile:  Path.GetFileName(sourcePath),
            ProcessedAt: DateTime.UtcNow,
            Results:     results,
            AllOk:       results.All(r => r.Ok));
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
    string? Error);
