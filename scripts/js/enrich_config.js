const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../config.json');

try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    let updates = 0;

    for (const section in config) {
        for (const key in config[section]) {
            const entry = config[section][key];
            
            // 1. Detect Float
            // Criteria: Prefix 'f' OR default value is float OR range is float
            const isFloatName = key.startsWith('f') && key[1] && key[1] === key[1].toUpperCase();
            const isFloatDef = typeof entry['default-value'] === 'number' && !Number.isInteger(entry['default-value']);
            const isFloatRange = (entry.min !== undefined && !Number.isInteger(entry.min)) || 
                                 (entry.max !== undefined && !Number.isInteger(entry.max));

            if (entry.type === 'number' && (isFloatName || isFloatDef || isFloatRange)) {
                entry.inputType = 'float';
                // Ensure step is set if missing
                if (!entry.step) {
                    entry.step = 0.01; // Reasonable default for floats
                }
                updates++;
            }

            // 2. Detect Enums (Radio / Select) from Description
            // Look for patterns like "0 - Label, 1 - Label"
            if (entry.description && typeof entry.description === 'string') {
                // Regex to find "number - text" segments.
                // Simple splitter: comma or newline
                // But descriptions might simple be "0 - A, 1 - B"
                
                // Heuristic: check if it contains at least "0 -" and "1 -"
                if (entry.description.match(/\b0\s*-\s*/) && entry.description.match(/\b1\s*-\s*/)) {
                    const options = [];
                    // Split by comma, but be careful of commas in text.
                    // Usually these lists are comma separated.
                    // "0 - none, 1 - on group, 2 - on friendlies"
                    
                    const parts = entry.description.split(/,\s*(?=\d+\s*-)/);
                    let validEnum = true;

                    for (const part of parts) {
                        const match = part.match(/(\d+)\s*-\s*(.+)/);
                        if (match) {
                            options.push({
                                value: parseInt(match[1]),
                                label: match[2].trim().replace(/\.$/, '') // remove trailing dot
                            });
                        } else {
                            // If we have some parts but one fails, maybe it's mixed text?
                            // For safety, if we found at least 2 options, we might keep them
                        }
                    }

                    if (options.length >= 2) {
                        entry.options = options;
                        
                        if (options.length <= 4) {
                            entry.inputType = 'radio';
                        } else {
                            entry.inputType = 'select';
                        }
                        updates++;
                    }
                }
            }
        }
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    console.log(`Enriched config.json with inputTypes and options. Updated entries: ${updates}`);

} catch (e) {
    console.error("Error enriching config:", e);
}
