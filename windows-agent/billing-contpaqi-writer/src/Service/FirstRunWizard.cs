using System.Text.Json;

namespace Centinelia.BillingContpaqi.Writer.Service;

/// <summary>
/// Wizard de primer arranque para el writer. Cuando <see cref="WriterServiceOptions"/>
/// no tiene los campos locales críticos (empresa CONTPAQi, credenciales SUPERVISOR,
/// password del CSD, conexión SQL, concepto FACT), prompt en consola y persiste
/// las respuestas en <c>appsettings.local.json</c> junto al EXE. Los siguientes
/// arranques leen ese archivo y no vuelven a preguntar.
///
/// El wizard NO se corre bajo el SCM (donde no hay consola interactiva). El
/// caller detecta si estamos en modo consola y decide si invocarlo o abortar
/// con mensaje claro pidiendo correr el EXE manual una vez.
///
/// La config injectada en el zip (<see cref="CentineliaConfig"/>) provee
/// dropbox_base_path como default para <c>Storage.DropboxRoot</c>. Los otros
/// campos son 100% locales y solo pueden venir del wizard.
/// </summary>
public static class FirstRunWizard
{
    public const string LocalSettingsFileName = "appsettings.local.json";

    /// <summary>
    /// Chequea si <see cref="WriterServiceOptions"/> ya está completo. Si retorna
    /// true, no hay que preguntarle nada a Beatriz.
    /// </summary>
    public static bool IsComplete(WriterServiceOptions opts)
    {
        if (string.IsNullOrWhiteSpace(opts.EmpresaPath))         return false;
        if (string.IsNullOrWhiteSpace(opts.Concepto))            return false;
        if (string.IsNullOrWhiteSpace(opts.SqlConnectionString)) return false;
        // Password de SUPERVISOR puede ser cadena vacía legítima (default en
        // instalaciones fresh de CONTPAQi). No lo consideramos requerido.
        // CsdPassword idem: algunas orgs cargan el CSD sin password.

        switch (opts.Storage.Backend.ToLowerInvariant())
        {
            case "local":
                if (string.IsNullOrWhiteSpace(opts.Storage.InboxPath))  return false;
                if (string.IsNullOrWhiteSpace(opts.Storage.OutboxPath)) return false;
                break;
            case "dropbox":
                // DropboxToken se busca via API a runtime; no requerido aquí.
                if (string.IsNullOrWhiteSpace(opts.Storage.DropboxRoot)) return false;
                break;
        }
        return true;
    }

