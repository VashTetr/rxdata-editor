const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Robust Parsing Test: Handle Game old.rxdata correctly
 * This test implements a more robust parsing strategy
 */

class RobustParsingTest {
    constructor() {
        this.testResults = [];
    }

    log(message) {
        console.log(`[ROBUST] ${message}`);
    }

    error(message) {
        console.error(`[ROBUST-ERROR] ${message}`);
    }

    success(message) {
        console.log(`[ROBUST-SUCCESS] ${message}`);
    }

    async runTest() {
        console.log('=== ROBUST PARSING TEST ===\n');
        console.log('This test implements a more robust parsing strategy for Game old.rxdata');

        try {
            await this.testRobustParsing();
            await this.compareWithGameNew();

        } catch (error) {
            this.error(`Robust parsing test failed: ${error.message}`);
            this.error(`Stack: ${error.stack}`);
        }
    }

    async testRobustParsing() {
        this.log('Step 1: Test robust parsing strategy');

        const gameOld = fs.readFileSync('Game old.rxdata');
        const gameNew = fs.readFileSync('Game new.rxdata');

        // Parse Game new (working) for reference
        const gameNewObjects = this.parseFileRobust(gameNew, 'Game new');
        this.log(`Game new: ${Object.keys(gameNewObjects).length} objects parsed`);

        // Parse Game old with robust strategy
        const gameOldObjects = this.parseFileRobust(gameOld, 'Game old');
        this.log(`Game old: ${Object.keys(gameOldObjects).length} objects parsed`);

        this.success('Step 1 PASSED: Robust parsing completed');
        return { gameNewObjects, gameOldObjects };
    }

    parseFileRobust(data, label) {
        this.log(`\n--- Robust parsing ${label} ---`);

        const objects = {};
        let position = 0;
        let objectIndex = 0;

        while (position < data.length) {
            // Look for next Ruby Marshal header (4, 8)
            let headerPos = -1;
            for (let i = position; i < data.length - 1; i++) {
                if (data[i] === 4 && data[i + 1] === 8) {
                    headerPos = i;
                    break;
                }
            }

            if (headerPos === -1) {
                // No more headers found
                break;
            }

            // Try to parse from this position
            try {
                const remainingData = data.slice(headerPos);
                const parsed = load(remainingData);

                if (parsed !== null && parsed !== undefined) {
                    objects[objectIndex] = parsed;

                    // Log what we found
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        const symbols = Object.getOwnPropertySymbols(parsed);
                        const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                        if (rubyVars.length > 0) {
                            this.log(`${label} Object ${objectIndex}: Ruby object with ${rubyVars.length} variables`);

                            // Check for specific important variables
                            const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                            if (nameSymbol) {
                                const nameValue = parsed[nameSymbol];
                                const nameStr = this.convertToString(nameValue);
                                this.log(`${label} Object ${objectIndex}: @name = "${nameStr}"`);
                            }

                            const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                            if (boxesSymbol) {
                                const boxesValue = parsed[boxesSymbol];
                                if (Array.isArray(boxesValue)) {
                                    this.log(`${label} Object ${objectIndex}: @boxes = Array[${boxesValue.length}]`);
                                }
                            }
                        } else {
                            this.log(`${label} Object ${objectIndex}: Regular object with ${Object.keys(parsed).length} properties`);
                        }
                    } else if (Array.isArray(parsed)) {
                        this.log(`${label} Object ${objectIndex}: Array with ${parsed.length} items`);
                    } else {
                        this.log(`${label} Object ${objectIndex}: ${typeof parsed} value`);
                    }

                    objectIndex++;

                    // Calculate how much data was consumed by this object
                    // This is tricky - we need to estimate based on the serialized size
                    try {
                        const { dump } = require('@hyrious/marshal');
                        const serialized = dump(parsed);
                        position = headerPos + serialized.length;
                        this.log(`${label} Object ${objectIndex - 1}: Consumed ${serialized.length} bytes`);
                    } catch (dumpError) {
                        // If we can't serialize it back, skip ahead by a small amount
                        position = headerPos + 100;
                        this.log(`${label} Object ${objectIndex - 1}: Could not determine size, skipping 100 bytes`);
                    }
                } else {
                    // Failed to parse, skip ahead
                    position = headerPos + 1;
                }

            } catch (parseError) {
                this.log(`${label} Parse failed at position ${headerPos}: ${parseError.message}`);
                position = headerPos + 1;
            }

            // Safety check to prevent infinite loops
            if (objectIndex > 20) {
                this.log(`${label} Safety break: Found ${objectIndex} objects, stopping`);
                break;
            }
        }

