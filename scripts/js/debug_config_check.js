const fs = require('fs');
try {
    const content = fs.readFileSync('config.json', 'utf8');
    const schema = JSON.parse(content);
    
    // Check keys
    const keys = Object.keys(schema).sort();
    console.log(`Total Keys: ${keys.length}`);
    if (keys.length > 0) {
        console.log(`First Key: "${keys[0]}"`);
        console.log(`Last Key: "${keys[keys.length-1]}"`);
    }

    // Check specific keys
    if (schema['Battle']) {
        console.log("Battle Section: Found");
        console.log("Battle Type:", typeof schema['Battle']);
        console.log("Battle Keys:", Object.keys(schema['Battle']).length);
    } else {
        console.error("Battle Section: MISSING");
    }

    if (schema['BattleAI']) {
        console.log("BattleId Section: Found");
    }

    // Check for nulls
    for (const key of keys) {
        if (!schema[key]) {
             console.error(`Key "${key}" is NULL or UNDEFINED`);
        }
    }

} catch (e) {
    console.error("Parse Error:", e);
}
