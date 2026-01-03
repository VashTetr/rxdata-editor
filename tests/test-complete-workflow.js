const fs = require('fs');
const { load, dump } = require('@hyrious/marshal');

/**
 * Complete Workflow Test: Simulate the full copy/paste operation with mapping
 * This test verifies that the Game old → Game new copy operation works correctly
 */

class CompleteWorkflowTest {
    constructor() {
        this.leftPane = {
            data: null,
            filePath: null,
            parsedData: null,
            rawObjects: null,
            objectMapping: null,
            selectedPath: null,
            selectedValue: null
        };
        this.rightPane = {
            data: null,
            filePath: null,
            parsedData: null,
            rawObjects: null,
            objectMapping: null,
            selectedPath: null,
            selectedValue: null
        };
        this.modifiedObjects = {
            left: new Set(),
            right: new Set()
        };
    }

    log(message) {
        console.log(`[WORKFLOW] ${message}`);
    }

    async runTest() {
        console.log('=== COMPLETE WORKFLOW TEST ===\n');
        console.log('This test simulates the complete copy/paste workflow with object mapping');

        try {
            await this.step1_LoadFiles();
            await this.step2_CreateMappings();
            await this.step3_FindBoxesObjects();
            await this.step4_SimulateCopyPaste();
            await this.step5_SaveAndVerify();

            console.log('\n🎉 COMPLETE WORKFLOW TEST PASSED!');
            console.log('The Game old → Game new copy/paste operation works correctly with object mapping.');

        } catch (error) {
            console.error(`\n❌ WORKFLOW TEST FAILED: ${error.message}`);
            console.error(`Stack: ${error.stack}`);
        }
    }

    async step1_LoadFiles() {
        this.log('Step 1: Load both save files');

        // Load Game new (left pane)
        await this.loadFileByPath('Game new.rxdata', 'left');

        // Load Game old (right pane)
        await this.loadFileByPath('Game old.rxdata', 'right');

        this.log(`Left pane (Game new): ${Object.keys(this.leftPane.parsedData).length} parsed objects`);
        this.log(`Right pane (Game old): ${Object.keys(this.rightPane.parsedData).length} parsed objects`);
    }

