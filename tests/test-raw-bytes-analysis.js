const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Analyze raw bytes of failed objects to understand the parsing issue
 */

console.log('=== RAW BYTES ANALYSIS ===\n');

function analyzeFailedObject(filename, objectIndex) {
    console.log(`Analyzing ${filename} object ${objectIndex}...`);

    const data = fs.readFileSync(filename);

    // Find Marshal headers
    const marshalHeaders = [];
    for (let i = 0; i < data.length - 1; i++) {
        if (data[i] === 4 && data[i + 1] === 8) {
            marshalHeaders.push(i);
        }
    }

    if (objectIndex >= marshalHeaders.length) {
        console.log(`Object ${objectIndex} not found`);
        return;
    }

    const start = marshalHeaders[objectIndex];
    const end = objectIndex + 1 < marshalHeaders.length ? marshalHeaders[objectIndex + 1] : data.length;
    const section = data.slice(start, end);

    console.log(`Object ${objectIndex}: ${section.length} bytes (${start}-${end})`);
    console.log(`First 50 bytes: [${Array.from(section.slice(0, 50)).join(', ')}]`);

    // Try different parsing strategies
    console.log('\n--- Parsing Strategies ---');

    // Strategy 1: Normal parsing
    try {
        const parsed = load(section);
        console.log('Strategy 1 (normal): SUCCESS');

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const symbols = Object.getOwnPropertySymbols(parsed);
            const rubyVars = symbols.filter(sym => sym.toString().includes('@'));
            console.log(`  Ruby object with ${rubyVars.length} variables`);

            const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
            if (nameSymbol) {
                const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
                console.log(`  @name = "${nameValue}"`);
            }
        }
    } catch (error) {
        console.log(`Strategy 1 (normal): FAILED - ${error.message}`);
    }

    // Strategy 2: Try parsing smaller chunks
    console.log('\n--- Chunk Analysis ---');
    const chunkSizes = [1000, 2000, 5000, 10000, 15000, 20000, 25000, 30000];

    for (const chunkSize of chunkSizes) {
        if (chunkSize >= section.length) continue;

        try {
            const chunk = section.slice(0, chunkSize);
            const parsed = load(chunk);
            console.log(`Chunk ${chunkSize}: SUCCESS`);

            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const symbols = Object.getOwnPropertySymbols(parsed);
                const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                if (nameSymbol) {
                    const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
                    console.log(`  Found @name = "${nameValue}" in ${chunkSize} byte chunk!`);

                    // This might be the correct size for this object
                    return { success: true, correctSize: chunkSize, parsed: parsed };
                }
            }
        } catch (error) {
            // Continue trying other chunk sizes
        }
    }

    // Strategy 3: Look for embedded Marshal headers
    console.log('\n--- Embedded Headers ---');
    const embeddedHeaders = [];
    for (let i = 2; i < section.length - 1; i++) {
        if (section[i] === 4 && section[i + 1] === 8) {
            embeddedHeaders.push(i);
        }
    }

    if (embeddedHeaders.length > 0) {
        console.log(`Found ${embeddedHeaders.length} embedded headers at: [${embeddedHeaders.join(', ')}]`);

        // Try parsing from each embedded header
        for (const headerPos of embeddedHeaders) {
            try {
                const embeddedSection = section.slice(headerPos);
                const parsed = load(embeddedSection);
                console.log(`Embedded header at ${headerPos}: SUCCESS`);

                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    const symbols = Object.getOwnPropertySymbols(parsed);
                    const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                    if (nameSymbol) {
                        const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
                        console.log(`  Found @name = "${nameValue}" at embedded header ${headerPos}!`);
                        return { success: true, embeddedAt: headerPos, parsed: parsed };
                    }
                }
            } catch (error) {
                // Continue trying other embedded headers
            }
        }
    } else {
        console.log('No embedded headers found');
    }

    return { success: false };
}

// Analyze Game old object 0 (failed player object)
console.log('=== ANALYZING GAME OLD OBJECT 0 ===');
const result0 = analyzeFailedObject('Game old.rxdata', 0);

if (result0.success) {
    console.log('\n🎯 FOUND SOLUTION FOR OBJECT 0!');
    if (result0.correctSize) {
        console.log(`Correct size: ${result0.correctSize} bytes`);
    }
    if (result0.embeddedAt) {
        console.log(`Embedded at position: ${result0.embeddedAt}`);
    }
} else {
    console.log('\n❌ Could not fix object 0');
}

// Analyze Game old object 14 (other failed object)
console.log('\n\n=== ANALYZING GAME OLD OBJECT 14 ===');
const result14 = analyzeFailedObject('Game old.rxdata', 14);

if (result14.success) {
    console.log('\n🎯 FOUND SOLUTION FOR OBJECT 14!');
    if (result14.correctSize) {
        console.log(`Correct size: ${result14.correctSize} bytes`);
    }
    if (result14.embeddedAt) {
        console.log(`Embedded at position: ${result14.embeddedAt}`);
    }
} else {
    console.log('\n❌ Could not fix object 14');
}

// Compare with Game new object 0 for reference
console.log('\n\n=== REFERENCE: GAME NEW OBJECT 0 ===');
const gameNewData = fs.readFileSync('Game new.rxdata');
const gameNewHeaders = [];
for (let i = 0; i < gameNewData.length - 1; i++) {
    if (gameNewData[i] === 4 && gameNewData[i + 1] === 8) {
        gameNewHeaders.push(i);
    }
}

const gameNewObj0 = gameNewData.slice(gameNewHeaders[0], gameNewHeaders[1]);
console.log(`Game new object 0: ${gameNewObj0.length} bytes`);
console.log(`First 50 bytes: [${Array.from(gameNewObj0.slice(0, 50)).join(', ')}]`);

try {
    const parsed = load(gameNewObj0);
    const symbols = Object.getOwnPropertySymbols(parsed);
    const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
    if (nameSymbol) {
        const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
        console.log(`Game new @name = "${nameValue}"`);
    }
} catch (error) {
    console.log(`Game new object 0 parse failed: ${error.message}`);
}