const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../config.json');

try {
    if (!fs.existsSync(configPath)) {
        console.error("config.json not found!");
        process.exit(1);
    }

    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    const newConfig = {};

    function toHungarian(entry) {
        // 1. Reconstruct PascalCase from the "name" field
        // "Max Num Corpses" -> "MaxNumCorpses"
        if (!entry.name) {
            // Fallback: If no name, try to clean the existing key?
            // This shouldn't happen based on known schema, but safety first.
            console.warn("Entry missing name, skipping reconstruction:", entry);
            return null;
        }

        // Remove distinct characters that are not letters/numbers if necessary
        // Typically just removing spaces is enough for Title Case names
        const pascal = entry.name.replace(/[^a-zA-Z0-9]/g, '');

        // 2. Determine prefix
        let prefix = 's'; // Default string
        if (entry.type === 'boolean' || entry.type === 'checkbox' || typeof entry['default-value'] === 'boolean') {
            prefix = 'b';
        } else if (entry.type === 'number' || typeof entry['default-value'] === 'number') {
            if (Number.isInteger(entry['default-value'])) {
                 prefix = 'i';
            } else {
                 prefix = 'f';
            }
        }

        return prefix + pascal;
    }

    let fixedCount = 0;
    
    for (const sectionKey of Object.keys(config)) {
        newConfig[sectionKey] = {};
        for (const oldKey of Object.keys(config[sectionKey])) {
            const entry = config[sectionKey][oldKey];
            
            // Generate clean key from scratch using the Name field
            const newKey = toHungarian(entry);
            
            if (newKey) {
                newConfig[sectionKey][newKey] = entry;
                if (newKey !== oldKey) {
                    // console.log(`Fixed: ${oldKey} -> ${newKey}`);
                    fixedCount++;
                }
            } else {
                // Keep old key if we couldn't generate a new one
                newConfig[sectionKey][oldKey] = entry;
            }
        }
    }

    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 4));
    console.log(`Config keys repaired successfully. Fixed ${fixedCount} keys.`);

} catch (e) {
    console.error("Error repairing config keys:", e);
}
