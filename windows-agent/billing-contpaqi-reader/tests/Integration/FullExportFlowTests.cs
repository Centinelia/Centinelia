using System.Text;
using System.Text.Json;
using FirebirdSql.Data.FirebirdClient;
using BillingContpaqiReader.Config;
using BillingContpaqiReader.Db;
using BillingContpaqiReader.Logging;
using BillingContpaqiReader.Scheduling;
using BillingContpaqiReader.Storage;

namespace BillingContpaqiReader.Tests.Integration;

/// <summary>
/// End-to-end integration test: real Firebird embedded DB in tempdir + CapturingUploader.
/// Exercises the full PeriodicRunner.RunOnceAsync() pipeline and asserts file contents.
/// </summary>
public class FullExportFlowTests : IDisposable
{
    private readonly string _dbPath;
    private readonly string _connectionString;
    private readonly string _logPath;

    public FullExportFlowTests()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), $"e2e_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        _dbPath = Path.Combine(tempDir, "test.fdb");
        _logPath = Path.Combine(tempDir, "agent.log");

        _connectionString = new FbConnectionStringBuilder
        {
            Database = _dbPath,
            UserID = "SYSDBA",
            Password = "masterkey",
            ServerType = FbServerType.Embedded,
            Charset = "UTF8",
            Pooling = false
        }.ToString();

        FbConnection.CreateDatabase(_connectionString, pageSize: 16384, forcedWrites: false, overwrite: true);
        CreateSchema();
    }

    public void Dispose()
    {
        var dir = Path.GetDirectoryName(_dbPath)!;
        try { Directory.Delete(dir, recursive: true); } catch { }
    }

    // ---------------------------------------------------------------------------
    // Main end-to-end test
    // ---------------------------------------------------------------------------

    [Fact]
    public async Task RunOnceAsync_uploads_three_files_with_expected_content()
    {
        // Arrange — seed data (RFC max 13 chars per Firebird schema, e.g. XAXX010101000)
        InsertClient("XAXX010101000", "CLI001", "Empresa Test SA de CV", "G03", "601", "64000", "empresa@test.com", "8181234567");
        InsertClient("XEXX010101000", "CLI002", "Otra Empresa SC", "G01", "612", "64100", "otra@test.com", "");
        InsertProduct("PROD-SERV-01", "Servicio Contable Mensual", "SERV", 1500.00m, "84111506", 0.16m);
        InsertProduct("PROD-SOFT-02", "Licencia Software", "PZA", 3500.00m, "43232100", 0.16m);

        var basePath = "/Centinelia/Test/Acme";

        var config = new AppConfig
        {
            DbProvider = "firebird",
            DbConnectionString = _connectionString,
            DropboxAccessToken = "fake-token-for-test",
            DropboxBasePath = basePath,
            AgentVersion = "0.1.0-test",
            SyncIntervalMinutes = 15
        };

        var repo = new FirebirdCatalogRepository(_connectionString);
        var uploader = new CapturingUploader();
        var logger = new FileLogger(_logPath);
        var runner = new PeriodicRunner(config, repo, uploader, logger);

        // Act
        await runner.RunOnceAsync();

        // Assert — 3 files uploaded
        Assert.Equal(3, uploader.Uploads.Count);

        var clientsPath = $"{basePath}/Config/contpaqi_clientes.csv";
        var productsPath = $"{basePath}/Config/contpaqi_productos.csv";
        var freshnessPath = $"{basePath}/Config/last_sync.json";

        Assert.True(uploader.Uploads.ContainsKey(clientsPath), $"Expected key '{clientsPath}' in uploads. Keys: {string.Join(", ", uploader.Uploads.Keys)}");
        Assert.True(uploader.Uploads.ContainsKey(productsPath), $"Expected key '{productsPath}' in uploads.");
        Assert.True(uploader.Uploads.ContainsKey(freshnessPath), $"Expected key '{freshnessPath}' in uploads.");

        // Assert — clients CSV content
        var clientsCsv = Encoding.UTF8.GetString(uploader.Uploads[clientsPath]);
        Assert.Contains("rfc,adapter_client_id,razon_social", clientsCsv);
        Assert.Contains("XAXX010101000", clientsCsv);
        Assert.Contains("XEXX010101000", clientsCsv);
        Assert.Contains("CLI001", clientsCsv);
        Assert.Contains("CLI002", clientsCsv);
        Assert.Contains("Empresa Test SA de CV", clientsCsv);
        Assert.Contains("G03", clientsCsv);

        // Assert — clients CSV has correct row count (header + 2 data rows)
        var clientLines = clientsCsv.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(3, clientLines.Length); // header + 2 clients

        // Assert — products CSV content
        var productsCsv = Encoding.UTF8.GetString(uploader.Uploads[productsPath]);
        Assert.Contains("sku,nombre,unidad,precio,clave_sat,iva_tasa", productsCsv);
        Assert.Contains("PROD-SERV-01", productsCsv);
        Assert.Contains("PROD-SOFT-02", productsCsv);
        Assert.Contains("Servicio Contable Mensual", productsCsv);
        Assert.Contains("1500.0", productsCsv);
        Assert.Contains("3500.0", productsCsv);
        Assert.Contains("84111506", productsCsv);
        Assert.Contains("0.16", productsCsv);

        // Assert — products CSV has correct row count (header + 2 data rows)
        var productLines = productsCsv.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(3, productLines.Length); // header + 2 products

        // Assert — freshness JSON
        var freshnessJson = Encoding.UTF8.GetString(uploader.Uploads[freshnessPath]);
        var doc = JsonDocument.Parse(freshnessJson);
        var root = doc.RootElement;

        Assert.Equal("ok", root.GetProperty("status").GetString());
        Assert.Equal(2, root.GetProperty("records").GetProperty("clients").GetInt32());
        Assert.Equal(2, root.GetProperty("records").GetProperty("products").GetInt32());
        Assert.Equal("0.1.0-test", root.GetProperty("agent_version").GetString());
        Assert.True(root.TryGetProperty("last_sync_at", out _), "freshness JSON must have last_sync_at");
        Assert.True(root.TryGetProperty("duration_ms", out _), "freshness JSON must have duration_ms");

        // Verify last_sync_at is a valid ISO 8601 UTC timestamp
        var lastSyncAt = root.GetProperty("last_sync_at").GetString()!;
        Assert.True(DateTimeOffset.TryParse(lastSyncAt, out _), $"last_sync_at '{lastSyncAt}' is not a valid timestamp");
    }

    [Fact]
    public async Task RunOnceAsync_with_empty_tables_uploads_status_ok_with_zero_counts()
    {
        // Arrange — no rows inserted
        var basePath = "/Centinelia/Test/Empty";

        var config = new AppConfig
        {
            DbProvider = "firebird",
            DbConnectionString = _connectionString,
            DropboxAccessToken = "fake-token",
            DropboxBasePath = basePath,
            AgentVersion = "0.1.0-test",
            SyncIntervalMinutes = 15
        };

        var repo = new FirebirdCatalogRepository(_connectionString);
        var uploader = new CapturingUploader();
        var logger = new FileLogger(_logPath);
        var runner = new PeriodicRunner(config, repo, uploader, logger);

        // Act
        await runner.RunOnceAsync();

        // Assert — 3 files still uploaded even with zero rows
        Assert.Equal(3, uploader.Uploads.Count);

        var freshnessPath = $"{basePath}/Config/last_sync.json";
        var freshnessJson = Encoding.UTF8.GetString(uploader.Uploads[freshnessPath]);
        var doc = JsonDocument.Parse(freshnessJson);
        var root = doc.RootElement;

        Assert.Equal("ok", root.GetProperty("status").GetString());
        Assert.Equal(0, root.GetProperty("records").GetProperty("clients").GetInt32());
        Assert.Equal(0, root.GetProperty("records").GetProperty("products").GetInt32());

        // Clients CSV should have only the header row
        var clientsPath = $"{basePath}/Config/contpaqi_clientes.csv";
        var clientsCsv = Encoding.UTF8.GetString(uploader.Uploads[clientsPath]);
        Assert.Contains("rfc,adapter_client_id,razon_social", clientsCsv);
        var dataLines = clientsCsv.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        Assert.Single(dataLines); // header only
    }

    [Fact]
    public async Task RunOnceAsync_rfcs_are_normalized_to_uppercase_in_csv()
    {
        // Use a lowercase RFC that fits in VARCHAR(13): e.g. "xaxx010101000" = 13 chars
        InsertClient("xaxx010101000", "CLI099", "Empresa Lower SA", "G03", "601", "64000", "", "");

        var config = new AppConfig
        {
            DbProvider = "firebird",
            DbConnectionString = _connectionString,
            DropboxAccessToken = "fake-token",
            DropboxBasePath = "/test",
            AgentVersion = "0.1.0-test",
            SyncIntervalMinutes = 15
        };

        var repo = new FirebirdCatalogRepository(_connectionString);
        var uploader = new CapturingUploader();
        var logger = new FileLogger(_logPath);
        var runner = new PeriodicRunner(config, repo, uploader, logger);

        await runner.RunOnceAsync();

        var clientsPath = "/test/Config/contpaqi_clientes.csv";
        var clientsCsv = Encoding.UTF8.GetString(uploader.Uploads[clientsPath]);

        // RFC must be uppercased in the output CSV
        Assert.Contains("XAXX010101000", clientsCsv);
        Assert.DoesNotContain("xaxx010101000", clientsCsv);
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private void CreateSchema()
    {
        using var conn = new FbConnection(_connectionString);
        conn.Open();

        ExecuteDdl(conn, @"
            CREATE TABLE admClientes (
                cRFC           VARCHAR(13),
                cCodigoCliente VARCHAR(30),
                cRazonSocial   VARCHAR(200),
                cUsoCFDI       VARCHAR(10),
                cRegimenFiscal VARCHAR(10),
                cCodigoPostal  VARCHAR(10),
                cEmail         VARCHAR(200),
                cTelefono1     VARCHAR(30)
            )");

        ExecuteDdl(conn, @"
            CREATE TABLE admProductos (
                cCodigoProducto      VARCHAR(30),
                cNombreProducto      VARCHAR(200),
                cUnidadNoConvertible VARCHAR(10),
                cPrecio1             NUMERIC(15,4),
                cClaveSAT            VARCHAR(20),
                cValorTasaImpuesto1  NUMERIC(10,6)
            )");
    }

    private static void ExecuteDdl(FbConnection conn, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    private void InsertClient(string rfc, string codigo, string razon, string uso, string regimen, string cp, string email, string tel)
    {
        using var conn = new FbConnection(_connectionString);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO admClientes
                (cRFC, cCodigoCliente, cRazonSocial, cUsoCFDI, cRegimenFiscal, cCodigoPostal, cEmail, cTelefono1)
            VALUES
                (@rfc, @codigo, @razon, @uso, @regimen, @cp, @email, @tel)";
        cmd.Parameters.AddWithValue("@rfc", rfc);
        cmd.Parameters.AddWithValue("@codigo", codigo);
        cmd.Parameters.AddWithValue("@razon", razon);
        cmd.Parameters.AddWithValue("@uso", uso);
        cmd.Parameters.AddWithValue("@regimen", regimen);
        cmd.Parameters.AddWithValue("@cp", cp);
        cmd.Parameters.AddWithValue("@email", email);
        cmd.Parameters.AddWithValue("@tel", tel);
        cmd.ExecuteNonQuery();
    }

    private void InsertProduct(string sku, string nombre, string unidad, decimal precio, string claveSat, decimal iva)
    {
        using var conn = new FbConnection(_connectionString);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO admProductos
                (cCodigoProducto, cNombreProducto, cUnidadNoConvertible, cPrecio1, cClaveSAT, cValorTasaImpuesto1)
            VALUES
                (@sku, @nombre, @unidad, @precio, @clave, @iva)";
        cmd.Parameters.AddWithValue("@sku", sku);
        cmd.Parameters.AddWithValue("@nombre", nombre);
        cmd.Parameters.AddWithValue("@unidad", unidad);
        cmd.Parameters.AddWithValue("@precio", precio);
        cmd.Parameters.AddWithValue("@clave", claveSat);
        cmd.Parameters.AddWithValue("@iva", iva);
        cmd.ExecuteNonQuery();
    }
}

/// <summary>
/// Test double for IDropboxUploader that captures all uploads in memory.
/// Thread-safe via lock on Uploads.
/// </summary>
internal sealed class CapturingUploader : IDropboxUploader
{
    private readonly object _lock = new();
    public Dictionary<string, byte[]> Uploads { get; } = new();

    public async Task UploadAsync(string dropboxPath, Stream content)
    {
        using var ms = new MemoryStream();
        await content.CopyToAsync(ms);
        var bytes = ms.ToArray();

        lock (_lock)
        {
            Uploads[dropboxPath] = bytes;
        }
    }
}
