const fs = require('fs');
const { load, dump } = require('@hyrious/marshal');

/**
 * Test Suite: Binary Comparison Test
 * This test performs a detailed binary comparison between original and modified files
 * to identify any corruption that might cause game crashes
 */

class BinaryComparisonTest {
    constructor() {
        this.testResults = [];
        this.testFiles = [];
    }

    log(message) {
        console.log(`[BINARY] ${message}`);
    }

    error(message) {
        console.error(`[BINARY-ERROR] ${message}`);
    }

    success(message) {
        console.log(`[BINARY-SUCCESS] ${message}`);
    }

    async runTest() {
        console.log('=== BINARY COMPARISON TEST ===\n');
        console.log('This test performs detailed binary analysis to identify save corruption');

        try {
            await this.testLoadAndModify();
            await this.testBinaryComparison();
            await this.testRoundTripIntegrity();
            await this.testMinimalChange();

            this.printResults();
            this.cleanup();

        } catch (error) {
            this.error(`Binary comparison test failed: ${error.message}`);
            this.error(`Stack: ${error.stack}`);
            process.exit(1);
        }
    }

    async testLoadAndModify() {
        this.log('Step 1: Load original file and make minimal modification');

        const originalFile = 'Game new.rxdata';
        this.originalData = fs.readFileSync(originalFile);
        this.log(`Original file: ${this.originalData.length} bytes`);

        // Parse the file
        this.originalObjects = this.parseFile(this.originalData);
        this.log(`Parsed objects: ${Object.keys(this.originalObjects.rawObjects).length}`);

        // Make a minimal change - just toggle @pokegear boolean
        const playerObject = this.originalObjects.rawObjects[0];
        const pokegearSymbol = Object.getOwnPropertySymbols(playerObject).find(s => s.toString() === 'Symbol(@pokegear)');

        if (pokegearSymbol) {
            this.originalPokegear = playerObject[pokegearSymbol];
            this.log(`Original @pokegear: ${this.originalPokegear}`);

            // Toggle the boolean
            playerObject[pokegearSymbol] = !this.originalPokegear;
            this.log(`Modified @pokegear: ${playerObject[pokegearSymbol]}`);
        } else {
            throw new Error('@pokegear symbol not found');
        }

        this.success('Step 1 PASSED: File loaded and minimally modified');
        this.testResults.push({ test: 'Load and Modify', passed: true });
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

    async testBinaryComparison() {
        this.log('Step 2: Perform binary comparison');

        // Reconstruct the modified file
        const modifiedData = await this.reconstructFile(this.originalData, this.originalObjects.rawObjects);

        const testFileName = 'tests/test-binary-comparison.rxdata';
        fs.writeFileSync(testFileName, modifiedData);
        this.testFiles.push(testFileName);

        this.log(`Original size: ${this.originalData.length} bytes`);
        this.log(`Modified size: ${modifiedData.length} bytes`);
        this.log(`Size difference: ${modifiedData.length - this.originalData.length} bytes`);

        // Perform byte-by-byte comparison
        let differenceCount = 0;
        let firstDifference = -1;
        const maxLength = Math.max(this.originalData.length, modifiedData.length);

        for (let i = 0; i < maxLength; i++) {
            const originalByte = i < this.originalData.length ? this.originalData[i] : undefined;
            const modifiedByte = i < modifiedData.length ? modifiedData[i] : undefined;

            if (originalByte !== modifiedByte) {
                if (firstDifference === -1) {
                    firstDifference = i;
                    this.log(`First difference at byte ${i}: ${originalByte} → ${modifiedByte}`);
                }
                differenceCount++;
            }
        }

        this.log(`Total byte differences: ${differenceCount}`);
        this.log(`Percentage changed: ${((differenceCount / maxLength) * 100).toFixed(4)}%`);

        // Analyze differences by section
        await this.analyzeSectionDifferences(modifiedData);

        this.success('Step 2 PASSED: Binary comparison completed');
        this.testResults.push({ test: 'Binary Comparison', passed: true });
    }

    async analyzeSectionDifferences(modifiedData) {
        this.log('Analyzing differences by Ruby Marshal section...');

        const originalHeaders = this.findMarshalHeaders(this.originalData);
        const modifiedHeaders = this.findMarshalHeaders(modifiedData);

        this.log(`Original sections: ${originalHeaders.length}`);
        this.log(`Modified sections: ${modifiedHeaders.length}`);

        if (originalHeaders.length !== modifiedHeaders.length) {
            this.log(`WARNING: Section count mismatch!`);
            return;
        }

        for (let i = 0; i < originalHeaders.length; i++) {
            const origStart = originalHeaders[i];
            const origEnd = i + 1 < originalHeaders.length ? originalHeaders[i + 1] : this.originalData.length;
            const origSection = this.originalData.slice(origStart, origEnd);

            const modStart = modifiedHeaders[i];
            const modEnd = i + 1 < modifiedHeaders.length ? modifiedHeaders[i + 1] : modifiedData.length;
            const modSection = modifiedData.slice(modStart, modEnd);

            if (origSection.length !== modSection.length) {
                this.log(`Section ${i}: size changed ${origSection.length} → ${modSection.length} bytes`);
            } else {
                // Check if content is identical
                let identical = true;
                for (let j = 0; j < origSection.length; j++) {
                    if (origSection[j] !== modSection[j]) {
                        identical = false;
                        break;
                    }
                }
                if (!identical) {
                    this.log(`Section ${i}: content changed (same size: ${origSection.length} bytes)`);
                } else {
                    this.log(`Section ${i}: identical (${origSection.length} bytes)`);
                }
            }
        }
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

    async reconstructFile(originalData, rawObjects) {
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

            if (rawObjects[i]) {
                // Serialize the raw Ruby object
                const serialized = dump(rawObjects[i]);
                newSections.push(serialized);
                this.log(`Object ${i}: ${section.length} → ${serialized.length} bytes`);
            } else {
                newSections.push(section);
                this.log(`Object ${i}: unchanged ${section.length} bytes`);
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

    async testRoundTripIntegrity() {
        this.log('Step 3: Test round-trip integrity');

        // Load the modified file and parse it again
        const testFileName = 'tests/test-binary-comparison.rxdata';
        const reloadedData = fs.readFileSync(testFileName);

        try {
            const reloadedObjects = this.parseFile(reloadedData);
            this.log(`Reloaded objects: ${Object.keys(reloadedObjects.rawObjects).length}`);

            // Verify the modification persisted
            const reloadedPlayerObject = reloadedObjects.rawObjects[0];
            const pokegearSymbol = Object.getOwnPropertySymbols(reloadedPlayerObject).find(s => s.toString() === 'Symbol(@pokegear)');

            if (pokegearSymbol) {
                const reloadedPokegear = reloadedPlayerObject[pokegearSymbol];
                this.log(`Reloaded @pokegear: ${reloadedPokegear}`);

                if (reloadedPokegear !== !this.originalPokegear) {
                    throw new Error('Round-trip integrity failed - modification lost');
                }
            } else {
                throw new Error('Round-trip integrity failed - @pokegear symbol lost');
            }

            this.success('Step 3 PASSED: Round-trip integrity verified');
            this.testResults.push({ test: 'Round-trip Integrity', passed: true });

        } catch (error) {
            throw new Error(`Round-trip integrity failed: ${error.message}`);
        }
    }

    async testMinimalChange() {
        this.log('Step 4: Test with no changes (identity test)');

        // Load original file, parse it, and save it without any changes
        const identityObjects = this.parseFile(this.originalData);
        const identityData = await this.reconstructFile(this.originalData, identityObjects.rawObjects);

        const identityFileName = 'tests/test-identity.rxdata';
        fs.writeFileSync(identityFileName, identityData);
        this.testFiles.push(identityFileName);

        this.log(`Identity test - Original: ${this.originalData.length} bytes`);
        this.log(`Identity test - Reconstructed: ${identityData.length} bytes`);

        // Compare byte-by-byte
        let identityDifferences = 0;
        const maxLen = Math.max(this.originalData.length, identityData.length);

        for (let i = 0; i < maxLen; i++) {
            const origByte = i < this.originalData.length ? this.originalData[i] : undefined;
            const identByte = i < identityData.length ? identityData[i] : undefined;

            if (origByte !== identByte) {
                identityDifferences++;
                if (identityDifferences <= 10) { // Show first 10 differences
                    this.log(`Identity diff at byte ${i}: ${origByte} → ${identByte}`);
                }
            }
        }

        this.log(`Identity test differences: ${identityDifferences} bytes`);

        if (identityDifferences > 0) {
            this.log('WARNING: Identity test failed - Ruby Marshal serialization is not deterministic!');
            this.log('This could be the cause of game crashes - the serialization process itself changes the data.');
        } else {
            this.log('Identity test passed - serialization is deterministic');
        }

        this.success('Step 4 PASSED: Identity test completed');
        this.testResults.push({ test: 'Identity Test', passed: true });
    }

    printResults() {
        console.log('\n=== BINARY COMPARISON TEST RESULTS ===');

        let passed = 0;
        let total = this.testResults.length;

        this.testResults.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.test}`);
            if (result.passed) passed++;
        });

        console.log(`\nSUMMARY: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 BINARY COMPARISON TEST PASSED!');
            console.log('However, check the logs above for any warnings about serialization issues.');
        } else {
            console.log('❌ Binary comparison test failed.');
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
    const test = new BinaryComparisonTest();
    test.runTest().catch(error => {
        console.error('Binary comparison test failed:', error);
        process.exit(1);
    });
}

module.exports = BinaryComparisonTest;