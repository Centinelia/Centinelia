using Centinelia.BillingContpaqi.Writer.Sdk;

namespace Centinelia.BillingContpaqi.Writer;

/// <summary>
/// CLI smoke test para validar las bindings al SDK CONTPAQi contra la
/// empresa piloto Tortillas Estrella.
///
/// Modos:
///   <c>--mode session</c>   Day 1: abre + cierra sesión + empresa. Reporta versión SDK.
///   <c>--mode find</c>      Day 2a: busca cliente y producto por código en el catálogo real.
///   <c>--mode create</c>    Day 2b: crea un documento nuevo con 1 línea (queda "Sin afectar").
///
/// Ejemplos:
///   BillingContpaqiWriter --mode session
///   BillingContpaqiWriter --mode find --cliente 008 --producto 021
///   BillingContpaqiWriter --mode create --concepto "4.0 CFDI FACTURA" \
///     --serie FTEN --cliente 008 --producto 021 --cantidad 5 --precio 6.50
///
/// Defaults asumen la empresa piloto local:
///   --sdk      "C:\Program Files (x86)\Compac\COMERCIAL\SDK"
///   --empresa  "C:\Compac\Empresas\adTortillasEstrella_PILOTO_D"
///   --usuario  SUPERVISOR
///   --password ""
/// </summary>
public static class Program
{
    public static int Main(string[] args)
    {
        var opts = ParseArgs(args);
        if (opts is null) return 2;

        Console.WriteLine($"[writer] BillingContpaqiWriter — modo: {opts.Mode}");
        Console.WriteLine($"[writer] SDK path: {opts.SdkPath}");
        Console.WriteLine($"[writer] Empresa:  {opts.EmpresaPath}");

        try
        {
            Console.WriteLine($"[writer] SDK version: {ContpaqiSession.GetSdkVersion()}");

            using var session = ContpaqiSession.Open(opts.SdkPath, opts.Usuario, opts.Password, opts.EmpresaPath);
            Console.WriteLine("[writer] Sesión + empresa abiertas OK");

            switch (opts.Mode)
            {
                case "session":
                    // Nada más, con abrir/cerrar es suficiente para Day 1.
                    break;

                case "find":
                    Require(opts.Cliente,  "--cliente");
                    Require(opts.Producto, "--producto");
                    session.FindCliente(opts.Cliente!);
                    Console.WriteLine($"[writer] Cliente '{opts.Cliente}' encontrado en catálogo");
                    session.FindProducto(opts.Producto!);
                    Console.WriteLine($"[writer] Producto '{opts.Producto}' encontrado en catálogo");
                    break;

                case "create":
                    Require(opts.Concepto, "--concepto");
                    Require(opts.Serie,    "--serie");
                    Require(opts.Cliente,  "--cliente");
                    Require(opts.Producto, "--producto");
                    // Verificar catálogos antes de armar el documento — si falla, evitamos ruido en el alta.
                    session.FindCliente(opts.Cliente!);
                    session.FindProducto(opts.Producto!);

                    var header = new InvoiceHeader
                    {
                        CodigoConcepto = opts.Concepto!,
                        Serie          = opts.Serie!,
                        CodigoCliente  = opts.Cliente!,
                        Fecha          = DateTime.Now.ToString("MM/dd/yyyy"),
                        Referencia     = "piloto-nala-writer-day2",
                    };
                    var idDoc = session.CreateDocumentHeader(header);
                    Console.WriteLine($"[writer] Documento creado con ID interno: {idDoc}");

                    var line = new InvoiceLine
                    {
                        CodigoProducto = opts.Producto!,
                        Cantidad       = opts.Cantidad,
                        PrecioUnitario = opts.Precio,
                    };
                    var idMov = session.AddLine(idDoc, line);
                    Console.WriteLine($"[writer] Movimiento agregado con ID interno: {idMov}");

                    Console.WriteLine("[writer] Documento quedó 'Sin afectar'. Day 3 agregará AffectDocument.");
                    break;

                default:
                    Console.Error.WriteLine($"[writer] Modo desconocido: {opts.Mode}");
                    PrintUsage();
                    return 2;
            }

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

        Console.WriteLine($"[writer] Smoke '{opts.Mode}' completado OK");
        return 0;
    }

    private static void Require(string? value, string flag)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException($"Requiere flag {flag}");
    }

    private sealed record CliOptions(
        string SdkPath,
        string EmpresaPath,
        string Usuario,
        string Password,
        string Mode,
        string? Concepto,
        string? Serie,
        string? Cliente,
        string? Producto,
        double Cantidad,
        double Precio);

    private static CliOptions? ParseArgs(string[] args)
    {
        string sdk      = @"C:\Program Files (x86)\Compac\COMERCIAL\SDK";
        string empresa  = @"C:\Compac\Empresas\adTortillasEstrella_PILOTO_D";
        string usuario  = "SUPERVISOR";
        string password = "";
        string mode     = "session";
        string? concepto = null, serie = null, cliente = null, producto = null;
        double cantidad = 1, precio = 0;

        for (var i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--sdk":       sdk      = args[++i]; break;
                case "--empresa":   empresa  = args[++i]; break;
                case "--usuario":   usuario  = args[++i]; break;
                case "--password":  password = args[++i]; break;
                case "--mode":      mode     = args[++i]; break;
                case "--concepto":  concepto = args[++i]; break;
                case "--serie":     serie    = args[++i]; break;
                case "--cliente":   cliente  = args[++i]; break;
                case "--producto":  producto = args[++i]; break;
                case "--cantidad":  cantidad = double.Parse(args[++i], System.Globalization.CultureInfo.InvariantCulture); break;
                case "--precio":    precio   = double.Parse(args[++i], System.Globalization.CultureInfo.InvariantCulture); break;
                case "--help":
                case "-h":
                    PrintUsage();
                    return null;
                default:
                    Console.Error.WriteLine($"[writer] Flag desconocido: {args[i]}");
                    PrintUsage();
                    return null;
            }
        }
        return new CliOptions(sdk, empresa, usuario, password, mode,
                              concepto, serie, cliente, producto, cantidad, precio);
    }

    private static void PrintUsage()
    {
        Console.Error.WriteLine("""
        Uso:
          BillingContpaqiWriter --mode <session|find|create> [flags]

        Flags comunes:
          --sdk <ruta>       default: C:\Program Files (x86)\Compac\COMERCIAL\SDK
          --empresa <ruta>   default: C:\Compac\Empresas\adTortillasEstrella_PILOTO_D
          --usuario <nom>    default: SUPERVISOR
          --password <pwd>   default: (vacío)

        Modo 'find':
          --cliente <codigo> --producto <codigo>

        Modo 'create':
          --concepto <cod>   ej. "4.0 CFDI FACTURA"
          --serie <serie>    ej. FTEN
          --cliente <codigo> ej. 008
          --producto <codigo>ej. 021
          --cantidad <n>     ej. 5
          --precio <n>       ej. 6.50
        """);
    }
}
