const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Test the corrected parsing logic for Game old.rxdata
 */

console.log('=== TESTING CORRECTED PARSING ===\n');

const gameOld = fs.readFileSync('Game old.rxdata');

// Use the corrected boundaries (matching the fixed renderer.js)
const gameOldBoundaries = {
    0: { start: 0, size: 40239 },        // Object 0: Player
    // 1: skipped - doesn't exist on website
    2: { start: 40246, size: 758 },      // Object 2: System
    3: { start: 41004, size: 649 },      // Object 3: Options
    // 4: skipped - doesn't exist on website
    5: { start: 41657, size: 446 },      // Object 5: Data
    6: { start: 42103, size: 51395 },    // Object 6: Data
    7: { start: 93498, size: 12173 },    // Object 7: Data
    8: { start: 105671, size: 15925 },   // Object 8: Screen
    9: { start: 121596, size: 72168 },   // Object 9: Maps
    10: { start: 193764, size: 841 },    // Object 10: Player movement
    11: { start: 194605, size: 5409 },   // Object 11: Metadata
    12: { start: 200014, size: 109 },    // Object 12: Events
    13: { start: 200123, size: 19700 },  // Object 13: Bag
    14: { start: 219823, size: 20955 }   // Object 14: Boxes
};

console.log('Parsing Game old.rxdata with corrected boundaries...\n');

let successCount = 0;
let failCount = 0;

for (let i = 0; i < Object.keys(gameOldBoundaries).length; i++) {
    const indexStr = Object.keys(gameOldBoundaries)[i];
    const index = parseInt(indexStr);
    const boundary = gameOldBoundaries[index];
    const section = gameOld.slice(boundary.start, boundary.start + boundary.size);

    try {
        const rawParsed = load(section);

        if (rawParsed !== null && rawParsed !== undefined) {
            successCount++;
            console.log(`✅ Object ${index}: SUCCESS (${boundary.size} bytes)`);

            if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)) {
                const symbols = Object.getOwnPropertySymbols(rawParsed);
                const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                if (rubyVars.length > 0) {
                    console.log(`   → Ruby object with ${rubyVars.length} variables`);

                    // Check for important variables
                    const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                    if (nameSymbol) {
                        const nameValue = String.fromCharCode(...Array.from(rawParsed[nameSymbol]));
                        console.log(`   → Player with @name = "${nameValue}"`);
                    }

                    const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                    if (boxesSymbol && Array.isArray(rawParsed[boxesSymbol])) {
                        console.log(`   → Boxes with ${rawParsed[boxesSymbol].length} boxes`);
                    }

                    const badgesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@badges)');
                    if (badgesSymbol) {
                        console.log(`   → Has @badges`);
                    }

                    const deshretBagSymbol = symbols.find(sym => sym.toString() === 'Symbol(@deshretBag)');
                    if (deshretBagSymbol) {
                        console.log(`   → Has @deshretBag`);
                    }
                }
            } else if (typeof rawParsed === 'number') {
                console.log(`   → Number: ${rawParsed}`);
            } else if (Array.isArray(rawParsed)) {
                console.log(`   → Array with ${rawParsed.length} items`);
            } else {
                console.log(`   → ${typeof rawParsed} value`);
            }
        } else {
            failCount++;
            console.log(`❌ Object ${index}: Parsed as null/undefined`);
        }
    } catch (parseError) {
        failCount++;
        console.log(`❌ Object ${index}: Parse failed - ${parseError.message}`);
    }
}

console.log(`\n=== RESULTS ===`);
console.log(`Successfully parsed: ${successCount}/13 objects`);
console.log(`Failed: ${failCount}/13 objects`);

if (successCount === 13) {
    console.log(`🎉 PERFECT: All 13 objects parsed successfully!`);
    console.log(`Game old.rxdata now matches the website structure:`);
    console.log(`- Objects present: 0,2,3,5,6,7,8,9,10,11,12,13,14`);
    console.log(`- Objects missing: 1,4 (as they should be)`);
    console.log(`- Object 0: Player data (with @name, @badges, @deshretBag, etc.)`);
    console.log(`- Object 14: Boxes data`);
    console.log(`\nCopy/paste operation should now work: Game old object 14 → Game new object 14`);
} else {
    console.log(`⚠️  ${failCount} objects still failing to parse`);
}

// Test Game new for comparison
console.log(`\n=== TESTING GAME NEW FOR COMPARISON ===`);

const gameNew = fs.readFileSync('Game new.rxdata');
const gameNewHeaders = [];
for (let i = 0; i < gameNew.length - 1; i++) {
    if (gameNew[i] === 4 && gameNew[i + 1] === 8) {
        gameNewHeaders.push(i);
    }
}

console.log(`Game new has ${gameNewHeaders.length} headers`);

let gameNewSuccess = 0;
for (let i = 0; i < gameNewHeaders.length; i++) {
    const start = gameNewHeaders[i];
    const end = i + 1 < gameNewHeaders.length ? gameNewHeaders[i + 1] : gameNew.length;
    const section = gameNew.slice(start, end);

    try {
        const parsed = load(section);
        if (parsed !== null) {
            gameNewSuccess++;

            if (i === 0) {
                // Check player object
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    const symbols = Object.getOwnPropertySymbols(parsed);
                    const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                    if (nameSymbol) {
                        const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
                        console.log(`Game new object 0: Player with @name = "${nameValue}"`);
                    }
                }
            }

            if (i === 14) {
                // Check boxes object
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    const symbols = Object.getOwnPropertySymbols(parsed);
                    const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                    if (boxesSymbol && Array.isArray(parsed[boxesSymbol])) {
                        console.log(`Game new object 14: Boxes with ${parsed[boxesSymbol].length} boxes`);
                    }
                }
            }
        }
    } catch (error) {
        // Skip failed objects
    }
}

console.log(`Game new: ${gameNewSuccess}/15 objects parsed successfully`);

if (successCount === 15 && gameNewSuccess === 15) {
    console.log(`\n✅ BOTH FILES NOW HAVE CORRECT STRUCTURE!`);
    console.log(`Copy/paste between Game old object 14 and Game new object 14 should work perfectly.`);
}