using System.Xml.Linq;

namespace Centinelia.BillingContpaqi.Writer.Watch;

/// <summary>
/// Parser del XML de importación multi-factura que Nala (Vercel) deposita
/// en la bandeja de pendientes. Formato definido en
/// <c>src/lib/billing/contpaqi/xml-import.ts</c> del repo Centinelia.
///
/// El schema (namespace <c>http://www.contpaqi.com/comercial/import/v1</c>)
/// es un &lt;Documentos&gt; que contiene N &lt;Documento&gt;, cada uno con
/// &lt;Encabezado&gt; (RfcReceptor, Serie, Fecha, UsoCFDI, FormaPago...) y
/// &lt;Movimientos&gt; con N &lt;Movimiento&gt; (CodigoProducto, Cantidad,
/// PrecioUnitario). El concepto interno de CONTPAQi (ej. "440") NO viene
/// en el XML — es config del writer (banda del emisor, no del batch).
/// </summary>
public static class ImportXmlParser
{
    private static readonly XNamespace Ns = "http://www.contpaqi.com/comercial/import/v1";

    /// <summary>
    /// Parsea el XML crudo y retorna la lista de facturas a procesar.
    /// Lanza excepción si el XML no es bien formado o falta el elemento raíz.
    /// </summary>
    public static List<ImportInvoice> Parse(string xml)
    {
        var doc = XDocument.Parse(xml);
        var root = doc.Root
            ?? throw new InvalidDataException("XML sin elemento raíz");
        if (root.Name.LocalName != "Documentos")
        {
            throw new InvalidDataException($"Se esperaba raíz 'Documentos', llegó '{root.Name.LocalName}'");
        }

        var result = new List<ImportInvoice>();
        foreach (var docto in root.Elements(Ns + "Documento"))
        {
            var enc  = docto.Element(Ns + "Encabezado")
                ?? throw new InvalidDataException("Documento sin <Encabezado>");
            var movs = docto.Element(Ns + "Movimientos")
                ?? throw new InvalidDataException("Documento sin <Movimientos>");

            var lines = new List<ImportLine>();
            foreach (var mov in movs.Elements(Ns + "Movimiento"))
            {
                lines.Add(new ImportLine(
                    CodigoProducto: Required(mov, "CodigoProducto"),
                    Cantidad:       ParseDouble(Required(mov, "Cantidad")),
                    PrecioUnitario: ParseDouble(Required(mov, "PrecioUnitario"))
                ));
            }
            if (lines.Count == 0)
            {
                throw new InvalidDataException("Documento sin líneas <Movimiento>");
            }

            result.Add(new ImportInvoice(
                RfcReceptor: Required(enc, "RfcReceptor"),
                Serie:       Required(enc, "Serie"),
                Fecha:       Required(enc, "Fecha"),
                Lines:       lines
            ));
        }

        if (result.Count == 0)
        {
            throw new InvalidDataException("Lote sin ninguna factura");
        }
        return result;
    }

    private static string Required(XElement parent, string localName)
    {
        var el = parent.Element(Ns + localName);
        if (el is null || string.IsNullOrWhiteSpace(el.Value))
        {
            throw new InvalidDataException($"Falta o vacío <{localName}> en <{parent.Name.LocalName}>");
        }
        return el.Value.Trim();
    }

    private static double ParseDouble(string s) =>
        double.Parse(s, System.Globalization.CultureInfo.InvariantCulture);
}

/// <summary>Factura extraída del XML de importación (subset mínimo que el writer usa).</summary>
public sealed record ImportInvoice(
    string RfcReceptor,
    string Serie,
    /// <summary>Fecha del encabezado (formato del XML de Nala, típicamente YYYY-MM-DD).</summary>
    string Fecha,
    List<ImportLine> Lines);

/// <summary>Línea de la factura (columna Movimiento del XML).</summary>
public sealed record ImportLine(
    string CodigoProducto,
    double Cantidad,
    double PrecioUnitario);
