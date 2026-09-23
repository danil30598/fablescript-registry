$ErrorActionPreference = 'Stop'

$pythonVersion = '3.13.14'
$pythonSeries = '313'
$pythonSha256 = '90b4e5b9898b72d744650524bff92377c367f44bd5fbd09e3148656c080ad907'
$pygameVersion = '2.6.1'
$pygameSha256 = '813af4fba5d0b2cb8e58f5d95f7910295c34067dcc290d34f1be59c48bd1ea6a'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$downloadRoot = Join-Path $projectRoot 'build\dependencies'
$vendorRoot = Join-Path $projectRoot 'runtime\vendor\python-win-x64'
$stagingRoot = Join-Path $projectRoot 'build\embedded-python-staging'
$pythonArchive = Join-Path $downloadRoot "python-$pythonVersion-embed-amd64.zip"
$pygameWheel = Join-Path $downloadRoot "pygame-$pygameVersion-cp$pythonSeries-cp$pythonSeries-win_amd64.whl"
$pygameArchive = Join-Path $downloadRoot "pygame-$pygameVersion-cp$pythonSeries-cp$pythonSeries-win_amd64.zip"

function Assert-ProjectChild([string]$Path, [string]$ExpectedLeaf) {
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    if (-not $fullPath.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path $fullPath -Leaf) -ne $ExpectedLeaf) {
        throw "Unsafe build path: $fullPath"
    }
}

function Assert-Hash([string]$Path, [string]$ExpectedHash) {
    $actualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $ExpectedHash) {
        throw "Checksum mismatch for $Path. Expected $ExpectedHash, got $actualHash."
    }
}

Assert-ProjectChild $vendorRoot 'python-win-x64'
Assert-ProjectChild $stagingRoot 'embedded-python-staging'
New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null

if (-not (Test-Path -LiteralPath $pythonArchive)) {
    $pythonUrl = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip"
    Invoke-WebRequest -Uri $pythonUrl -OutFile $pythonArchive
}
Assert-Hash $pythonArchive $pythonSha256

if (-not (Test-Path -LiteralPath $pygameWheel)) {
    $pygameRelease = Invoke-RestMethod -Uri "https://pypi.org/pypi/pygame/$pygameVersion/json"
    $pygameFile = $pygameRelease.urls | Where-Object {
        $_.filename -eq (Split-Path $pygameWheel -Leaf)
    } | Select-Object -First 1
    if (-not $pygameFile) {
        throw "Pygame wheel was not found: $(Split-Path $pygameWheel -Leaf)"
    }
    Invoke-WebRequest -Uri $pygameFile.url -OutFile $pygameWheel
}
Assert-Hash $pygameWheel $pygameSha256

if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
Expand-Archive -LiteralPath $pythonArchive -DestinationPath $stagingRoot -Force

$sitePackages = Join-Path $stagingRoot 'Lib\site-packages'
New-Item -ItemType Directory -Path $sitePackages -Force | Out-Null
Copy-Item -LiteralPath $pygameWheel -Destination $pygameArchive -Force
Expand-Archive -LiteralPath $pygameArchive -DestinationPath $sitePackages -Force
Remove-Item -LiteralPath $pygameArchive -Force

$pathFile = Join-Path $stagingRoot "python$pythonSeries._pth"
@(
    "python$pythonSeries.zip"
    '.'
    'Lib\site-packages'
    'import site'
) | Set-Content -LiteralPath $pathFile -Encoding Ascii

if (Test-Path -LiteralPath $vendorRoot) {
    Remove-Item -LiteralPath $vendorRoot -Recurse -Force
}
New-Item -ItemType Directory -Path (Split-Path $vendorRoot -Parent) -Force | Out-Null
Move-Item -LiteralPath $stagingRoot -Destination $vendorRoot

& (Join-Path $vendorRoot 'python.exe') -c 'import pygame; print(pygame.version.ver)'
if ($LASTEXITCODE -ne 0) {
    throw 'Embedded Python could not import Pygame.'
}

Write-Output "Embedded Python $pythonVersion and Pygame ${pygameVersion}: $vendorRoot"
