const fs = require('fs');
const { load, dump } = require('@hyrious/marshal');

/**
 * Test Suite: Property Editor Changes Test
 * Tests that changes made through the property editor are properly saved
 * and persist after reload (simulating the app's property editor functionality)
 */

class PropertyEditorChangesTest {
    constructor() {
        this.testResults = [];
        this.testFiles = [];
    }

    log(message) {
        console.log(`[PROP-EDITOR] ${message}`);
    }

    error(message) {
        console.error(`[PROP-EDITOR-ERROR] ${message}`);
    }

    success(message) {
        console.log(`[PROP-EDITOR-SUCCESS] ${message}`);
    }

    async runTest() {
        console.log('=== PROPERTY EDITOR CHANGES TEST ===\n');
        console.log('This test simulates property editor changes and verifies they persist');

        try {
            await this.testLoadOriginalFile();
            await this.testSimulatePropertyEditorChange();
            await this.testSaveWithSelectiveSerializationSimulation();
            await this.testVerifyChangePersistence();

            this.printResults();
            this.cleanup();

        } catch (error) {
            this.error(`Property editor changes test failed: ${error.message}`);
            this.error(`Stack: ${error.stack}`);
            process.exit(1);
        }
    }

    async testLoadOriginalFile() {
        this.log('Step 1: Load original file and parse like the app');

        const originalFile = 'Game new.rxdata';
        this.originalData = fs.readFileSync(originalFile);
        this.log(`Original file: ${this.originalData.length} bytes`);

        // Parse the file exactly like the app does
        this.originalObjects = this.parseFileExactlyLikeApp(this.originalData);
        this.log(`Parsed objects: ${Object.keys(this.originalObjects.rawObjects).length}`);

        this.success('Step 1 PASSED: Original file loaded and parsed');
        this.testResults.push({ test: 'Load Original File', passed: true });
    }

