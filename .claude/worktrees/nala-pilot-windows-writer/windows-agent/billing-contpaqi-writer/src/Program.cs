using Centinelia.BillingContpaqi.Writer.Sdk;

namespace Centinelia.BillingContpaqi.Writer;

/// <summary>
/// Day 1 hello-world: valida que las bindings al SDK CONTPAQi funcionan.
///
/// Objetivo mínimo verificable:
///   1. Cargar el SDK sin BadImageFormatException (proceso 32-bit).
///   2. Reportar versión del SDK.
///   3. Abrir sesión con SUPERVISOR (sin password) contra la empresa piloto.
///   4. Cerrar limpiamente.
///
/// Uso:
///   BillingContpaqiWriter.exe --sdk "C:\Program Files (x86)\Compac\COMERCIAL\SDK" \
///                             --empresa "C:\Compac\Empresas\adTortillasEstrella_PILOTO_D" \
///                             --usuario SUPERVISOR --password ""
/// </summary>
public static class Program
{
    public static int Main(string[] args)
    {
        var opts = ParseArgs(args);
        if (opts is null) return 2;

        Console.WriteLine("[writer] BillingContpaqiWriter Day 1 smoke");
        Console.WriteLine($"[writer] SDK path:  {opts.SdkPath}");
        Console.WriteLine($"[writer] Empresa:   {opts.EmpresaPath}");
        Console.WriteLine($"[writer] Usuario:   {opts.Usuario}");

        try
        {
            // 1. Version antes de abrir sesión — sanity check de que las DLLs cargan.
            var version = ContpaqiSession.GetSdkVersion();
            Console.WriteLine($"[writer] SDK version: {(string.IsNullOrWhiteSpace(version) ? "(vacía)" : version)}");

            // 2. Abrir sesión + empresa.
            using var session = ContpaqiSession.Open(opts.SdkPath, opts.Usuario, opts.Password, opts.EmpresaPath);
            Console.WriteLine("[writer] Sesión + empresa abiertas OK");

            // Day 2+ agregaría operaciones aquí: fBuscaClienteRFC, fCreaDocumento, etc.

            Console.WriteLine("[writer] Cerrando sesión (Dispose automático al salir del using)");
        }
        catch (ContpaqiSdkException ex)
        {
            Console.Error.WriteLine($"[writer] ERROR SDK: {ex.Message}");
            return 1;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[writer] ERROR inesperado: {ex.GetType().Name} — {ex.Message}");
            return 1;
        }

        Console.WriteLine("[writer] Smoke test completado OK");
        return 0;
    }

    private sealed record CliOptions(string SdkPath, string EmpresaPath, string Usuario, string Password);

    private static CliOptions? ParseArgs(string[] args)
    {
        string? sdk = null, empresa = null, usuario = "SUPERVISOR", password = "";
        for (var i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--sdk":      sdk      = args[++i]; break;
                case "--empresa":  empresa  = args[++i]; break;
                case "--usuario":  usuario  = args[++i]; break;
                case "--password": password = args[++i]; break;
                default:
                    Console.Error.WriteLine($"[writer] Flag desconocido: {args[i]}");
                    PrintUsage();
                    return null;
            }
        }
        if (string.IsNullOrEmpty(sdk) || string.IsNullOrEmpty(empresa))
        {
            PrintUsage();
            return null;
        }
        return new CliOptions(sdk, empresa, usuario, password);
    }

    private static void PrintUsage()
    {
        Console.Error.WriteLine("""
        Uso:
          BillingContpaqiWriter.exe --sdk <ruta-carpeta-SDK> --empresa <ruta-carpeta-empresa> [--usuario SUPERVISOR] [--password ""]

        Ejemplo:
          BillingContpaqiWriter.exe ^
            --sdk "C:\Program Files (x86)\Compac\COMERCIAL\SDK" ^
            --empresa "C:\Compac\Empresas\adTortillasEstrella_PILOTO_D"
        """);
    }
}
