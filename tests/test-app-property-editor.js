const fs = require('fs');
const { load, dump } = require('@hyrious/marshal');

/**
 * Test Suite: App Property Editor Integration Test
 * Tests the complete property editor workflow including:
 * - Loading files like the app
 * - Displaying values correctly (Uint8Array as strings)
 * - Updating values through property editor
 * - Saving with selective serialization
 * - Verifying changes persist
 */

class AppPropertyEditorTest {
    constructor() {
        this.testResults = [];
        this.testFiles = [];

        // Simulate the app's dual pane structure
        this.leftPane = {
            data: null,
            filePath: null,
            parsedData: null,
            rawObjects: null,
            selectedPath: null,
            selectedValue: null
        };

        // Simulate modification tracking
        this.modifiedObjects = {
            left: new Set()
        };
    }

    log(message) {
        console.log(`[APP-PROP] ${message}`);
    }

    error(message) {
        console.error(`[APP-PROP-ERROR] ${message}`);
    }

    success(message) {
        console.log(`[APP-PROP-SUCCESS] ${message}`);
    }

    async runTest() {
        console.log('=== APP PROPERTY EDITOR INTEGRATION TEST ===\n');
        console.log('This test simulates the complete app property editor workflow');

        try {
            await this.testLoadFileIntoApp();
            await this.testSelectPlayerObject();
            await this.testDisplayCharacterName();
            await this.testEditCharacterName();
            await this.testSaveWithModificationTracking();
            await this.testVerifyPersistence();

            this.printResults();
            this.cleanup();

        } catch (error) {
            this.error(`App property editor test failed: ${error.message}`);
            this.error(`Stack: ${error.stack}`);
            process.exit(1);
        }
    }

    async testLoadFileIntoApp() {
        this.log('Step 1: Load file into app (simulating app startup)');

        const originalFile = 'Game new.rxdata';
        this.leftPane.data = fs.readFileSync(originalFile);
        this.leftPane.filePath = originalFile;

        this.log(`Loaded file: ${this.leftPane.data.length} bytes`);

        // Parse exactly like the app does
        const result = this.parseFileExactlyLikeApp(this.leftPane.data);
        this.leftPane.parsedData = result.parsedData;
        this.leftPane.rawObjects = result.rawObjects;

        this.log(`Parsed objects: ${Object.keys(this.leftPane.rawObjects).length}`);
        this.log(`Processed objects: ${Object.keys(this.leftPane.parsedData || {}).length}`);

        // Debug: Check what's in the parsed data
        if (this.leftPane.parsedData) {
            Object.keys(this.leftPane.parsedData).forEach(key => {
                const obj = this.leftPane.parsedData[key];
                this.log(`Parsed object ${key}: ${typeof obj} ${obj && obj['@rb:object'] ? '(Ruby object)' : ''}`);
            });
        }

        this.success('Step 1 PASSED: File loaded into app');
        this.testResults.push({ test: 'Load File Into App', passed: true });
    }

    parseFileExactlyLikeApp(data) {
        // Find marshal headers
        const marshalHeaders = [];
        for (let i = 0; i < data.length - 1; i++) {
            if (data[i] === 4 && data[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        const parsedObjects = {};
        const rawObjects = {};

        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
            const section = data.slice(start, end);

            try {
                const rawParsed = load(section);
                rawObjects[i] = rawParsed;

                if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)) {
                    const symbols = Object.getOwnPropertySymbols(rawParsed);
                    const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                    if (rubyVars.length > 0) {
                        const processed = this.processRubyObjectLikeApp(rawParsed, false);
                        parsedObjects[i] = processed;
                    } else {
                        // Even if no Ruby vars, still include the object
                        parsedObjects[i] = rawParsed;
                    }
                } else {
                    // Include non-object data as well
                    parsedObjects[i] = rawParsed;
                }
            } catch (parseError) {
                this.log(`Failed to parse section ${i}: ${parseError.message}`);
            }
        }

        return { parsedObjects, rawObjects };
    }

    processRubyObjectLikeApp(obj, isRoot = false) {
        if (!obj || typeof obj !== 'object') {
            return this.convertByteArrayToStringLikeApp(obj);
        }

        if (obj instanceof Uint8Array) {
            return this.convertByteArrayToStringLikeApp(obj);
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.processRubyObjectLikeApp(item, false));
        }

        const symbolKeys = Object.getOwnPropertySymbols(obj);
        const regularKeys = Object.keys(obj);

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

            const classSymbol = symbolKeys.find(sym => sym.toString().includes('class'));
            if (classSymbol) {
                rbObject['@rb:object']['@rb:klass'] = obj[classSymbol];
            }

            rubyInstanceVars.forEach(sym => {
                const key = sym.toString().replace('Symbol(', '').replace(')', '');
                rbObject['@rb:object']['@rb:attributes'][key] = this.processRubyObjectLikeApp(obj[sym], false);
            });

