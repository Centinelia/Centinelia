using Microsoft.Data.SqlClient;

namespace Centinelia.BillingContpaqi.Writer.Service;

/// <summary>
/// Descubre la conexión SQL Server local sin que la clienta tenga que armar el
/// connection string. Prueba instancias comunes (COMPAC, SQLEXPRESS, default,
/// LocalDB) con el nombre de la BD derivado del folder de la empresa CONTPAQi.
///
/// Autenticación: prueba Windows Auth primero (Integrated Security). Si falla
/// contra todas las instancias, hace una segunda pasada con SQL Auth (sa +
/// passwords comunes de CONTPAQi Comercial Pro) — cubre el 90% de setups
/// Mixed Mode donde CONTPAQi manejó la instalación.
///
/// Se invoca desde Program.cs cuando (a) el portal envió el campo vacío o
/// (b) el connection string explícito no conecta (probe fallido → degradar
/// a autodetect antes de abortar con error 5).
///
/// Contexto del incidente Ramón Leang 2026-09-10:
/// SQL en Mixed Mode con sa/password gestionado por CONTPAQi, Windows user
/// FacturaRL (no admin, sin login SQL). Autodetect solo con Windows Auth
/// fallaba silencioso → error 5 → sesión bloqueada 4 horas. Este fallback
/// SQL Auth previene la repetición.
/// </summary>
public static class SqlAutodetect
{
    /// <summary>
    /// Instancias que probamos en orden. COMPAC primero porque es la que
    /// crea el instalador de CONTPAQi Comercial en el 90% de los setups.
    /// LocalDB al final para clientes que instalaron SQL Express edition
    /// más nueva (SQL 2022+).
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
        @"(LocalDb)\MSSQLLocalDB",
        @"(LocalDb)\v11.0",
    };

    /// <summary>
    /// Passwords conocidos que CONTPAQi Comercial usa para el usuario sa en
    /// instalaciones default. NUNCA prueba passwords del cliente ni hace
    /// fuerza bruta — solo el conjunto pequeño de defaults del instalador.
    /// Si ninguno funciona, degradamos a prompt interactivo.
    /// </summary>
    private static readonly string[] KnownSaPasswords = new[]
    {
        "",              // sa sin password (setups muy viejos)
        "sa",            // default estándar
        "SQL$erver",     // default en algunos scripts de deploy
        "Contpaq5",      // observado en instalaciones CONTPAQi 5.x
        "$upervis0r",    // observado en instalaciones CONTPAQi 6.x
    };

    public sealed record DetectedConnection(string ConnectionString, string ServerTried, string AuthMode);

    /// <summary>
    /// Recorre las instancias candidatas hasta encontrar una que abra + tenga
    /// la BD derivada del folder empresa. Prueba Windows Auth primero, luego
    /// SQL Auth con sa + passwords conocidos. Devuelve null si nada funciona.
    /// </summary>
    public static DetectedConnection? TryDetect(string empresaPath, TimeSpan perAttemptTimeout, Action<string>? progress = null)
    {
        if (string.IsNullOrWhiteSpace(empresaPath)) return null;
        var dbName = Path.GetFileName(empresaPath.TrimEnd(Path.DirectorySeparatorChar));
        if (string.IsNullOrEmpty(dbName)) return null;

        var timeoutSecs = (int)perAttemptTimeout.TotalSeconds;

        // Pasada 1: Windows Auth (Integrated Security). Cubre setups donde el
        // usuario Windows tiene login SQL con sysadmin o con acceso a la BD.
        foreach (var server in CandidateServers)
        {
            var connStr = $"Server={server};Database={dbName};Integrated Security=true;TrustServerCertificate=true;Connect Timeout={timeoutSecs}";
            progress?.Invoke($"probando {server} (Windows Auth)...");
            if (TryConnect(connStr))
            {
                return new DetectedConnection(connStr, server, "Windows Auth");
            }
        }

        // Pasada 2: SQL Auth con sa + passwords conocidos. Solo si Windows Auth
        // fue rechazada — evita ruido en logs de SQL Server para setups OK.
        foreach (var server in CandidateServers)
        {
            foreach (var pwd in KnownSaPasswords)
            {
                var pwdLabel = string.IsNullOrEmpty(pwd) ? "(vacío)" : $"(len={pwd.Length})";
                var connStr = $"Server={server};Database={dbName};User Id=sa;Password={pwd};TrustServerCertificate=true;Connect Timeout={timeoutSecs}";
                progress?.Invoke($"probando {server} (sa {pwdLabel})...");
                if (TryConnect(connStr))
                {
                    return new DetectedConnection(connStr, server, $"SQL Auth sa {pwdLabel}");
                }
            }
        }

        return null;
    }

    /// <summary>
    /// Prueba una connection string explícita (la que vino del portal). Se
    /// invoca ANTES de tirar autodetect: si el string del portal funciona,
    /// no hay razón para escanear. Si falla, degradamos a TryDetect.
    /// Retorna true solo si abre + SELECT 1 corre exitoso.
    /// </summary>
    public static bool Probe(string connectionString, TimeSpan timeout)
    {
        if (string.IsNullOrWhiteSpace(connectionString)) return false;
        // Asegurar que el timeout no herede uno gigante de la string original.
        var probeConn = connectionString;
        if (!probeConn.Contains("Connect Timeout", StringComparison.OrdinalIgnoreCase))
        {
            probeConn += $";Connect Timeout={(int)timeout.TotalSeconds}";
        }
        return TryConnect(probeConn);
    }

    /// <summary>
    /// Construye una connection string desde partes explícitas (server, user,
    /// password) y valida que conecta. Se usa desde el prompt interactivo
    /// cuando autodetect falla y le pedimos las credenciales a la clienta.
    /// </summary>
    public static DetectedConnection? TryWithCredentials(
        string empresaPath, string server, string user, string password, TimeSpan timeout)
    {
        var dbName = Path.GetFileName(empresaPath.TrimEnd(Path.DirectorySeparatorChar));
        if (string.IsNullOrEmpty(dbName)) return null;
        var connStr = $"Server={server};Database={dbName};User Id={user};Password={password};TrustServerCertificate=true;Connect Timeout={(int)timeout.TotalSeconds}";
        return TryConnect(connStr) ? new DetectedConnection(connStr, server, $"SQL Auth {user} (manual)") : null;
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
