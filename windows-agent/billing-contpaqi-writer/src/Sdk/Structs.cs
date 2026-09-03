using System.Runtime.InteropServices;

namespace Centinelia.BillingContpaqi.Writer.Sdk;

/// <summary>
/// Structs del SDK CONTPAQi Comercial. Layout <c>Sequential, Pack=4, Ansi</c>
/// es OBLIGATORIO — cambia y el marshalling se rompe silenciosamente.
///
/// Solo declaramos los campos que USAMOS. Si el SDK espera un struct más
/// grande y le pasamos uno más pequeño, la memoria será interpretada mal.
/// Por eso replicamos LOS MISMOS campos y orden que expone AR Software
/// wrapper (validado contra CONTPAQi real por comunidad).
/// </summary>
internal static class Structs
{
    /// <summary>
    /// Llave compuesta para identificar un documento existente.
    /// Se usa en fBuscaDocumento, fAfectaDocto, fEmiteDocumento y similares.
    /// </summary>
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 4)]
    public struct TLlaveDoc
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = SdkConstants.kLongCodigo)]
        public string aCodConcepto;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = SdkConstants.kLongSerie)]
        public string aSerie;

        public double aFolio;
    }

    /// <summary>
    /// Encabezado de documento nuevo. Se pasa a fAltaDocumento(ref int, ref TDocumento).
    /// El campo <c>aSistemaOrigen</c> debe ser &gt; 5 para indicar "no viene de otro PAQ".
    /// </summary>
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 4)]
    public struct TDocumento
    {
        public double aFolio;
        public int    aNumMoneda;
        public double aTipoCambio;
        public double aImporte;
        public double aDescuentoDoc1;
        public double aDescuentoDoc2;
        public int    aSistemaOrigen;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = SdkConstants.kLongCodigo)]
        public string aCodConcepto;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = SdkConstants.kLongSerie)]
        public string aSerie;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = SdkConstants.kLongFecha)]
        public string aFecha;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = SdkConstants.kLongCodigo)]
        public string aCodigoCteProv;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = SdkConstants.kLongCodigo)]
        public string aCodigoAgente;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = SdkConstants.kLongReferencia)]
        public string aReferencia;

        public int aAfecta;

        public double aGasto1;
        public double aGasto2;
        public double aGasto3;
    }

    /// <summary>
    /// Línea/movimiento de un documento. Se pasa a fAltaMovimiento(idDocumento, ref int, ref TMovimiento).
    /// </summary>
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 4)]
    public struct TMovimiento
    {
        public int    aConsecutivo;
        public double aUnidades;
        public double aPrecio;
        public double aCosto;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = SdkConstants.kLongCodigo)]
        public string aCodProdSer;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = SdkConstants.kLongCodigo)]
        public string aCodAlmacen;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = SdkConstants.kLongReferencia)]
        public string aReferencia;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = SdkConstants.kLongCodigo)]
        public string aCodClasificacion;
    }
}
