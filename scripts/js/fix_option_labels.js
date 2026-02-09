const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../config.json');
const config = require(configPath);

let changes = 0;

function toTitleCase(str) {
    if (!str) return str;
    return str.replace(/\w\S*/g, (txt) => {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}

function cleanLabel(label) {
    if (!label) return label;
    
    let newLabel = label;
    
    // Fix: Remove "Operations: ..." trailing text
    // Handles "fastest. Operations: ..." or just "Operations: ..."
    const opsIndex = newLabel.toLowerCase().indexOf('operations');
    if (opsIndex !== -1) {
        // Cut off before 'operations'
        // If there is a dot or space before it, trim that too.
        newLabel = newLabel.substring(0, opsIndex);
        // Trim trailing punctuation and spaces
        newLabel = newLabel.replace(/[\.\s]+$/, '');
    }

    // Fix casing
    if (newLabel === "off") newLabel = "Off";
    if (newLabel === "low") newLabel = "Low";
    if (newLabel === "medium") newLabel = "Medium";
    if (newLabel === "high") newLabel = "High";
    if (newLabel === "very high") newLabel = "Very High";
    if (newLabel === "ultra") newLabel = "Ultra";
    if (newLabel === "auto") newLabel = "Auto";
    if (newLabel === "default") newLabel = "Default";
    if (newLabel === "on") newLabel = "On";
    
    // Generic Title Casing if it's multiple words and completely lowercase
    if (newLabel === newLabel.toLowerCase() && newLabel.length > 3) {
        newLabel = toTitleCase(newLabel);
    }
    
    return newLabel;
}

function traverse(obj) {
    for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            if (obj[key].options && Array.isArray(obj[key].options)) {
                obj[key].options.forEach(opt => {
                    const original = opt.label;
                    const cleaned = cleanLabel(original);
                    if (original !== cleaned) {
                        console.log(`Updating [${key}] label: "${original}" -> "${cleaned}"`);
                        opt.label = cleaned;
                        changes++;
                    }
                });
            } else {
                traverse(obj[key]);
            }
        }
    }
}

traverse(config);

if (changes > 0) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    console.log(`\nUpdated ${changes} labels.`);
} else {
    console.log("No label changes needed.");
}
