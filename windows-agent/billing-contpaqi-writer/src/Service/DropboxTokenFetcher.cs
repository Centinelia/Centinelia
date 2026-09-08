using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Logging;

namespace Centinelia.BillingContpaqi.Writer.Service;

/// <summary>
/// Cliente HTTP que pide a Centinelia el access_token de Dropbox del meerkat
/// Nala per-agent. Beatriz nunca teclea tokens — el zip trae el api_token de
/// Centinelia y este componente lo canjea por el token Dropbox real.
///
/// Endpoint: <c>GET {endpoint}/api/writer/dropbox-token</c>
///   Header: <c>Authorization: Bearer {api_token}</c>
///   Response 200: { access_token, expires_at (ISO), dropbox_base_path }
///
/// Nota: el access_token de Dropbox tipicamente dura 4 horas. Este fetcher
/// pide uno fresh al arranque del writer y basta para runs cortos. Si el
/// service corre >4h y el token expira mid-flight, el DropboxInboxStorage
/// lanzará 401, el WatchLoop crashea al outer catch de <see cref="WriterBackgroundService"/>
/// y el SCM restart trae otro token fresh. Refresh proactivo mid-run queda
/// como mejora futura si se vuelve necesaria.
/// </summary>
public sealed class DropboxTokenFetcher : IDisposable
{
    private readonly HttpClient _http;
    private readonly ILogger<DropboxTokenFetcher> _logger;
    private readonly string _endpoint;
    private readonly string _apiToken;

    public DropboxTokenFetcher(
        string endpoint,
        string apiToken,
        ILogger<DropboxTokenFetcher> logger)
    {
        _endpoint = endpoint.TrimEnd('/');
        _apiToken = apiToken;
        _logger   = logger;
        _http     = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(15),
        };
    }

    public async Task<DropboxTokenResponse> FetchAsync(CancellationToken ct)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, $"{_endpoint}/api/writer/dropbox-token");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiToken);

        _logger.LogInformation("[dropbox-fetcher] pidiendo token a {endpoint}", _endpoint);
        using var res = await _http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode)
        {
            var body = await res.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Centinelia rechazó la petición de token Dropbox (HTTP {(int)res.StatusCode}): {body}");
        }

        var data = await res.Content.ReadFromJsonAsync<DropboxTokenResponse>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Centinelia devolvió respuesta vacía al pedir token Dropbox");

        if (string.IsNullOrWhiteSpace(data.access_token))
            throw new InvalidOperationException("Centinelia devolvió access_token vacío");
        if (string.IsNullOrWhiteSpace(data.dropbox_base_path))
            throw new InvalidOperationException("Centinelia devolvió dropbox_base_path vacío");

        _logger.LogInformation("[dropbox-fetcher] token OK, expira {expires}", data.expires_at);
        return data;
    }

    public void Dispose() => _http.Dispose();
}

// System.Text.Json prefiere snake_case como propiedades cuando matchea 1-a-1
// con el JSON server-side; usar record con propiedades explícitas es lo más
// simple sin agregar JsonSerializerOptions global.
public sealed record DropboxTokenResponse(
    string access_token,
    string expires_at,
    string dropbox_base_path);
