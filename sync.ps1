$from = "moodle-atto_recitcircuit/src/*"
$to = "shared/recitfad/lib/editor/atto/plugins/circuit/"
$source = "./src";

try {
    . ("..\sync\watcher.ps1")
}
catch {
    Write-Host "Error while loading sync.ps1 script." 
}