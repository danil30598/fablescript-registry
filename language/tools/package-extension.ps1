$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stagingRoot = Join-Path $projectRoot '.vsix-staging'
$extensionRoot = Join-Path $stagingRoot 'extension'
$buildRoot = Join-Path $projectRoot 'build'
$zipPath = Join-Path $buildRoot 'fablescript-0.0.34.zip'
$vsixPath = Join-Path $buildRoot 'fablescript-0.0.34.vsix'
if (-not $stagingRoot.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path $stagingRoot -Leaf) -ne '.vsix-staging') {
    throw 'Unsafe staging path.'
}

if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $extensionRoot -Force | Out-Null
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $projectRoot 'packaging\[Content_Types].xml') -Destination $stagingRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'packaging\extension.vsixmanifest') -Destination $stagingRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'vscode-extension\package.json') -Destination $extensionRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'vscode-extension\extension.js') -Destination $extensionRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'vscode-extension\language-configuration.json') -Destination $extensionRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'vscode-extension\syntaxes') -Destination $extensionRoot -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'runtime') -Destination $extensionRoot -Recurse
Remove-Item -LiteralPath (Join-Path $extensionRoot 'runtime\vendor') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $extensionRoot 'runtime\native-modules\window-host.py') -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination $extensionRoot

Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $vsixPath -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $stagingRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal
Move-Item -LiteralPath $zipPath -Destination $vsixPath
Remove-Item -LiteralPath $stagingRoot -Recurse -Force

Write-Output $vsixPath
