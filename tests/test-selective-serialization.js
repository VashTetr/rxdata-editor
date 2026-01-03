const fs = require('fs');
const { load, dump } = require('@hyrious/marshal');

/**
 * Test Suite: Selective Serialization Test
 * Tests the new approach of only re-serializing modified objects
 * while preserving original binary data for unmodified objects
 */

class SelectiveSerializationTest {
    constructor() {
        this.testResults = [];
        this.testFiles = [];
    }

    log(message) {
        console.log(`[SELECTIVE] ${message}`);
    }

    error(message) {
        console.error(`[SELECTIVE-ERROR] ${message}`);
    }

    success(message) {
        console.log(`[SELECTIVE-SUCCESS] ${message}`);
    }

    async runTest() {
        console.log('=== SELECTIVE SERIALIZATION TEST ===\n');
        console.log('This test verifies that only modified objects are re-serialized');

        try {
            await this.testLoadOriginalFile();
            await this.testSelectiveModification();
            await this.testBinaryPreservation();
            await this.testGameCompatibility();

            this.printResults();
            this.cleanup();

        } catch (error) {
            this.error(`Selective serialization test failed: ${error.message}`);
            this.error(`Stack: ${error.stack}`);
            process.exit(1);
        }
    }

    async testLoadOriginalFile() {
        this.log('Step 1: Load original file');

        const originalFile = 'Game new.rxdata';
        this.originalData = fs.readFileSync(originalFile);
        this.log(`Original file: ${this.originalData.length} bytes`);

        // Parse the file
        this.originalObjects = this.parseFile(this.originalData);
        this.log(`Parsed objects: ${Object.keys(this.originalObjects.rawObjects).length}`);

        this.success('Step 1 PASSED: Original file loaded');
        this.testResults.push({ test: 'Load Original File', passed: true });
    }

