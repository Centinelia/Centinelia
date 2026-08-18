using FirebirdSql.Data.FirebirdClient;
using BillingContpaqiReader.Db.Models;

namespace BillingContpaqiReader.Db;

public class FirebirdCatalogRepository : ICatalogRepository
{
    private readonly string _connectionString;

    public FirebirdCatalogRepository(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task<IEnumerable<ContpaqiClient>> GetClientsAsync()
    {
        const string sql = @"
            SELECT cRFC, cCodigoCliente, cRazonSocial, cUsoCFDI,
                   cRegimenFiscal, cCodigoPostal, cEmail, cTelefono1
            FROM admClientes";

        var results = new List<ContpaqiClient>();

        await using var conn = new FbConnection(_connectionString);
        await conn.OpenAsync();
        await using var cmd = new FbCommand(sql, conn);
        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            results.Add(new ContpaqiClient(
                Rfc: (reader["cRFC"]?.ToString() ?? "").ToUpperInvariant(),
                AdapterClientId: reader["cCodigoCliente"]?.ToString() ?? "",
                RazonSocial: reader["cRazonSocial"]?.ToString() ?? "",
                UsoCfdi: reader["cUsoCFDI"]?.ToString() ?? "",
                RegimenFiscal: reader["cRegimenFiscal"]?.ToString() ?? "",
                CodigoPostal: reader["cCodigoPostal"]?.ToString() ?? "",
                Email: reader["cEmail"]?.ToString() ?? "",
                Telefono: reader["cTelefono1"]?.ToString() ?? ""
            ));
        }

        return results;
    }

    public async Task<IEnumerable<ContpaqiProduct>> GetProductsAsync()
    {
        const string sql = @"
            SELECT cCodigoProducto, cNombreProducto, cUnidadNoConvertible,
                   cPrecio1, cClaveSAT, cValorTasaImpuesto1
            FROM admProductos";

        var results = new List<ContpaqiProduct>();

        await using var conn = new FbConnection(_connectionString);
        await conn.OpenAsync();
        await using var cmd = new FbCommand(sql, conn);
        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            results.Add(new ContpaqiProduct(
                Sku: reader["cCodigoProducto"]?.ToString() ?? "",
                Nombre: reader["cNombreProducto"]?.ToString() ?? "",
                Unidad: reader["cUnidadNoConvertible"]?.ToString() ?? "",
                Precio: reader.IsDBNull(reader.GetOrdinal("cPrecio1"))
                    ? 0m
                    : Convert.ToDecimal(reader["cPrecio1"]),
                ClaveSat: reader["cClaveSAT"]?.ToString() ?? "",
                IvaTasa: reader.IsDBNull(reader.GetOrdinal("cValorTasaImpuesto1"))
                    ? 0m
                    : Convert.ToDecimal(reader["cValorTasaImpuesto1"])
            ));
        }

        return results;
    }
}