            regularKeys.forEach(key => {
                if (key !== 'class') {
                    rbObject['@rb:object']['@rb:attributes'][key] = this.processRubyObjectLikeApp(obj[key], false);
                }
            });

            return rbObject;
        } else {
            const processed = {};

            regularKeys.forEach(key => {
                processed[key] = this.processRubyObjectLikeApp(obj[key], false);
            });

            symbolKeys.forEach(sym => {
                const key = sym.toString();
                processed[key] = this.processRubyObjectLikeApp(obj[sym], false);
            });

            return processed;
        }
    }

    convertByteArrayToStringLikeApp(data) {
        if (data instanceof Uint8Array) {
            try {
                const decoder = new TextDecoder('utf-8', { fatal: false });
                const str = decoder.decode(data);

                if (str && str.length > 0 && !str.includes('\uFFFD')) {
                    return str;
                }

                const simpleStr = String.fromCharCode(...Array.from(data).filter(v => v > 0));
                if (simpleStr.match(/^[\x20-\x7E\s]*$/)) {
                    return simpleStr;
                }
            } catch (e) {
                // Fall through to return original data
            }
        }

        if (Array.isArray(data) && data.length > 0 && data.every(v => typeof v === 'number' && v >= 0 && v <= 255)) {
            try {
                const buffer = new Uint8Array(data);
                const decoder = new TextDecoder('utf-8', { fatal: false });
                const str = decoder.decode(buffer);

                if (str && str.length > 0 && !str.includes('\uFFFD')) {
                    return str;
                }

                const simpleStr = String.fromCharCode(...data.filter(v => v > 0));
                if (simpleStr.match(/^[\x20-\x7E\s]*$/)) {
                    return simpleStr;
                }
            } catch (e) {
                // Fall through to return original array
            }
        }
        return data;
    }

    async testSelectPlayerObject() {
        this.log('Step 2: Select player object (simulating tree view click)');

        // Work directly with raw objects since that's what matters for property editing
        const playerObject = this.leftPane.rawObjects[0];
        if (!playerObject) {
            throw new Error('Player object (raw object 0) not found');
        }

        // Simulate selecting the player object
        this.leftPane.selectedPath = ['0'];
        this.leftPane.selectedValue = playerObject;

        this.log(`Selected path: ${this.leftPane.selectedPath.join(' → ')}`);
        this.log(`Selected value type: ${typeof this.leftPane.selectedValue}`);
        this.log(`Selected value symbols: ${Object.getOwnPropertySymbols(this.leftPane.selectedValue).length}`);

        this.success('Step 2 PASSED: Player object selected');
        this.testResults.push({ test: 'Select Player Object', passed: true });
    }

    async testDisplayCharacterName() {
        this.log('Step 3: Display character name in property editor');

        // Get the character name from the raw object
        const playerObject = this.leftPane.selectedValue;
        const nameSymbol = Object.getOwnPropertySymbols(playerObject).find(s => s.toString() === 'Symbol(@name)');

        if (!nameSymbol) {
            throw new Error('@name symbol not found in player object');
        }

        const nameValue = playerObject[nameSymbol];
        this.log(`Raw name value: ${JSON.stringify(nameValue)}`);
        this.log(`Name value type: ${typeof nameValue}`);
        this.log(`Name value constructor: ${nameValue.constructor.name}`);

        // Test the formatValue method like the app would
        const displayValue = this.formatValueLikeApp(nameValue);
        this.log(`Formatted for display: "${displayValue}"`);

        if (typeof displayValue !== 'string' || displayValue.length === 0) {
            throw new Error('Character name not properly formatted for display');
        }

        this.originalDisplayName = displayValue;
        this.log(`Character name displayed as: "${this.originalDisplayName}"`);

        this.success('Step 3 PASSED: Character name displayed correctly');
        this.testResults.push({ test: 'Display Character Name', passed: true });
    }

    formatValueLikeApp(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (typeof value === 'symbol') return value.toString();
        if (typeof value === 'string') return value;

        // Handle Uint8Array (like character names) - convert to string for editing
        if (value instanceof Uint8Array) {
            try {
                const str = String.fromCharCode(...Array.from(value));
                // Only return as string if it contains printable characters
                if (str.match(/^[\x20-\x7E]*$/)) {
                    return str;
                }
            } catch (e) {
                // Fall through to default handling
            }
        }

        // Handle regular arrays that might be byte arrays
        if (Array.isArray(value)) {
            // Check if it's a byte array that could be a string
            if (value.length > 0 && value.every(v => typeof v === 'number' && v >= 0 && v <= 255)) {
                try {
                    const str = String.fromCharCode(...value);
                    // Only return as string if it contains printable characters
                    if (str.match(/^[\x20-\x7E]*$/)) {
                        return str;
                    }
                } catch (e) {
                    // Fall through to default array handling
                }
            }
            return `Array(${value.length})`;
        }

        if (typeof value === 'object') {
            const regularKeys = Object.keys(value).length;
            const symbolKeys = Object.getOwnPropertySymbols(value).length;
            return `Object(${regularKeys + symbolKeys})`;
        }
        return String(value);
    }

    async testEditCharacterName() {
        this.log('Step 4: Edit character name (simulating property editor input)');

        this.newDisplayName = 'NewTestName';
        this.log(`Changing name from "${this.originalDisplayName}" to "${this.newDisplayName}"`);

        // Simulate the app's updateValue method
        await this.updateValueLikeApp('@name', this.newDisplayName, 'string');

        this.success('Step 4 PASSED: Character name edited');
        this.testResults.push({ test: 'Edit Character Name', passed: true });
    }

    async updateValueLikeApp(key, newValue, originalType) {
        this.log(`Updating value: ${key} = "${newValue}"`);

        // Get the raw object directly
        const objectIndex = parseInt(this.leftPane.selectedPath[0]);
        const rawObject = this.leftPane.rawObjects[objectIndex];
        const nameSymbol = Object.getOwnPropertySymbols(rawObject).find(s => s.toString() === 'Symbol(@name)');

        if (nameSymbol) {
            // Get the original value to determine format
            const originalValue = rawObject[nameSymbol];
            let finalValue = newValue;

            // Convert string back to Uint8Array if original was Uint8Array
            if (originalValue instanceof Uint8Array && typeof newValue === 'string') {
                finalValue = new Uint8Array(Array.from(newValue).map(char => char.charCodeAt(0)));
                this.log(`Converted to Uint8Array: [${Array.from(finalValue).join(', ')}]`);
            }

            rawObject[nameSymbol] = finalValue;
            this.log('Raw object updated');
        }

        // Mark object as modified
        this.modifiedObjects.left.add(objectIndex);
        this.log(`Marked object ${objectIndex} as modified`);
    }

    async testSaveWithModificationTracking() {
        this.log('Step 5: Save with modification tracking');

        // Reconstruct file with selective serialization
        const modifiedData = await this.reconstructFileSelectively(
            this.leftPane.data,
            this.leftPane.rawObjects,
            this.modifiedObjects.left
        );

        const testFileName = 'tests/test-app-property-editor.rxdata';
        fs.writeFileSync(testFileName, modifiedData);
        this.testFiles.push(testFileName);

        this.log(`Original size: ${this.leftPane.data.length} bytes`);
        this.log(`Modified size: ${modifiedData.length} bytes`);
        this.log(`Size difference: ${modifiedData.length - this.leftPane.data.length} bytes`);

        this.success('Step 5 PASSED: File saved with modification tracking');
        this.testResults.push({ test: 'Save with Modification Tracking', passed: true });
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
                this.log(`Preserving original object ${i}`);
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

    async testVerifyPersistence() {
        this.log('Step 6: Verify change persistence');

        const testFileName = 'tests/test-app-property-editor.rxdata';
        const reloadedData = fs.readFileSync(testFileName);

        // Parse the reloaded file
        const reloadedResult = this.parseFileExactlyLikeApp(reloadedData);
        this.log(`Reloaded objects: ${Object.keys(reloadedResult.rawObjects).length}`);

        // Check the character name in the raw object
        const reloadedPlayerObject = reloadedResult.rawObjects[0];
        const nameSymbol = Object.getOwnPropertySymbols(reloadedPlayerObject).find(s => s.toString() === 'Symbol(@name)');

        if (!nameSymbol) {
            throw new Error('Character name symbol not found in reloaded file');
        }

        const reloadedNameValue = reloadedPlayerObject[nameSymbol];
        const reloadedDisplayName = this.formatValueLikeApp(reloadedNameValue);

        this.log(`Reloaded name: "${reloadedDisplayName}"`);
        this.log(`Expected name: "${this.newDisplayName}"`);

        if (reloadedDisplayName !== this.newDisplayName) {
            throw new Error(`Name change did not persist: expected "${this.newDisplayName}", got "${reloadedDisplayName}"`);
        }

        this.success('Step 6 PASSED: Change persistence verified');
        this.testResults.push({ test: 'Verify Change Persistence', passed: true });
    }

    printResults() {
        console.log('\n=== APP PROPERTY EDITOR INTEGRATION TEST RESULTS ===');

        let passed = 0;
        let total = this.testResults.length;

        this.testResults.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.test}`);
            if (result.passed) passed++;
        });

        console.log(`\nSUMMARY: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 APP PROPERTY EDITOR INTEGRATION TEST PASSED!');
            console.log('The complete property editor workflow works correctly:');
            console.log('- Character names display as editable strings');
            console.log('- Changes are properly saved to raw objects');
            console.log('- Only modified objects are re-serialized');
            console.log('- Changes persist after save/reload');
        } else {
            console.log('❌ App property editor integration test failed.');
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
    const test = new AppPropertyEditorTest();
    test.runTest().catch(error => {
        console.error('App property editor integration test failed:', error);
        process.exit(1);
    });
}

module.exports = AppPropertyEditorTest;