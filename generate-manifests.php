<?php

declare(strict_types=1);

$baseDir = __DIR__ . '/Modules';
$skipFiles = ['wse2-launcher.zip'];
$errors = [];

if (!class_exists('ZipArchive')) {
    fwrite(STDERR, "ZipArchive is required to generate manifests.\n");
    exit(1);
}

if (!is_dir($baseDir)) {
    fwrite(STDERR, "Modules directory not found: {$baseDir}\n");
    exit(1);
}

function normalizePath(string $path): string
{
    return ltrim(str_replace('\\', '/', $path), './');
}

function manifestFromZip(string $zipPath): ?array
{
    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) {
        return null;
    }

    $rootPrefix = null;
    $rootName = null;
    $allUnderRoot = true;

    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        $name = normalizePath($stat['name'] ?? '');

        if ($name === '' || str_ends_with($name, '/')) {
            continue;
        }

        $parts = explode('/', $name, 2);
        if (count($parts) < 2 || $parts[0] === '') {
            $allUnderRoot = false;
            break;
        }

        $candidatePrefix = $parts[0] . '/';
        if ($rootPrefix === null) {
            $rootPrefix = $candidatePrefix;
            $rootName = $parts[0];
        } elseif ($rootPrefix !== $candidatePrefix) {
            $allUnderRoot = false;
            break;
        }
    }

    if (!$allUnderRoot) {
        $rootPrefix = null;
        $rootName = null;
    }

    $files = [];
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $stat = $zip->statIndex($i);
        $name = normalizePath($stat['name'] ?? '');

        if ($name === '' || str_ends_with($name, '/')) {
            continue;
        }

        $relativePath = $name;
        if ($rootPrefix !== null && str_starts_with($relativePath, $rootPrefix)) {
            $relativePath = substr($relativePath, strlen($rootPrefix));
        }

        if ($relativePath === '') {
            continue;
        }

        $stream = $zip->getStream($stat['name']);
        if ($stream === false) {
            continue;
        }

        $hashCtxSha256 = hash_init('sha256');
        while (!feof($stream)) {
            $chunk = fread($stream, 8192);
            if ($chunk !== false && $chunk !== '') {
                hash_update($hashCtxSha256, $chunk);
            }
        }
        fclose($stream);

        $files[] = [
            'path' => $relativePath,
            'sha256' => hash_final($hashCtxSha256),
            'size' => isset($stat['size']) ? (int) $stat['size'] : null,
        ];
    }

    $zip->close();

    return [
        'root' => $rootName,
        'files' => $files,
    ];
}

function writeAtomicJson(string $targetPath, array $payload): bool
{
    $tempPath = $targetPath . '.tmp';
    $encoded = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        return false;
    }

    if (file_put_contents($tempPath, $encoded, LOCK_EX) === false) {
        return false;
    }

    return rename($tempPath, $targetPath);
}

$expectedManifests = [];

foreach (glob($baseDir . '/*.zip') ?: [] as $zipPath) {
    $filename = basename($zipPath);
    if (in_array($filename, $skipFiles, true)) {
        continue;
    }

    $moduleName = pathinfo($filename, PATHINFO_FILENAME);
    $manifest = manifestFromZip($zipPath);

    if ($manifest === null) {
        $errors[] = "{$filename}: could not read archive";
        continue;
    }

    $manifestPath = $baseDir . '/' . $moduleName . '.manifest.json';
    $expectedManifests[] = $manifestPath;

    if (!writeAtomicJson($manifestPath, $manifest)) {
        $errors[] = "{$filename}: failed to write manifest";
        continue;
    }

    fwrite(STDOUT, "Wrote {$manifestPath}\n");
}

foreach (glob($baseDir . '/*.manifest.json') ?: [] as $manifestPath) {
    if (in_array($manifestPath, $expectedManifests, true)) {
        continue;
    }

    if (!unlink($manifestPath)) {
        $errors[] = basename($manifestPath) . ': failed to remove stale manifest';
        continue;
    }

    fwrite(STDOUT, "Removed stale manifest {$manifestPath}\n");
}

if ($errors !== []) {
    foreach ($errors as $error) {
        fwrite(STDERR, "{$error}\n");
    }
    exit(1);
}