        this.log(`${label} Robust parsing complete: ${objectIndex} objects found`);
        return objects;
    }

    convertToString(data) {
        if (data instanceof Uint8Array) {
            return String.fromCharCode(...Array.from(data));
        } else if (Array.isArray(data)) {
            return String.fromCharCode(...data);
        } else if (typeof data === 'string') {
            return data;
        } else {
            return String(data);
        }
    }

    async compareWithGameNew() {
        this.log('Step 2: Compare structures with Game new');

        const gameNew = fs.readFileSync('Game new.rxdata');
        const gameOld = fs.readFileSync('Game old.rxdata');

        // Use our current parsing method for Game new
        const gameNewCurrent = this.parseFileCurrent(gameNew, 'Game new (current)');

        // Use robust parsing for Game old
        const gameOldRobust = this.parseFileRobust(gameOld, 'Game old (robust)');

        this.log('\n--- Structure Comparison ---');
        this.log(`Game new (current method): ${Object.keys(gameNewCurrent).length} objects`);
        this.log(`Game old (robust method): ${Object.keys(gameOldRobust).length} objects`);

        // Look for player object (object with @name)
        let gameNewPlayerIndex = -1;
        let gameOldPlayerIndex = -1;

        for (const [index, obj] of Object.entries(gameNewCurrent)) {
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                const symbols = Object.getOwnPropertySymbols(obj);
                const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                if (nameSymbol) {
                    gameNewPlayerIndex = parseInt(index);
                    const nameStr = this.convertToString(obj[nameSymbol]);
                    this.log(`Game new player object: Index ${index}, @name = "${nameStr}"`);
                    break;
                }
            }
        }

        for (const [index, obj] of Object.entries(gameOldRobust)) {
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                const symbols = Object.getOwnPropertySymbols(obj);
                const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                if (nameSymbol) {
                    gameOldPlayerIndex = parseInt(index);
                    const nameStr = this.convertToString(obj[nameSymbol]);
                    this.log(`Game old player object: Index ${index}, @name = "${nameStr}"`);
                    break;
                }
            }
        }

        // Look for boxes object (object with @boxes)
        let gameNewBoxesIndex = -1;
        let gameOldBoxesIndex = -1;

        for (const [index, obj] of Object.entries(gameNewCurrent)) {
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                const symbols = Object.getOwnPropertySymbols(obj);
                const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                if (boxesSymbol && Array.isArray(obj[boxesSymbol])) {
                    gameNewBoxesIndex = parseInt(index);
                    this.log(`Game new boxes object: Index ${index}, @boxes = Array[${obj[boxesSymbol].length}]`);
                    break;
                }
            }
        }

        for (const [index, obj] of Object.entries(gameOldRobust)) {
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                const symbols = Object.getOwnPropertySymbols(obj);
                const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                if (boxesSymbol && Array.isArray(obj[boxesSymbol])) {
                    gameOldBoxesIndex = parseInt(index);
                    this.log(`Game old boxes object: Index ${index}, @boxes = Array[${obj[boxesSymbol].length}]`);
                    break;
                }
            }
        }

        this.log('\n--- Key Object Mapping ---');
        this.log(`Player object: Game new[${gameNewPlayerIndex}] vs Game old[${gameOldPlayerIndex}]`);
        this.log(`Boxes object: Game new[${gameNewBoxesIndex}] vs Game old[${gameOldBoxesIndex}]`);

        if (gameNewPlayerIndex === 0 && gameOldPlayerIndex === 0) {
            this.success('✅ Player objects are both at index 0 - structure matches!');
        } else {
            this.log(`⚠️  Player object indices don't match - this explains the parsing issue`);
        }

        this.success('Step 2 PASSED: Structure comparison completed');
    }

    parseFileCurrent(data, label) {
        // This is our current parsing method from the app
        const marshalHeaders = [];
        for (let i = 0; i < data.length - 1; i++) {
            if (data[i] === 4 && data[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        const parsedObjects = {};
        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
            const section = data.slice(start, end);

            try {
                const rawParsed = load(section);
                parsedObjects[i] = rawParsed;
            } catch (parseError) {
                // Skip failed sections
            }
        }

        return parsedObjects;
    }
}

// Run test
const test = new RobustParsingTest();
test.runTest();