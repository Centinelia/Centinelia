using System.Runtime.InteropServices;

namespace Centinelia.BillingContpaqi.Writer.Sdk;

/// <summary>
/// P/Invoke bindings for the CONTPAQi Comercial native SDK
/// (<c>MGW_SDK.dll</c> / <c>CONTPAQ_I_DLL.dll</c>).
///
/// CONTPAQi SDK is native x86 C, not COM. Consumer process must be 32-bit
/// (see csproj Platforms/PlatformTarget=x86). PATH must contain the SDK
/// folder or use SetDllDirectory at startup.
///
/// Function names are the ones documented in CONTPAQi's public SDK manual
/// for Comercial Premium/Pro. Signatures follow the standard convention:
///   - Return value: int (0 = ok; non-zero = error code, translate via <c>fError</c>)
///   - Strings: ANSI (CharSet.Ansi) unless documented otherwise
///
/// This scaffold covers Day 1 (open/close session + fetch version). Additional
/// functions (createDocumento, agregaMovimiento, timbraDocumento, etc.) will
/// be added in Day 2-4.
/// </summary>
internal static class ContpaqiSdkNative
{
    // The DLL name is resolved via LoadLibrary; PATH or SetDllDirectory must
    // include the CONTPAQi SDK folder. Typical:
    //   C:\Program Files (x86)\Compac\COMERCIAL\SDK
    private const string DllName = "MGW_SDK.dll";

    // ---- Session lifecycle -----------------------------------------------

    /// <summary>Inicia la sesión del SDK con el usuario y la contraseña.</summary>
    /// <returns>0 si OK. Codigo de error si falla.</returns>
    [DllImport(DllName, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)]
    public static extern int fInicioSesionSDK(string usuario, string password);

    /// <summary>Termina la sesión del SDK y libera recursos.</summary>
    [DllImport(DllName, CallingConvention = CallingConvention.StdCall)]
    public static extern void fTerminaSDK();

    // ---- Empresa (opens against the company database) --------------------

    /// <summary>Abre una empresa de CONTPAQi Comercial dada la ruta al directorio de la empresa.</summary>
    /// <param name="rutaEmpresa">
    ///   Ruta absoluta al directorio de la empresa CONTPAQi.
    ///   Ejemplo piloto: <c>C:\Compac\Empresas\adTortillasEstrella_PILOTO_D</c>
    /// </param>
    [DllImport(DllName, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)]
    public static extern int fAbreEmpresa(string rutaEmpresa);

    /// <summary>Cierra la empresa actualmente abierta.</summary>
    [DllImport(DllName, CallingConvention = CallingConvention.StdCall)]
    public static extern int fCierraEmpresa();

    // ---- Diagnostics ------------------------------------------------------

    /// <summary>
    /// Traduce un código de error numérico devuelto por otras funciones del
    /// SDK a un string legible. Copia el resultado en <paramref name="buffer"/>
    /// (mínimo 512 bytes recomendado por la documentación pública).
    /// </summary>
    [DllImport(DllName, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)]
    public static extern void fError(int codigo, System.Text.StringBuilder buffer, int tamano);

    /// <summary>
    /// Devuelve la versión del SDK cargado. Copia el resultado en
    /// <paramref name="buffer"/>. Útil para validar que la instalación de
    /// CONTPAQi está viva antes de cualquier operación.
    /// </summary>
    [DllImport(DllName, CharSet = CharSet.Ansi, CallingConvention = CallingConvention.StdCall)]
    public static extern void fVersionSDK(System.Text.StringBuilder buffer, int tamano);
}
