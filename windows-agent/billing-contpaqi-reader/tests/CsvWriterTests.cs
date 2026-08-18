using System.IO;
using System.Text;
using BillingContpaqiReader.Db.Models;
using BillingContpaqiReader.Export;

public class CsvWriterTests
{
    // ---- helpers ----

    private static string WriteClientsToString(IEnumerable<ContpaqiClient> clients)
    {
        using var ms = new MemoryStream();
        CsvWriter.WriteClients(clients, ms);
        // Skip the 3-byte UTF-8 BOM when decoding; normalise CRLF → LF for easy line splitting
        return Encoding.UTF8.GetString(ms.ToArray(), 3, (int)ms.Length - 3).Replace("\r\n", "\n");
    }

    private static byte[] WriteClientsToBytes(IEnumerable<ContpaqiClient> clients)
    {
        using var ms = new MemoryStream();
        CsvWriter.WriteClients(clients, ms);
        return ms.ToArray();
    }

    private static string WriteProductsToString(IEnumerable<ContpaqiProduct> products)
    {
        using var ms = new MemoryStream();
        CsvWriter.WriteProducts(products, ms);
        // Skip the 3-byte UTF-8 BOM; normalise CRLF → LF for easy line splitting
        return Encoding.UTF8.GetString(ms.ToArray(), 3, (int)ms.Length - 3).Replace("\r\n", "\n");
    }

    // ---- tests ----

    [Fact]
    public void WriteClients_happy_path_produces_correct_headers_and_row()
    {
        var client = new ContpaqiClient(
            Rfc: "XAXX010101000",
            AdapterClientId: "CLI001",
            RazonSocial: "Empresa SA de CV",
            UsoCfdi: "G03",
            RegimenFiscal: "601",
            CodigoPostal: "64000",
            Email: "facturacion@empresa.com",
            Telefono: "8181234567");

        var csv = WriteClientsToString([client]);
        var lines = csv.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        Assert.Equal("rfc,adapter_client_id,razon_social,uso_cfdi,regimen_fiscal,codigo_postal,email,telefono", lines[0]);
        Assert.Equal("XAXX010101000,CLI001,Empresa SA de CV,G03,601,64000,facturacion@empresa.com,8181234567", lines[1]);
    }

    [Fact]
    public void WriteClients_starts_with_UTF8_BOM()
    {
        var client = new ContpaqiClient("RFC1", "C1", "Razón", "G01", "601", "12345", "a@b.com", "5551234567");
        var bytes = WriteClientsToBytes([client]);

        Assert.Equal(0xEF, bytes[0]);
        Assert.Equal(0xBB, bytes[1]);
        Assert.Equal(0xBF, bytes[2]);
    }

    [Fact]
    public void WriteClients_rfc_is_uppercased()
    {
        var client = new ContpaqiClient("xaxx010101000", "C1", "Razón SA", "G03", "601", "64000", "a@b.com", "8181234567");
        var csv = WriteClientsToString([client]);
        var lines = csv.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        Assert.StartsWith("XAXX010101000", lines[1]);
    }

    [Fact]
    public void WriteClients_quoting_comma_in_field()
    {
        // razon_social contains a comma → must be quoted
        var client = new ContpaqiClient(
            Rfc: "RFC123",
            AdapterClientId: "CLI002",
            RazonSocial: "Empresa, SA de CV",
            UsoCfdi: "G03",
            RegimenFiscal: "601",
            CodigoPostal: "64000",
            Email: "x@y.com",
            Telefono: "8181111111");

        var csv = WriteClientsToString([client]);
        var lines = csv.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        Assert.Contains("\"Empresa, SA de CV\"", lines[1]);
    }

    [Fact]
    public void WriteClients_quoting_double_quote_in_field()
    {
        // razon_social contains a double-quote → must be escaped as ""
        var client = new ContpaqiClient(
            Rfc: "RFC456",
            AdapterClientId: "CLI003",
            RazonSocial: "Empresa \"Alfa\" SA",
            UsoCfdi: "G03",
            RegimenFiscal: "601",
            CodigoPostal: "64000",
            Email: "a@b.com",
            Telefono: "8182222222");

        var csv = WriteClientsToString([client]);
        var lines = csv.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        Assert.Contains("\"Empresa \"\"Alfa\"\" SA\"", lines[1]);
    }

    [Fact]
    public void WriteProducts_happy_path_produces_correct_headers_and_row()
    {
        var product = new ContpaqiProduct(
            Sku: "PROD001",
            Nombre: "Servicio de Contabilidad",
            Unidad: "E48",
            Precio: 1500.00m,
            ClaveSat: "84111506",
            IvaTasa: 16.0m);

        var csv = WriteProductsToString([product]);
        var lines = csv.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        Assert.Equal("sku,nombre,unidad,precio,clave_sat,iva_tasa", lines[0]);
        Assert.Equal("PROD001,Servicio de Contabilidad,E48,1500.0,84111506,16.0", lines[1]);
    }

    [Fact]
    public void WriteProducts_decimal_uses_dot_separator()
    {
        var product = new ContpaqiProduct("SKU1", "Prod", "H87", 18.5m, "43211501", 0.0m);
        var csv = WriteProductsToString([product]);
        var lines = csv.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        // precio=18.5, iva_tasa=0.0 — InvariantCulture, format 0.0#
        Assert.Equal("SKU1,Prod,H87,18.5,43211501,0.0", lines[1]);
    }

    [Fact]
    public void WriteProducts_starts_with_UTF8_BOM()
    {
        var product = new ContpaqiProduct("SKU1", "Prod", "H87", 10m, "43211501", 16m);
        using var ms = new MemoryStream();
        CsvWriter.WriteProducts([product], ms);
        var bytes = ms.ToArray();

        Assert.Equal(0xEF, bytes[0]);
        Assert.Equal(0xBB, bytes[1]);
        Assert.Equal(0xBF, bytes[2]);
    }

    [Fact]
    public void WriteClients_empty_list_produces_only_header()
    {
        var csv = WriteClientsToString([]);
        var lines = csv.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        Assert.Single(lines);
        Assert.Equal("rfc,adapter_client_id,razon_social,uso_cfdi,regimen_fiscal,codigo_postal,email,telefono", lines[0]);
    }

    [Fact]
    public void WriteProducts_empty_list_produces_only_header()
    {
        var csv = WriteProductsToString([]);
        var lines = csv.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        Assert.Single(lines);
        Assert.Equal("sku,nombre,unidad,precio,clave_sat,iva_tasa", lines[0]);
    }
}
