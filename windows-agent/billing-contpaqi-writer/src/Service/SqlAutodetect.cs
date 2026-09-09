using Microsoft.Data.SqlClient;

namespace Centinelia.BillingContpaqi.Writer.Service;

/// <summary>
/// Descubre la conexión SQL Server local sin que la clienta tenga que armar el
/// connection string. Prueba instancias comunes (COMPAC, SQLEXPRESS, default)
/// con el nombre de la BD derivado del folder de la empresa CONTPAQi.
///
/// Se invoca cuando el campo "Conexión SQL Server" viene vacío desde el portal
/// (auto-detect) o cuando el string explícito no conecta y queremos degradar
/// con un intento.
/// </summary>
public static class SqlAutodetect
{
    /// <summary>
    /// Instancias que probamos en orden. COMPAC primero porque es la que
    /// crea el instalador de CONTPAQi Comercial en el 90% de los setups.
    /// </summary>
    private static readonly string[] CandidateServers = new[]
    {
        @".\COMPAC",
        @".\SQLEXPRESS",
        @"(local)\COMPAC",
        @"(local)\SQLEXPRESS",
        @"(local)",
        @"localhost\COMPAC",
        @"localhost\SQLEXPRESS",
        @"localhost",
        @".",
    };

    public sealed record DetectedConnection(string ConnectionString, string ServerTried);

    /// <summary>
    /// Recorre las instancias candidatas hasta encontrar una que abra + tenga
    /// la BD derivada del folder empresa. Devuelve null si ninguna funciona
    /// (probablemente SQL local con instancia custom o BD con otro nombre).
    /// </summary>
    public static DetectedConnection? TryDetect(string empresaPath, TimeSpan perAttemptTimeout, Action<string>? progress = null)
    {
        if (string.IsNullOrWhiteSpace(empresaPath)) return null;
        var dbName = Path.GetFileName(empresaPath.TrimEnd(Path.DirectorySeparatorChar));
        if (string.IsNullOrEmpty(dbName)) return null;

        foreach (var server in CandidateServers)
        {
            var connStr = $"Server={server};Database={dbName};Integrated Security=true;TrustServerCertificate=true;Connect Timeout={(int)perAttemptTimeout.TotalSeconds}";
            progress?.Invoke($"probando {server}...");
            if (TryConnect(connStr))
            {
                return new DetectedConnection(connStr, server);
            }
        }
        return null;
    }

    /// <summary>
    /// Ping barato — abre + SELECT 1 + close. Timeout ya viene embebido en el
    /// connection string. Cualquier SqlException se interpreta como "esta
    /// instancia no sirve, siguiente".
    /// </summary>
    private static bool TryConnect(string connStr)
    {
        try
        {
            using var conn = new SqlConnection(connStr);
            conn.Open();
            using var cmd = new SqlCommand("SELECT 1", conn);
            cmd.ExecuteScalar();
            return true;
        }
        catch (SqlException)
        {
            return false;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
        catch (Exception)
        {
            return false;
        }
    }
}
