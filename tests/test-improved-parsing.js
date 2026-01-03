const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Test the improved parsing logic for Game old.rxdata
 */

console.log('Testing improved parsing for Game old.rxdata...');

const data = fs.readFileSync('Game old.rxdata');

const marshalHeaders = [];
for (let i = 0; i < data.length - 1; i++) {
    if (data[i] === 4 && data[i + 1] === 8) {
        marshalHeaders.push(i);
    }
}

console.log(`Found ${marshalHeaders.length} Marshal headers`);

const parsedObjects = {};
const rawObjects = {};
let successfullyParsedCount = 0;
const failedObjects = [];

for (let i = 0; i < marshalHeaders.length; i++) {
    const start = marshalHeaders[i];
    const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
    const section = data.slice(start, end);

    try {
        const rawParsed = load(section);

        if (rawParsed !== null && rawParsed !== undefined) {
            rawObjects[i] = rawParsed;
            successfullyParsedCount++;

            if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)) {
                const symbols = Object.getOwnPropertySymbols(rawParsed);
                const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                if (rubyVars.length > 0) {
                    parsedObjects[i] = rawParsed; // Simplified for test
                    console.log(`Object ${i}: ${rubyVars.length} Ruby variables`);

                    // Check for important objects
                    const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                    if (nameSymbol) {
                        const nameValue = String.fromCharCode(...Array.from(rawParsed[nameSymbol]));
                        console.log(`Object ${i}: Player object with @name = "${nameValue}"`);
                    }

                    const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                    if (boxesSymbol && Array.isArray(rawParsed[boxesSymbol])) {
                        console.log(`Object ${i}: Boxes object with ${rawParsed[boxesSymbol].length} boxes`);
                    }
                } else {
                    parsedObjects[i] = rawParsed;
                    console.log(`Object ${i}: Regular object with ${Object.keys(rawParsed).length} properties`);
                }
            } else if (Array.isArray(rawParsed)) {
                parsedObjects[i] = rawParsed;
                console.log(`Object ${i}: Array with ${rawParsed.length} items`);
            } else {
                parsedObjects[i] = rawParsed;
                console.log(`Object ${i}: ${typeof rawParsed} value`);
            }
        } else {
            console.log(`Object ${i}: parsed as null/undefined`);
            failedObjects.push(i);
            rawObjects[i] = null;
        }
    } catch (parseError) {
        console.log(`Object ${i}: Parse failed: ${parseError.message}`);
        failedObjects.push(i);
        rawObjects[i] = null;
    }
}

console.log(`\nSummary:`);
console.log(`Successfully parsed ${successfullyParsedCount}/${marshalHeaders.length} objects`);
console.log(`Parsed objects: [${Object.keys(parsedObjects).join(', ')}]`);
console.log(`Failed objects: [${failedObjects.join(', ')}]`);
console.log(`All object indices: [${Object.keys(rawObjects).join(', ')}]`);

// Check if we now have the correct structure
const allIndices = Object.keys(rawObjects).map(k => parseInt(k)).sort((a, b) => a - b);
console.log(`\nObject indices in order: [${allIndices.join(', ')}]`);

if (allIndices.length === 17) {
    console.log('✅ Found all 17 objects (including failed ones)');
} else {
    console.log(`❌ Expected 17 objects, found ${allIndices.length}`);
}

// Check if boxes object is at index 16
if (parsedObjects[16]) {
    const obj16 = parsedObjects[16];
    const symbols = Object.getOwnPropertySymbols(obj16);
    const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
    if (boxesSymbol) {
        console.log('✅ Boxes object found at index 16');
    } else {
        console.log('❌ Boxes object not found at index 16');
    }
} else {
    console.log('❌ Object 16 not parsed successfully');
}