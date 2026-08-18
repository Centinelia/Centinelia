using BillingContpaqiReader.Config;
using BillingContpaqiReader.Db;

namespace BillingContpaqiReader.Tests;

public class DbFactoryTests
{
    private static AppConfig MakeConfig(string provider) => new AppConfig
    {
        DbProvider = provider,
        DbConnectionString = "Server=localhost;Database=test",
        DropboxAccessToken = "token",
        DropboxBasePath = "/path"
    };

    [Fact]
    public void Create_WithFirebird_ReturnsFirebirdRepository()
    {
        var config = MakeConfig("firebird");
        var repo = DbFactory.Create(config);
        Assert.IsType<FirebirdCatalogRepository>(repo);
    }

    [Fact]
    public void Create_WithSqlServer_ReturnsSqlServerRepository()
    {
        var config = MakeConfig("sqlserver");
        var repo = DbFactory.Create(config);
        Assert.IsType<SqlServerCatalogRepository>(repo);
    }

    [Fact]
    public void Create_WithUnknownProvider_ThrowsArgumentException()
    {
        var config = new AppConfig
        {
            DbProvider = "oracle",
            DbConnectionString = "cs",
            DropboxAccessToken = "token",
            DropboxBasePath = "/path"
        };
        Assert.Throws<ArgumentException>(() => DbFactory.Create(config));
    }
}
