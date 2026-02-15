<?php
header('Content-Type: application/json');

// Directory containing ZIP modules
$modulesDir = '.'; // Same folder
$modules = [];

// Scan for .zip files in current directory
foreach (glob("*.zip") as $filename) {
    if ($filename === 'wse2-launcher.zip') continue; // Skip launcher itself if present

    $moduleName = pathinfo($filename, PATHINFO_FILENAME);
    
    // Optional: Extract version from filename or manifest if available
    // Better approach: Read a companion .json file for metadata
    
    $version = '1.0.0'; // Default
    $versionFile = $moduleName . '.json'; // e.g., Native.json
    if (file_exists($versionFile)) {
        $meta = json_decode(file_get_contents($versionFile), true);
        if ($meta && isset($meta['version'])) {
            $version = $meta['version'];
        }
    }

    // Calculate MD5 hash of the ZIP file for integrity check
    // Optimization: Cache MD5 to avoid recalculating on every request
    $md5File = $filename . '.md5';
    $currentMtime = filemtime($filename);
    
    $md5 = null;
    $shouldUpdate = true;
    
    if (file_exists($md5File)) {
        $cachedData = json_decode(file_get_contents($md5File), true);
        if ($cachedData && isset($cachedData['mtime']) && $cachedData['mtime'] === $currentMtime) {
            $md5 = $cachedData['hash'];
            $shouldUpdate = false;
        }
    }
    
    if ($shouldUpdate) {
        $md5 = md5_file($filename);
        file_put_contents($md5File, json_encode(['mtime' => $currentMtime, 'hash' => $md5]));
    }

    $modules[] = [
        'name' => $moduleName,
        'version' => $version,
        'url' => $filename,
        'md5' => $md5, // Send hash to client - CRITICAL for integrity check
        'size' => filesize($filename)
    ];
}

echo json_encode($modules, JSON_PRETTY_PRINT);
?>