using Centinelia.BillingContpaqi.Writer.Sdk;
using Microsoft.Extensions.Logging;

namespace Centinelia.BillingContpaqi.Writer.Watch;

/// <summary>
/// Retry helper para llamadas al PAC (fEmitirDocumento). El PAC puede fallar
/// por causas transient (timeout de red, contención) o permanentes (documento
/// ya timbrado, CSD inválido, RFC receptor rechazado por SAT).
///
/// Historia:
///   v1 (Day 7): reintentaba CUALQUIER error de fEmitirDocumento. Auditoría
///     2026-09-04 detectó riesgo de doble timbre: si el intento 1 realmente
///     timbró pero el PAC devolvió timeout de red, el intento 2 volvía a
///     timbrar → duplicado fiscal.
///   v2: filtra códigos permanentes conocidos (ya timbrado, CSD/CFDI/RFC
///     inválido) para que NO reintente esos. También hace safety-check post-
///     intento-fallido: si el documento ya tiene UUID en BD, considera que
///     el timbre entró y retorna éxito.
/// </summary>
public static class RetryPolicy
{
    /// <summary>
    /// Verificador opcional: si tras un fallo puede confirmar que el documento
    /// YA tiene UUID (o sea, el timbre entró aunque el PAC haya devuelto error),
    /// devuelve el UUID. Si retorna null, el fallo es real y se reintenta.
    /// Se inyecta desde BatchProcessor con acceso al SDK/BD.
    /// </summary>
    public delegate string? PostFailureUuidCheck();

    /// <summary>
    /// Reintenta <paramref name="action"/> hasta <paramref name="maxAttempts"/>
    /// veces, esperando 2^n segundos entre intentos (2s, 4s, 8s por default).
    /// Solo reintenta si la excepción es transient (fEmitirDocumento sin código
    /// de error permanente conocido). Antes de reintentar, si se pasó
    /// <paramref name="uuidCheck"/>, verifica que el documento no haya sido
    /// timbrado ya en el intento fallido (guardrail contra duplicado fiscal).
    /// </summary>
    public static void Stamp(
        Action action,
        ILogger logger,
        string label,
        int maxAttempts = 3,
        int baseDelaySeconds = 2,
        PostFailureUuidCheck? uuidCheck = null)
    {
        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                action();
                if (attempt > 1)
                {
                    logger.LogInformation("[retry] {label} tuvo éxito en intento {attempt}/{max}",
                        label, attempt, maxAttempts);
                }
                return;
            }
            catch (ContpaqiSdkException ex)
            {
                // Guardrail contra doble timbre: si tras el fallo el documento
                // ya tiene UUID, el timbre entró — no reintentar, considerar éxito.
                if (uuidCheck != null)
                {
                    string? uuidAfter = null;
                    try { uuidAfter = uuidCheck(); } catch { /* best-effort */ }
                    if (!string.IsNullOrEmpty(uuidAfter))
                    {
                        logger.LogWarning(
                            "[retry] {label} lanzó excepción pero el documento YA tiene UUID {uuid} — timbre entró, no reintento",
                            label, uuidAfter);
                        return;
                    }
                }

                if (!IsTransient(ex) || attempt >= maxAttempts)
                {
                    // Permanente o último intento — re-throw sin más retries.
                    throw;
                }

                var delay = TimeSpan.FromSeconds(Math.Pow(baseDelaySeconds, attempt));
                logger.LogWarning(
                    "[retry] {label} falló intento {attempt}/{max}: {func} código {code}: {msg}. Reintentando en {delay}s",
                    label, attempt, maxAttempts, ex.FunctionName, ex.ErrorCode, ex.Message, delay.TotalSeconds);
                Thread.Sleep(delay);
            }
        }
    }

    /// <summary>
    /// Códigos permanentes conocidos del SDK CONTPAQi / PAC. Reintentar cuando
    /// el PAC dice "documento ya timbrado" causa duplicado fiscal. Reintentar
    /// cuando el CSD está vencido no lo va a arreglar. Reintentar cuando el
    /// SAT rechaza el RFC no lo va a arreglar tampoco.
    ///
    /// Lista pragmática basada en códigos documentados del SDK y observación
    /// del PAC trial (ver [[handoff-writer-pilot-day5]] descubrimientos). Si
    /// aparecen más códigos permanentes en prod, agregarlos aquí.
    /// </summary>
    private static readonly int[] PermanentPacCodes = new[]
    {
        // fEmitirDocumento del SDK CONTPAQi:
        // 402: Documento ya timbrado.
        // 403: CSD inválido / caducado.
        // 404: RFC receptor rechazado por SAT.
        // 405: XML complementario inválido.
        // (Códigos exactos varían por versión del SDK; ajustar tras observación en prod.)
        402, 403, 404, 405,
    };

    /// <summary>
    /// Considera "transient" errores del PAC EXCEPTO los códigos permanentes
    /// conocidos. Sin este filtro, un "documento ya timbrado" causaba retry
    /// que resultaba en un segundo timbre real.
    /// </summary>
    private static bool IsTransient(ContpaqiSdkException ex)
    {
        if (ex.FunctionName is not "fEmitirDocumento") return false;
        if (Array.IndexOf(PermanentPacCodes, ex.ErrorCode) >= 0) return false;
        return true;
    }
}
