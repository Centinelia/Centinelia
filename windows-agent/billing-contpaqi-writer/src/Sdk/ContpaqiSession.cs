using System.Runtime.InteropServices;
using System.Text;

namespace Centinelia.BillingContpaqi.Writer.Sdk;

/// <summary>
/// Wrapper idiomático sobre las funciones core del SDK CONTPAQi.
///
/// Uso típico:
/// <code>
/// using var session = ContpaqiSession.Open(sdkPath, "SUPERVISOR", "", empresaPath);
///
/// session.FindCliente("008");            // verifica que el código exista en el catálogo
/// session.FindProducto("021");           // verifica que el SKU exista
/// var idDoc = session.CreateDocumentHeader(new InvoiceHeader { ... });
/// session.AddLine(idDoc, new InvoiceLine { ... });
/// session.AffectDocument("FACTURA", "FTEN", folio);   // Sin afectar → activo
/// // Day 4: session.StampDocument(...) invocará al PAC contratado
/// </code>
///
/// Este wrapper NO es thread-safe. El SDK CONTPAQi asume single-threaded.
/// </summary>
public sealed class ContpaqiSession : IDisposable
{
    private bool _empresaOpen;
    private bool _sessionOpen;
    private bool _disposed;

    private ContpaqiSession() { }

    /// <summary>
    /// Añade el directorio del SDK a la lista de búsqueda de DLLs. Debe
    /// invocarse ANTES de cualquier P/Invoke al SDK (incluyendo
    /// <see cref="GetSdkVersion"/> y <see cref="DescribeError"/>), o el
    /// runtime tira <c>DllNotFoundException</c> al buscar
    /// <c>MGWServicios.dll</c> solo en el PATH del sistema.
    /// </summary>
    public static void RegisterSdkPath(string sdkPath)
    {
        if (!SetDllDirectory(sdkPath))
        {
            var err = Marshal.GetLastPInvokeError();
            throw new InvalidOperationException($"SetDllDirectory falló con código {err} para ruta '{sdkPath}'");
        }
    }

    /// <summary>Abre una sesión SDK + una empresa. Llama <see cref="RegisterSdkPath"/> internamente.</summary>
    public static ContpaqiSession Open(string sdkPath, string usuario, string password, string rutaEmpresa)
    {
        RegisterSdkPath(sdkPath);
        var session = new ContpaqiSession();

        var sesionResult = ContpaqiSdkNative.fInicioSesionSDK(usuario, password);
        if (sesionResult != SdkConstants.CodigoExito)
        {
            throw new ContpaqiSdkException("fInicioSesionSDK", sesionResult, DescribeError(sesionResult));
        }
        session._sessionOpen = true;

        var empresaResult = ContpaqiSdkNative.fAbreEmpresa(rutaEmpresa);
        if (empresaResult != SdkConstants.CodigoExito)
        {
            session.Dispose();
            throw new ContpaqiSdkException("fAbreEmpresa", empresaResult, DescribeError(empresaResult));
        }
        session._empresaOpen = true;

        return session;
    }

    /// <summary>Retorna la versión reportada por el SDK cargado.</summary>
    public static string GetSdkVersion()
    {
        var buffer = new StringBuilder(256);
        ContpaqiSdkNative.fVersionSDK(buffer, buffer.Capacity);
        return buffer.ToString();
    }

    /// <summary>Traduce un código de error del SDK a texto legible.</summary>
    public static string DescribeError(int codigo)
    {
        var buffer = new StringBuilder(512);
        ContpaqiSdkNative.fError(codigo, buffer, buffer.Capacity);
        return buffer.ToString();
    }

    // ---- Búsquedas (validan que el código exista en el catálogo) ---------

    /// <summary>Verifica que un cliente/proveedor exista por código. Throw si no existe.</summary>
    public void FindCliente(string codigo)
    {
        var r = ContpaqiSdkNative.fBuscaCteProv(codigo);
        if (r != SdkConstants.CodigoExito)
        {
            throw new ContpaqiSdkException("fBuscaCteProv", r, $"código '{codigo}': {DescribeError(r)}");
        }
    }

    /// <summary>Verifica que un producto exista por código. Throw si no existe.</summary>
    public void FindProducto(string codigo)
    {
        var r = ContpaqiSdkNative.fBuscaProducto(codigo);
        if (r != SdkConstants.CodigoExito)
        {
            throw new ContpaqiSdkException("fBuscaProducto", r, $"código '{codigo}': {DescribeError(r)}");
        }
    }

    // ---- Alta de documentos + líneas -------------------------------------

