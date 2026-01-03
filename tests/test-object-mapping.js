const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Test the object mapping logic for Game old.rxdata
 */

console.log('=== OBJECT MAPPING TEST ===\n');

// Test the object mapping logic
const data = fs.readFileSync('Game old.rxdata');

const marshalHeaders = [];
for (let i = 0; i < data.length - 1; i++) {
    if (data[i] === 4 && data[i + 1] === 8) {
        marshalHeaders.push(i);
    }
}

const rawObjects = {};
const objectTypes = {};

for (let i = 0; i < marshalHeaders.length; i++) {
    const start = marshalHeaders[i];
    const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
    const section = data.slice(start, end);

    try {
        const rawParsed = load(section);
        if (rawParsed !== null && rawParsed !== undefined) {
            rawObjects[i] = rawParsed;

            let objectType = 'UNKNOWN';

            if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)) {
                const symbols = Object.getOwnPropertySymbols(rawParsed);
                const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                if (rubyVars.length > 0) {
                    const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                    const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                    const mapsSymbol = symbols.find(sym => sym.toString() === 'Symbol(@maps)');
                    const dataSymbol = symbols.find(sym => sym.toString() === 'Symbol(@data)');

                    if (nameSymbol) {
                        objectType = 'PLAYER';
                    } else if (boxesSymbol && Array.isArray(rawParsed[boxesSymbol])) {
                        objectType = 'BOXES';
                    } else if (mapsSymbol) {
                        objectType = 'MAPS';
                    } else if (dataSymbol) {
                        objectType = 'DATA';
                    } else {
                        const varNames = rubyVars.map(sym => sym.toString().replace('Symbol(', '').replace(')', ''));
                        if (varNames.includes('@playing_bgm')) {
                            objectType = 'SYSTEM';
                        } else if (varNames.includes('@runstyle')) {
                            objectType = 'OPTIONS';
                        } else if (varNames.includes('@weather_type')) {
                            objectType = 'SCREEN';
                        } else if (varNames.includes('@healingSpot')) {
                            objectType = 'METADATA';
                        } else if (varNames.includes('@movedEvents')) {
                            objectType = 'EVENTS';
                        }
                    }
                }
            } else if (typeof rawParsed === 'number') {
                objectType = 'NUMBER';
            }

            objectTypes[i] = objectType;
        }
    } catch (parseError) {
        rawObjects[i] = null;
        objectTypes[i] = 'FAILED';
    }
}

console.log('Object types:');
for (const [index, type] of Object.entries(objectTypes)) {
    console.log(`  ${index}: ${type}`);
}

// Create mapping
console.log('\nCreating mapping...');
const mapping = {};
let mappedIndex = 0;

const priorityOrder = ['PLAYER', 'NUMBER', 'SYSTEM', 'OPTIONS', 'DATA', 'SCREEN', 'MAPS', 'METADATA', 'EVENTS', 'BOXES'];

for (const type of priorityOrder) {
    const indices = Object.keys(objectTypes).filter(i => objectTypes[i] === type);
    for (const originalIndex of indices) {
        if (rawObjects[originalIndex] && mappedIndex <= 14) {
            mapping[mappedIndex] = parseInt(originalIndex);
            console.log(`Mapping: ${mappedIndex} ← ${originalIndex} (${type})`);
            mappedIndex++;
        }
    }
}

console.log('\nFinal mapping:', mapping);

// Verify the mapping
const playerMappedTo = Object.keys(mapping).find(k => objectTypes[mapping[k]] === 'PLAYER');
const boxesMappedTo = Object.keys(mapping).find(k => objectTypes[mapping[k]] === 'BOXES');

console.log('\nVerification:');
console.log(`Player object mapped to index: ${playerMappedTo || 'NOT FOUND'}`);
console.log(`Boxes object mapped to index: ${boxesMappedTo || 'NOT FOUND'}`);

if (playerMappedTo === '0') {
    console.log('✅ Player object correctly at index 0');
} else {
    console.log('❌ Player object not at index 0');
}

if (boxesMappedTo === '14') {
    console.log('✅ Boxes object correctly at index 14');
} else if (boxesMappedTo) {
    console.log(`⚠️  Boxes object at index ${boxesMappedTo} instead of 14`);
} else {
    console.log('❌ Boxes object not found in mapping');
}