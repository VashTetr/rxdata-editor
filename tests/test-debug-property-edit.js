const fs = require('fs');
const { load, dump } = require('@hyrious/marshal');

/**
 * Debug Test: Property Edit Issue
 * This test debugs exactly what happens when you edit a property in the app
 */

class DebugPropertyEditTest {
    constructor() {
        // Simulate the app's structure exactly
        this.leftPane = {
            data: null,
            filePath: null,
            parsedData: null,
            rawObjects: null,
            selectedPath: null,
            selectedValue: null
        };

        this.modifiedObjects = {
            left: new Set()
        };
    }

    log(message) {
        console.log(`[DEBUG] ${message}`);
    }

    async runTest() {
        console.log('=== DEBUG PROPERTY EDIT TEST ===\n');
        console.log('This test debugs what happens when you edit a property');

        try {
            await this.loadFile();
            await this.simulateSelectingCharacterName();
            await this.simulateEditingCharacterName();
            await this.debugRawObjectState();
            await this.testSaveProcess();

        } catch (error) {
            console.error(`Debug test failed: ${error.message}`);
            console.error(`Stack: ${error.stack}`);
        }
    }

    async loadFile() {
        this.log('Step 1: Load file exactly like the app');

        const originalFile = 'Game new.rxdata';
        const data = fs.readFileSync(originalFile);
        this.leftPane.data = data;
        this.leftPane.filePath = originalFile;

        // Parse exactly like the app
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
                        const processed = this.processRubyObject(rawParsed);
                        parsedObjects[i] = processed;
                    }
                }
            } catch (parseError) {
                this.log(`Failed to parse section ${i}: ${parseError.message}`);
            }
        }

        this.leftPane.parsedData = parsedObjects;
        this.leftPane.rawObjects = rawObjects;

        this.log(`Loaded ${Object.keys(rawObjects).length} raw objects`);
        this.log(`Processed ${Object.keys(parsedObjects).length} parsed objects`);
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

            rubyInstanceVars.forEach(sym => {
                const key = sym.toString().replace('Symbol(', '').replace(')', '');
                rbObject['@rb:object']['@rb:attributes'][key] = this.processRubyObject(obj[sym]);
            });

            return rbObject;
        } else {
            const processed = {};
            regularKeys.forEach(key => {
                processed[key] = this.processRubyObject(obj[key]);
            });
            return processed;
        }
    }

    convertByteArrayToString(data) {
        if (data instanceof Uint8Array) {
            try {
                const str = String.fromCharCode(...Array.from(data));
                if (str.match(/^[\x20-\x7E]*$/)) {
                    return str;
                }
            } catch (e) {
                // Fall through
            }
        }
        return data;
    }

    async simulateSelectingCharacterName() {
        this.log('Step 2: Simulate selecting character name in property editor');

        // Simulate clicking on object 0 in the tree, then the @name property
        this.leftPane.selectedPath = ['0', '@rb:object', '@rb:attributes'];
        this.leftPane.selectedValue = this.leftPane.parsedData[0]['@rb:object']['@rb:attributes'];

        this.log(`Selected path: ${this.leftPane.selectedPath.join(' → ')}`);
        this.log(`Selected value type: ${typeof this.leftPane.selectedValue}`);

        // Get the current character name
        const nameValue = this.leftPane.selectedValue['@name'];
        this.log(`Current name value: ${JSON.stringify(nameValue)}`);
        this.log(`Current name as string: "${nameValue}"`);

        // Also check the raw object
        const rawPlayerObject = this.leftPane.rawObjects[0];
        const nameSymbol = Object.getOwnPropertySymbols(rawPlayerObject).find(s => s.toString() === 'Symbol(@name)');
        const rawNameValue = rawPlayerObject[nameSymbol];
        this.log(`Raw name value: ${JSON.stringify(rawNameValue)}`);
        this.log(`Raw name as string: "${String.fromCharCode(...Array.from(rawNameValue))}"`);
    }

    async simulateEditingCharacterName() {
        this.log('Step 3: Simulate editing character name');

        const newName = 'DebugTestName';
        this.log(`Changing name to: "${newName}"`);

        // Simulate the app's updateValue method
        try {
            this.updateValueLikeApp('@name', newName, 'string');
            this.log('updateValue completed successfully');
        } catch (error) {
            this.log(`updateValue failed: ${error.message}`);
            throw error;
        }
    }

    updateValueLikeApp(key, newValue, originalType) {
        this.log(`=== UPDATE VALUE DEBUG ===`);
        this.log(`Key: ${key}`);
        this.log(`New value: ${newValue}`);
        this.log(`Original type: ${originalType}`);

        // Find active pane (simplified)
        const activePane = 'left';
        const activePaneData = this.leftPane;

        this.log(`Active pane: ${activePane}`);
        this.log(`Selected path: ${activePaneData.selectedPath.join(' → ')}`);

        // Convert value
        let convertedValue = String(newValue);
        this.log(`Converted value: ${convertedValue}`);

        try {
            // Update parsed data
            this.updateValueInParsedData(activePaneData, key, convertedValue);
            this.log('Parsed data updated');

            // Update raw objects
            this.updateValueInRawObjects(activePaneData, key, convertedValue);
            this.log('Raw objects updated');

            // Mark as modified
            const objectIndex = parseInt(activePaneData.selectedPath[0]);
            this.modifiedObjects[activePane].add(objectIndex);
            this.log(`Marked object ${objectIndex} as modified`);

        } catch (error) {
            this.log(`Update failed: ${error.message}`);
            throw error;
        }
    }

    updateValueInParsedData(paneData, key, newValue) {
        this.log('Updating parsed data...');
        const current = paneData.selectedValue;

        if (!current || typeof current !== 'object') {
            throw new Error('Cannot update value - selected item is not an object');
        }

        current[key] = newValue;
        this.log(`Updated ${key} in parsed data`);
    }

    updateValueInRawObjects(paneData, key, newValue) {
        this.log('Updating raw objects...');
        this.log(`Selected path: ${paneData.selectedPath.join(' → ')}`);

        if (!paneData.selectedPath || paneData.selectedPath.length === 0) {
            throw new Error('No selected path for raw object update');
        }

        // Extract object index
        const objectIndex = parseInt(paneData.selectedPath[0]);
        if (isNaN(objectIndex) || !paneData.rawObjects[objectIndex]) {
            throw new Error(`Raw object ${objectIndex} not found`);
        }

        this.log(`Updating raw object ${objectIndex}`);

        // CRITICAL ISSUE: The selected path includes UI structure (@rb:object, @rb:attributes)
        // but the raw object doesn't have this structure!

        const rawObject = paneData.rawObjects[objectIndex];
        this.log(`Raw object type: ${typeof rawObject}`);
        this.log(`Raw object symbols: ${Object.getOwnPropertySymbols(rawObject).length}`);

        // For @name, we need to find the Symbol(@name) directly in the raw object
        if (key === '@name') {
            const nameSymbol = Object.getOwnPropertySymbols(rawObject).find(s => s.toString() === 'Symbol(@name)');
            if (nameSymbol) {
                const originalValue = rawObject[nameSymbol];
                this.log(`Found @name symbol, original value: ${JSON.stringify(originalValue)}`);

                // Convert string back to Uint8Array
                if (originalValue instanceof Uint8Array && typeof newValue === 'string') {
                    const finalValue = new Uint8Array(Array.from(newValue).map(char => char.charCodeAt(0)));
                    rawObject[nameSymbol] = finalValue;
                    this.log(`Updated @name to Uint8Array: [${Array.from(finalValue).join(', ')}]`);
                } else {
                    rawObject[nameSymbol] = newValue;
                    this.log(`Updated @name to: ${newValue}`);
                }
            } else {
                throw new Error('@name symbol not found in raw object');
            }
        } else {
            throw new Error(`Property ${key} not handled in this debug test`);
        }
    }

    async debugRawObjectState() {
        this.log('Step 4: Debug raw object state after edit');

        const rawPlayerObject = this.leftPane.rawObjects[0];
        const nameSymbol = Object.getOwnPropertySymbols(rawPlayerObject).find(s => s.toString() === 'Symbol(@name)');
        const rawNameValue = rawPlayerObject[nameSymbol];

        this.log(`Raw name after edit: ${JSON.stringify(rawNameValue)}`);
        this.log(`Raw name as string: "${String.fromCharCode(...Array.from(rawNameValue))}"`);

        // Check if object is marked as modified
        this.log(`Object 0 marked as modified: ${this.modifiedObjects.left.has(0)}`);
        this.log(`Modified objects: [${Array.from(this.modifiedObjects.left).join(', ')}]`);
    }

    async testSaveProcess() {
        this.log('Step 5: Test save process');

        // Simulate the save process
        const updatedData = await this.reconstructFileWithModifications();

        const testFileName = 'tests/debug-property-edit.rxdata';
        fs.writeFileSync(testFileName, updatedData);

        this.log(`Original size: ${this.leftPane.data.length} bytes`);
        this.log(`Saved size: ${updatedData.length} bytes`);
        this.log(`Size difference: ${updatedData.length - this.leftPane.data.length} bytes`);

        // Verify the saved file contains the change
        const reloadedData = fs.readFileSync(testFileName);
        const reloadedObjects = this.parseFile(reloadedData);

        const reloadedPlayerObject = reloadedObjects[0];
        const nameSymbol = Object.getOwnPropertySymbols(reloadedPlayerObject).find(s => s.toString() === 'Symbol(@name)');
        const reloadedName = String.fromCharCode(...Array.from(reloadedPlayerObject[nameSymbol]));

        this.log(`Reloaded name: "${reloadedName}"`);

        if (reloadedName === 'DebugTestName') {
            this.log('✅ SUCCESS: Change was saved correctly!');
        } else {
            this.log('❌ FAILURE: Change was not saved!');
        }

        // Cleanup
        fs.unlinkSync(testFileName);
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
                rawObjects[i] = load(section);
            } catch (parseError) {
                // Skip failed sections
            }
        }

        return rawObjects;
    }

    async reconstructFileWithModifications() {
        const data = this.leftPane.data;
        const marshalHeaders = [];

        for (let i = 0; i < data.length - 1; i++) {
            if (data[i] === 4 && data[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        const newSections = [];

        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
            const section = data.slice(start, end);

            if (this.modifiedObjects.left.has(i)) {
                this.log(`Re-serializing modified object ${i}`);
                const serialized = dump(this.leftPane.rawObjects[i]);
                newSections.push(serialized);
            } else {
                this.log(`Preserving original object ${i}`);
                newSections.push(section);
            }
        }

        const totalLength = newSections.reduce((sum, section) => sum + section.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;

        for (const section of newSections) {
            result.set(section, offset);
            offset += section.length;
        }

        return result;
    }
}

// Run test
const test = new DebugPropertyEditTest();
test.runTest();