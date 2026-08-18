using System.Globalization;
using System.IO;
using System.Text;
using BillingContpaqiReader.Db.Models;

namespace BillingContpaqiReader.Export;

public static class CsvWriter
{
    private static readonly Encoding Utf8Bom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: true);

    // ---- public API ----

    public static void WriteClients(IEnumerable<ContpaqiClient> clients, Stream output)
    {
        using var writer = new StreamWriter(output, Utf8Bom, leaveOpen: true);
        writer.NewLine = "\r\n"; // RFC 4180 uses CRLF

        writer.WriteLine("rfc,adapter_client_id,razon_social,uso_cfdi,regimen_fiscal,codigo_postal,email,telefono");

        foreach (var c in clients)
        {
            writer.WriteLine(string.Join(",",
                Escape(c.Rfc.ToUpperInvariant()),
                Escape(c.AdapterClientId),
                Escape(c.RazonSocial),
                Escape(c.UsoCfdi),
                Escape(c.RegimenFiscal),
                Escape(c.CodigoPostal),
                Escape(c.Email),
                Escape(c.Telefono)));
        }
    }

    public static void WriteProducts(IEnumerable<ContpaqiProduct> products, Stream output)
    {
        using var writer = new StreamWriter(output, Utf8Bom, leaveOpen: true);
        writer.NewLine = "\r\n";

        writer.WriteLine("sku,nombre,unidad,precio,clave_sat,iva_tasa");

        foreach (var p in products)
        {
            writer.WriteLine(string.Join(",",
                Escape(p.Sku),
                Escape(p.Nombre),
                Escape(p.Unidad),
                FormatDecimal(p.Precio),
                Escape(p.ClaveSat),
                FormatDecimal(p.IvaTasa)));
        }
    }

    // ---- private helpers ----

    /// <summary>
    /// RFC 4180 quoting: if the field contains comma, double-quote, CR, or LF,
    /// wrap it in double-quotes and escape any embedded double-quotes as "".
    /// Returns empty string for null fields.
    /// </summary>
    private static string Escape(string? field)
    {
        if (field is null) return "";
        if (field.Contains(',') || field.Contains('"') || field.Contains('\r') || field.Contains('\n'))
        {
            return "\"" + field.Replace("\"", "\"\"") + "\"";
        }
        return field;
    }

    /// <summary>
    /// Format decimal with InvariantCulture, pattern "0.0#" so that:
    ///   16    → "16.0"
    ///   18.5  → "18.5"
    ///   0     → "0.0"
    ///   1500  → "1500.0"
    /// </summary>
    private static string FormatDecimal(decimal value)
        => value.ToString("0.0#", CultureInfo.InvariantCulture);
}
