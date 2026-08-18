using Microsoft.Data.SqlClient;
using BillingContpaqiReader.Db;

namespace BillingContpaqiReader.Tests;

/// <summary>
/// Integration tests for SqlServerCatalogRepository.
/// All tests skip silently when (localdb)\MSSQLLocalDB is unavailable.
/// </summary>
public class SqlServerCatalogRepositoryTests : IAsyncLifetime
{
    private const string LocalDbServer = @"(localdb)\MSSQLLocalDB";
    private string? _dbName;
    private string? _connectionString;

    // -----------------------------------------------------------------------
    // LocalDB availability helper
    // -----------------------------------------------------------------------

    /// <summary>
    /// Returns true if (localdb)\MSSQLLocalDB can be opened.
    /// Uses a short connect timeout so it fails fast on CI without LocalDB.
    /// </summary>
    public static bool LocalDbAvailable()
    {
        var cs = new SqlConnectionStringBuilder
        {
            DataSource = LocalDbServer,
            InitialCatalog = "master",
            IntegratedSecurity = true,
            ConnectTimeout = 3
        }.ToString();

        try
        {
            using var conn = new SqlConnection(cs);
            conn.Open();
            return true;
        }
        catch
        {
            return false;
        }
    }

    // -----------------------------------------------------------------------
    // Test database lifecycle
    // -----------------------------------------------------------------------

