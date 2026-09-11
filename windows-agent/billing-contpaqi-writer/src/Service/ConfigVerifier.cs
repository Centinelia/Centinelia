using Centinelia.BillingContpaqi.Writer.Sdk;
using Microsoft.Data.SqlClient;

namespace Centinelia.BillingContpaqi.Writer.Service;

/// <summary>
/// Dry-run que verifica cada campo Windows-local ANTES de persistir
/// appsettings.local.json o registrar el Windows Service. Si algo falla, la
/// clienta ve exactamente qué campo está mal, corrige en el portal, descarga
/// zip nuevo, y reintenta. Sin dejar residuos (servicio roto, appsettings
/// stale, etc.).
///
/// Se corre en el proceso interactivo (doble-click), no bajo SCM.
/// </summary>
public static class ConfigVerifier
{
    public sealed record CheckResult(string Label, bool Ok, string? Detail);

    /// <summary>
    /// Corre los checks en orden y los imprime en tiempo real. Devuelve true
    /// si TODOS pasaron. Si algo falla, no continúa con los siguientes (algunos
    /// dependen del anterior — no tiene sentido probar SQL si la ruta no existe).
    /// </summary>
    public static bool Verify(WriterServiceOptions opts)
    {
        Console.WriteLine();
        Console.WriteLine("  Verificando configuración antes de instalar...");
        Console.WriteLine();

        var checks = new (string Label, Func<CheckResult> Run)[]
        {
            ("SDK CONTPAQi (MGWServicios.dll)",   () => CheckSdkPath(opts.SdkPath)),
            ("Carpeta de la empresa CONTPAQi",    () => CheckEmpresaPath(opts.EmpresaPath)),
            ("SQL Server conecta",                () => CheckSqlConnection(opts.SqlConnectionString)),
            ("Usuario/password + empresa abren",  () => CheckContpaqiSession(opts)),
            ("Concepto FACT existe en la BD",     () => CheckConcepto(opts)),
        };

        var i = 0;
        foreach (var (label, run) in checks)
        {
            i++;
            Console.Write($"    [{i}/{checks.Length}] {label}... ");
            CheckResult result;
            try { result = run(); }
            catch (Exception ex)
            {
                result = new CheckResult(label, false, $"{ex.GetType().Name}: {ex.Message}");
            }

            if (result.Ok)
            {
                Console.WriteLine("OK");
            }
            else
            {
                Console.WriteLine("FALLÓ");
                Console.WriteLine();
                Console.WriteLine($"    ❌ {result.Detail}");
                Console.WriteLine();
                PrintFixHint(label, opts);
                return false;
            }
        }

        Console.WriteLine();
        Console.WriteLine("  ✓ Todos los checks pasaron.");
        Console.WriteLine();
        return true;
    }

    private static CheckResult CheckSdkPath(string sdkPath)
    {
        if (string.IsNullOrWhiteSpace(sdkPath))
            return new("sdk", false, "La ruta del SDK está vacía.");
        var dll = Path.Combine(sdkPath, "MGWServicios.dll");
        if (!File.Exists(dll))
            return new("sdk", false,
                $"No existe MGWServicios.dll en '{sdkPath}'. Verifica que CONTPAQi Comercial esté instalado y que la ruta apunte al folder que contiene esa DLL.");
        return new("sdk", true, null);
    }