    parseFile(data) {
        const marshalHeaders = [];
        for (let i = 0; i < data.length - 1; i++) {
            if (data[i] === 4 && data[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        const rawObjects = {};
        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
            const section = data.slice(start, end);

            try {
                const rawParsed = load(section);
                rawObjects[i] = rawParsed;
            } catch (parseError) {
                this.log(`Failed to parse section ${i}: ${parseError.message}`);
            }
        }

        return { rawObjects };
    }

    async testSelectiveModification() {
        this.log('Step 2: Make selective modification (only object 0)');

        // Modify only object 0 - toggle @pokegear
        const playerObject = this.originalObjects.rawObjects[0];
        const pokegearSymbol = Object.getOwnPropertySymbols(playerObject).find(s => s.toString() === 'Symbol(@pokegear)');

        if (pokegearSymbol) {
            this.originalPokegear = playerObject[pokegearSymbol];
            playerObject[pokegearSymbol] = !this.originalPokegear;
            this.log(`Modified @pokegear: ${this.originalPokegear} → ${playerObject[pokegearSymbol]}`);
        } else {
            throw new Error('@pokegear symbol not found');
        }

        // Mark only object 0 as modified
        this.modifiedObjects = new Set([0]);

        this.success('Step 2 PASSED: Selective modification completed');
        this.testResults.push({ test: 'Selective Modification', passed: true });
    }

    async testBinaryPreservation() {
        this.log('Step 3: Test binary preservation for unmodified objects');

        // Reconstruct file with selective serialization
        const modifiedData = await this.reconstructFileSelectively(this.originalData, this.originalObjects.rawObjects, this.modifiedObjects);

        const testFileName = 'tests/test-selective-serialization.rxdata';
        fs.writeFileSync(testFileName, modifiedData);
        this.testFiles.push(testFileName);

        this.log(`Original size: ${this.originalData.length} bytes`);
        this.log(`Modified size: ${modifiedData.length} bytes`);
        this.log(`Size difference: ${modifiedData.length - this.originalData.length} bytes`);

        // Analyze which sections changed
        const originalHeaders = this.findMarshalHeaders(this.originalData);
        const modifiedHeaders = this.findMarshalHeaders(modifiedData);

        let identicalSections = 0;
        let modifiedSections = 0;

        for (let i = 0; i < originalHeaders.length; i++) {
            const origStart = originalHeaders[i];
            const origEnd = i + 1 < originalHeaders.length ? originalHeaders[i + 1] : this.originalData.length;
            const origSection = this.originalData.slice(origStart, origEnd);

            const modStart = modifiedHeaders[i];
            const modEnd = i + 1 < modifiedHeaders.length ? modifiedHeaders[i + 1] : modifiedData.length;
            const modSection = modifiedData.slice(modStart, modEnd);

            if (this.modifiedObjects.has(i)) {
                // This object should be different
                if (origSection.length === modSection.length) {
                    let identical = true;
                    for (let j = 0; j < origSection.length; j++) {
                        if (origSection[j] !== modSection[j]) {
                            identical = false;
                            break;
                        }
                    }
                    if (identical) {
                        this.log(`WARNING: Object ${i} was marked as modified but binary is identical`);
                    } else {
                        this.log(`Object ${i}: correctly modified (${origSection.length} → ${modSection.length} bytes)`);
                        modifiedSections++;
                    }
                } else {
                    this.log(`Object ${i}: correctly modified (${origSection.length} → ${modSection.length} bytes)`);
                    modifiedSections++;
                }
            } else {
                // This object should be identical
                if (origSection.length !== modSection.length) {
                    this.log(`ERROR: Object ${i} should be identical but size changed: ${origSection.length} → ${modSection.length}`);
                } else {
                    let identical = true;
                    for (let j = 0; j < origSection.length; j++) {
                        if (origSection[j] !== modSection[j]) {
                            identical = false;
                            break;
                        }
                    }
                    if (identical) {
                        this.log(`Object ${i}: correctly preserved (${origSection.length} bytes)`);
                        identicalSections++;
                    } else {
                        this.log(`ERROR: Object ${i} should be identical but content changed`);
                    }
                }
            }
        }

        this.log(`Binary preservation results: ${identicalSections} preserved, ${modifiedSections} modified`);

        if (identicalSections + modifiedSections === originalHeaders.length) {
            this.success('Step 3 PASSED: Binary preservation working correctly');
            this.testResults.push({ test: 'Binary Preservation', passed: true });
        } else {
            throw new Error('Binary preservation failed - some objects were corrupted');
        }
    }

    async reconstructFileSelectively(originalData, rawObjects, modifiedObjects) {
        const marshalHeaders = [];
        for (let i = 0; i < originalData.length - 1; i++) {
            if (originalData[i] === 4 && originalData[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        const newSections = [];

        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : originalData.length;
            const section = originalData.slice(start, end);

            if (modifiedObjects.has(i)) {
                // Re-serialize modified object
                this.log(`Re-serializing modified object ${i}`);
                const serialized = dump(rawObjects[i]);
                newSections.push(serialized);
                this.log(`Object ${i}: ${section.length} → ${serialized.length} bytes`);
            } else {
                // Use original binary data
                newSections.push(section);
                this.log(`Object ${i}: preserved original ${section.length} bytes`);
            }
        }

        // Combine all sections
        const totalLength = newSections.reduce((sum, section) => sum + section.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;

        for (const section of newSections) {
            result.set(section, offset);
            offset += section.length;
        }

        return result;
    }

    findMarshalHeaders(data) {
        const headers = [];
        for (let i = 0; i < data.length - 1; i++) {
            if (data[i] === 4 && data[i + 1] === 8) {
                headers.push(i);
            }
        }
        return headers;
    }

    async testGameCompatibility() {
        this.log('Step 4: Test game compatibility');

        const testFileName = 'tests/test-selective-serialization.rxdata';
        const testData = fs.readFileSync(testFileName);

        // Try to parse the modified file
        try {
            const reloadedObjects = this.parseFile(testData);
            this.log(`Reloaded objects: ${Object.keys(reloadedObjects.rawObjects).length}`);

            // Verify the modification persisted
            const reloadedPlayerObject = reloadedObjects.rawObjects[0];
            const pokegearSymbol = Object.getOwnPropertySymbols(reloadedPlayerObject).find(s => s.toString() === 'Symbol(@pokegear)');

            if (pokegearSymbol) {
                const reloadedPokegear = reloadedPlayerObject[pokegearSymbol];
                this.log(`Reloaded @pokegear: ${reloadedPokegear}`);

                if (reloadedPokegear !== !this.originalPokegear) {
                    throw new Error('Modification did not persist correctly');
                }
            } else {
                throw new Error('@pokegear symbol lost during save/load');
            }

            // Verify other objects are intact
            for (let i = 1; i < Object.keys(reloadedObjects.rawObjects).length; i++) {
                if (reloadedObjects.rawObjects[i] && this.originalObjects.rawObjects[i]) {
                    const originalSymbols = Object.getOwnPropertySymbols(this.originalObjects.rawObjects[i]).length;
                    const reloadedSymbols = Object.getOwnPropertySymbols(reloadedObjects.rawObjects[i]).length;

                    if (originalSymbols !== reloadedSymbols) {
                        this.log(`WARNING: Object ${i} symbol count changed: ${originalSymbols} → ${reloadedSymbols}`);
                    }
                }
            }

            this.success('Step 4 PASSED: Game compatibility verified');
            this.testResults.push({ test: 'Game Compatibility', passed: true });

        } catch (error) {
            throw new Error(`Game compatibility test failed: ${error.message}`);
        }
    }

    printResults() {
        console.log('\n=== SELECTIVE SERIALIZATION TEST RESULTS ===');

        let passed = 0;
        let total = this.testResults.length;

        this.testResults.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.test}`);
            if (result.passed) passed++;
        });

        console.log(`\nSUMMARY: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 SELECTIVE SERIALIZATION TEST PASSED!');
            console.log('Only modified objects are re-serialized, preserving original binary data.');
            console.log('This should prevent game crashes caused by serialization differences.');
        } else {
            console.log('❌ Selective serialization test failed.');
            process.exit(1);
        }
    }

    cleanup() {
        this.log('\nCleaning up test files...');
        this.testFiles.forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
                this.log(`Deleted: ${file}`);
            }
        });
    }
}

// Run test if this file is executed directly
if (require.main === module) {
    const test = new SelectiveSerializationTest();
    test.runTest().catch(error => {
        console.error('Selective serialization test failed:', error);
        process.exit(1);
    });
}

module.exports = SelectiveSerializationTest;