    public async Task InitializeAsync()
    {
        if (!LocalDbAvailable())
            return;

        _dbName = $"TestDb_{Guid.NewGuid():N}";
        _connectionString = BuildConnectionString(_dbName);

        // Create database
        await using var masterConn = new SqlConnection(BuildConnectionString("master"));
        await masterConn.OpenAsync();
        await using var createCmd = masterConn.CreateCommand();
        createCmd.CommandText = $"CREATE DATABASE [{_dbName}]";
        await createCmd.ExecuteNonQueryAsync();

        // Create schema
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        await ExecuteDdlAsync(conn, @"
            CREATE TABLE admClientes (
                cRFC           NVARCHAR(13)  NULL,
                cCodigoCliente NVARCHAR(30)  NULL,
                cRazonSocial   NVARCHAR(200) NULL,
                cUsoCFDI       NVARCHAR(10)  NULL,
                cRegimenFiscal NVARCHAR(10)  NULL,
                cCodigoPostal  NVARCHAR(10)  NULL,
                cEmail         NVARCHAR(200) NULL,
                cTelefono1     NVARCHAR(30)  NULL
            )");

        await ExecuteDdlAsync(conn, @"
            CREATE TABLE admProductos (
                cCodigoProducto      NVARCHAR(30)    NULL,
                cNombreProducto      NVARCHAR(200)   NULL,
                cUnidadNoConvertible NVARCHAR(10)    NULL,
                cPrecio1             DECIMAL(15,4)   NULL,
                cClaveSAT            NVARCHAR(20)    NULL,
                cValorTasaImpuesto1  DECIMAL(10,6)   NULL
            )");
    }

    public async Task DisposeAsync()
    {
        if (_dbName is null)
            return;

        try
        {
            await using var masterConn = new SqlConnection(BuildConnectionString("master"));
            await masterConn.OpenAsync();
            await using var cmd = masterConn.CreateCommand();
            // Force close existing connections before drop
            cmd.CommandText = $@"
                ALTER DATABASE [{_dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                DROP DATABASE [{_dbName}]";
            await cmd.ExecuteNonQueryAsync();
        }
        catch { /* best-effort cleanup */ }
    }

    // -----------------------------------------------------------------------
    // Happy path: clients
    // -----------------------------------------------------------------------

    [Fact]
    public async Task GetClientsAsync_returns_inserted_client()
    {
        if (!LocalDbAvailable()) return;

        await InsertClientAsync("RFC-TEST-01", "CLI001", "Test SA de CV", "G03", "601", "64000", "test@test.com", "8181234567");

        var repo = new SqlServerCatalogRepository(_connectionString!);
        var clients = (await repo.GetClientsAsync()).ToList();

        Assert.Single(clients);
        var c = clients[0];
        Assert.Equal("RFC-TEST-01", c.Rfc);
        Assert.Equal("CLI001", c.AdapterClientId);
        Assert.Equal("Test SA de CV", c.RazonSocial);
        Assert.Equal("G03", c.UsoCfdi);
        Assert.Equal("601", c.RegimenFiscal);
        Assert.Equal("64000", c.CodigoPostal);
        Assert.Equal("test@test.com", c.Email);
        Assert.Equal("8181234567", c.Telefono);
    }

    [Fact]
    public async Task GetClientsAsync_normalizes_rfc_to_upper()
    {
        if (!LocalDbAvailable()) return;

        await InsertClientAsync("rfc-lower-01", "CLI002", "Lower RFC SA", "G03", "601", "64000", "", "");

        var repo = new SqlServerCatalogRepository(_connectionString!);
        var clients = (await repo.GetClientsAsync()).ToList();

        Assert.Equal("RFC-LOWER-01", clients[0].Rfc);
    }

    [Fact]
    public async Task GetClientsAsync_returns_empty_when_no_rows()
    {
        if (!LocalDbAvailable()) return;

        var repo = new SqlServerCatalogRepository(_connectionString!);
        var clients = await repo.GetClientsAsync();

        Assert.Empty(clients);
    }

    // -----------------------------------------------------------------------
    // Happy path: products
    // -----------------------------------------------------------------------

    [Fact]
    public async Task GetProductsAsync_returns_inserted_product()
    {
        if (!LocalDbAvailable()) return;

        await InsertProductAsync("PROD001", "Servicio Contable", "SERV", 1500.00m, "84111506", 0.16m);

        var repo = new SqlServerCatalogRepository(_connectionString!);
        var products = (await repo.GetProductsAsync()).ToList();

        Assert.Single(products);
        var p = products[0];
        Assert.Equal("PROD001", p.Sku);
        Assert.Equal("Servicio Contable", p.Nombre);
        Assert.Equal("SERV", p.Unidad);
        Assert.Equal(1500.00m, p.Precio);
        Assert.Equal("84111506", p.ClaveSat);
        Assert.Equal(0.16m, p.IvaTasa);
    }

    [Fact]
    public async Task GetProductsAsync_returns_empty_when_no_rows()
    {
        if (!LocalDbAvailable()) return;

        var repo = new SqlServerCatalogRepository(_connectionString!);
        var products = await repo.GetProductsAsync();

        Assert.Empty(products);
    }

    // -----------------------------------------------------------------------
    // Defensive: null columns map to empty string / 0
    // -----------------------------------------------------------------------

    [Fact]
    public async Task GetClientsAsync_handles_null_optional_fields()
    {
        if (!LocalDbAvailable()) return;

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO admClientes
                (cRFC, cCodigoCliente, cRazonSocial, cUsoCFDI, cRegimenFiscal, cCodigoPostal, cEmail, cTelefono1)
            VALUES
                ('RFC-NULL-01', 'CLI003', 'Null Fields SA', 'G03', '601', '64000', NULL, NULL)";
        await cmd.ExecuteNonQueryAsync();

        var repo = new SqlServerCatalogRepository(_connectionString!);
        var clients = (await repo.GetClientsAsync()).ToList();

        Assert.Single(clients);
        Assert.Equal("", clients[0].Email);
        Assert.Equal("", clients[0].Telefono);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static string BuildConnectionString(string database) =>
        new SqlConnectionStringBuilder
        {
            DataSource = LocalDbServer,
            InitialCatalog = database,
            IntegratedSecurity = true,
            ConnectTimeout = 10,
            TrustServerCertificate = true
        }.ToString();

    private static async Task ExecuteDdlAsync(SqlConnection conn, string sql)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task InsertClientAsync(string rfc, string codigo, string razon, string uso, string regimen, string cp, string email, string tel)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
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
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task InsertProductAsync(string sku, string nombre, string unidad, decimal precio, string claveSat, decimal iva)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
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
        await cmd.ExecuteNonQueryAsync();
    }
}
