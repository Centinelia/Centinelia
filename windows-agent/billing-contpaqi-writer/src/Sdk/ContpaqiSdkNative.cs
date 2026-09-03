using System.Runtime.InteropServices;

namespace Centinelia.BillingContpaqi.Writer.Sdk;

/// <summary>
/// P/Invoke bindings al SDK nativo de CONTPAQi Comercial.
///
/// DLL: <c>MGWServicios.dll</c> — se distribuye con CONTPAQi Comercial
/// Premium/Pro en <c>C:\Program Files (x86)\Compac\COMERCIAL\SDK\</c>
/// junto con sus dependencias (<c>contpaqi_rt.dll</c>, <c>librerias.dll</c>,
/// <c>CONTPAQ_I_DLL.dll</c>). Todas son x86; el proceso consumidor DEBE
/// ser 32-bit (ver csproj <c>PlatformTarget=x86</c>).
///
/// Convenciones:
/// - Return type <c>int</c>: 0 = éxito (<see cref="SdkConstants.CodigoExito"/>),
///   cualquier otro valor es código de error (traducible con <c>fError</c>).
/// - Strings: ANSI (CharSet.Ansi por default en DllImport aquí).
/// - Calling convention: WinAPI (StdCall en x86).
///
/// Las firmas exactas provienen de la documentación pública del SDK,
/// validadas contra el wrapper open-source AR Software (referencia:
/// https://github.com/AndresRamos/ARSoftware.Contpaqi.Comercial).
/// </summary>
internal static class ContpaqiSdkNative
{
    private const string DllName = "MGWServicios.dll";

    // ---- Session lifecycle -----------------------------------------------

    /// <summary>
    /// IMPORTANTE: retorna <c>void</c>, no int. Un intento previo de leerla
    /// como int devolvía valores basura (leyendo del stack).
    /// </summary>
    [DllImport(DllName, EntryPoint = "fInicioSesionSDK", CharSet = CharSet.Ansi)]
    public static extern void fInicioSesionSDK(string usuario, string password);

    /// <summary>
    /// Selecciona el sistema PAQ dentro del SDK. DEBE llamarse entre
    /// <c>fInicioSesionSDK</c> y <c>fAbreEmpresa</c>, con el string
    /// "CONTPAQ I COMERCIAL" para Comercial Premium/Pro.
    /// </summary>
    [DllImport(DllName, EntryPoint = "fSetNombrePAQ", CharSet = CharSet.Ansi)]
    public static extern int fSetNombrePAQ(string aSistema);

    [DllImport(DllName, EntryPoint = "fTerminaSDK")]
    public static extern void fTerminaSDK();

    [DllImport(DllName, EntryPoint = "fAbreEmpresa", CharSet = CharSet.Ansi)]
    public static extern int fAbreEmpresa(string aDirectorioEmpresa);

    [DllImport(DllName, EntryPoint = "fCierraEmpresa")]
    public static extern int fCierraEmpresa();

    // ---- Diagnostics ------------------------------------------------------

    [DllImport(DllName, EntryPoint = "fError", CharSet = CharSet.Ansi)]
    public static extern void fError(int codigo, System.Text.StringBuilder buffer, int tamano);

    [DllImport(DllName, EntryPoint = "fVersionSDK", CharSet = CharSet.Ansi)]
    public static extern void fVersionSDK(System.Text.StringBuilder buffer, int tamano);

    // ---- Búsqueda de catálogos (posiciona el "puntero interno" del SDK)  -

    /// <summary>
    /// Busca un cliente/proveedor por su código interno. Regresa 0 si lo
    /// encuentra y deja el "puntero" interno del SDK posicionado en él.
    /// </summary>
    [DllImport(DllName, EntryPoint = "fBuscaCteProv", CharSet = CharSet.Ansi)]
    public static extern int fBuscaCteProv(string aCodCteProv);

    /// <summary>
    /// Busca un producto/servicio por su código. Regresa 0 si lo encuentra.
    /// </summary>
    [DllImport(DllName, EntryPoint = "fBuscaProducto", CharSet = CharSet.Ansi)]
    public static extern int fBuscaProducto(string aCodProducto);

    // ---- Alta de documentos y movimientos --------------------------------

    /// <summary>
    /// Crea un nuevo documento a partir de un <see cref="Structs.TDocumento"/>.
    /// Al éxito, <paramref name="aIdDocumento"/> queda con el ID interno del
    /// documento recién creado (necesario para <c>fAltaMovimiento</c>).
    /// El documento queda como "Sin afectar" — hay que llamar
    /// <c>fAfectaDocto</c> aparte para activarlo.
    /// </summary>
    [DllImport(DllName, EntryPoint = "fAltaDocumento", CharSet = CharSet.Ansi)]
    public static extern int fAltaDocumento(ref int aIdDocumento, ref Structs.TDocumento aDocumento);

    /// <summary>
    /// Agrega un movimiento (línea de detalle) al documento <paramref name="aIdDocumento"/>.
    /// Al éxito, <paramref name="aIdMovimiento"/> queda con el ID del movimiento.
    /// </summary>
    [DllImport(DllName, EntryPoint = "fAltaMovimiento", CharSet = CharSet.Ansi)]
    public static extern int fAltaMovimiento(int aIdDocumento, ref int aIdMovimiento, ref Structs.TMovimiento astMovimiento);

    /// <summary>
    /// Afecta o des-afecta un documento existente identificado por
    /// concepto + serie + folio. <c>afecta=true</c> activa el documento
    /// (baja stock, actualiza saldos, listo para timbrar).
    /// </summary>
    [DllImport(DllName, EntryPoint = "fAfectaDocto", CharSet = CharSet.Ansi)]
    public static extern int fAfectaDocto(ref Structs.TLlaveDoc aLlaveDocto, bool aAfecta);
}