    async loadFileByPath(filePath, pane) {
        const data = fs.readFileSync(filePath);
        const paneData = this[pane + 'Pane'];
        paneData.filePath = filePath;
        paneData.data = data;

        // Parse like the app does
        const marshalHeaders = [];
        for (let i = 0; i < data.length - 1; i++) {
            if (data[i] === 4 && data[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        const parsedObjects = {};
        const rawObjects = {};
        let successfullyParsedCount = 0;
        const failedObjects = [];

        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
            const section = data.slice(start, end);

            try {
                const rawParsed = load(section);

                if (rawParsed !== null && rawParsed !== undefined) {
                    rawObjects[i] = rawParsed;
                    successfullyParsedCount++;

                    if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)) {
                        const symbols = Object.getOwnPropertySymbols(rawParsed);
                        const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                        if (rubyVars.length > 0) {
                            const processed = this.processRubyObject(rawParsed);
                            parsedObjects[i] = processed;
                        }
                    } else {
                        parsedObjects[i] = rawParsed;
                    }
                } else {
                    failedObjects.push(i);
                }
            } catch (parseError) {
                failedObjects.push(i);
                rawObjects[i] = null;
            }
        }

        paneData.parsedData = parsedObjects;
        paneData.rawObjects = rawObjects;
        this.modifiedObjects[pane].clear();
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

    convertByteArrayToString(data) {
        if (data instanceof Uint8Array) {
            return String.fromCharCode(...Array.from(data));
        } else if (Array.isArray(data)) {
            return String.fromCharCode(...data);
        } else {
            return data;
        }
    }

    async step2_CreateMappings() {
        this.log('Step 2: Create object mappings');

        this.leftPane.objectMapping = this.createObjectMapping(this.leftPane);
        this.rightPane.objectMapping = this.createObjectMapping(this.rightPane);

        if (this.leftPane.objectMapping) {
            this.log(`Left pane mapping: ${JSON.stringify(this.leftPane.objectMapping)}`);
        } else {
            this.log('Left pane: Standard layout, no mapping needed');
        }

        if (this.rightPane.objectMapping) {
            this.log(`Right pane mapping: ${JSON.stringify(this.rightPane.objectMapping)}`);
        } else {
            this.log('Right pane: Standard layout, no mapping needed');
        }
    }

    createObjectMapping(paneData) {
        const objectTypes = {};

        // Analyze each object
        for (const [index, obj] of Object.entries(paneData.rawObjects)) {
            if (!obj) continue;

            const indexNum = parseInt(index);
            let objectType = 'UNKNOWN';

            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                const symbols = Object.getOwnPropertySymbols(obj);
                const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                if (rubyVars.length > 0) {
                    const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                    const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                    const mapsSymbol = symbols.find(sym => sym.toString() === 'Symbol(@maps)');
                    const dataSymbol = symbols.find(sym => sym.toString() === 'Symbol(@data)');

                    if (nameSymbol) {
                        objectType = 'PLAYER';
                    } else if (boxesSymbol && Array.isArray(obj[boxesSymbol])) {
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
            } else if (typeof obj === 'number') {
                objectType = 'NUMBER';
            }

            objectTypes[indexNum] = objectType;
        }

        // Check if mapping is needed
        const playerIndices = Object.keys(objectTypes).filter(i => objectTypes[i] === 'PLAYER');
        const boxesIndices = Object.keys(objectTypes).filter(i => objectTypes[i] === 'BOXES');

        if (playerIndices.length === 0 || boxesIndices.length === 0 ||
            !playerIndices.includes('0') || !boxesIndices.includes('14')) {

            // Create mapping
            const mapping = {};
            let mappedIndex = 0;

            const priorityOrder = ['PLAYER', 'NUMBER', 'SYSTEM', 'OPTIONS', 'DATA', 'SCREEN', 'MAPS', 'METADATA', 'EVENTS', 'BOXES'];

            for (const type of priorityOrder) {
                const indices = Object.keys(objectTypes).filter(i => objectTypes[i] === type);
                for (const originalIndex of indices) {
                    if (paneData.rawObjects[originalIndex] && mappedIndex <= 14) {
                        mapping[mappedIndex] = parseInt(originalIndex);
                        mappedIndex++;
                    }
                }
            }

            return mapping;
        }

        return null;
    }

    async step3_FindBoxesObjects() {
        this.log('Step 3: Find boxes objects in both panes');

        // Find boxes in left pane (Game new)
        let leftBoxesIndex = null;
        if (this.leftPane.objectMapping) {
            leftBoxesIndex = Object.keys(this.leftPane.objectMapping).find(k => {
                const originalIndex = this.leftPane.objectMapping[k];
                const obj = this.leftPane.rawObjects[originalIndex];
                return this.isBoxesObject(obj);
            });
        } else {
            leftBoxesIndex = Object.keys(this.leftPane.rawObjects).find(i => {
                return this.isBoxesObject(this.leftPane.rawObjects[i]);
            });
        }

        // Find boxes in right pane (Game old)
        let rightBoxesIndex = null;
        if (this.rightPane.objectMapping) {
            rightBoxesIndex = Object.keys(this.rightPane.objectMapping).find(k => {
                const originalIndex = this.rightPane.objectMapping[k];
                const obj = this.rightPane.rawObjects[originalIndex];
                return this.isBoxesObject(obj);
            });
        } else {
            rightBoxesIndex = Object.keys(this.rightPane.rawObjects).find(i => {
                return this.isBoxesObject(this.rightPane.rawObjects[i]);
            });
        }

        this.log(`Left pane boxes at mapped index: ${leftBoxesIndex || 'NOT FOUND'}`);
        this.log(`Right pane boxes at mapped index: ${rightBoxesIndex || 'NOT FOUND'}`);

        if (!leftBoxesIndex || !rightBoxesIndex) {
            throw new Error('Boxes objects not found in one or both panes');
        }

        this.leftBoxesIndex = leftBoxesIndex;
        this.rightBoxesIndex = rightBoxesIndex;
    }

    isBoxesObject(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;

        const symbols = Object.getOwnPropertySymbols(obj);
        const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
        return boxesSymbol && Array.isArray(obj[boxesSymbol]);
    }

    async step4_SimulateCopyPaste() {
        this.log('Step 4: Simulate copy/paste operation (Game old boxes → Game new)');

        // Get the source boxes (from right pane - Game old)
        const rightOriginalIndex = this.rightPane.objectMapping ?
            this.rightPane.objectMapping[this.rightBoxesIndex] :
            parseInt(this.rightBoxesIndex);

        const sourceBoxesObj = this.rightPane.rawObjects[rightOriginalIndex];
        const boxesSymbol = Object.getOwnPropertySymbols(sourceBoxesObj).find(sym => sym.toString() === 'Symbol(@boxes)');
        const sourceBoxes = sourceBoxesObj[boxesSymbol];

        this.log(`Source boxes: ${sourceBoxes.length} boxes from Game old object ${rightOriginalIndex} (mapped index ${this.rightBoxesIndex})`);

        // Get the target boxes (from left pane - Game new)
        const leftOriginalIndex = this.leftPane.objectMapping ?
            this.leftPane.objectMapping[this.leftBoxesIndex] :
            parseInt(this.leftBoxesIndex);

        const targetBoxesObj = this.leftPane.rawObjects[leftOriginalIndex];
        const targetBoxesSymbol = Object.getOwnPropertySymbols(targetBoxesObj).find(sym => sym.toString() === 'Symbol(@boxes)');
        const originalTargetBoxes = targetBoxesObj[targetBoxesSymbol];

        this.log(`Target boxes: ${originalTargetBoxes.length} boxes in Game new object ${leftOriginalIndex} (mapped index ${this.leftBoxesIndex})`);

        // Perform the copy operation (direct assignment to preserve Ruby symbols)
        targetBoxesObj[targetBoxesSymbol] = sourceBoxes;

        // Mark the target object as modified
        this.modifiedObjects.left.add(leftOriginalIndex);

        this.log(`✅ Copy operation completed: Game old boxes copied to Game new`);
        this.log(`Modified object ${leftOriginalIndex} in left pane`);

        // Verify the copy
        const newTargetBoxes = targetBoxesObj[targetBoxesSymbol];
        if (newTargetBoxes === sourceBoxes) {
            this.log('✅ Copy verification: Boxes reference copied successfully');
        } else {
            throw new Error('Copy verification failed: Boxes not copied correctly');
        }
    }

    async step5_SaveAndVerify() {
        this.log('Step 5: Save modified file and verify');

        // Reconstruct the file with modifications
        const updatedData = await this.reconstructFileWithModifications(this.leftPane);

        const testFileName = 'tests/test-complete-workflow.rxdata';
        fs.writeFileSync(testFileName, updatedData);

        this.log(`Original Game new size: ${this.leftPane.data.length} bytes`);
        this.log(`Modified file size: ${updatedData.length} bytes`);
        this.log(`Size difference: ${updatedData.length - this.leftPane.data.length} bytes`);

        // Verify the saved file
        const reloadedData = fs.readFileSync(testFileName);
        const reloadedObjects = this.parseFile(reloadedData);

        // Find the boxes object in the reloaded file
        let reloadedBoxesObj = null;
        for (const [index, obj] of Object.entries(reloadedObjects)) {
            if (this.isBoxesObject(obj)) {
                reloadedBoxesObj = obj;
                this.log(`Reloaded boxes object found at index ${index}`);
                break;
            }
        }

        if (!reloadedBoxesObj) {
            throw new Error('Boxes object not found in reloaded file');
        }

        const reloadedBoxesSymbol = Object.getOwnPropertySymbols(reloadedBoxesObj).find(sym => sym.toString() === 'Symbol(@boxes)');
        const reloadedBoxes = reloadedBoxesObj[reloadedBoxesSymbol];

        this.log(`Reloaded file has ${reloadedBoxes.length} boxes`);

        // Compare with original Game old boxes
        const rightOriginalIndex = this.rightPane.objectMapping ?
            this.rightPane.objectMapping[this.rightBoxesIndex] :
            parseInt(this.rightBoxesIndex);

        const originalGameOldBoxes = this.rightPane.rawObjects[rightOriginalIndex];
        const originalBoxesSymbol = Object.getOwnPropertySymbols(originalGameOldBoxes).find(sym => sym.toString() === 'Symbol(@boxes)');
        const originalBoxes = originalGameOldBoxes[originalBoxesSymbol];

        if (reloadedBoxes.length === originalBoxes.length) {
            this.log('✅ Verification: Box count matches original Game old');
        } else {
            throw new Error(`Verification failed: Expected ${originalBoxes.length} boxes, got ${reloadedBoxes.length}`);
        }

        // Cleanup
        fs.unlinkSync(testFileName);
        this.log('Test file cleaned up');
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

    async reconstructFileWithModifications(paneData) {
        const data = paneData.data;
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
                // Re-serialize modified object
                const serialized = dump(paneData.rawObjects[i]);
                newSections.push(serialized);
            } else {
                // Use original binary data
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
const test = new CompleteWorkflowTest();
test.runTest();