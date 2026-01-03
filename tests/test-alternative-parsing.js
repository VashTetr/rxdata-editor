const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Test alternative parsing strategies for Game old.rxdata object 0
 */

console.log('=== ALTERNATIVE PARSING STRATEGIES ===\n');

const gameOld = fs.readFileSync('Game old.rxdata');

// Find all Marshal headers
const headers = [];
for (let i = 0; i < gameOld.length - 1; i++) {
    if (gameOld[i] === 4 && gameOld[i + 1] === 8) {
        headers.push(i);
    }
}

console.log(`Found ${headers.length} headers: [${headers.slice(0, 10).join(', ')}${headers.length > 10 ? '...' : ''}]`);

// Focus on object 0 (the problematic one)
const obj0Start = headers[0];
const obj0End = headers[1];
const obj0Section = gameOld.slice(obj0Start, obj0End);

console.log(`\nObject 0: ${obj0Section.length} bytes (${obj0Start}-${obj0End})`);
console.log(`First 20 bytes: [${Array.from(obj0Section.slice(0, 20)).join(', ')}]`);

// Strategy 1: Try parsing the entire remaining file from position 0
console.log('\n--- Strategy 1: Parse entire remaining file ---');
try {
    const entireRemainingData = gameOld.slice(obj0Start);
    const parsed = load(entireRemainingData);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const symbols = Object.getOwnPropertySymbols(parsed);
        const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
        if (nameSymbol) {
            const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
            console.log(`✅ SUCCESS: Found player with @name = "${nameValue}"`);
            console.log(`This suggests object 0 extends beyond the next header`);
        } else {
            console.log(`✅ Parsed successfully but no @name found`);
        }
    }
} catch (error) {
    console.log(`❌ Failed: ${error.message}`);
}

// Strategy 2: Try different end positions
console.log('\n--- Strategy 2: Try different end positions ---');
const testEndPositions = [
    obj0End + 1000,
    obj0End + 2000,
    obj0End + 5000,
    obj0End + 10000,
    obj0End + 15000,
    obj0End + 20000,
    obj0End + 25000,
    obj0End + 30000,
    headers[2], // End at header 2
    headers[3], // End at header 3
    headers[4], // End at header 4
];

for (const endPos of testEndPositions) {
    if (endPos >= gameOld.length) continue;

    try {
        const testSection = gameOld.slice(obj0Start, endPos);
        const parsed = load(testSection);

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const symbols = Object.getOwnPropertySymbols(parsed);
            const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
            if (nameSymbol) {
                const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
                console.log(`✅ SUCCESS with end position ${endPos}: @name = "${nameValue}"`);
                console.log(`   Section size: ${testSection.length} bytes`);

                // This might be the correct size for object 0
                break;
            }
        }
    } catch (error) {
        // Continue trying other positions
    }
}

// Strategy 3: Look for the actual end of object 0 by trying to parse incrementally
console.log('\n--- Strategy 3: Find actual object boundary ---');
let foundValidSize = null;

// Start from a reasonable minimum size and increment
for (let size = 10000; size <= Math.min(gameOld.length - obj0Start, 50000); size += 1000) {
    try {
        const testSection = gameOld.slice(obj0Start, obj0Start + size);
        const parsed = load(testSection);

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const symbols = Object.getOwnPropertySymbols(parsed);
            const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
            if (nameSymbol) {
                const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
                console.log(`✅ Found valid size ${size}: @name = "${nameValue}"`);
                foundValidSize = size;
                // Continue to find the largest valid size
            }
        }
    } catch (error) {
        // If we had a valid size and now it fails, the previous size was probably correct
        if (foundValidSize) {
            console.log(`🎯 Optimal size appears to be: ${foundValidSize} bytes`);
            break;
        }
    }
}

if (foundValidSize) {
    console.log(`\n=== SOLUTION FOUND ===`);
    console.log(`Game old.rxdata object 0 should be parsed with ${foundValidSize} bytes instead of ${obj0Section.length} bytes`);
    console.log(`This means the Marshal header detection is finding the wrong boundary`);

    // Test the solution
    const correctSection = gameOld.slice(obj0Start, obj0Start + foundValidSize);
    const finalParsed = load(correctSection);
    const symbols = Object.getOwnPropertySymbols(finalParsed);
    const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

    console.log(`Final test: ${rubyVars.length} Ruby variables found`);

    // Check for key variables that should be in the player object
    const keyVars = ['@name', '@badges', '@deshretBag', '@party'];
    const foundVars = keyVars.filter(varName => {
        return symbols.some(sym => sym.toString() === `Symbol(${varName})`);
    });

    console.log(`Key player variables found: [${foundVars.join(', ')}]`);

    if (foundVars.length >= 2) {
        console.log(`✅ This looks like the correct player object!`);
    }
} else {
    console.log(`\n❌ No valid size found for object 0`);
}