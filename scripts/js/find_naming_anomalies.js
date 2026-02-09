const fs = require('fs');
const config = require('../../config.json');

const anomalies = [];

function check(obj) {
    for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            if (obj[key].type) {
                const type = obj[key].type;
                const prefix = key.charAt(0);
                
                if (prefix === 'b' && type !== 'checkbox') {
                    anomalies.push({ key, type, expected: 'checkbox' });
                }
                if (prefix === 'f' && type !== 'number' && obj[key].inputType !== 'float') {
                     // floats are numbers, so type=number is fine, but usually we mark them
                }
                if (prefix === 'i' && type !== 'number') {
                    // anomalies.push({ key, type, expected: 'number' });
                    // i can be hex colors in some legacy? No we fixed those.
                }
                if (prefix === 's' && type !== 'text') {
                    anomalies.push({ key, type, expected: 'text' });
                }
                if (prefix === 'v' && type !== 'text') {
                    // vectors are text
                }
            } else {
                check(obj[key]);
            }
        }
    }
}

check(config);

console.log("Anomalies found:");
console.log(JSON.stringify(anomalies, null, 2));