    /// <summary>
    /// Ejecuta el wizard interactivo y escribe el resultado en <c>appsettings.local.json</c>
    /// junto al EXE. Actualiza también las propiedades de <paramref name="opts"/>
    /// en memoria (el caller decide si rebindear o reiniciar el Host).
    /// </summary>
    public static void Run(
        WriterServiceOptions opts,
        CentineliaConfig? centineliaConfig,
        string baseDir)
    {
        // Forzar UTF-8 en consola para que acentos y ñ salgan legibles bajo
        // Windows Terminal / PowerShell con codepage default (que suele ser 850 en MX).
        try { Console.OutputEncoding = System.Text.Encoding.UTF8; }
        catch { /* algunas consolas no permiten cambiar encoding — no crítico */ }

        Console.WriteLine();
        Console.WriteLine("=========================================================");
        Console.WriteLine("  Centinelia Writer — Configuración de primer arranque");
        Console.WriteLine("=========================================================");
        Console.WriteLine();
        if (centineliaConfig is not null)
        {
            Console.WriteLine($"  Cliente:    {centineliaConfig.PortalEmail}");
            Console.WriteLine($"  Endpoint:   {centineliaConfig.Endpoint}");
            Console.WriteLine($"  Dropbox:    {centineliaConfig.DropboxBasePath}");
            Console.WriteLine();
            Console.WriteLine("  Estos datos vienen del zip descargado desde tu portal.");
        }
        else
        {
            Console.WriteLine("  No se encontró centinelia-config.json junto al EXE.");
            Console.WriteLine("  El writer va a arrancar en modo standalone (sin llamar a Centinelia).");
        }
        Console.WriteLine();
        Console.WriteLine("  A continuación necesito unos datos que solo viven en esta PC");
        Console.WriteLine("  (CONTPAQi, SQL Server y CSD). Los guardo en appsettings.local.json");
        Console.WriteLine("  para no volver a preguntar. Presiona Enter para aceptar el default.");
        Console.WriteLine();

        // -- SDK Path -----------------------------------------------------
        var sdkDefault = string.IsNullOrWhiteSpace(opts.SdkPath)
            ? @"C:\Program Files (x86)\Compac\COMERCIAL"
            : opts.SdkPath;
        opts.SdkPath = PromptWithDefault(
            "Ruta del SDK CONTPAQi (folder que contiene MGWServicios.dll)",
            sdkDefault);

        // -- Empresa Path -------------------------------------------------
        var empresaDefault = string.IsNullOrWhiteSpace(opts.EmpresaPath)
            ? SuggestEmpresaPath()
            : opts.EmpresaPath;
        opts.EmpresaPath = PromptWithDefault(
            "Ruta de la empresa CONTPAQi (folder con archivos de la BD)",
            empresaDefault,
            allowEmpty: false);

        // -- Usuario / Password SUPERVISOR -------------------------------
        opts.Usuario = PromptWithDefault(
            "Usuario CONTPAQi",
            string.IsNullOrWhiteSpace(opts.Usuario) ? "SUPERVISOR" : opts.Usuario);
        opts.Password = PromptSecret(
            "Password del usuario CONTPAQi (Enter si no tiene)",
            opts.Password);

        // -- Concepto FACT ------------------------------------------------
        var conceptoDefault = string.IsNullOrWhiteSpace(opts.Concepto) ? "440" : opts.Concepto;
        opts.Concepto = PromptWithDefault(
            "Concepto FACT en CONTPAQi (código interno, ej. 440)",
            conceptoDefault,
            allowEmpty: false);

        // -- CSD Password -------------------------------------------------
        opts.CsdPassword = PromptSecret(
            "Password del CSD cargado en CONTPAQi (Enter si no tiene)",
            opts.CsdPassword);

        // -- SQL Connection String ---------------------------------------
        var sqlDefault = string.IsNullOrWhiteSpace(opts.SqlConnectionString)
            ? SuggestSqlConnStr(opts.EmpresaPath)
            : opts.SqlConnectionString;
        opts.SqlConnectionString = PromptWithDefault(
            "Conexión SQL Server a la BD CONTPAQi",
            sqlDefault,
            allowEmpty: false);

        // -- Storage backend + config ------------------------------------
        var backendDefault = string.IsNullOrWhiteSpace(opts.Storage.Backend) ? "dropbox" : opts.Storage.Backend;
        opts.Storage.Backend = PromptWithDefault(
            "Backend de storage (dropbox | local)",
            backendDefault);

        switch (opts.Storage.Backend.ToLowerInvariant())
        {
            case "dropbox":
                var dbxRootDefault = !string.IsNullOrWhiteSpace(opts.Storage.DropboxRoot)
                    ? opts.Storage.DropboxRoot
                    : centineliaConfig?.DropboxBasePath ?? "/Facturacion";
                opts.Storage.DropboxRoot = PromptWithDefault(
                    "Ruta base en Dropbox (donde vive /pendientes, /timbrados, etc.)",
                    dbxRootDefault,
                    allowEmpty: false);
                // DropboxToken se pide a runtime via API; no lo tocamos aquí.
                opts.Storage.DropboxToken = string.Empty;
                break;

            case "local":
                opts.Storage.InboxPath = PromptWithDefault(
                    "Carpeta local INBOX (donde Nala deposita XMLs)",
                    opts.Storage.InboxPath,
                    allowEmpty: false);
                opts.Storage.OutboxPath = PromptWithDefault(
                    "Carpeta local OUTBOX (donde se escriben timbrados/errores)",
                    opts.Storage.OutboxPath,
                    allowEmpty: false);
                break;

            default:
                throw new InvalidOperationException($"Backend '{opts.Storage.Backend}' inválido");
        }

        Persist(opts, baseDir);

        Console.WriteLine();
        Console.WriteLine("  ✓ Config guardada en appsettings.local.json.");
        Console.WriteLine("    Los próximos arranques leen esto y no vuelven a preguntar.");
        Console.WriteLine("    Si necesitas cambiar algo, borra ese archivo y vuelve a correr el EXE.");
        Console.WriteLine();
    }

    // -----------------------------------------------------------------------
    // Helpers de input
    // -----------------------------------------------------------------------

