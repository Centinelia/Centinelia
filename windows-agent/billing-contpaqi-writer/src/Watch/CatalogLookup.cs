using Microsoft.Data.SqlClient;

namespace Centinelia.BillingContpaqi.Writer.Watch;

/// <summary>
/// Lookups directos a la BD CONTPAQi que el SDK no expone:
///   - RFC → código interno de cliente en admClientes.
///   - CIDDOCUMENTO → CFOLIO asignado por CONTPAQi tras fAltaDocumento
///     (el SDK no propaga el folio al struct TDocumento por ref).
///
/// Read-only. Cada llamada abre + cierra su propia conexión; el volumen es
/// bajo (unos pocos queries por factura) y el aislamiento evita compartir
/// estado con el hilo del SDK.
/// </summary>
public sealed class CatalogLookup
{
    private readonly string _connectionString;

    public CatalogLookup(string connectionString)
    {
        _connectionString = connectionString;
    }

    /// <summary>
    /// Retorna el código interno del cliente cuyo RFC coincide, o null si no existe.
    /// Comparación exacta case-sensitive contra <c>admClientes.CRFC</c>.
    /// </summary>
    public string? FindClientCodeByRfc(string rfc)
    {
        using var conn = new SqlConnection(_connectionString);
        conn.Open();
        using var cmd = new SqlCommand(
            "SELECT TOP 1 CCODIGOCLIENTE FROM admClientes WHERE CRFC = @rfc",
            conn);
        cmd.Parameters.AddWithValue("@rfc", rfc);
        var result = cmd.ExecuteScalar();
        return result is null or DBNull ? null : (string)result;
    }

    /// <summary>
    /// Retorna el folio asignado por CONTPAQi al documento recién creado.
    /// Llamar inmediatamente después de <c>fAltaDocumento</c>, usando el
    /// ID interno que devolvió el SDK.
    /// </summary>
    public double GetFolioByDocumentId(int idDocumento)
    {
        using var conn = new SqlConnection(_connectionString);
        conn.Open();
        using var cmd = new SqlCommand(
            "SELECT CFOLIO FROM admDocumentos WHERE CIDDOCUMENTO = @id",
            conn);
        cmd.Parameters.AddWithValue("@id", idDocumento);
        var result = cmd.ExecuteScalar()
            ?? throw new InvalidOperationException($"No existe admDocumentos con CIDDOCUMENTO={idDocumento}");
        return Convert.ToDouble(result);
    }
}
