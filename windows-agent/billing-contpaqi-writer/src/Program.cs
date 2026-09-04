using Centinelia.BillingContpaqi.Writer.Sdk;
using Centinelia.BillingContpaqi.Writer.Watch;
using Centinelia.BillingContpaqi.Writer.Watch.Storage;
using Microsoft.Extensions.Logging;

namespace Centinelia.BillingContpaqi.Writer;

/// <summary>
/// CLI smoke test para validar las bindings al SDK CONTPAQi contra la
/// empresa piloto Tortillas Estrella.
///
/// Modos:
///   <c>--mode session</c>   Day 1: abre + cierra sesión + empresa. Reporta versión SDK.
///   <c>--mode find</c>      Day 2a: busca cliente y producto por código en el catálogo real.
///   <c>--mode create</c>    Day 2b: crea un documento nuevo con 1 línea (queda "Sin afectar").
///   <c>--mode stamp</c>     Day 4: timbra un documento afectado por concepto + serie + folio.
///   <c>--mode fetch-xml</c> Day 5: extrae el XML timbrado a disco (o stdout con --out -).
///   <c>--mode uuid</c>      Day 5: imprime el UUID del CFDI de un documento timbrado.
///   <c>--mode watch</c>     Day 6: bucle que procesa XMLs de importación depositados
///                                    por Nala en <c>--inbox</c>, escribe los XMLs
///                                    timbrados a <c>--outbox/timbrados/</c> y mueve el
///                                    original a <c>procesados/</c> o <c>errores/</c>.
///
/// Ejemplos:
///   BillingContpaqiWriter --mode session
///   BillingContpaqiWriter --mode find --cliente 008 --producto 021
///   BillingContpaqiWriter --mode create --concepto "4.0 CFDI FACTURA" \
///     --serie FTEN --cliente 008 --producto 021 --cantidad 5 --precio 6.50
///
/// Defaults asumen la empresa piloto local:
///   --sdk      "C:\Program Files (x86)\Compac\COMERCIAL\SDK"
///   --empresa  "C:\Compac\Empresas\adTortillasEstrella_PILOTO_DEV"
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
            // Registrar el path del SDK ANTES del primer P/Invoke.
            ContpaqiSession.RegisterSdkPath(opts.SdkPath);
            // fVersionSDK no está exportada por MGWServicios.dll (validado 2026-09-03).
            // Se removió del smoke; puede resurgir si encontramos el nombre correcto.

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

                case "stamp":
                    Require(opts.Concepto, "--concepto");
                    Require(opts.Serie,    "--serie");
                    if (opts.Folio <= 0) throw new ArgumentException("Requiere --folio > 0");
                    session.StampDocument(opts.Concepto!, opts.Serie!, opts.Folio, opts.CsdPassword ?? "");
                    Console.WriteLine($"[writer] Documento {opts.Concepto}-{opts.Serie}-{opts.Folio} timbrado (o el PAC devolvió éxito).");
                    Console.WriteLine("[writer] Verificar XML+PDF en la carpeta XML_SDK del directorio de la empresa.");
                    break;

                case "fetch-xml":
                    Require(opts.Concepto, "--concepto");
                    Require(opts.Serie,    "--serie");
                    if (opts.Folio <= 0) throw new ArgumentException("Requiere --folio > 0");

                    var xml = session.FetchTimbradoXml(opts.Concepto!, opts.Serie!, opts.Folio);

                    if (string.IsNullOrEmpty(opts.OutPath) || opts.OutPath == "-")
                    {
                        // stdout: emitir el XML crudo sin prefijos [writer].
                        // Todos los logs informativos van a stderr para que el caller pueda pipear.
                        Console.Error.WriteLine($"[writer] XML extraído ({xml.Length} chars) — enviando a stdout");
                        Console.Out.Write(xml);
                    }
                    else
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(opts.OutPath)) ?? ".");
                        File.WriteAllText(opts.OutPath, xml);
                        Console.WriteLine($"[writer] XML escrito a: {opts.OutPath} ({xml.Length} chars)");
                    }
                    break;

                case "uuid":
                    Require(opts.Concepto, "--concepto");
                    Require(opts.Serie,    "--serie");
                    if (opts.Folio <= 0) throw new ArgumentException("Requiere --folio > 0");
                    var uuid = session.GetDocumentUuid(opts.Concepto!, opts.Serie!, opts.Folio);
                    Console.WriteLine($"[writer] UUID: {uuid}");
                    break;

                case "watch":
                    Require(opts.Concepto,   "--concepto");
                    Require(opts.SqlConnStr, "--sql");
                    // csd-pwd puede ser vacío si CONTPAQi ya tiene el CSD sin password (raro pero legal).
                    using (var loggerFactory = BuildLoggerFactory())
                    {
                        var procLogger  = loggerFactory.CreateLogger("BatchProcessor");
                        var watchLogger = loggerFactory.CreateLogger("WatchLoop");

                        IInboxStorage storage = BuildStorage(opts);
                        try
                        {
                            var catalog   = new CatalogLookup(opts.SqlConnStr!);
                            var processor = new BatchProcessor(
                                session, catalog, storage,
                                opts.Concepto!, opts.CsdPassword ?? "", procLogger);
                            var loop = new WatchLoop(processor, storage,
                                TimeSpan.FromSeconds(opts.PollSecs), watchLogger);

                            using var cts = new CancellationTokenSource();
                            Console.CancelKeyPress += (_, ev) =>
                            {
                                watchLogger.LogInformation("[watch] Ctrl+C recibido; cerrando loop");
                                ev.Cancel = true; // deja al proceso terminar de forma limpia
                                cts.Cancel();
                            };
                            loop.RunAsync(cts.Token).GetAwaiter().GetResult();
                        }
                        finally
                        {
                            (storage as IDisposable)?.Dispose();
                        }
                    }
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
                    var (idDoc, folioAsignado) = session.CreateDocumentHeader(header);
                    Console.WriteLine($"[writer] Documento creado con ID interno: {idDoc}, folio: {folioAsignado}");

                    var line = new InvoiceLine
                    {
                        CodigoProducto = opts.Producto!,
                        Cantidad       = opts.Cantidad,
                        PrecioUnitario = opts.Precio,
                        CodigoAlmacen  = opts.Almacen,
                    };
                    var idMov = session.AddLine(idDoc, line);
                    Console.WriteLine($"[writer] Movimiento agregado con ID interno: {idMov}");

                    Console.WriteLine($"[writer] Siguiente paso: --mode stamp --concepto {opts.Concepto} --serie {opts.Serie} --folio {folioAsignado} --csd-pwd <pwd>");
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

    /// <summary>
    /// Instancia el <see cref="IInboxStorage"/> según la config del CLI.
    /// Valida los flags mínimos por backend y falla ruidosamente si faltan
    /// para evitar arrancar un watcher que después no puede listar el inbox.
    /// </summary>
    private static IInboxStorage BuildStorage(CliOptions opts)
    {
        switch (opts.Storage.ToLowerInvariant())
        {
            case "local":
                Require(opts.Inbox,  "--inbox (con --storage local)");
                Require(opts.Outbox, "--outbox (con --storage local)");
                return new LocalInboxStorage(opts.Inbox!, opts.Outbox!);

            case "dropbox":
                Require(opts.DropboxToken, "--dropbox-token (con --storage dropbox)");
                Require(opts.DropboxRoot,  "--dropbox-root (con --storage dropbox)");
                return new DropboxInboxStorage(opts.DropboxToken!, opts.DropboxRoot!);

            default:
                throw new ArgumentException(
                    $"--storage inválido: '{opts.Storage}'. Valores: local | dropbox");
        }
    }

    /// <summary>
    /// Factory de <see cref="ILoggerFactory"/> con Console provider en un
    /// formato leíble para consola local + tail-friendly para archivos.
    /// Cada línea es prefijada con timestamp UTC y level para facilitar el
    /// grep / structured search.
    /// </summary>
    private static ILoggerFactory BuildLoggerFactory()
    {
        return LoggerFactory.Create(builder =>
        {
            builder.SetMinimumLevel(LogLevel.Information);
            builder.AddSimpleConsole(opts =>
            {
                opts.SingleLine       = true;
                opts.TimestampFormat  = "yyyy-MM-dd HH:mm:ss.fff ";
                opts.UseUtcTimestamp  = true;
                opts.IncludeScopes    = false;
            });
        });
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
        double Precio,
        string Almacen,
        double Folio,
        string? CsdPassword,
        string? OutPath,
        string? Inbox,
        string? Outbox,
        string? SqlConnStr,
        int PollSecs,
        string Storage,
        string? DropboxToken,
        string? DropboxRoot);

    private static CliOptions? ParseArgs(string[] args)
    {
        // MGWServicios.dll vive en el folder padre COMERCIAL, no en el subdirectorio SDK/.
        string sdk      = @"C:\Program Files (x86)\Compac\COMERCIAL";
        string empresa  = @"C:\Compac\Empresas\adTortillasEstrella_PILOTO_DEV";
        string usuario  = "SUPERVISOR";
        string password = "";
        string mode     = "session";
        string? concepto = null, serie = null, cliente = null, producto = null;
        double cantidad = 1, precio = 0;
        string almacen = "1";   // "Almacen Uno" es el default estándar en CONTPAQi Comercial.
        double folio = 0;
        string? csdPassword = null;
        string? outPath = null;
        string? inbox = null, outbox = null, sqlConnStr = null;
        int pollSecs = 10;
        string storage = "local";
        string? dropboxToken = null, dropboxRoot = null;

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
                case "--almacen":   almacen  = args[++i]; break;
                case "--folio":     folio    = double.Parse(args[++i], System.Globalization.CultureInfo.InvariantCulture); break;
                case "--csd-pwd":   csdPassword = args[++i]; break;
                case "--cantidad":  cantidad = double.Parse(args[++i], System.Globalization.CultureInfo.InvariantCulture); break;
                case "--precio":    precio   = double.Parse(args[++i], System.Globalization.CultureInfo.InvariantCulture); break;
                case "--out":       outPath  = args[++i]; break;
                case "--inbox":         inbox        = args[++i]; break;
                case "--outbox":        outbox       = args[++i]; break;
                case "--sql":           sqlConnStr   = args[++i]; break;
                case "--poll-secs":     pollSecs     = int.Parse(args[++i], System.Globalization.CultureInfo.InvariantCulture); break;
                case "--storage":       storage      = args[++i]; break;
                case "--dropbox-token": dropboxToken = args[++i]; break;
                case "--dropbox-root":  dropboxRoot  = args[++i]; break;
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
                              concepto, serie, cliente, producto, cantidad, precio, almacen,
                              folio, csdPassword, outPath,
                              inbox, outbox, sqlConnStr, pollSecs,
                              storage, dropboxToken, dropboxRoot);
    }

    private static void PrintUsage()
    {
        Console.Error.WriteLine("""
        Uso:
          BillingContpaqiWriter --mode <session|find|create> [flags]

        Flags comunes:
          --sdk <ruta>       default: C:\Program Files (x86)\Compac\COMERCIAL\SDK
          --empresa <ruta>   default: C:\Compac\Empresas\adTortillasEstrella_PILOTO_DEV
          --usuario <nom>    default: SUPERVISOR
          --password <pwd>   default: (vacío)

        Modo 'find':
          --cliente <codigo> --producto <codigo>

        Modo 'create':
          --concepto <cod>   ej. 440 (ID interno "4.0 CFDI FACTURA")
          --serie <serie>    ej. FTEN
          --cliente <codigo> ej. 008
          --producto <codigo>ej. 021
          --cantidad <n>     ej. 5
          --precio <n>       ej. 6.50
          --almacen <cod>    default: 1

        Modo 'stamp':
          --concepto <cod>   ej. 440
          --serie <serie>    ej. FTEN
          --folio <n>        ej. 72852
          --csd-pwd <pwd>    password del CSD cargado en CONTPAQi (default "")

        Modo 'fetch-xml':
          --concepto <cod>   ej. 440
          --serie <serie>    ej. FTEN
          --folio <n>        ej. 72852
          --out <ruta>       opcional. Si se omite o vale '-', el XML sale por stdout.
                             Con --out, los logs [writer] siguen en stdout.

        Modo 'uuid':
          --concepto <cod>   ej. 440
          --serie <serie>    ej. FTEN
          --folio <n>        ej. 72852

        Modo 'watch':
          --concepto <cod>       ej. 440 (concepto CONTPAQi para todos los documentos del lote)
          --csd-pwd <pwd>        password del CSD cargado en CONTPAQi
          --sql <connstr>        conexión a la BD CONTPAQi para lookup RFC→código y folio
          --poll-secs <n>        intervalo de polling en segundos (default 10)
          --storage local|dropbox  backend del inbox/outbox (default local)
          # Backend local:
          --inbox <ruta>         carpeta filesystem donde Nala deposita XMLs de importación
          --outbox <ruta>        carpeta base filesystem para timbrados/, procesados/, errores/
          # Backend dropbox:
          --dropbox-token <t>    access token de la App Dropbox del cliente
          --dropbox-root <path>  base de Dropbox (ej. /Apps/Centinelia/piloto-estrella).
                                  El watcher lee de {root}/pendientes y escribe a
                                  {root}/timbrados|procesados|errores.
        """);
    }
}