    /// <summary>
    /// Da de alta un documento nuevo con encabezado. El documento queda
    /// "Sin afectar" — usar <see cref="AffectDocument"/> para activarlo
    /// después de agregar todas las líneas.
    /// </summary>
    /// <returns>ID interno del documento (necesario para <see cref="AddLine"/>).</returns>
    public int CreateDocumentHeader(InvoiceHeader header)
    {
        var doc = new Structs.TDocumento
        {
            aCodConcepto    = header.CodigoConcepto,   // ej. "FACT" o "4.0 CFDI FACTURA"
            aSerie          = header.Serie,            // ej. "FTEN"
            aFolio          = 0,                       // 0 = auto-asigna el siguiente folio de la serie
            aFecha          = header.Fecha,            // "mm/dd/yyyy"
            aCodigoCteProv  = header.CodigoCliente,    // ej. "008"
            aCodigoAgente   = header.CodigoAgente ?? "",
            aReferencia     = header.Referencia ?? "",
            aNumMoneda      = 1,                       // 1 = Pesos MN
            aTipoCambio     = 1.0,
            aImporte        = 0.0,                     // se calcula al afectar
            aDescuentoDoc1  = 0.0,
            aDescuentoDoc2  = 0.0,
            aSistemaOrigen  = 6,                       // >5 = origen externo (no otro PAQ)
            aAfecta         = 0,                       // sin uso, siempre 0
            aGasto1         = 0.0,
            aGasto2         = 0.0,
            aGasto3         = 0.0,
        };

        int idDoc = 0;
        var r = ContpaqiSdkNative.fAltaDocumento(ref idDoc, ref doc);
        if (r != SdkConstants.CodigoExito)
        {
            throw new ContpaqiSdkException("fAltaDocumento", r, DescribeError(r));
        }
        return idDoc;
    }

    /// <summary>Agrega una línea al documento identificado por <paramref name="idDocumento"/>.</summary>
    /// <returns>ID interno del movimiento creado.</returns>
    public int AddLine(int idDocumento, InvoiceLine line)
    {
        var mov = new Structs.TMovimiento
        {
            aConsecutivo      = 0,                    // 0 = auto-consecutivo
            aUnidades         = line.Cantidad,
            aPrecio           = line.PrecioUnitario,
            aCosto            = 0.0,
            aCodProdSer       = line.CodigoProducto,
            aCodAlmacen       = line.CodigoAlmacen ?? "",
            aReferencia       = line.Referencia ?? "",
            aCodClasificacion = "",
        };

        int idMov = 0;
        var r = ContpaqiSdkNative.fAltaMovimiento(idDocumento, ref idMov, ref mov);
        if (r != SdkConstants.CodigoExito)
        {
            throw new ContpaqiSdkException("fAltaMovimiento", r, DescribeError(r));
        }
        return idMov;
    }

    /// <summary>Afecta (activa) un documento existente identificado por concepto + serie + folio.</summary>
    public void AffectDocument(string codConcepto, string serie, double folio)
    {
        var llave = new Structs.TLlaveDoc
        {
            aCodConcepto = codConcepto,
            aSerie       = serie,
            aFolio       = folio,
        };
        var r = ContpaqiSdkNative.fAfectaDocto(ref llave, true);
        if (r != SdkConstants.CodigoExito)
        {
            throw new ContpaqiSdkException("fAfectaDocto", r, DescribeError(r));
        }
    }

    // ---- IDisposable ------------------------------------------------------

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        if (_empresaOpen)
        {
            try { ContpaqiSdkNative.fCierraEmpresa(); } catch { /* best-effort */ }
        }
        if (_sessionOpen)
        {
            try { ContpaqiSdkNative.fTerminaSDK(); } catch { /* best-effort */ }
        }
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetDllDirectory(string lpPathName);
}

/// <summary>Datos del encabezado del documento a crear (subset amigable de <see cref="Structs.TDocumento"/>).</summary>
public sealed record InvoiceHeader
{
    /// <summary>Código del concepto del documento en el catálogo CONTPAQi (ej. "FACT", "4.0 CFDI FACTURA").</summary>
    public required string CodigoConcepto { get; init; }
    /// <summary>Serie del comprobante (ej. "FTEN").</summary>
    public required string Serie { get; init; }
    /// <summary>Código interno del cliente en CONTPAQi (adapter_id, no RFC).</summary>
    public required string CodigoCliente { get; init; }
    /// <summary>Fecha formato "mm/dd/yyyy" (obligatorio, sin espacios).</summary>
    public required string Fecha { get; init; }
    public string? CodigoAgente { get; init; }
    public string? Referencia { get; init; }
}

/// <summary>Línea (movimiento) del documento.</summary>
public sealed record InvoiceLine
{
    /// <summary>Código interno del producto en CONTPAQi (sku).</summary>
    public required string CodigoProducto { get; init; }
    public required double Cantidad { get; init; }
    public required double PrecioUnitario { get; init; }
    public string? CodigoAlmacen { get; init; }
    public string? Referencia { get; init; }
}

/// <summary>Excepción envuelta con el nombre de la función, código y descripción del SDK.</summary>
public sealed class ContpaqiSdkException : Exception
{
    public string FunctionName { get; }
    public int ErrorCode { get; }

    public ContpaqiSdkException(string functionName, int errorCode, string message)
        : base($"{functionName} falló con código {errorCode}: {message}")
    {
        FunctionName = functionName;
        ErrorCode = errorCode;
    }
}
