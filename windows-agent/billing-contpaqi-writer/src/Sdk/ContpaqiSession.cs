using System.Runtime.InteropServices;
using System.Text;

namespace Centinelia.BillingContpaqi.Writer.Sdk;

/// <summary>
/// Wrapper idiomático C# sobre las funciones de sesión del SDK CONTPAQi.
///
/// Uso:
/// <code>
/// using (var session = ContpaqiSession.Open(sdkPath, "SUPERVISOR", "", empresaPath))
/// {
///     // ejecutar operaciones contra el SDK...
/// }
/// // fCierraEmpresa + fTerminaSDK se llaman automáticamente en Dispose.
/// </code>
///
/// Este wrapper NO es thread-safe. El SDK CONTPAQi asume single-threaded
/// (no se puede tener múltiples sesiones concurrentes en el mismo proceso).
/// </summary>
public sealed class ContpaqiSession : IDisposable
{
    private bool _empresaOpen;
    private bool _sessionOpen;
    private bool _disposed;

    private ContpaqiSession() { }

    /// <summary>
    /// Abre una sesión SDK + una empresa. Añade el <paramref name="sdkPath"/> al
    /// buscador de DLLs antes del primer P/Invoke.
    /// </summary>
    /// <param name="sdkPath">
    ///   Directorio que contiene <c>MGW_SDK.dll</c> y sus dependencias.
    ///   Típicamente <c>C:\Program Files (x86)\Compac\COMERCIAL\SDK</c>.
    /// </param>
    /// <param name="usuario">Usuario CONTPAQi (ej. <c>SUPERVISOR</c>).</param>
    /// <param name="password">Contraseña del usuario. Puede ser vacía.</param>
    /// <param name="rutaEmpresa">
    ///   Ruta absoluta al directorio de la empresa.
    ///   Ej. <c>C:\Compac\Empresas\adTortillasEstrella_PILOTO_D</c>.
    /// </param>
    public static ContpaqiSession Open(string sdkPath, string usuario, string password, string rutaEmpresa)
    {
        // El SDK carga varios DLLs por su cuenta (contpaqi_rt.dll, librerias.dll, etc).
        // SetDllDirectory garantiza que el loader los encuentre.
        if (!SetDllDirectory(sdkPath))
        {
            var err = Marshal.GetLastPInvokeError();
            throw new InvalidOperationException($"SetDllDirectory falló con código {err} para ruta '{sdkPath}'");
        }

        var session = new ContpaqiSession();

        var sesionResult = ContpaqiSdkNative.fInicioSesionSDK(usuario, password);
        if (sesionResult != 0)
        {
            throw new ContpaqiSdkException("fInicioSesionSDK", sesionResult, DescribeError(sesionResult));
        }
        session._sessionOpen = true;

        var empresaResult = ContpaqiSdkNative.fAbreEmpresa(rutaEmpresa);
        if (empresaResult != 0)
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

/// <summary>Error devuelto por el SDK nativo con el código y el mensaje traducido.</summary>
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