    private static string PromptWithDefault(string prompt, string defaultValue, bool allowEmpty = true)
    {
        while (true)
        {
            Console.Write(string.IsNullOrEmpty(defaultValue)
                ? $"  {prompt}: "
                : $"  {prompt} [{defaultValue}]: ");
            var input = Console.ReadLine()?.Trim() ?? string.Empty;
            if (input.Length == 0) input = defaultValue ?? string.Empty;
            if (!allowEmpty && string.IsNullOrEmpty(input))
            {
                Console.WriteLine("    Este campo es requerido. Intenta de nuevo.");
                continue;
            }
            return input;
        }
    }

    /// <summary>
    /// Lee un secreto sin mostrar los caracteres en pantalla (usa Console.ReadKey).
    /// Cuando stdin está redirigido (ej. proceso lanzado desde script con pipe),
    /// ReadKey no funciona — fallback a ReadLine visible con advertencia.
    /// </summary>
    private static string PromptSecret(string prompt, string current)
    {
        var hint = string.IsNullOrEmpty(current) ? "(vacío)" : "(sin cambio)";
        Console.Write($"  {prompt} {hint}: ");

        if (Console.IsInputRedirected)
        {
            // Modo pipe/script: no podemos ocultar caracteres, leemos línea normal.
            var typed = Console.ReadLine() ?? string.Empty;
            return typed.Length == 0 ? current : typed;
        }

        var sb = new System.Text.StringBuilder();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter) { Console.WriteLine(); break; }
            if (key.Key == ConsoleKey.Backspace) { if (sb.Length > 0) sb.Length--; continue; }
            if (!char.IsControl(key.KeyChar)) sb.Append(key.KeyChar);
        }
        var typedInteractive = sb.ToString();
        return typedInteractive.Length == 0 ? current : typedInteractive;
    }

    /// <summary>Intenta encontrar una empresa CONTPAQi razonable en C:\Compac\Empresas.</summary>
    private static string SuggestEmpresaPath()
    {
        try
        {
            var root = @"C:\Compac\Empresas";
            if (!Directory.Exists(root)) return string.Empty;
            var candidates = Directory.GetDirectories(root)
                .Where(p => Path.GetFileName(p).StartsWith("ad", StringComparison.OrdinalIgnoreCase))
                .OrderBy(p => p)
                .ToList();
            if (candidates.Count == 1) return candidates[0];
            if (candidates.Count > 1)
            {
                Console.WriteLine("    Empresas CONTPAQi detectadas en C:\\Compac\\Empresas:");
                foreach (var c in candidates) Console.WriteLine($"      - {c}");
            }
        }
        catch { }
        return string.Empty;
    }

    /// <summary>
    /// Sugiere una connection string a SQL Server usando el nombre de la BD
    /// derivado del folder de la empresa. CONTPAQi Comercial Pro nombra la
    /// BD igual al folder de la empresa (ej. adTortillasEstrella_PILOTO_DEV).
    /// </summary>
    private static string SuggestSqlConnStr(string empresaPath)
    {
        if (string.IsNullOrWhiteSpace(empresaPath)) return string.Empty;
        var dbName = Path.GetFileName(empresaPath.TrimEnd(Path.DirectorySeparatorChar));
        if (string.IsNullOrEmpty(dbName)) return string.Empty;
        return $"Server=.\\COMPAC;Database={dbName};Integrated Security=true;TrustServerCertificate=true";
    }

    // -----------------------------------------------------------------------
    // Persistencia
    // -----------------------------------------------------------------------

    private static void Persist(WriterServiceOptions opts, string baseDir)
    {
        var path = Path.Combine(baseDir, LocalSettingsFileName);
        var payload = new
        {
            Writer = new
            {
                opts.SdkPath,
                opts.EmpresaPath,
                opts.Usuario,
                opts.Password,
                opts.Concepto,
                opts.CsdPassword,
                opts.SqlConnectionString,
                opts.PollSeconds,
                Storage = new
                {
                    opts.Storage.Backend,
                    opts.Storage.InboxPath,
                    opts.Storage.OutboxPath,
                    opts.Storage.DropboxToken,
                    opts.Storage.DropboxRoot,
                },
            },
        };
        var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions
        {
            WriteIndented = true,
        });
        File.WriteAllText(path, json);
    }
}
