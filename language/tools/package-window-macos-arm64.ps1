$ErrorActionPreference = 'Stop'

$packageVersion = '1.2.0'
$pythonVersion = '3.13.16'
$pythonBuild = '20261009'
$pythonArchiveName = "cpython-$pythonVersion+$pythonBuild-aarch64-apple-darwin-install_only_stripped.tar.gz"
$pythonUrl = "https://github.com/astral-sh/python-build-standalone/releases/download/$pythonBuild/cpython-$pythonVersion%2B$pythonBuild-aarch64-apple-darwin-install_only_stripped.tar.gz"
$pythonSha256 = '11785155d0f70e634178219c20925d8f20be00a3da4684fc4f5019dd15602ef7'
$pygameArchiveName = 'pygame-2.6.1-cp313-cp313-macosx_11_0_arm64.whl'
$pygameUrl = "https://files.pythonhosted.org/packages/0e/c6/9cb315de851a7682d9c7568a41ea042ee98d668cb8deadc1dafcab6116f0/$pygameArchiveName"
$pygameSha256 = '2a3a1288e2e9b1e5834e425bedd5ba01a3cd4902b5c2bff8ed4a740ccfe98171'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$buildRoot = Join-Path $projectRoot 'build'
$dependencyRoot = Join-Path $buildRoot 'dependencies'
$pythonArchive = Join-Path $dependencyRoot $pythonArchiveName
$pygameArchive = Join-Path $dependencyRoot $pygameArchiveName
$hostPath = Join-Path $projectRoot 'runtime\native-modules\window-host.py'
$noticesPath = Join-Path $projectRoot 'runtime\vendor\THIRD_PARTY_NOTICES.md'
$archivePath = Join-Path $buildRoot "window-runtime-$packageVersion-darwin-arm64.zip"
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'fablescript-window-macos-build'
$resolvedTempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$resolvedTemporaryRoot = [System.IO.Path]::GetFullPath($temporaryRoot)

if (-not $resolvedTemporaryRoot.StartsWith($resolvedTempBase + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path $resolvedTemporaryRoot -Leaf) -ne 'fablescript-window-macos-build') {
    throw "Unsafe temporary path: $resolvedTemporaryRoot"
}

function Get-VerifiedDownload([string]$Url, [string]$Destination, [string]$ExpectedHash) {
    New-Item -ItemType Directory -Path (Split-Path $Destination -Parent) -Force | Out-Null
    if (-not (Test-Path -LiteralPath $Destination) -or
        (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedHash) {
        Invoke-WebRequest -Uri $Url -OutFile $Destination
    }
    $actualHash = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $ExpectedHash) {
        throw "Checksum mismatch for $(Split-Path $Destination -Leaf): $actualHash"
    }
}

Get-VerifiedDownload $pythonUrl $pythonArchive $pythonSha256
Get-VerifiedDownload $pygameUrl $pygameArchive $pygameSha256
if (-not (Test-Path -LiteralPath $hostPath)) { throw 'window-host.py is missing.' }
if (-not (Test-Path -LiteralPath $noticesPath)) { throw 'THIRD_PARTY_NOTICES.md is missing.' }

if (Test-Path -LiteralPath $resolvedTemporaryRoot) {
    Remove-Item -LiteralPath $resolvedTemporaryRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $resolvedTemporaryRoot -Force | Out-Null
$temporaryPythonArchive = Join-Path $resolvedTemporaryRoot 'python.tar.gz'
Copy-Item -LiteralPath $pythonArchive -Destination $temporaryPythonArchive
$packageRoot = Join-Path $resolvedTemporaryRoot 'package'
$pythonRoot = Join-Path $packageRoot 'python-macos-arm64'
New-Item -ItemType Directory -Path $pythonRoot -Force | Out-Null

& tar -xzf $temporaryPythonArchive -C $pythonRoot --strip-components=1 `
    --exclude=python/bin/idle3 `
    --exclude=python/bin/pydoc3 `
    --exclude=python/bin/python `
    --exclude=python/bin/python3 `
    --exclude=python/bin/python3-config `
    --exclude=python/lib/pkgconfig/python3-embed.pc `
    --exclude=python/lib/pkgconfig/python3.pc `
    --exclude=python/share/man/man1/python.1 `
    --exclude=python/share/man/man1/python3.1
if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }

$pythonExecutable = Join-Path $pythonRoot 'bin\python3.13'
if (-not (Test-Path -LiteralPath $pythonExecutable)) { throw 'The macOS Python executable is missing from the archive.' }

foreach ($relativePath in @(
    'include',
    'share',
    'lib\pkgconfig',
    'lib\python3.13\ensurepip',
    'lib\python3.13\idlelib',
    'lib\python3.13\test',
    'lib\python3.13\tkinter',
    'lib\python3.13\turtledemo'
)) {
    Remove-Item -LiteralPath (Join-Path $pythonRoot $relativePath) -Recurse -Force -ErrorAction SilentlyContinue
}
Get-ChildItem -LiteralPath (Join-Path $pythonRoot 'bin') -File |
    Where-Object Name -ne 'python3.13' |
    Remove-Item -Force

$sitePackages = Join-Path $pythonRoot 'lib\python3.13\site-packages'
New-Item -ItemType Directory -Path $sitePackages -Force | Out-Null
Get-ChildItem -LiteralPath $sitePackages |
    Where-Object { $_.Name -eq 'pip' -or $_.Name -like 'pip-*.dist-info' -or $_.Name -like 'setuptools*' } |
    Remove-Item -Recurse -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($pygameArchive, $sitePackages, $true)

Copy-Item -LiteralPath $hostPath -Destination $packageRoot
Copy-Item -LiteralPath $noticesPath -Destination $packageRoot

Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $archivePath -CompressionLevel Optimal
Remove-Item -LiteralPath $resolvedTemporaryRoot -Recurse -Force

$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output $archivePath
Write-Output "SHA256: $hash"
