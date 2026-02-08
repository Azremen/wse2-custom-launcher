const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../config.json');
const csvDir = path.join(__dirname, '../wse2-csv');

function parseCSVLine(line) {
    const result = [];
    let start = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
            inQuotes = !inQuotes;
        } else if (line[i] === ',' && !inQuotes) {
            result.push(line.substring(start, i).replace(/^"|"$/g, '').trim());
            start = i + 1;
        }
    }
    result.push(line.substring(start).replace(/^"|"$/g, '').trim());
    return result;
}

try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const csvKeys = new Set();
    const csvKeyMap = {}; // Maps stripped key to actual CSV key

    // Load all CSV keys
    const files = fs.readdirSync(csvDir);
    for (const file of files) {
        if (!file.endsWith('.csv')) continue;
        const content = fs.readFileSync(path.join(csvDir, file), 'utf8');
        const lines = content.split(/\r?\n/);
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cols = parseCSVLine(lines[i]);
            if (cols.length > 0) {
                const name = cols[0];
                csvKeys.add(name);
                
                // create fuzzy map (stripping first char if it looks like hungarian)
                if (name.length > 1) {
                    const stripped = name.substring(1);
                     if (!csvKeyMap[stripped]) csvKeyMap[stripped] = [];
                     csvKeyMap[stripped].push(name);
                }
            }
        }
    }

    console.log("Analysis of Key Mismatches:");
    console.log("--------------------------------");

    for (const section in config) {
        for (const key in config[section]) {
            if (!csvKeys.has(key)) {
                // Key in config is NOT in CSV exactly.
                // Check if it exists with a different prefix
                const stripped = key.substring(1);
                const candidates = csvKeyMap[stripped];

                if (candidates) {
                    console.log(`[Mismatch] Config: "${key}" | CSV has: "${candidates.join(', ')}".`);
                    // We might have changed 'u' to 'i' or similar.
                } else {
                     // Check if maybe we stripped 'sc' or something else?
                     // Or maybe the key is just totally different or new?
                     // console.log(`[Unknown] Config: "${key}" not found in CSVs.`);
                }
            }
        }
    }

} catch (e) {
    console.error("Error analyzing keys:", e);
}
