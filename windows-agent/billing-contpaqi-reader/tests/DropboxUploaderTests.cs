using BillingContpaqiReader.Storage;

namespace BillingContpaqiReader.Tests;

public class DropboxUploaderTests
{
    [Fact]
    public async Task UploadAsync_InjectsCorrectPathAndContent()
    {
        // Arrange
        string? capturedPath = null;
        Stream? capturedStream = null;

        Func<string, Stream, Task> fakeHandler = (path, stream) =>
        {
            capturedPath = path;
            capturedStream = stream;
            return Task.CompletedTask;
        };

        var uploader = new DropboxUploader("fake-token", fakeHandler);
        var content = new MemoryStream(new byte[] { 1, 2, 3 });
        const string targetPath = "/billing/2026/file.csv";

        // Act
        await uploader.UploadAsync(targetPath, content);

        // Assert
        Assert.Equal(targetPath, capturedPath);
        Assert.Same(content, capturedStream);
    }

    [Fact]
    public async Task UploadAsync_HandlerCalledExactlyOnce()
    {
        int callCount = 0;
        Func<string, Stream, Task> fakeHandler = (_, _) =>
        {
            callCount++;
            return Task.CompletedTask;
        };

        var uploader = new DropboxUploader("fake-token", fakeHandler);
        await uploader.UploadAsync("/some/path", Stream.Null);

        Assert.Equal(1, callCount);
    }

    [Fact]
    public void Constructor_PublicOverload_DoesNotThrow()
    {
        // Verifies the public constructor accepts a token without crashing at construction time.
        var ex = Record.Exception(() => new DropboxUploader("any-token"));
        Assert.Null(ex);
    }
}
