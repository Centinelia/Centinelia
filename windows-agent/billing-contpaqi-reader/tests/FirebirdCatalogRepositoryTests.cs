using FirebirdSql.Data.FirebirdClient;
using BillingContpaqiReader.Db;

namespace BillingContpaqiReader.Tests;

public class FirebirdCatalogRepositoryTests : IDisposable
{
    private readonly string _dbPath;
    private readonly string _connectionString;

    public FirebirdCatalogRepositoryTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"test_{Guid.NewGuid():N}.fdb");
        _connectionString = BuildConnectionString(_dbPath);
        CreateDatabase();
        CreateSchema();
    }

    public void Dispose()
    {
        // Firebird embedded keeps handle open briefly — suppress delete errors
        try { File.Delete(_dbPath); } catch { }
    }

    // -----------------------------------------------------------------------
    // Happy-path: clients
    // -----------------------------------------------------------------------

    [Fact]
    public async Task GetClientsAsync_returns_inserted_client()
    {
        InsertClient("RFC-TEST-01", "CLI001", "Test SA de CV", "G03", "601", "64000", "test@test.com", "8181234567");

        var repo = new FirebirdCatalogRepository(_connectionString);
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
        InsertClient("rfc-lower-01", "CLI002", "Lower RFC SA", "G03", "601", "64000", "", "");

        var repo = new FirebirdCatalogRepository(_connectionString);
        var clients = (await repo.GetClientsAsync()).ToList();

        Assert.Equal("RFC-LOWER-01", clients[0].Rfc);
    }

    [Fact]
    public async Task GetClientsAsync_returns_empty_when_no_rows()
    {
        var repo = new FirebirdCatalogRepository(_connectionString);
        var clients = await repo.GetClientsAsync();

        Assert.Empty(clients);
    }

    // -----------------------------------------------------------------------
    // Happy-path: products
    // -----------------------------------------------------------------------

    [Fact]
    public async Task GetProductsAsync_returns_inserted_product()
    {
        InsertProduct("PROD001", "Servicio Contable", "SERV", 1500.00m, "84111506", 0.16m);

        var repo = new FirebirdCatalogRepository(_connectionString);
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
        var repo = new FirebirdCatalogRepository(_connectionString);
        var products = await repo.GetProductsAsync();

        Assert.Empty(products);
    }

    // -----------------------------------------------------------------------
    // Defensive: null columns map to empty string
    // -----------------------------------------------------------------------

    [Fact]
    public async Task GetClientsAsync_handles_null_optional_fields()
    {
        // Insert with NULL email and phone
        using var conn = new FbConnection(_connectionString);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO admClientes
                (cRFC, cCodigoCliente, cRazonSocial, cUsoCFDI, cRegimenFiscal, cCodigoPostal, cEmail, cTelefono1)
            VALUES
                ('RFC-NULL-01', 'CLI003', 'Null Fields SA', 'G03', '601', '64000', NULL, NULL)";
        cmd.ExecuteNonQuery();

        var repo = new FirebirdCatalogRepository(_connectionString);
        var clients = (await repo.GetClientsAsync()).ToList();

        Assert.Single(clients);
        Assert.Equal("", clients[0].Email);
        Assert.Equal("", clients[0].Telefono);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static string BuildConnectionString(string dbPath) =>
        new FbConnectionStringBuilder
        {
            Database = dbPath,
            UserID = "SYSDBA",
            Password = "masterkey",
            ServerType = FbServerType.Embedded,
            Charset = "UTF8",
            Pooling = false
        }.ToString();

    private void CreateDatabase()
    {
        FbConnection.CreateDatabase(_connectionString, pageSize: 16384, forcedWrites: false, overwrite: true);
    }

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
