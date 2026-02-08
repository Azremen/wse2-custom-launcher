const fs = require('fs');
const path = require('path');

const csvDir = path.join(__dirname, '../wse2-csv');
const configPath = path.join(__dirname, '../config.json');

const files = fs.readdirSync(csvDir).filter(f => f.endsWith('.csv'));

const newConfig = {};
const translations = {}; // Key -> English Text

// Helper to infer type and value
function parseValue(valStr) {
    if (!valStr) return { val: "", type: "text" };
    if (valStr.toUpperCase() === 'TRUE') return { val: true, type: 'checkbox' };
    if (valStr.toUpperCase() === 'FALSE') return { val: false, type: 'checkbox' };
    
    const num = Number(valStr);
    if (!isNaN(num)) return { val: num, type: 'number' };
    
    return { val: valStr, type: 'text' };
}

function toSnakeCase(str) {
    // Remove Hungarian notation prefixes (i, f, b, u, s, v) if followed by Uppercase
    let clean = str.replace(/^[ifbusv](?=[A-Z])/, '');
    // Insert underscores
    return clean.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

function toReadable(str) {
    // Remove prefix
    let clean = str.replace(/^[ifbusv](?=[A-Z])/, '');
    // Split camel case
    return clean.replace(/([A-Z])/g, ' $1').trim();
}

// Config Sections mapping based on filenames
// "WSE2 config options - Battle.csv" -> "Battle"
files.forEach(file => {
    // Extract Section Name
    // Remove "WSE2 config options - " and ".csv"
    let sectionName = file.replace('WSE2 config options - ', '').replace('.csv', '');
    // Handle "Graphics (1)" case if exists, usually it's just Graphics
    sectionName = sectionName.replace(/\s\(\d+\)/, '');
    sectionName = sectionName.trim();
    
    if (!newConfig[sectionName]) {
        newConfig[sectionName] = {};
    }

    const content = fs.readFileSync(path.join(csvDir, file), 'utf8');
    const lines = content.split(/\r?\n/);
    
    // Header: Name,Default Value,Warband Name,Description
    // Skip header
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // CSV parsing - Regex for CSV split including quotes
        const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        
        if (!matches || matches.length < 2) continue;
        
        // Clean quotes
        const clean = (s) => s ? s.replace(/^"|"$/g, '').trim() : '';
        
        const originalName = clean(matches[0]);
        if(!originalName) continue;

        const defaultValRaw = clean(matches[1]);
        const warbandName = clean(matches[2]);
        const desc = clean(matches[3]); // Description might be missing
        
        // Infer type
        const { val, type } = parseValue(defaultValRaw);
        
        // Transform Keys
        const key = toSnakeCase(originalName);
        const displayName = toReadable(originalName);
        
        // Add to config
        newConfig[sectionName][key] = {
            "name": displayName, 
            "type": type,
            "default-value": val
        };
        
        if (desc) {
            newConfig[sectionName][key]["description"] = desc;
        }
    }
});

// Write Config
fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 4));
console.log("Config.json generated from CSVs.");
