const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Find which index the boxes object is at in our corrected boundaries
 */

console.log('=== FINDING BOXES OBJECT INDEX ===\n');

const gameOld = fs.readFileSync('Game old.rxdata');

// Use the correct boundaries we found
const boundaries = [
    { start: 0, size: 40239 },
    { start: 40239, size: 7 },
    { start: 40246, size: 758 },
    { start: 41004, size: 649 },
    { start: 41653, size: 4 },
    { start: 41657, size: 446 },
    { start: 42103, size: 51395 },
    { start: 93498, size: 12173 },
    { start: 105671, size: 15925 },
    { start: 121596, size: 72168 },
    { start: 193764, size: 841 },
    { start: 194605, size: 5409 },
    { start: 200014, size: 109 },
    { start: 200123, size: 35000 },
    { start: 211613, size: 8210 }
];

console.log('Checking each object for boxes...\n');

for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const section = gameOld.slice(boundary.start, boundary.start + boundary.size);

    try {
        const parsed = load(section);

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const symbols = Object.getOwnPropertySymbols(parsed);
            const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');

            if (boxesSymbol && Array.isArray(parsed[boxesSymbol])) {
                console.log(`🎯 FOUND BOXES OBJECT AT INDEX ${i}!`);
                console.log(`  Boxes: ${parsed[boxesSymbol].length} boxes`);

                // Check for other box-related symbols
                const omuranBoxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@omuranBoxes)');
                const deshretBoxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@deshretBoxes)');

                if (omuranBoxesSymbol) {
                    console.log(`  OmuranBoxes: ${parsed[omuranBoxesSymbol].length} boxes`);
                }
                if (deshretBoxesSymbol) {
                    console.log(`  DeshretBoxes: ${parsed[deshretBoxesSymbol].length} boxes`);
                }

                console.log(`  Total symbols: ${symbols.length}`);
                break;
            }
        }
    } catch (error) {
        // Skip failed objects
    }
}

// Also check the remaining data after our 15 objects
console.log('\n=== CHECKING REMAINING DATA ===');

const lastBoundary = boundaries[boundaries.length - 1];
const endOfLastObject = lastBoundary.start + lastBoundary.size;
const remainingData = gameOld.slice(endOfLastObject);

console.log(`Remaining data after object 14: ${remainingData.length} bytes`);

if (remainingData.length > 0) {
    // Look for Marshal headers in remaining data
    const remainingHeaders = [];
    for (let i = 0; i < remainingData.length - 1; i++) {
        if (remainingData[i] === 4 && remainingData[i + 1] === 8) {
            remainingHeaders.push(endOfLastObject + i);
        }
    }

    console.log(`Headers in remaining data: [${remainingHeaders.join(', ')}]`);

    // Try to parse from the first remaining header
    if (remainingHeaders.length > 0) {
        const start = remainingHeaders[0];
        const section = gameOld.slice(start);

        try {
            const parsed = load(section);

            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const symbols = Object.getOwnPropertySymbols(parsed);
                const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');

                if (boxesSymbol && Array.isArray(parsed[boxesSymbol])) {
                    console.log(`🎯 FOUND BOXES OBJECT IN REMAINING DATA!`);
                    console.log(`  Position: ${start}`);
                    console.log(`  Boxes: ${parsed[boxesSymbol].length} boxes`);
                    console.log(`  This should be our object 15 (but we need it to be object 14)`);
                }
            }
        } catch (error) {
            console.log(`Failed to parse remaining data: ${error.message}`);
        }
    }
}

// Let's also check if we made an error in our boundary calculation
console.log('\n=== RECHECKING BOUNDARY 13 ===');

// Object 13 used alternative parsing with 35000 bytes starting at 200123
// But maybe the boxes object is actually at position 219823 (the last header we found)

const boxesStart = 219823;
const boxesSection = gameOld.slice(boxesStart);

try {
    const boxesParsed = load(boxesSection);

    if (boxesParsed && typeof boxesParsed === 'object' && !Array.isArray(boxesParsed)) {
        const symbols = Object.getOwnPropertySymbols(boxesParsed);
        const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');

        if (boxesSymbol && Array.isArray(boxesParsed[boxesSymbol])) {
            console.log(`🎯 CONFIRMED: Boxes object is at position ${boxesStart}`);
            console.log(`  Boxes: ${boxesParsed[boxesSymbol].length} boxes`);
            console.log(`  Size: ${gameOld.length - boxesStart} bytes`);

            // This means our object 13 boundary is wrong
            // Object 13 should end at 219823, and object 14 should start at 219823
            console.log(`\n💡 CORRECTION NEEDED:`);
            console.log(`  Object 13 should be: 200123 to 219823 (${219823 - 200123} bytes)`);
            console.log(`  Object 14 should be: 219823 to end (${gameOld.length - 219823} bytes)`);
        }
    }
} catch (error) {
    console.log(`Failed to parse from ${boxesStart}: ${error.message}`);
}