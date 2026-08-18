using Dropbox.Api;
using Dropbox.Api.Files;

namespace BillingContpaqiReader.Storage;

public class DropboxUploader : IDropboxUploader
{
    private readonly Func<string, Stream, Task> _uploadImpl;

    /// <summary>Public constructor — uses the real Dropbox SDK.</summary>
    public DropboxUploader(string accessToken)
        : this(accessToken, BuildRealHandler(accessToken))
    {
    }

    /// <summary>Internal constructor — allows injecting a fake handler for tests.</summary>
    internal DropboxUploader(string accessToken, Func<string, Stream, Task>? uploadImpl)
    {
        _ = accessToken; // kept for symmetry / future refresh-token use
        _uploadImpl = uploadImpl ?? BuildRealHandler(accessToken);
    }

    public Task UploadAsync(string dropboxPath, Stream content) =>
        _uploadImpl(dropboxPath, content);

    private static Func<string, Stream, Task> BuildRealHandler(string accessToken)
    {
        var client = new DropboxClient(accessToken);
        return async (path, stream) =>
        {
            await client.Files.UploadAsync(
                path,
                WriteMode.Overwrite.Instance,
                body: stream);
        };
    }
}