    private static CheckResult CheckEmpresaPath(string empresaPath)
    {
        if (string.IsNullOrWhiteSpace(empresaPath))
            return new("empresa", false, "La ruta de la empresa está vacía.");
        if (!Directory.Exists(empresaPath))
            return new("empresa", false,
                $"La carpeta '{empresaPath}' no existe en esta PC. Verifica en CONTPAQi → Empresa → Redefinir cuál es la ruta correcta.");

        // Validar que la carpeta contiene metadata CONTPAQi. CONTPAQi Comercial
        // deposita archivos con extensión .cfx (config) o .cfa (aliases) o .adf
        // (data). Si no hay ninguno, probablemente la clienta apuntó a un
        // folder vacío/equivocado y el CONTPAQi Session se colgaría o
        // devolvería datos vacíos silenciosamente.
        try
        {
            var hasCompacFiles = Directory.EnumerateFiles(empresaPath)
                .Any(f =>
                {
                    var ext = Path.GetExtension(f).ToLowerInvariant();
                    return ext is ".cfx" or ".cfa" or ".adf" or ".dbf" or ".ddf";
                });
            if (!hasCompacFiles)
            {
                return new("empresa", false,
                    $"La carpeta '{empresaPath}' existe pero no contiene archivos CONTPAQi (.cfx/.cfa/.adf). ¿Es la ruta correcta de una empresa activa?");
            }
        }
        catch (UnauthorizedAccessException)
        {
            return new("empresa", false,
                $"No tengo permisos para leer '{empresaPath}'. Corre el instalador como Administrador o dale permisos de lectura al usuario Windows.");
        }
        return new("empresa", true, null);
    }

    private static CheckResult CheckSqlConnection(string connStr)
    {
        if (string.IsNullOrWhiteSpace(connStr))
            return new("sql", false, "La conexión SQL está vacía.");
        try
        {
            // ConnectTimeout corto para que el fail no cuelgue 30s.
            var builder = new SqlConnectionStringBuilder(connStr) { ConnectTimeout = 5 };
            using var conn = new SqlConnection(builder.ToString());
            conn.Open();
            using var cmd = new SqlCommand("SELECT 1", conn);
            cmd.ExecuteScalar();
            return new("sql", true, null);
        }
        catch (SqlException ex)
        {
            return new("sql", false,
                $"No se pudo conectar al SQL Server: {ex.Message.Split('\n')[0]}");
        }
        catch (Exception ex)
        {
            return new("sql", false,
                $"Connection string inválido: {ex.Message}");
        }
    }

    private static CheckResult CheckContpaqiSession(WriterServiceOptions opts)
    {
        // Requiere que checks anteriores pasaron (SDK dll + empresa folder).
        try
        {
            ContpaqiSession.RegisterSdkPath(opts.SdkPath);
            using var session = ContpaqiSession.Open(opts.SdkPath, opts.Usuario, opts.Password, opts.EmpresaPath);
            // El open ya valida usuario, password, y que la empresa se pueda abrir.
            return new("session", true, null);
        }
        catch (ContpaqiSdkException ex)
        {
            return new("session", false,
                $"CONTPAQi rechazó la conexión: {ex.Message}. Suele ser usuario/password incorrectos, o la empresa está corrupta/bloqueada.");
        }
        catch (Exception ex)
        {
            return new("session", false, $"{ex.GetType().Name}: {ex.Message}");
        }
    }