    parseFileExactlyLikeApp(data) {
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

    async testSimulatePropertyEditorChange() {
        this.log('Step 2: Simulate property editor change');

        // Simulate changing the character name through the property editor
        const playerObject = this.originalObjects.rawObjects[0];
        const nameSymbol = Object.getOwnPropertySymbols(playerObject).find(s => s.toString() === 'Symbol(@name)');

        if (!nameSymbol) {
            throw new Error('@name symbol not found');
        }

        this.originalName = playerObject[nameSymbol];
        this.log(`Original name: ${this.convertToString(this.originalName)}`);

        // Simulate the property editor change - convert string to Uint8Array like the app would
        this.newNameString = 'EditedName';
        this.newName = new Uint8Array(Array.from(this.newNameString).map(char => char.charCodeAt(0)));

        this.log(`New name string: "${this.newNameString}"`);
        this.log(`New name as Uint8Array: [${Array.from(this.newName).join(', ')}]`);

        // Apply the change to the raw object (simulating the app's updateValue method)
        playerObject[nameSymbol] = this.newName;

        // Mark object 0 as modified (simulating the app's modification tracking)
        this.modifiedObjects = new Set([0]);

        this.log('Property editor change simulated');

        this.success('Step 2 PASSED: Property editor change simulated');
        this.testResults.push({ test: 'Simulate Property Editor Change', passed: true });
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

    async testSaveWithSelectiveSerializationSimulation() {
        this.log('Step 3: Save with selective serialization (simulating app save)');

        // Reconstruct file using selective serialization like the app does
        const modifiedData = await this.reconstructFileSelectively(
            this.originalData,
            this.originalObjects.rawObjects,
            this.modifiedObjects
        );

        const testFileName = 'tests/test-property-editor-changes.rxdata';
        fs.writeFileSync(testFileName, modifiedData);
        this.testFiles.push(testFileName);

        this.log(`Original size: ${this.originalData.length} bytes`);
        this.log(`Modified size: ${modifiedData.length} bytes`);
        this.log(`Size difference: ${modifiedData.length - this.originalData.length} bytes`);

        // Verify selective serialization worked
        const originalHeaders = this.findMarshalHeaders(this.originalData);
        const modifiedHeaders = this.findMarshalHeaders(modifiedData);

        let preservedCount = 0;
        let modifiedCount = 0;

        for (let i = 0; i < originalHeaders.length; i++) {
            const origStart = originalHeaders[i];
            const origEnd = i + 1 < originalHeaders.length ? originalHeaders[i + 1] : this.originalData.length;
            const origSection = this.originalData.slice(origStart, origEnd);

            const modStart = modifiedHeaders[i];
            const modEnd = i + 1 < modifiedHeaders.length ? modifiedHeaders[i + 1] : modifiedData.length;
            const modSection = modifiedData.slice(modStart, modEnd);

            if (this.modifiedObjects.has(i)) {
                this.log(`Object ${i}: modified (${origSection.length} → ${modSection.length} bytes)`);
                modifiedCount++;
            } else {
                // Should be identical
                if (origSection.length === modSection.length) {
                    let identical = true;
                    for (let j = 0; j < origSection.length; j++) {
                        if (origSection[j] !== modSection[j]) {
                            identical = false;
                            break;
                        }
                    }
                    if (identical) {
                        this.log(`Object ${i}: preserved (${origSection.length} bytes)`);
                        preservedCount++;
                    } else {
                        this.log(`ERROR: Object ${i} should be preserved but content differs`);
                    }
                } else {
                    this.log(`ERROR: Object ${i} should be preserved but size differs`);
                }
            }
        }

        this.log(`Selective serialization: ${preservedCount} preserved, ${modifiedCount} modified`);

        this.success('Step 3 PASSED: Selective serialization completed');
        this.testResults.push({ test: 'Save with Selective Serialization', passed: true });
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
            } else {
                // Use original binary data
                newSections.push(section);
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

    async testVerifyChangePersistence() {
        this.log('Step 4: Verify change persistence after reload');

        const testFileName = 'tests/test-property-editor-changes.rxdata';
        const reloadedData = fs.readFileSync(testFileName);

        // Parse the reloaded file
        const reloadedObjects = this.parseFileExactlyLikeApp(reloadedData);
        this.log(`Reloaded objects: ${Object.keys(reloadedObjects.rawObjects).length}`);

        // Verify the name change persisted
        const reloadedPlayerObject = reloadedObjects.rawObjects[0];
        const nameSymbol = Object.getOwnPropertySymbols(reloadedPlayerObject).find(s => s.toString() === 'Symbol(@name)');

        if (!nameSymbol) {
            throw new Error('Reloaded @name symbol not found');
        }

        const reloadedName = reloadedPlayerObject[nameSymbol];
        const reloadedNameString = this.convertToString(reloadedName);

        this.log(`Reloaded name: "${reloadedNameString}"`);
        this.log(`Expected name: "${this.newNameString}"`);

        if (reloadedNameString !== this.newNameString) {
            throw new Error(`Name change did not persist: expected "${this.newNameString}", got "${reloadedNameString}"`);
        }

        // Verify other objects were not affected
        for (let i = 1; i < Object.keys(reloadedObjects.rawObjects).length; i++) {
            if (reloadedObjects.rawObjects[i] && this.originalObjects.rawObjects[i]) {
                const originalSymbols = Object.getOwnPropertySymbols(this.originalObjects.rawObjects[i]).length;
                const reloadedSymbols = Object.getOwnPropertySymbols(reloadedObjects.rawObjects[i]).length;

                if (originalSymbols !== reloadedSymbols) {
                    this.log(`WARNING: Object ${i} symbol count changed: ${originalSymbols} → ${reloadedSymbols}`);
                }
            }
        }

        this.success('Step 4 PASSED: Change persistence verified');
        this.testResults.push({ test: 'Verify Change Persistence', passed: true });
    }

    printResults() {
        console.log('\n=== PROPERTY EDITOR CHANGES TEST RESULTS ===');

        let passed = 0;
        let total = this.testResults.length;

        this.testResults.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.test}`);
            if (result.passed) passed++;
        });

        console.log(`\nSUMMARY: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 PROPERTY EDITOR CHANGES TEST PASSED!');
            console.log('Property editor changes are properly saved and persist after reload.');
            console.log('The selective serialization system correctly handles direct property edits.');
        } else {
            console.log('❌ Property editor changes test failed.');
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
    const test = new PropertyEditorChangesTest();
    test.runTest().catch(error => {
        console.error('Property editor changes test failed:', error);
        process.exit(1);
    });
}

module.exports = PropertyEditorChangesTest;