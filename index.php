<?php

declare(strict_types=1);

// ── Configuration ─────────────────────────────────────────────────────────────
const DEFAULT_VERSION  = '1.0.0';
const SKIP_FILES       = ['wse2-launcher.zip'];
const CACHE_DIR        = __DIR__ . '/.cache';
const MODULES_DIR      = __DIR__ . '/Modules';
const MODULES_URL_PATH = 'Modules/';
// Set to a specific origin (e.g. 'https://example.com') to restrict CORS,
// or keep '*' to allow any origin (suitable for a public mod distribution server).
const ALLOWED_ORIGIN   = '*';

// ── Headers ───────────────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
header('Cache-Control: no-store');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Read version and description from the module's companion JSON metadata file.
 * Returns an array with 'version' (string) and 'description' (string|null).
 */
function readMeta(string $moduleName): array
{
    $metaFile = MODULES_DIR . '/' . $moduleName . '.json';

    if (!is_readable($metaFile)) {
        return ['version' => DEFAULT_VERSION, 'description' => null];
    }

    $meta = json_decode(file_get_contents($metaFile), true);

    return [
        'version'     => (is_array($meta) && isset($meta['version']) && is_string($meta['version']))
            ? $meta['version']
            : DEFAULT_VERSION,
        'description' => (is_array($meta) && isset($meta['description']) && is_string($meta['description']))
            ? $meta['description']
            : null,
    ];
}

/**
 * Return the MD5 hash of a ZIP file, using a cached value when the file
 * has not been modified since the last calculation.
 */
function resolvemd5(string $zipPath): ?string
{
    if (!is_readable($zipPath)) {
        return null;
    }

    if (!is_dir(CACHE_DIR)) {
        mkdir(CACHE_DIR, 0750, true);
    }

    $cacheFile   = CACHE_DIR . '/' . basename($zipPath) . '.md5.json';
    $currentMtime = filemtime($zipPath);

    if (is_readable($cacheFile)) {
        $cached = json_decode(file_get_contents($cacheFile), true);
        if (
            is_array($cached)
            && isset($cached['mtime'], $cached['hash'])
            && (int) $cached['mtime'] === $currentMtime
        ) {
            return $cached['hash'];
        }
    }

    $hash = md5_file($zipPath);
    file_put_contents(
        $cacheFile,
        json_encode(['mtime' => $currentMtime, 'hash' => $hash]),
        LOCK_EX
    );

    return $hash ?: null;
}

/**
 * Read the pre-generated manifest for a module.
 * The manifest is created during release/deployment and stored next to the ZIP.
 */
function readManifest(string $moduleName): ?array
{
    $manifestFile = MODULES_DIR . '/' . $moduleName . '.manifest.json';

    if (!is_readable($manifestFile)) {
        return null;
    }

    $manifest = json_decode(file_get_contents($manifestFile), true);

    if (!is_array($manifest) || !isset($manifest['files'])) {
        return null;
    }

    return $manifest;
}

// ── Main ──────────────────────────────────────────────────────────────────────

$modules = [];

foreach (glob(MODULES_DIR . '/*.zip') ?: [] as $zipPath) {
    $filename   = basename($zipPath);
    $moduleName = pathinfo($filename, PATHINFO_FILENAME);

    if (in_array($filename, SKIP_FILES, true)) {
        continue;
    }

    $meta     = readMeta($moduleName);
    $filesize = filesize($zipPath);
    $manifest = readManifest($moduleName);

    $modules[] = [
        'name'        => $moduleName,
        'version'     => $meta['version'],
        'description' => $meta['description'],
        'url'         => MODULES_URL_PATH . rawurlencode($filename),
        'md5'         => resolvemd5($zipPath),
        'size'        => $filesize !== false ? $filesize : null,
        'manifest'    => $manifest,
    ];
}

echo json_encode($modules, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
