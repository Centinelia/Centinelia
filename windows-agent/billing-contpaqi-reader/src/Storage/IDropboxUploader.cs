namespace BillingContpaqiReader.Storage;

public interface IDropboxUploader
{
    Task UploadAsync(string dropboxPath, Stream content);
}
