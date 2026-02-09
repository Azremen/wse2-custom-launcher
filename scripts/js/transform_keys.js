const fs = require('fs');

try {
    const raw = fs.readFileSync('./config.json', 'utf8');
    const config = JSON.parse(raw);
    const newConfig = {};

    function toHungarian(key, type, defVal) {
        // Snake to Pascal
        const pascal = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
        
        // Determine prefix
        let prefix = 's'; // Default string
        if (type === 'boolean' || type === 'checkbox') {
            prefix = 'b';
        } else if (type === 'number') {
            if (Number.isInteger(defVal)) {
                 prefix = 'i';
            } else {
                 prefix = 'f';
            }
        }
        
        return prefix + pascal;
    }

    for (const sectionKey of Object.keys(config)) {
        newConfig[sectionKey] = {};
        for (const key of Object.keys(config[sectionKey])) {
            const entry = config[sectionKey][key];
            const newKey = toHungarian(key, entry.type, entry['default-value']);
            newConfig[sectionKey][newKey] = entry;
            
            // Log update
            // console.log(`${key} -> ${newKey}`);
        }
    }

    fs.writeFileSync('./config.json', JSON.stringify(newConfig, null, 4));
    console.log("Config keys updated successfully.");

} catch (e) {
    console.error("Error transforming config:", e);
}
