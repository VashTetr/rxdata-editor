const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Find the correct object boundaries for Game old.rxdata to match the website
 * The website shows 15 objects (0-14), but we're finding 17 headers
 */

console.log('=== FINDING CORRECT OBJECT BOUNDARIES ===\n');

const gameOld = fs.readFileSync('Game old.rxdata');

// Find all potential Marshal headers
const allHeaders = [];
for (let i = 0; i < gameOld.length - 1; i++) {
    if (gameOld[i] === 4 && gameOld[i + 1] === 8) {
        allHeaders.push(i);
    }
}

console.log(`Found ${allHeaders.length} potential headers: [${allHeaders.join(', ')}]`);

// We know from our tests that:
// - Object 0 should be parsed with ~50000 bytes (player object)
// - The website shows 15 objects total
// - Object 14 should be the boxes object (not 16)

// Let's try to reconstruct the correct boundaries
console.log('\n=== RECONSTRUCTING CORRECT BOUNDARIES ===');

// Start with object 0 at position 0, size ~50000
const correctBoundaries = [];

// Object 0: Player object (we know this works with 50000 bytes)
correctBoundaries.push({ start: 0, size: 50000, index: 0 });

// Now we need to find where the next 14 objects are
// The website shows objects 0-14, so we need to find 14 more objects after object 0

let currentPos = 50000;
let objectIndex = 1;

console.log(`Starting search for remaining objects from position ${currentPos}`);

// Look for the next Marshal headers after position 50000
const remainingHeaders = allHeaders.filter(pos => pos >= currentPos);
console.log(`Remaining headers after position ${currentPos}: [${remainingHeaders.join(', ')}]`);

// Try to parse objects using the remaining headers
for (let i = 0; i < remainingHeaders.length && objectIndex <= 14; i++) {
    const start = remainingHeaders[i];
    const end = i + 1 < remainingHeaders.length ? remainingHeaders[i + 1] : gameOld.length;
    const section = gameOld.slice(start, end);

    try {
        const parsed = load(section);

        if (parsed !== null && parsed !== undefined) {
            correctBoundaries.push({ start: start, size: section.length, index: objectIndex });
            console.log(`Object ${objectIndex}: ${start}-${end} (${section.length} bytes) - SUCCESS`);

            // Check what type of object this is
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const symbols = Object.getOwnPropertySymbols(parsed);
                const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                if (rubyVars.length > 0) {
                    const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                    if (boxesSymbol && Array.isArray(parsed[boxesSymbol])) {
                        console.log(`  → This is the BOXES object with ${parsed[boxesSymbol].length} boxes`);
                    }

                    const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                    if (nameSymbol) {
                        const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
                        console.log(`  → This has @name = "${nameValue}"`);
                    }
                }
            } else if (typeof parsed === 'number') {
                console.log(`  → This is a number: ${parsed}`);
            } else if (Array.isArray(parsed)) {
                console.log(`  → This is an array with ${parsed.length} items`);
            }

            objectIndex++;
        } else {
            console.log(`Object at ${start}: Parsed as null/undefined - SKIP`);
        }
    } catch (error) {
        console.log(`Object at ${start}: Parse failed - ${error.message}`);

        // Try alternative parsing for this position
        if (error.message.includes('marshal data too short')) {
            console.log(`  Trying alternative parsing...`);

            const testSizes = [40000, 45000, 50000, 60000];
            let found = false;

            for (const size of testSizes) {
                if (start + size > gameOld.length) continue;

                try {
                    const testSection = gameOld.slice(start, start + size);
                    const testParsed = load(testSection);

                    if (testParsed && typeof testParsed === 'object' && !Array.isArray(testParsed)) {
                        const symbols = Object.getOwnPropertySymbols(testParsed);
                        const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                        if (rubyVars.length >= 3) {
                            correctBoundaries.push({ start: start, size: size, index: objectIndex });
                            console.log(`Object ${objectIndex}: ${start}-${start + size} (${size} bytes) - SUCCESS (alternative)`);
                            objectIndex++;
                            found = true;
                            break;
                        }
                    }
                } catch (altError) {
                    // Continue trying
                }
            }

            if (!found) {
                console.log(`  Alternative parsing also failed`);
            }
        }
    }
}

console.log(`\n=== FINAL BOUNDARY ANALYSIS ===`);
console.log(`Found ${correctBoundaries.length} objects:`);

correctBoundaries.forEach(boundary => {
    console.log(`Object ${boundary.index}: ${boundary.start} + ${boundary.size} bytes`);
});

if (correctBoundaries.length === 15) {
    console.log(`✅ SUCCESS: Found exactly 15 objects to match the website!`);

    // Find the boxes object
    const boxesObject = correctBoundaries.find(boundary => {
        const start = boundary.start;
        const size = boundary.size;
        const section = gameOld.slice(start, start + size);

        try {
            const parsed = load(section);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const symbols = Object.getOwnPropertySymbols(parsed);
                const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                return boxesSymbol && Array.isArray(parsed[boxesSymbol]);
            }
        } catch (error) {
            return false;
        }
        return false;
    });

    if (boxesObject) {
        console.log(`✅ Boxes object found at index ${boxesObject.index} (should be 14)`);
        if (boxesObject.index === 14) {
            console.log(`🎯 PERFECT: Boxes object is at the correct index 14!`);
        } else {
            console.log(`⚠️  Boxes object is at index ${boxesObject.index}, not 14`);
        }
    }

} else {
    console.log(`❌ FAILED: Found ${correctBoundaries.length} objects, expected 15`);
}

// Export the correct boundaries for use in the app
console.log(`\n=== CORRECT BOUNDARIES FOR IMPLEMENTATION ===`);
console.log(`const gameOldCorrectBoundaries = [`);
correctBoundaries.forEach((boundary, i) => {
    const comma = i < correctBoundaries.length - 1 ? ',' : '';
    console.log(`  { start: ${boundary.start}, size: ${boundary.size} }${comma}`);
});
console.log(`];`);