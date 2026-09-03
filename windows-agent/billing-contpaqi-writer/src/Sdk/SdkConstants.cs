namespace Centinelia.BillingContpaqi.Writer.Sdk;

/// <summary>
/// Longitudes máximas de los campos del SDK CONTPAQi Comercial.
/// Basado en la documentación pública oficial (misma tabla que expone
/// AR Software wrapper). Se usan como <c>SizeConst</c> en los
/// <see cref="System.Runtime.InteropServices.MarshalAsAttribute"/> de
/// los structs.
///
/// Valor 0 (<see cref="CodigoExito"/>) es el "OK" universal de retorno
/// del SDK; cualquier otro valor es error (traducible con <c>fError</c>).
/// </summary>
internal static class SdkConstants
{
    public const int CodigoExito = 0;

    public const int kLongCodigo     = 31;
    public const int kLongFecha      = 24;
    public const int kLongSerie      = 12;
    public const int kLongReferencia = 21;
    public const int kLongRFC        = 21;
    public const int kLongNombre     = 61;
    // UUID CFDI: 36 chars + null terminator; el SDK reserva 37.
    public const int kLongitudUUID   = 37;

    // Códigos de formato para fEntregEnDiscoXML.
    public const int TipoArchivoXml = 0;
    public const int TipoArchivoPdf = 1;

    /// <summary>
    /// Nombre del directorio (relativo al de la empresa) donde
    /// <c>fEntregEnDiscoXML</c> deposita los XMLs y PDFs generados.
    /// El SDK lo crea automáticamente si no existe.
    /// </summary>
    public const string DirectorioArchivosDigitales = "XML_SDK";
}
