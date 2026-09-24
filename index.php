<?php

declare(strict_types=1);

// Large ZIP hashing can exceed the default 30s limit; don't let it corrupt output mid-run.
set_time_limit(0);
// Keep warnings out of the JSON response body; they still reach the error log.
ini_set('display_errors', '0');

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
 * Return the MD5 and SHA256 hashes of a ZIP file, using cached values when the
 * file has not been modified since the last calculation. Both hashes are
 * computed from a single streamed read to avoid reading the file twice.
 */
function resolveHashes(string $zipPath): array
{
    $defaultHashes = ['md5' => null, 'sha256' => null];

    if (!is_readable($zipPath)) {
        return $defaultHashes;
    }

    if (!is_dir(CACHE_DIR)) {
        @mkdir(CACHE_DIR, 0755, true);
    }

    $cacheFile   = CACHE_DIR . '/' . basename($zipPath) . '.hashes.json';
    $currentMtime = filemtime($zipPath);

    if (is_readable($cacheFile)) {
        $cached = json_decode(file_get_contents($cacheFile), true);
        if (
            is_array($cached)
            && isset($cached['mtime'], $cached['md5'], $cached['sha256'])
            && (int) $cached['mtime'] === $currentMtime
        ) {
            return ['md5' => $cached['md5'], 'sha256' => $cached['sha256']];
        }
    }

    $ctxMd5 = hash_init('md5');
    $ctxSha = hash_init('sha256');
    $handle = @fopen($zipPath, 'rb');

    if (!$handle) {
        return $defaultHashes;
    }

    while (!feof($handle)) {
        $chunk = fread($handle, 1024 * 1024 * 8);
        hash_update($ctxMd5, $chunk);
        hash_update($ctxSha, $chunk);
    }
    fclose($handle);

    $result = [
        'md5'    => hash_final($ctxMd5),
        'sha256' => hash_final($ctxSha),
    ];

    @file_put_contents(
        $cacheFile,
        json_encode(['mtime' => $currentMtime, 'md5' => $result['md5'], 'sha256' => $result['sha256']]),
        LOCK_EX
    );

    return $result;
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
    $filesize = @filesize($zipPath);
    $manifest = readManifest($moduleName);
    $hashes   = resolveHashes($zipPath);

    $modules[] = [
        'name'        => $moduleName,
        'version'     => $meta['version'],
        'description' => $meta['description'],
        'url'         => MODULES_URL_PATH . rawurlencode($filename),
        // md5 kept only for older launcher builds; sha256 is authoritative.
        'md5'         => $hashes['md5'],
        'sha256'      => $hashes['sha256'],
        'size'        => $filesize !== false ? $filesize : null,
        'manifest'    => $manifest,
    ];
}

echo json_encode($modules, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
