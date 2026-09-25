$ErrorActionPreference = 'Stop'

$packageVersion = '1.1.0'
$platform = 'win32-x64'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pythonRoot = Join-Path $projectRoot 'runtime\vendor\python-win-x64'
$hostPath = Join-Path $projectRoot 'runtime\native-modules\window-host.py'
$noticesPath = Join-Path $projectRoot 'runtime\vendor\THIRD_PARTY_NOTICES.md'
$stagingRoot = Join-Path $projectRoot 'build\window-runtime-staging'
$archivePath = Join-Path $projectRoot "build\window-runtime-$packageVersion-$platform.zip"

if (-not (Test-Path -LiteralPath (Join-Path $pythonRoot 'pythonw.exe'))) {
    throw 'Embedded Python is missing. Run tools/build-embedded-python.ps1 first.'
}
if (-not (Test-Path -LiteralPath $hostPath)) {
    throw 'window-host.py is missing.'
}

$resolvedStaging = [System.IO.Path]::GetFullPath($stagingRoot)
if (-not $resolvedStaging.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path $resolvedStaging -Leaf) -ne 'window-runtime-staging') {
    throw "Unsafe staging path: $resolvedStaging"
}

if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
Copy-Item -LiteralPath $pythonRoot -Destination $stagingRoot -Recurse
Copy-Item -LiteralPath $hostPath -Destination $stagingRoot
Copy-Item -LiteralPath $noticesPath -Destination $stagingRoot

Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $stagingRoot '*') -DestinationPath $archivePath -CompressionLevel Optimal
Remove-Item -LiteralPath $stagingRoot -Recurse -Force

$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output $archivePath
Write-Output "SHA256: $hash"
