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
    const rawConfig = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(rawConfig);
    const csvKeyMap = {}; // Stripped Key -> Full CSV Key (e.g. "Values" -> "fValues")

    // Load CSV keys map
    const files = fs.readdirSync(csvDir);
    for (const file of files) {
        if (!file.endsWith('.csv')) continue;
        const subContent = fs.readFileSync(path.join(csvDir, file), 'utf8');
        const lines = subContent.split(/\r?\n/);
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cols = parseCSVLine(lines[i]);
            if (cols.length > 0) {
                const name = cols[0];
                if (name.length > 1) {
                    const stripped = name.substring(1);
                    // Store the LAST one found, assuming uniqueness or consistency
                    csvKeyMap[stripped] = name; 
                }
            }
        }
    }

    let updates = 0;

    for (const section in config) {
        const keys = Object.keys(config[section]);
        for (const key of keys) {
            // Check if key exists in CSV exactly? No, we want to check if mismatch exists
            // If current key is NOT in CSV map's values...
            
            const stripped = key.substring(1);
            const csvName = csvKeyMap[stripped];

            if (csvName && csvName !== key) {
                // Key mismatch!
                // We should rename the key in config to match csvName
                console.log(`Renaming ${key} -> ${csvName}`);
                
                const entry = config[section][key];
                delete config[section][key];
                
                // If the new name implies a float (fPrefix), update attributes?
                // The previous enrich scripts should have handled types/limits based on data content, 
                // but we should ensure 'inputType' aligns if we are renaming to 'f'.
                
                if (csvName.startsWith('f')) {
                     entry.inputType = 'float';
                     if (!entry.step) entry.step = 0.01;
                     
                     // Ensure default value is treated efficiently? 
                     // Usually it's fine, but let's make sure it's not a string "0" if it's a float
                }
                
                config[section][csvName] = entry;
                updates++;
            }
        }
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    console.log(`Reverted keys to CSV original names. Updated entries: ${updates}`);

} catch (e) {
    console.error("Error fixing keys:", e);
}
