const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../config.json');
const csvDir = path.join(__dirname, '../wse2-csv');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Regexs for ranges
const rangeRegex = /range:\s*([0-9.]+)\s*-\s*([0-9.]+)/i;
const rangeRegexBare = /^([0-9.]+)-([0-9.]+)$/; // e.g. "1.5-2.5"
const rangeRegexText = /range from ([0-9]+) to ([0-9]+)/i; // "range from 1 to 16"

function parseCSVLine(line) {
    const result = [];
    let startValueIndex = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
            inQuotes = !inQuotes;
        } else if (line[i] === ',' && !inQuotes) {
            let val = line.substring(startValueIndex, i).trim();
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            result.push(val);
            startValueIndex = i + 1;
        }
    }
    let lastVal = line.substring(startValueIndex).trim();
    if (lastVal.startsWith('"') && lastVal.endsWith('"')) lastVal = lastVal.slice(1, -1);
    result.push(lastVal);
    return result;
}

const files = fs.readdirSync(csvDir).filter(f => f.endsWith('.csv'));
let changed = false;

files.forEach(file => {
   const content = fs.readFileSync(path.join(csvDir, file), 'utf8');
   const lines = content.split(/\r?\n/);
   
   // Headers usually: Name, Default Value, Warband Name, Description
   // Find indices
   const header = parseCSVLine(lines[0]);
   const nameIdx = 0; // Assumption
   const descIdx = header.findIndex(h => h.toLowerCase().includes('description'));
   
   if (descIdx === -1) return;

   for (let i = 1; i < lines.length; i++) {
       if (!lines[i].trim()) continue;
       const cols = parseCSVLine(lines[i]);
       const key = cols[nameIdx];
       let desc = cols[descIdx];
       
       if (!key || !desc) continue;

       // Find parsed key in config
       let found = false;
       for (const sectionKey in config) {
           if (config[sectionKey][key]) {
               found = true;
               const item = config[sectionKey][key];
               
               let min, max;
               const matchLabel = desc.match(rangeRegex);
               const matchBare = desc.trim().match(rangeRegexBare);
               const matchText = desc.match(rangeRegexText);

               if (matchLabel) {
                   min = parseFloat(matchLabel[1]);
                   max = parseFloat(matchLabel[2]);
               } else if (matchBare) {
                   min = parseFloat(matchBare[1]);
                   max = parseFloat(matchBare[2]);
               } else if (matchText) {
                   min = parseFloat(matchText[1]);
                   max = parseFloat(matchText[2]);
               }

               if (min !== undefined && max !== undefined) {
                    // Update Item
                    if (item.inputType !== 'range' || item.min !== min || item.max !== max) {
                        console.log(`[CSV] Syncing Range for ${key}: ${min} - ${max}`);
                        item.inputType = 'range';
                        item.min = min;
                        item.max = max;

                        // Step Logic
                        if (item.type === 'number') {
                             const defVal = item['default-value'];
                             const sDef = String(defVal);
                             const sMin = String(min);
                             const sMax = String(max);
                             
                             if (sDef.includes('.') || sMin.includes('.') || sMax.includes('.')) {
                                 const getPrecision = (n) => (String(n).split('.')[1] || '').length;
                                 const p = Math.max(getPrecision(defVal), getPrecision(min), getPrecision(max));
                                 if (p >= 2) item.step = 0.01;
                                 else if (p === 1) item.step = 0.1;
                                 else item.step = 0.01;
                             } else {
                                 item.step = 1;
                             }
                        }
                        changed = true;
                    }
               }
           }
       }
   }
});

if (changed) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    console.log("Updated config.json from CSVs.");
} else {
    console.log("Config matches CSV ranges.");
}
