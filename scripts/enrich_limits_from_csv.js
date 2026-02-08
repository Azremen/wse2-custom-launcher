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
            result.push(line.substring(start, i).replace(/^"|"$/g, '').trim()); // Strip quotes
            start = i + 1;
        }
    }
    result.push(line.substring(start).replace(/^"|"$/g, '').trim());
    return result;
}

try {
    const rawConfig = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(rawConfig);
    let updates = 0;

    const files = fs.readdirSync(csvDir);

    for (const section in config) {
        const csvFileName = `WSE2 config options - ${section}.csv`;
        // Handle "Graphics (1).csv" vs "Graphics.csv" edge case if needed, but looks like exact matches mostly.
        // Actually, let's just look for one that starts with it if exact fails?
        // But list_dir showed "WSE2 config options - Battle.csv", so it matches section key "Battle".
        
        const csvPath = path.join(csvDir, csvFileName);
        
        if (!fs.existsSync(csvPath)) {
            console.log(`No CSV found for section: ${section}`);
            continue;
        }

        const csvContent = fs.readFileSync(csvPath, 'utf8');
        const lines = csvContent.split(/\r?\n/);
        
        // Map CSV rows by ID (Name column)
        // Also map by ID without first char (to handle f/i mismatched prefixes)
        const csvMap = {};
        const csvMapStripped = {};

        // Skip header (Name,Default Value,Warband Name,Description)
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cols = parseCSVLine(lines[i]);
            // Name is index 0, Description is index 3
            if (cols.length >= 4) {
                const name = cols[0];
                const desc = cols[3];
                const cleanDesc = desc.replace(/""/g, '"'); // Unescape double quotes if any
                
                csvMap[name] = cleanDesc;
                if (name.length > 1) {
                    csvMapStripped[name.substring(1)] = { name, desc: cleanDesc };
                }
            }
        }

        for (const key in config[section]) {
            let desc = csvMap[key];
            let rawName = key;

            // optimized matching
            if (!desc && key.length > 1) {
                const stripped = key.substring(1);
                if (csvMapStripped[stripped]) {
                    desc = csvMapStripped[stripped].desc;
                    rawName = csvMapStripped[stripped].name;
                }
            }

            if (desc) {
                // Parse Range
                // Formats: "Range: 0-2000", "Range: 55.0-100.0", "range: 0-100"
                const rangeMatch = desc.match(/range:\s*([0-9.]+)\s*-\s*([0-9.]+)/i);
                
                if (rangeMatch) {
                    const min = parseFloat(rangeMatch[1]);
                    const max = parseFloat(rangeMatch[2]);
                    
                    if (!isNaN(min) && !isNaN(max)) {
                        config[section][key].min = min;
                        config[section][key].max = max;
                        updates++;

                        // Infer Float type from range decimals or 'f' prefix match
                        const isFloat = rawName.startsWith('f') || 
                                        !Number.isInteger(min) || 
                                        !Number.isInteger(max);
                        
                        if (isFloat) {
                            config[section][key].inputType = 'float';
                            if (!config[section][key].step) {
                                config[section][key].step = 0.01;
                            }
                        }
                    }
                }

                // Parse "values: a, b, c" (e.g. ShadowMap texture size)
                const valuesMatch = desc.match(/values:\s*([\d,\s]+)/i);
                if (valuesMatch) {
                    const valStr = valuesMatch[1];
                    const valList = valStr.split(',').map(s => s.trim()).filter(s => s);
                    const options = valList.map(v => {
                        const num = parseInt(v);
                        return { value: isNaN(num) ? v : num, label: v };
                    });

                    if (options.length > 0) {
                        config[section][key].options = options;
                        config[section][key].inputType = options.length > 4 ? 'select' : 'radio';
                        updates++;
                    }
                }

                // Parse "0=Label, 1=Label" (e.g. Screenshot format)
                if (desc.includes('=')) {
                    // Primitive check for 0=A, 1=B pattern
                   const eqParts = desc.split(/,\s*/);
                   const eqOptions = [];
                   for (const part of eqParts) {
                       const m = part.match(/^(\d+)=(.+)$/);
                       if (m) {
                           eqOptions.push({ value: parseInt(m[1]), label: m[2] });
                       }
                   }
                   if (eqOptions.length >= 2) {
                       config[section][key].options = eqOptions;
                       config[section][key].inputType = eqOptions.length > 4 ? 'select' : 'radio';
                       updates++;
                   }
                }
            }
        }
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    console.log(`Enriched config.json with limits from CSVs. Updated entries: ${updates}`);

} catch (e) {
    console.error("Error processing CSV limits:", e);
}