    /// <summary>
    /// Verifica que el concepto FACT declarado en la config existe en la BD de
    /// CONTPAQi. Sin esto, escribir "999" (o cualquier código válido pero
    /// inexistente en la empresa específica) pasaba silente el dry-run y
    /// crasheaba al escribir el primer XML. Query directa a admConceptos
    /// (tabla estándar de CONTPAQi Comercial Pro).
    /// </summary>
    private static CheckResult CheckConcepto(WriterServiceOptions opts)
    {
        if (string.IsNullOrWhiteSpace(opts.Concepto))
            return new("concepto", false, "El código de concepto FACT está vacío.");
        if (string.IsNullOrWhiteSpace(opts.SqlConnectionString))
            return new("concepto", false, "SQL vacío (chequeo previo debió atrapar esto).");

        try
        {
            var builder = new SqlConnectionStringBuilder(opts.SqlConnectionString) { ConnectTimeout = 5 };
            using var conn = new SqlConnection(builder.ToString());
            conn.Open();
            // admConceptos.CCODIGOCONCEPTO en CONTPAQi Comercial. Case-sensitive
            // por default en algunas instalaciones (usar UPPER para tolerar).
            using var cmd = new SqlCommand(
                "SELECT COUNT(*) FROM admConceptos WHERE UPPER(CCODIGOCONCEPTO) = UPPER(@codigo)",
                conn);
            cmd.Parameters.AddWithValue("@codigo", opts.Concepto);
            var count = Convert.ToInt32(cmd.ExecuteScalar());
            if (count == 0)
            {
                return new("concepto", false,
                    $"El concepto '{opts.Concepto}' no existe en admConceptos. Abre CONTPAQi → Configuración → Conceptos y verifica el código correcto (típicamente '440' para factura CFDI).");
            }
            return new("concepto", true, null);
        }
        catch (SqlException ex)
        {
            // Si admConceptos no existe (BD no es CONTPAQi Comercial o versión rara),
            // no bloqueamos — solo warning y seguimos. El error real saldrá al primer
            // intento de escritura y el usuario verá qué es.
            if (ex.Message.Contains("Invalid object name", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine("(warning: admConceptos no encontrada — skip check)");
                return new("concepto", true, null);
            }
            return new("concepto", false, $"No pude verificar el concepto: {ex.Message.Split('\n')[0]}");
        }
        catch (Exception ex)
        {
            return new("concepto", false, $"{ex.GetType().Name}: {ex.Message}");
        }
    }

    /// <summary>
    /// Imprime la ayuda de "cómo arreglar esto" según qué check falló. Todos
    /// terminan diciendo "corrige en el portal y descarga el zip de nuevo".
    /// </summary>
    private static void PrintFixHint(string failedLabel, WriterServiceOptions opts)
    {
        Console.WriteLine("  Cómo arreglarlo:");
        Console.WriteLine();

        if (failedLabel.Contains("SDK", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine("    1. Verifica que tengas instalado CONTPAQi Comercial Pro o Premium (no Contabilidad).");
            Console.WriteLine("    2. En el portal, edita el campo 'Ruta del SDK CONTPAQi (avanzado)' con la ruta");
            Console.WriteLine("       correcta al folder que contiene MGWServicios.dll.");
        }
        else if (failedLabel.Contains("empresa", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine("    1. En CONTPAQi Comercial, abre Empresa → Redefinir. Copia la ruta que ves ahí.");
            Console.WriteLine("    2. En el portal, edita 'Ruta de la empresa CONTPAQi' con esa ruta.");
        }
        else if (failedLabel.Contains("SQL", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine("    1. Verifica que el nombre de la BD (Database=...) sea igual al nombre del folder");
            Console.WriteLine("       de la empresa (típicamente empieza con 'ad').");
            Console.WriteLine("    2. Si tu SQL Server no está en la instancia 'COMPAC' default, cambia Server=.\\COMPAC");
            Console.WriteLine("       por el nombre correcto de tu instancia.");
            Console.WriteLine("    3. En el portal, edita 'Conexión SQL Server' con el string correcto.");
        }
        else if (failedLabel.Contains("Usuario", StringComparison.OrdinalIgnoreCase) ||
                 failedLabel.Contains("session", StringComparison.OrdinalIgnoreCase))
        {
            Console.WriteLine("    1. Prueba abrir CONTPAQi manualmente con el mismo usuario y password.");
            Console.WriteLine("    2. Si funciona ahí pero aquí no, en el portal edita 'Password CONTPAQi'.");
            Console.WriteLine("    3. Verifica que el usuario existe en CONTPAQi (Configuración → Usuarios).");
        }

        Console.WriteLine();
        Console.WriteLine("    Después de corregir, DESCARGA EL ZIP DE NUEVO desde el portal y vuelve a");
        Console.WriteLine("    doble-clickear el EXE. Nada quedó instalado — puedes reintentar limpio.");
        Console.WriteLine();
        Console.WriteLine("    (Presiona cualquier tecla para cerrar esta ventana)");
        try { Console.ReadKey(intercept: true); } catch { }
    }
}
