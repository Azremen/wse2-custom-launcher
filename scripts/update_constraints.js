const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../config.json');
const csvDir = path.join(__dirname, '../wse2-csv');

// Regex for ranges: "Range: 0-100" or "Range: 0.0-1.0" or "0-2000"
const rangeRegex1 = /(?:Range|range):\s*([0-9.]+)\s*-\s*([0-9.]+)/;
// Sometimes it's just "0-2000" at start or end? The csv shows "range: 0-2000" explicitly often.

function parseCSVLine(line) {
    const chars = line.split('');
    const fields = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        if (char === '"') {
            if (inQuotes && chars[i + 1] === '"') {
                currentField += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            fields.push(currentField);
            currentField = '';
        } else {
            currentField += char;
        }
    }
    fields.push(currentField);
    return fields;
}

try {
    if (!fs.existsSync(configPath)) {
        console.error("config.json not found!");
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    let updateCount = 0;

    const files = fs.readdirSync(csvDir).filter(f => f.endsWith('.csv'));

    for (const file of files) {
        // console.log(`Processing ${file}...`);
        const content = fs.readFileSync(path.join(csvDir, file), 'utf8');
        const lines = content.split(/\r?\n/);
        
        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const cols = parseCSVLine(line);
            if (cols.length < 4) continue; // Name, Default, Warband, Desc
            
            const key = cols[0].trim();
            const desc = cols[3].trim();
            
            if (!key) continue;

            // Find key in config (recursive search or just match section provided by filename?)
            // The filename indicates section? "WSE2 config options - Battle.csv" -> "Battle"
            // Let's try to map filename to section, but we also have the key, which is unique-ish? 
            // Actually config.json is sectional.
            
            // Extract section from filename "WSE2 config options - Section.csv"
            let sectionName = file.replace('WSE2 config options - ', '').replace('.csv', '');
            
            // Fix inconsistencies if any?
            // "BattleAi" -> "BattleAI"? Let's check keys in config.
            // Or easier: search the key in the whole config object.
            
            let targetSection = null;
            let targetEntry = null;

            // 1. Try direct match via filename (if accurate)
            if (config[sectionName] && config[sectionName][key]) {
                targetSection = sectionName;
            } 
            // 2. Search all sections (fallback)
            else {
                for (const sec in config) {
                    if (config[sec][key]) {
                        targetSection = sec;
                        break;
                    }
                }
            }

            if (targetSection) {
                targetEntry = config[targetSection][key];
                
                // --- PARSE RANGE ---
                let match = desc.match(rangeRegex1);
                if (match) {
                    const min = parseFloat(match[1]);
                    const max = parseFloat(match[2]);
                    
                    if (!isNaN(min) && !isNaN(max)) {
                        targetEntry.min = min;
                        targetEntry.max = max;
                        updateCount++;
                        // console.log(`Updated ${key}: [${min}, ${max}]`);
                    }
                }
                
                // --- PARSE ENUMS? (Optional, implies select box) ---
                // "0 - a, 1 - b"
                // This is complex to parse robustly from free text, but let's check basic integer options
                if (desc.includes("0 - ") && desc.includes("1 - ")) {
                    // It's likely an enum.
                    // Let's extract them?
                    // For now, let's just mark it as "select" maybe?
                    // User only asked for range limits specifically (FOV).
                } 
            }
        }
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    console.log(`Updated range limits for ${updateCount} entries in config.json.`);

} catch (e) {
    console.error("Error reading/writing files:", e);
}
