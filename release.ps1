param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

$ModuleDir = "foundry-data/Data/modules/oot"
$ModuleJson = "$ModuleDir/module.json"
$OutputFile = "module.zip"

Write-Host "Creating release for OOT module v$Version..."

# Update version and download URL in module.json
$content = Get-Content $ModuleJson -Raw
$content = $content -replace '"version": "[^"]*"', "`"version`": `"$Version`""
$content = $content -replace 'releases/download/[^/]*/module.zip', "releases/download/$Version/module.zip"
Set-Content $ModuleJson $content -NoNewline

Write-Host "Updated module.json with version $Version"

# Remove old zip if exists
if (Test-Path $OutputFile) {
    Remove-Item $OutputFile
}

# Create zip with module contents at root (equivalent to: cd $ModuleDir && zip -r ../../../../module.zip .)
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

$sourcePath = [System.IO.Path]::GetFullPath($ModuleDir)
$destPath   = [System.IO.Path]::GetFullPath($OutputFile)

$stream = [System.IO.FileStream]::new($destPath, [System.IO.FileMode]::Create)
$zip    = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)

try {
    Get-ChildItem -Path $sourcePath -Recurse -File |
        Where-Object { $_.Name -ne ".DS_Store" } |
        ForEach-Object {
            $entryName = $_.FullName.Substring($sourcePath.Length + 1).Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName) | Out-Null
        }
} finally {
    $zip.Dispose()
    $stream.Dispose()
}

Write-Host "Created $OutputFile"
Write-Host "Ready to upload to GitHub release v$Version"
