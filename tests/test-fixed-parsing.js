const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Test the fixed parsing logic that handles embedded Marshal headers
 */

class FixedParsingTest {
    constructor() {
        // Simulate the app's structure
    }

    log(message) {
        console.log(`[FIXED-PARSING] ${message}`);
    }

    convertByteArrayToString(data) {
        if (data instanceof Uint8Array) {
            return String.fromCharCode(...Array.from(data));
        } else if (Array.isArray(data)) {
            return String.fromCharCode(...data);
        } else {
            return data;
        }
    }

    processRubyObject(obj) {
        // Simplified version of the app's processRubyObject
        if (!obj || typeof obj !== 'object') {
            return this.convertByteArrayToString(obj);
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.processRubyObject(item));
        }

        const symbolKeys = Object.getOwnPropertySymbols(obj);
        const rubyInstanceVars = symbolKeys.filter(sym => {
            const symStr = sym.toString();
            return symStr.includes('@') && !symStr.includes('class');
        });

        if (rubyInstanceVars.length > 0) {
            const rbObject = {
                '@rb:object': {
                    '@rb:attributes': {}
                }
            };

            rubyInstanceVars.forEach(sym => {
                const key = sym.toString().replace('Symbol(', '').replace(')', '');
                rbObject['@rb:object']['@rb:attributes'][key] = this.processRubyObject(obj[sym]);
            });

            return rbObject;
        } else {
            const processed = {};
            Object.keys(obj).forEach(key => {
                processed[key] = this.processRubyObject(obj[key]);
            });
            return processed;
        }
    }

    tryAlternativeParsing(data, startPos, objectIndex, marshalHeaders) {
        // Try alternative parsing strategies for objects that fail with "marshal data too short"
        console.log(`Trying alternative parsing for object ${objectIndex} starting at position ${startPos}`);

        // Strategy 1: Try parsing with extended boundaries
        const testSizes = [
            50000,  // Based on our test results
            45000,
            40000,
            35000,
            60000,
            70000,
        ];

        for (const size of testSizes) {
            if (startPos + size > data.length) continue;

            try {
                const testSection = data.slice(startPos, startPos + size);
                const parsed = load(testSection);

                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    const symbols = Object.getOwnPropertySymbols(parsed);
                    const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                    if (rubyVars.length > 0) {
                        // Verify this looks like a valid object
                        const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                        const badgesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@badges)');
                        const partySymbol = symbols.find(sym => sym.toString() === 'Symbol(@party)');

                        // For object 0, we expect player data
                        if (objectIndex === 0 && (nameSymbol || badgesSymbol || partySymbol)) {
                            console.log(`Alternative parsing succeeded with ${size} bytes for object ${objectIndex}`);
                            return { success: true, parsed: parsed, actualSize: size };
                        }

                        // For other objects, just check if it has Ruby variables
                        if (objectIndex !== 0 && rubyVars.length >= 3) {
                            console.log(`Alternative parsing succeeded with ${size} bytes for object ${objectIndex}`);
                            return { success: true, parsed: parsed, actualSize: size };
                        }
                    }
                }
            } catch (error) {
                // Continue trying other sizes
            }
        }

        return { success: false };
    }

    async testFixedParsing() {
        console.log('=== TESTING FIXED PARSING ===\n');

        // Test Game old.rxdata with the fixed parsing logic
        const data = fs.readFileSync('Game old.rxdata');

        const marshalHeaders = [];
        for (let i = 0; i < data.length - 1; i++) {
            if (data[i] === 4 && data[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        this.log(`Found ${marshalHeaders.length} Ruby Marshal objects`);

        const parsedObjects = {};
        const rawObjects = {};

        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            let end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
            let section = data.slice(start, end);

            try {
                const rawParsed = load(section);
                rawObjects[i] = rawParsed;

                if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)) {
                    const symbols = Object.getOwnPropertySymbols(rawParsed);
                    const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                    if (rubyVars.length > 0) {
                        const processed = this.processRubyObject(rawParsed);
                        parsedObjects[i] = processed;
                        this.log(`Object ${i}: ${rubyVars.length} Ruby variables`);
                    }
                }
            } catch (parseError) {
                this.log(`Failed to parse section ${i} (${section.length} bytes): ${parseError.message}`);

                // Try alternative parsing for failed objects
                if (parseError.message.includes('marshal data too short') || parseError.message.includes('data too short')) {
                    this.log(`Attempting alternative parsing for object ${i}...`);

                    const alternativeResult = this.tryAlternativeParsing(data, start, i, marshalHeaders);
                    if (alternativeResult.success) {
                        rawObjects[i] = alternativeResult.parsed;

                        if (alternativeResult.parsed && typeof alternativeResult.parsed === 'object' && !Array.isArray(alternativeResult.parsed)) {
                            const symbols = Object.getOwnPropertySymbols(alternativeResult.parsed);
                            const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                            if (rubyVars.length > 0) {
                                const processed = this.processRubyObject(alternativeResult.parsed);
                                parsedObjects[i] = processed;
                                this.log(`Object ${i}: ✅ Alternative parsing succeeded - ${rubyVars.length} Ruby variables`);

                                // Log if this is a player object
                                const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                                if (nameSymbol) {
                                    const nameValue = this.convertByteArrayToString(alternativeResult.parsed[nameSymbol]);
                                    this.log(`Object ${i}: Player object with @name = "${nameValue}"`);
                                }

                                // Log if this is a boxes object
                                const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                                if (boxesSymbol && Array.isArray(alternativeResult.parsed[boxesSymbol])) {
                                    this.log(`Object ${i}: Boxes object with ${alternativeResult.parsed[boxesSymbol].length} boxes`);
                                }
                            }
                        }
                    } else {
                        this.log(`Alternative parsing also failed for object ${i}`);
                    }
                }
            }
        }

        this.log(`\nFinal results:`);
        this.log(`Parsed objects: ${Object.keys(parsedObjects).length}`);
        this.log(`Raw objects: ${Object.keys(rawObjects).length}`);
        this.log(`Successfully parsed objects: [${Object.keys(parsedObjects).join(', ')}]`);

        // Check if we now have object 0 (player)
        if (parsedObjects[0]) {
            this.log(`✅ SUCCESS: Object 0 (player) is now parsed correctly!`);
        } else {
            this.log(`❌ FAILED: Object 0 (player) still not parsed`);
        }

        // Check if we have boxes
        const boxesObjectIndex = Object.keys(rawObjects).find(i => {
            const obj = rawObjects[i];
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                const symbols = Object.getOwnPropertySymbols(obj);
                const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                return boxesSymbol && Array.isArray(obj[boxesSymbol]);
            }
            return false;
        });

        if (boxesObjectIndex) {
            this.log(`✅ SUCCESS: Boxes found at object ${boxesObjectIndex}`);
        } else {
            this.log(`❌ FAILED: Boxes object not found`);
        }

        return { parsedObjects, rawObjects };
    }
}

// Run test
const test = new FixedParsingTest();
test.testFixedParsing();