using Xunit;
using System.IO;
using BillingContpaqiReader.Config;

public class AppConfigTests
{
    [Fact]
    public void Load_reads_all_required_fields()
    {
        var json = @"{
            ""DbProvider"": ""firebird"",
            ""DbConnectionString"": ""User=SYSDBA;Password=masterkey;Database=C:\\CONTPAQi\\empresa.fdb"",
            ""DropboxAccessToken"": ""fake-token"",
            ""DropboxBasePath"": ""/Centinelia/CONTPAQi"",
            ""AgentVersion"": ""0.1.0"",
            ""SyncIntervalMinutes"": 15
        }";
        var path = Path.GetTempFileName();
        File.WriteAllText(path, json);

        var config = AppConfig.Load(path);

        Assert.Equal("firebird", config.DbProvider);
        Assert.Equal("/Centinelia/CONTPAQi", config.DropboxBasePath);
        Assert.Equal(15, config.SyncIntervalMinutes);
    }

    [Fact]
    public void Load_throws_when_DbProvider_is_invalid()
    {
        var json = @"{ ""DbProvider"": ""mysql"", ""DbConnectionString"": ""x"", ""DropboxAccessToken"": ""y"", ""DropboxBasePath"": ""/z"", ""AgentVersion"": ""0.1.0"", ""SyncIntervalMinutes"": 15 }";
        var path = Path.GetTempFileName();
        File.WriteAllText(path, json);

        var ex = Assert.Throws<System.ArgumentException>(() => AppConfig.Load(path));
        Assert.Contains("DbProvider", ex.Message);
    }

    [Fact]
    public void Load_throws_when_DbConnectionString_missing()
    {
        var json = @"{ ""DbProvider"": ""firebird"", ""DbConnectionString"": """", ""DropboxAccessToken"": ""y"", ""DropboxBasePath"": ""/z"", ""AgentVersion"": ""0.1.0"", ""SyncIntervalMinutes"": 15 }";
        var path = Path.GetTempFileName();
        File.WriteAllText(path, json);

        var ex = Assert.Throws<System.ArgumentException>(() => AppConfig.Load(path));
        Assert.Contains("DbConnectionString", ex.Message);
    }

    [Fact]
    public void Load_throws_when_DropboxAccessToken_missing()
    {
        var json = @"{ ""DbProvider"": ""firebird"", ""DbConnectionString"": ""x"", ""DropboxAccessToken"": """", ""DropboxBasePath"": ""/z"", ""AgentVersion"": ""0.1.0"", ""SyncIntervalMinutes"": 15 }";
        var path = Path.GetTempFileName();
        File.WriteAllText(path, json);

        var ex = Assert.Throws<System.ArgumentException>(() => AppConfig.Load(path));
        Assert.Contains("DropboxAccessToken", ex.Message);
    }

    [Fact]
    public void Load_throws_when_DropboxBasePath_missing()
    {
        var json = @"{ ""DbProvider"": ""firebird"", ""DbConnectionString"": ""x"", ""DropboxAccessToken"": ""y"", ""DropboxBasePath"": """", ""AgentVersion"": ""0.1.0"", ""SyncIntervalMinutes"": 15 }";
        var path = Path.GetTempFileName();
        File.WriteAllText(path, json);

        var ex = Assert.Throws<System.ArgumentException>(() => AppConfig.Load(path));
        Assert.Contains("DropboxBasePath", ex.Message);
    }
}
