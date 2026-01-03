const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Try to split the large Game old object 0 into multiple objects
 */

console.log('=== SPLIT LARGE OBJECT TEST ===\n');

function findAllMarshalHeaders(data) {
    const headers = [];
    for (let i = 0; i < data.length - 1; i++) {
        if (data[i] === 4 && data[i + 1] === 8) {
            headers.push(i);
        }
    }
    return headers;
}

function tryParseFromPosition(data, startPos, maxLength = null) {
    try {
        const section = maxLength ? data.slice(startPos, startPos + maxLength) : data.slice(startPos);
        const parsed = load(section);
        return { success: true, parsed: parsed, actualLength: null };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Load Game old
const gameOld = fs.readFileSync('Game old.rxdata');
const headers = findAllMarshalHeaders(gameOld);

console.log(`Game old has ${headers.length} Marshal headers`);
console.log(`Headers at positions: [${headers.slice(0, 10).join(', ')}${headers.length > 10 ? '...' : ''}]`);

// Focus on the problematic object 0
const obj0Start = headers[0];
const obj0End = headers[1];
const obj0Data = gameOld.slice(obj0Start, obj0End);

console.log(`\nObject 0: ${obj0Data.length} bytes (${obj0Start}-${obj0End})`);

// Look for internal Marshal headers within object 0
console.log('\n--- Looking for internal structure ---');
const internalHeaders = [];
for (let i = 2; i < obj0Data.length - 1; i++) {
    if (obj0Data[i] === 4 && obj0Data[i + 1] === 8) {
        internalHeaders.push(i);
    }
}

console.log(`Found ${internalHeaders.length} internal headers: [${internalHeaders.slice(0, 10).join(', ')}${internalHeaders.length > 10 ? '...' : ''}]`);

// Try parsing the first part (should be the player object)
console.log('\n--- Trying to parse player object ---');

if (internalHeaders.length > 0) {
    // Try parsing from start to first internal header
    const firstPartLength = internalHeaders[0];
    console.log(`Trying first ${firstPartLength} bytes...`);

    const result = tryParseFromPosition(obj0Data, 0, firstPartLength);
    if (result.success) {
        console.log('✅ Successfully parsed first part!');

        const parsed = result.parsed;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const symbols = Object.getOwnPropertySymbols(parsed);
            const rubyVars = symbols.filter(sym => sym.toString().includes('@'));
            console.log(`  Ruby object with ${rubyVars.length} variables`);

            const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
            if (nameSymbol) {
                const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
                console.log(`  🎯 Found @name = "${nameValue}"`);
                console.log(`  This is the player object!`);
            }
        }
    } else {
        console.log(`❌ Failed: ${result.error}`);
    }
} else {
    // Try different chunk sizes
    console.log('No internal headers found, trying different chunk sizes...');

    const chunkSizes = [14729, 15000, 16000, 18000, 20000]; // Start with Game new object 0 size

    for (const chunkSize of chunkSizes) {
        if (chunkSize >= obj0Data.length) continue;

        console.log(`Trying ${chunkSize} bytes...`);
        const result = tryParseFromPosition(obj0Data, 0, chunkSize);

        if (result.success) {
            console.log(`✅ Successfully parsed ${chunkSize} bytes!`);

            const parsed = result.parsed;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const symbols = Object.getOwnPropertySymbols(parsed);
                const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                if (nameSymbol) {
                    const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
                    console.log(`  🎯 Found @name = "${nameValue}" with ${chunkSize} bytes`);

                    // This might be the correct size
                    console.log(`  Potential solution: Parse object 0 with ${chunkSize} bytes instead of ${obj0Data.length}`);
                    break;
                }
            }
        } else {
            console.log(`❌ Failed: ${result.error}`);
        }
    }
}

// Try a different approach: use the Ruby Marshal dump to determine actual object size
console.log('\n--- Trying reverse engineering approach ---');

// Load Game new object 0 as reference
const gameNew = fs.readFileSync('Game new.rxdata');
const gameNewHeaders = findAllMarshalHeaders(gameNew);
const gameNewObj0 = gameNew.slice(gameNewHeaders[0], gameNewHeaders[1]);

console.log(`Game new object 0: ${gameNewObj0.length} bytes`);

try {
    const gameNewParsed = load(gameNewObj0);
    console.log('Game new object 0 parsed successfully');

    // Try to serialize it back to see the expected size
    const { dump } = require('@hyrious/marshal');
    const serialized = dump(gameNewParsed);
    console.log(`Game new object 0 re-serialized: ${serialized.length} bytes`);

    // Now try parsing Game old object 0 with this size
    console.log(`\nTrying Game old object 0 with ${serialized.length} bytes...`);
    const result = tryParseFromPosition(obj0Data, 0, serialized.length);

    if (result.success) {
        console.log('✅ SUCCESS with re-serialized size!');

        const parsed = result.parsed;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const symbols = Object.getOwnPropertySymbols(parsed);
            const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
            if (nameSymbol) {
                const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
                console.log(`  🎯 Found @name = "${nameValue}"`);
                console.log(`  SOLUTION: Parse Game old object 0 with ${serialized.length} bytes`);
            }
        }
    } else {
        console.log(`❌ Failed: ${result.error}`);
    }

} catch (error) {
    console.log(`Game new reference failed: ${error.message}`);
}

// Final attempt: Binary search for the correct size
console.log('\n--- Binary search for correct size ---');

let minSize = 10000;
let maxSize = Math.min(obj0Data.length, 25000);
let bestSize = null;

while (minSize <= maxSize) {
    const midSize = Math.floor((minSize + maxSize) / 2);
    const result = tryParseFromPosition(obj0Data, 0, midSize);

    if (result.success) {
        const parsed = result.parsed;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const symbols = Object.getOwnPropertySymbols(parsed);
            const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
            if (nameSymbol) {
                bestSize = midSize;
                const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
                console.log(`✅ Size ${midSize}: Found @name = "${nameValue}"`);
                minSize = midSize + 1; // Try to find a larger valid size
            } else {
                maxSize = midSize - 1;
            }
        } else {
            maxSize = midSize - 1;
        }
    } else {
        maxSize = midSize - 1;
    }
}

if (bestSize) {
    console.log(`\n🎯 BEST SOLUTION: Parse Game old object 0 with ${bestSize} bytes`);
} else {
    console.log('\n❌ No valid size found');
}