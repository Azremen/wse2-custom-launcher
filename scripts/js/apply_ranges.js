const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

let changed = false;

// Supports: "Range: 0-100", "range: 0-2000", "1.5-2.5" (if strictly numbers)
// We want to be careful not to match dates or other things.
const rangeRegexWithLabel = /range:\s*([0-9.]+)\s*-\s*([0-9.]+)/i;
const rangeRegexBare = /^([0-9.]+)-([0-9.]+)$/; 

for (const sectionKey in config) {
    const section = config[sectionKey];
    for (const itemKey in section) {
        const item = section[itemKey];
        if (item.description) {
            let min, max;
            const matchLabel = item.description.match(rangeRegexWithLabel);
            const matchBare = item.description.trim().match(rangeRegexBare);

            if (matchLabel) {
                 min = parseFloat(matchLabel[1]);
                 max = parseFloat(matchLabel[2]);
            } else if (matchBare) {
                 min = parseFloat(matchBare[1]);
                 max = parseFloat(matchBare[2]);
            }

            if (min !== undefined && max !== undefined) {
                
                // Check if already correct
                if (item.inputType === 'range' && item.min === min && item.max === max) {
                    continue;
                }

                console.log(`Applying Range to ${itemKey}: ${min} - ${max}`);
                
                item.inputType = 'range';
                item.min = min;
                item.max = max;
                
                // Heuristic for step
                if (item.type === 'number') {
                     const defVal = item['default-value'];
                     // Convert to string to check for decimals
                     const sDef = String(defVal);
                     const sMin = String(min);
                     const sMax = String(max);
                     
                     if (sDef.includes('.') || sMin.includes('.') || sMax.includes('.')) {
                         // Decimals involved
                         const getPrecision = (n) => (String(n).split('.')[1] || '').length;
                         const p = Math.max(getPrecision(defVal), getPrecision(min), getPrecision(max));
                         if (p >= 2) item.step = 0.01;
                         else if (p === 1) item.step = 0.1;
                         else item.step = 0.01;
                     } else {
                         // Integer
                         item.step = 1;
                     }
                }
                changed = true;
            }
        }
    }
}

// Explicit overrides for user request
if (config.Battle && config.Battle.iBattleSizeMin) {
    config.Battle.iBattleSizeMin.min = 0;
    config.Battle.iBattleSizeMin.max = 30;
    // Don't force range slider for these, they are integer inputs for bounds? 
    // "others are min and max and limit minimum to 30 and maximum to 150"
    // Usually these are standard inputs, but let's keep them as number inputs with min/max attr
    // so the renderer enforces it.
    // Ensure inputType is NOT range if it was set by accident?
    // The previous prompt said "make a slider for range objects", these have descriptions?
    // iBattleSizeMin desc: "The minimum value ... depending on fBattleSize." -> No "Range:" keyword.
    // So my regex won't touch them.
    console.log("Enforced iBattleSizeMin limits: 0-30");
    changed = true;
}

if (config.Battle && config.Battle.iBattleSizeMax) {
    config.Battle.iBattleSizeMax.min = 150;
    config.Battle.iBattleSizeMax.max = 1000; 
    console.log("Enforced iBattleSizeMax limits: 150-1000");
    changed = true;
}

if (changed) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');
    console.log("Updated config.json with ranges.");
} else {
    console.log("No changes needed.");
}
