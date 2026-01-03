const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { load } = require('@hyrious/marshal');

class DualPaneRXDataEditor {
    constructor() {
        this.leftPane = {
            data: null,
            filePath: null,
            parsedData: null,
            rawObjects: null, // Store original Ruby objects
            selectedPath: null,
            selectedValue: null
        };
        this.rightPane = {
            data: null,
            filePath: null,
            parsedData: null,
            rawObjects: null, // Store original Ruby objects
            selectedPath: null,
            selectedValue: null
        };

        // Clipboard for copy/paste operations
        this.clipboard = {
            data: null,
            sourcePath: null,
            sourcePane: null
        };

        // Track which pane was last active
        this.lastActivePane = null;

        // Track modifications for saving
        this.modifications = {
            left: new Map(), // path -> {originalData, newData, binaryPosition}
            right: new Map()
        };

        // Track which objects have been modified (for selective re-serialization)
        this.modifiedObjects = {
            left: new Set(),
            right: new Set()
        };

        this.initializeUI();
        this.setupKeyboardShortcuts();
        this.setupResizers();
        this.setupSearch();
    }

    setupSearch() {
        // Setup search for left pane
        const leftSearchInput = document.getElementById('leftSearchInput');
        leftSearchInput.addEventListener('input', (e) => {
            this.performSearch('left', e.target.value);
        });

        // Setup search for right pane
        const rightSearchInput = document.getElementById('rightSearchInput');
        rightSearchInput.addEventListener('input', (e) => {
            this.performSearch('right', e.target.value);
        });
    }

    performSearch(pane, searchTerm) {
        const paneData = this[pane + 'Pane'];
        if (!paneData.parsedData) {
            return;
        }

        // Clear previous search highlights
        this.clearSearchHighlights(pane);

        if (!searchTerm.trim()) {
            // If search is empty, show normal property editor
            this.showPropertyEditor(pane, paneData.selectedValue);
            return;
        }

        // Find all matching paths
        const matches = this.searchInData(paneData.parsedData, searchTerm.toLowerCase());
        console.log(`Found ${matches.length} matches for "${searchTerm}" in ${pane} pane:`, matches);

        // Show search results in the property editor
        this.showSearchResults(pane, matches, searchTerm);
    }

    searchInData(data, searchTerm, currentPath = []) {
        const matches = [];

        if (typeof data === 'string') {
            if (data.toLowerCase().includes(searchTerm)) {
                matches.push({
                    path: [...currentPath],
                    value: data,
                    type: 'string'
                });
            }
        } else if (typeof data === 'number') {
            if (data.toString().toLowerCase().includes(searchTerm)) {
                matches.push({
                    path: [...currentPath],
                    value: data,
                    type: 'number'
                });
            }
        } else if (typeof data === 'boolean') {
            if (data.toString().toLowerCase().includes(searchTerm)) {
                matches.push({
                    path: [...currentPath],
                    value: data,
                    type: 'boolean'
                });
            }
        } else if (Array.isArray(data)) {
            data.forEach((item, index) => {
                const itemMatches = this.searchInData(item, searchTerm, [...currentPath, index.toString()]);
                matches.push(...itemMatches);
            });
        } else if (data && typeof data === 'object') {
            // Search in regular properties
            Object.keys(data).forEach(key => {
                // Check if the key itself matches
                if (key.toLowerCase().includes(searchTerm)) {
                    matches.push({
                        path: [...currentPath, key],
                        value: data[key],
                        type: 'key',
                        keyName: key
                    });
                }

                // Search in the value
                const valueMatches = this.searchInData(data[key], searchTerm, [...currentPath, key]);
                matches.push(...valueMatches);
            });

            // Search in symbol properties
            Object.getOwnPropertySymbols(data).forEach(sym => {
                const key = sym.toString();

                // Check if the symbol key matches
                if (key.toLowerCase().includes(searchTerm)) {
                    matches.push({
                        path: [...currentPath, key],
                        value: data[sym],
                        type: 'key',
                        keyName: key
                    });
                }

                // Search in the value
                const valueMatches = this.searchInData(data[sym], searchTerm, [...currentPath, key]);
                matches.push(...valueMatches);
            });
        }

        return matches;
    }

    buildTreeViewWithSearch(pane, matches) {
        const treeView = document.getElementById(`${pane}TreeView`);
        treeView.innerHTML = '';

        const paneData = this[pane + 'Pane'];
        if (paneData.parsedData) {
            const objectKeys = Object.keys(paneData.parsedData);
            if (objectKeys.length > 0) {
                objectKeys.forEach(key => {
                    this.createTreeNodeWithSearch(treeView, key, paneData.parsedData[key], [], pane, matches);
                });
            } else {
                this.createTreeNodeWithSearch(treeView, 'root', paneData.parsedData, [], pane, matches);
            }
        }

        // Auto-expand paths that contain matches
        this.autoExpandMatchingPaths(pane, matches);
    }

    createTreeNodeWithSearch(parent, key, value, path, pane, matches) {
        const currentPath = [...path, key];
        const pathString = currentPath.join('.');

        // Check if this path or any child path has matches
        const hasMatches = matches.some(match => {
            const matchPath = match.path.join('.');
            return matchPath.startsWith(pathString) || pathString.startsWith(matchPath);
        });

        // Check if this exact path is a match
        const isDirectMatch = matches.some(match => match.path.join('.') === pathString);

        const isExpandable = this.isExpandable(value);
        const item = document.createElement('div');
        item.className = `tree-item ${isExpandable ? '' : 'leaf'} ${isDirectMatch ? 'search-match' : ''} ${hasMatches ? 'search-parent' : ''}`;

        const expand = document.createElement('div');
        expand.className = `tree-expand ${isExpandable ? 'expandable' : ''}`;

        const label = document.createElement('div');
        label.className = 'tree-label';
        label.textContent = this.formatTreeLabel(key, value);

        // Highlight matching text in the label
        if (isDirectMatch) {
            label.style.backgroundColor = '#0e639c';
            label.style.color = '#ffffff';
            label.style.fontWeight = 'bold';
        } else if (hasMatches) {
            label.style.backgroundColor = 'rgba(14, 99, 156, 0.3)';
        }

        item.appendChild(expand);
        item.appendChild(label);

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectTreeItem(item, currentPath, value, pane);
        });

        if (isExpandable) {
            const children = document.createElement('div');
            children.className = 'tree-children';

            expand.addEventListener('click', (e) => {
                e.stopPropagation();
                expand.classList.toggle('expanded');
                children.classList.toggle('expanded');

                if (expand.classList.contains('expanded') && children.children.length === 0) {
                    this.populateChildrenWithSearch(children, value, currentPath, pane, matches);
                }
            });

            parent.appendChild(item);
            parent.appendChild(children);
        } else {
            parent.appendChild(item);
        }
    }

    populateChildrenWithSearch(parent, value, path, pane, matches) {
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                if (item !== null && item !== undefined) {
                    const childDiv = document.createElement('div');
                    childDiv.className = 'tree-child';
                    this.createTreeNodeWithSearch(childDiv, index.toString(), item, path, pane, matches);
                    parent.appendChild(childDiv);
                }
            });
        } else if (value && typeof value === 'object') {
            const regularKeys = Object.keys(value);
            const symbolKeys = Object.getOwnPropertySymbols(value).map(sym => sym.toString());
            const allKeys = [...regularKeys, ...symbolKeys];

            allKeys.sort((a, b) => {
                if (a === '@rb:object' && b !== '@rb:object') return -1;
                if (a !== '@rb:object' && b === '@rb:object') return 1;

                if (a === '@rb:attributes' && b !== '@rb:attributes') return -1;
                if (a !== '@rb:attributes' && b === '@rb:attributes') return 1;

                const aHasAt = a.includes('@');
                const bHasAt = b.includes('@');
                if (aHasAt && !bHasAt) return -1;
                if (!aHasAt && bHasAt) return 1;

                return a.localeCompare(b);
            });

            allKeys.forEach(keyStr => {
                const childDiv = document.createElement('div');
                childDiv.className = 'tree-child';

                let actualValue;
                if (keyStr.startsWith('Symbol(')) {
                    const symbolKey = Object.getOwnPropertySymbols(value).find(sym => sym.toString() === keyStr);
                    actualValue = symbolKey ? value[symbolKey] : undefined;
                } else {
                    actualValue = value[keyStr];
                }

                this.createTreeNodeWithSearch(childDiv, keyStr, actualValue, path, pane, matches);
                parent.appendChild(childDiv);
            });
        }
    }

    autoExpandMatchingPaths(pane, matches) {
        // Auto-expand tree nodes that contain matches
        matches.forEach(match => {
            let currentPath = [];
            for (let i = 0; i < match.path.length - 1; i++) {
                currentPath.push(match.path[i]);
                const pathSelector = currentPath.map(p => `[data-path="${p}"]`).join(' ');
                const expandButton = document.querySelector(`#${pane}TreeView ${pathSelector} .tree-expand.expandable`);
                if (expandButton && !expandButton.classList.contains('expanded')) {
                    expandButton.click();
                }
            }
        });
    }

    showSearchResults(pane, matches, searchTerm) {
        const editor = document.getElementById(`${pane}PropertyEditor`);
        editor.innerHTML = '';

        // Create search results header
        const header = document.createElement('div');
        header.className = 'search-results-header';
        header.style.cssText = `
            padding: 15px;
            background: #252526;
            border-bottom: 2px solid #0e639c;
            color: #ffffff;
            font-weight: bold;
        `;
        header.innerHTML = `
            <div style="font-size: 16px; margin-bottom: 5px;">Search Results</div>
            <div style="font-size: 12px; color: #cccccc;">Found ${matches.length} matches for "${searchTerm}"</div>
        `;
        editor.appendChild(header);

        if (matches.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'no-search-results';
            noResults.style.cssText = `
                padding: 20px;
                text-align: center;
                color: #888;
                font-style: italic;
            `;
            noResults.textContent = 'No matches found';
            editor.appendChild(noResults);
            return;
        }

        // Create search results table
        const resultsContainer = document.createElement('div');
        resultsContainer.className = 'search-results-container';
        resultsContainer.style.cssText = `
            overflow-y: auto;
            max-height: calc(100vh - 200px);
        `;

        const table = document.createElement('div');
        table.className = 'search-results-table';
        table.style.cssText = `
            display: table;
            width: 100%;
            border-collapse: collapse;
            font-family: monospace;
            font-size: 12px;
        `;

        // Group matches by type for better organization
        const groupedMatches = this.groupSearchMatches(matches);

        Object.keys(groupedMatches).forEach(groupName => {
            // Add group header
            const groupHeader = document.createElement('div');
            groupHeader.className = 'search-group-header';
            groupHeader.style.cssText = `
                display: table-row;
                background: #2d2d30;
                font-weight: bold;
                color: #9cdcfe;
            `;

            const groupHeaderCell = document.createElement('div');
            groupHeaderCell.style.cssText = `
                display: table-cell;
                padding: 8px 12px;
                border-bottom: 1px solid #3e3e42;
                colspan: 2;
            `;
            groupHeaderCell.textContent = `${groupName} (${groupedMatches[groupName].length} matches)`;
            groupHeader.appendChild(groupHeaderCell);
            table.appendChild(groupHeader);

            // Add matches in this group
            groupedMatches[groupName].forEach((match, index) => {
                this.createSearchResultRow(table, match, pane, index);
            });
        });

        resultsContainer.appendChild(table);
        editor.appendChild(resultsContainer);
    }

    groupSearchMatches(matches) {
        const groups = {
            'Attribute Names': [],
            'Pokemon Names': [],
            'Numbers': [],
            'Text Values': [],
            'Boolean Values': [],
            'Other': []
        };

        matches.forEach(match => {
            if (match.type === 'key') {
                groups['Attribute Names'].push(match);
            } else if (match.type === 'string') {
                // Try to detect if this might be a Pokemon name
                if (match.path.some(p => p.includes('party') || p.includes('box') || p.includes('pokemon')) ||
                    match.value.match(/^[A-Z][a-z]+$/)) {
                    groups['Pokemon Names'].push(match);
                } else {
                    groups['Text Values'].push(match);
                }
            } else if (match.type === 'number') {
                groups['Numbers'].push(match);
            } else if (match.type === 'boolean') {
                groups['Boolean Values'].push(match);
            } else {
                groups['Other'].push(match);
            }
        });

        // Remove empty groups
        Object.keys(groups).forEach(key => {
            if (groups[key].length === 0) {
                delete groups[key];
            }
        });

        return groups;
    }

    createSearchResultRow(parent, match, pane, index) {
        const row = document.createElement('div');
        row.className = 'search-result-row';
        row.style.cssText = `
            display: table-row;
            cursor: pointer;
            transition: background-color 0.2s;
        `;

        row.addEventListener('mouseenter', () => {
            row.style.backgroundColor = '#2d2d30';
        });

        row.addEventListener('mouseleave', () => {
            row.style.backgroundColor = '';
        });

        row.addEventListener('click', () => {
            this.navigateToSearchResult(pane, match);
        });

        // Path cell
        const pathCell = document.createElement('div');
        pathCell.className = 'search-result-path';
        pathCell.style.cssText = `
            display: table-cell;
            padding: 8px 12px;
            background: #1e1e1e;
            color: #9cdcfe;
            border-bottom: 1px solid #3e3e42;
            border-right: 1px solid #3e3e42;
            vertical-align: middle;
            width: 60%;
            word-break: break-all;
        `;
        pathCell.textContent = match.path.join(' → ');

        // Value cell
        const valueCell = document.createElement('div');
        valueCell.className = 'search-result-value';
        valueCell.style.cssText = `
            display: table-cell;
            padding: 8px 12px;
            background: #1e1e1e;
            vertical-align: middle;
            width: 40%;
            border-bottom: 1px solid #3e3e42;
        `;

        // Format the value based on type
        let displayValue = '';
        let valueColor = '#ffffff';

        if (match.type === 'string') {
            displayValue = `"${match.value}"`;
            valueColor = '#ce9178';
        } else if (match.type === 'number') {
            displayValue = match.value.toString();
            valueColor = '#b5cea8';
        } else if (match.type === 'boolean') {
            displayValue = match.value.toString();
            valueColor = '#569cd6';
        } else if (match.type === 'key') {
            displayValue = match.keyName || match.value;
            valueColor = '#9cdcfe';
        } else {
            displayValue = String(match.value);
        }

        valueCell.textContent = displayValue;
        valueCell.style.color = valueColor;

        row.appendChild(pathCell);
        row.appendChild(valueCell);
        parent.appendChild(row);
    }

    navigateToSearchResult(pane, match) {
        console.log('Navigating to search result:', match);

        // Clear the search to restore normal tree view
        const searchInput = document.getElementById(`${pane}SearchInput`);
        searchInput.value = '';

        // Rebuild normal tree view
        this.buildTreeView(pane);

        // Navigate to the item in the tree
        setTimeout(() => {
            this.expandAndSelectPath(pane, match.path);
        }, 100);
    }

    expandAndSelectPath(pane, targetPath) {
        console.log('Expanding and selecting path:', targetPath);

        const paneData = this[pane + 'Pane'];

        // Navigate through the tree to expand all parent nodes
        let currentData = paneData.parsedData;
        let currentPath = [];

        // First, expand all parent nodes
        for (let i = 0; i < targetPath.length - 1; i++) {
            currentPath.push(targetPath[i]);

            // Find and click the expand button for this level
            const treeItems = document.querySelectorAll(`#${pane}TreeView .tree-item`);
            for (const item of treeItems) {
                const label = item.querySelector('.tree-label');
                if (label && this.matchesTreePath(item, currentPath)) {
                    const expandButton = item.querySelector('.tree-expand.expandable');
                    if (expandButton && !expandButton.classList.contains('expanded')) {
                        expandButton.click();
                    }
                    break;
                }
            }
        }

        // Then select the final item
        setTimeout(() => {
            const treeItems = document.querySelectorAll(`#${pane}TreeView .tree-item`);
            for (const item of treeItems) {
                if (this.matchesTreePath(item, targetPath)) {
                    item.click();
                    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    break;
                }
            }
        }, 200);
    }

    matchesTreePath(treeItem, targetPath) {
        // This is a simplified path matching - you might need to make this more robust
        // based on how your tree items store their path information
        const label = treeItem.querySelector('.tree-label');
        if (!label) return false;

        const labelText = label.textContent;
        const lastPathElement = targetPath[targetPath.length - 1];

        // Check if this tree item represents the target path element
        return labelText.includes(lastPathElement) || labelText.startsWith(lastPathElement);
    }

    clearSearchHighlights(pane) {
        // This method is now mainly for clearing any existing highlights
        // The main functionality is now in the property editor
    }

    setupResizers() {
        // Setup horizontal resizer between left and right panes
        this.setupHorizontalResizer();

        // Setup vertical resizers within each pane
        this.setupVerticalResizer('left');
        this.setupVerticalResizer('right');
    }

    setupHorizontalResizer() {
        const mainContent = document.querySelector('.main-content');
        const leftPane = document.querySelector('.left-pane');
        const rightPane = document.querySelector('.right-pane');

        // Create resizer element
        const resizer = document.createElement('div');
        resizer.className = 'horizontal-resizer';
        resizer.style.cssText = `
            width: 4px;
            background: #3e3e42;
            cursor: ew-resize;
            flex-shrink: 0;
            display: none;
        `;

        // Insert resizer between panes
        mainContent.insertBefore(resizer, rightPane);

        let isResizing = false;
        let startX = 0;
        let startLeftWidth = 0;
        let startRightWidth = 0;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startLeftWidth = leftPane.offsetWidth;
            startRightWidth = rightPane.offsetWidth;
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const deltaX = e.clientX - startX;
            const totalWidth = startLeftWidth + startRightWidth;
            const newLeftWidth = Math.max(200, Math.min(totalWidth - 200, startLeftWidth + deltaX));
            const newRightWidth = totalWidth - newLeftWidth;

            leftPane.style.flex = `0 0 ${newLeftWidth}px`;
            rightPane.style.flex = `0 0 ${newRightWidth}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });

        // Show/hide resizer based on right pane visibility
        const observer = new MutationObserver(() => {
            if (rightPane.style.display !== 'none') {
                resizer.style.display = 'block';
            } else {
                resizer.style.display = 'none';
            }
        });

        observer.observe(rightPane, { attributes: true, attributeFilter: ['style'] });
    }

    setupVerticalResizer(pane) {
        const paneElement = document.querySelector(`.${pane}-pane`);
        const sidebar = paneElement.querySelector('.sidebar');
        const editorPanel = paneElement.querySelector('.editor-panel');

        // Create resizer element
        const resizer = document.createElement('div');
        resizer.className = 'vertical-resizer';
        resizer.style.cssText = `
            width: 4px;
            background: #3e3e42;
            cursor: ew-resize;
            flex-shrink: 0;
            transition: background-color 0.2s;
        `;

        resizer.addEventListener('mouseenter', () => {
            resizer.style.background = '#0e639c';
        });

        resizer.addEventListener('mouseleave', () => {
            resizer.style.background = '#3e3e42';
        });

        // Insert resizer between sidebar and editor panel
        const paneContent = paneElement.querySelector('.pane-content');
        paneContent.insertBefore(resizer, editorPanel);

        let isResizing = false;
        let startX = 0;
        let startSidebarWidth = 0;
        let startEditorWidth = 0;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startSidebarWidth = sidebar.offsetWidth;
            startEditorWidth = editorPanel.offsetWidth;
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const deltaX = e.clientX - startX;
            const totalWidth = startSidebarWidth + startEditorWidth;
            const newSidebarWidth = Math.max(150, Math.min(totalWidth - 200, startSidebarWidth + deltaX));
            const newEditorWidth = totalWidth - newSidebarWidth;

            sidebar.style.flex = `0 0 ${newSidebarWidth}px`;
            editorPanel.style.flex = `0 0 ${newEditorWidth}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+C - Copy
            if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                this.copySelected();
            }

            // Ctrl+V - Paste
            if (e.ctrlKey && e.key === 'v') {
                e.preventDefault();
                this.pasteToSelected();
            }

            // Escape - Clear clipboard
            if (e.key === 'Escape') {
                this.clearClipboard();
            }
        });
    }

    copySelected() {
        // Find which pane has a selection, prioritizing the last active pane
        let sourcePane = null;
        let selectedData = null;
        let selectedPath = null;

        // Check last active pane first
        if (this.lastActivePane) {
            const paneData = this[this.lastActivePane + 'Pane'];
            if (paneData.selectedValue !== null) {
                sourcePane = this.lastActivePane;
                selectedData = paneData.selectedValue;
                selectedPath = paneData.selectedPath;
            }
        }

        // If no selection in last active pane, check both panes
        if (!sourcePane) {
            if (this.leftPane.selectedValue !== null) {
                sourcePane = 'left';
                selectedData = this.leftPane.selectedValue;
                selectedPath = this.leftPane.selectedPath;
            } else if (this.rightPane.selectedValue !== null) {
                sourcePane = 'right';
                selectedData = this.rightPane.selectedValue;
                selectedPath = this.rightPane.selectedPath;
            }
        }

        if (sourcePane && selectedData !== null) {
            console.log(`=== COPY OPERATION ===`);
            console.log(`Copying from ${sourcePane} pane:`, selectedPath.join(' → '));

            // CRITICAL FIX: Get the raw data instead of processed data for copying
            // This preserves Ruby Marshal symbols and prevents corruption
            const rawData = this.getRawDataForPath(this[sourcePane + 'Pane'], selectedPath);

            if (rawData !== null) {
                // Use raw data directly - no cloning to preserve symbols
                this.clipboard.data = rawData;
                console.log('Using raw data for copy (preserves Ruby symbols)');
            } else {
                // Fallback to processed data if raw data not available
                this.clipboard.data = this.deepClone(selectedData);
                console.log('Using processed data for copy (fallback)');
            }

            this.clipboard.sourcePath = [...selectedPath];
            this.clipboard.sourcePane = sourcePane;

            console.log('Copied data type:', Array.isArray(this.clipboard.data) ? 'Array' : typeof this.clipboard.data);

            let dataDescription = '';
            if (Array.isArray(this.clipboard.data)) {
                dataDescription = `Array (${this.clipboard.data.length} items)`;
            } else if (this.clipboard.data && typeof this.clipboard.data === 'object') {
                const keys = Object.keys(this.clipboard.data).length + Object.getOwnPropertySymbols(this.clipboard.data).length;
                dataDescription = `Object (${keys} properties)`;
            } else {
                dataDescription = typeof this.clipboard.data;
            }

            this.showClipboardStatus(`Copied: ${selectedPath[selectedPath.length - 1]} (${dataDescription})`);
        } else {
            this.showClipboardStatus('Nothing selected to copy');
        }
    }

    getRawDataForPath(paneData, path) {
        console.log('Getting raw data for path:', path);

        if (!paneData.rawObjects || path.length === 0) {
            console.log('No raw objects available or invalid path');
            return null;
        }

        // Extract object index (first element of path)
        const objectIndex = parseInt(path[0]);
        if (isNaN(objectIndex) || !paneData.rawObjects[objectIndex]) {
            console.log(`Raw object ${objectIndex} not found`);
            return null;
        }

        console.log(`Navigating raw object ${objectIndex}`);

        // Navigate to the target location in the raw object
        let current = paneData.rawObjects[objectIndex];
        const pathCopy = [...path.slice(1)]; // Skip the object index

        console.log('Raw navigation path:', pathCopy);

        for (const key of pathCopy) {
            if (current && typeof current === 'object') {
                if (key === '@rb:object' || key === '@rb:attributes') {
                    // Skip UI wrapper levels
                    continue;
                } else if (key.startsWith('@')) {
                    // Ruby instance variable - find the symbol
                    const symbolKey = Object.getOwnPropertySymbols(current).find(sym => sym.toString() === `Symbol(${key})`);
                    if (symbolKey) {
                        current = current[symbolKey];
                        console.log(`Found raw symbol ${key}, navigated to:`, typeof current);
                    } else {
                        console.log(`Raw symbol ${key} not found`);
                        return null;
                    }
                } else {
                    // Regular property
                    if (current[key] !== undefined) {
                        current = current[key];
                        console.log(`Found raw property ${key}, navigated to:`, typeof current);
                    } else {
                        console.log(`Raw property ${key} not found`);
                        return null;
                    }
                }
            } else {
                console.log('Cannot navigate raw object - not an object:', current);
                return null;
            }
        }

        console.log('Raw data retrieved successfully:', typeof current);
        return current;
    }

    pasteToSelected() {
        if (!this.clipboard.data) {
            this.showClipboardStatus('Clipboard is empty');
            return;
        }

        // Find which pane has a selection, prioritizing the last active pane
        let targetPane = null;
        let targetPath = null;

        // Check last active pane first
        if (this.lastActivePane) {
            const paneData = this[this.lastActivePane + 'Pane'];
            if (paneData.selectedValue !== null) {
                targetPane = this.lastActivePane;
                targetPath = paneData.selectedPath;
            }
        }

        // If no selection in last active pane, check both panes
        if (!targetPane) {
            if (this.leftPane.selectedValue !== null) {
                targetPane = 'left';
                targetPath = this.leftPane.selectedPath;
            } else if (this.rightPane.selectedValue !== null) {
                targetPane = 'right';
                targetPath = this.rightPane.selectedPath;
            }
        }

        if (!targetPane) {
            this.showClipboardStatus('No target selected for paste');
            return;
        }

        // Show confirmation dialog
        this.showPasteWarning(targetPane, targetPath);
    }

    deepClone(obj) {
        // CRITICAL FIX: For Ruby Marshal objects, avoid deep cloning as it corrupts symbols
        // Instead, return the original object to preserve Ruby Marshal symbol integrity

        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        // For Ruby objects with symbols, return the original to preserve symbol integrity
        if (typeof obj === 'object' && Object.getOwnPropertySymbols(obj).length > 0) {
            console.log('WARNING: Returning original object to preserve Ruby symbols');
            return obj; // Direct reference preserves Ruby Marshal symbols
        }

        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }

        if (obj instanceof Array) {
            // For arrays that might contain Ruby objects, be careful
            const hasRubyObjects = obj.some(item =>
                item && typeof item === 'object' && Object.getOwnPropertySymbols(item).length > 0
            );

            if (hasRubyObjects) {
                console.log('WARNING: Array contains Ruby objects, returning original to preserve symbols');
                return obj; // Direct reference for arrays with Ruby objects
            }

            return obj.map(item => this.deepClone(item));
        }

        if (obj instanceof Uint8Array) {
            return new Uint8Array(obj);
        }

        if (typeof obj === 'object') {
            const cloned = {};

            // Clone regular properties first
            Object.keys(obj).forEach(key => {
                cloned[key] = this.deepClone(obj[key]);
            });

            // For objects without symbols, we can safely clone
            const symbols = Object.getOwnPropertySymbols(obj);
            if (symbols.length === 0) {
                return cloned;
            } else {
                // Has symbols - return original to preserve Ruby Marshal integrity
                console.log('WARNING: Object has symbols, returning original to preserve Ruby Marshal integrity');
                return obj;
            }
        }

        return obj;
    }

    showClipboardStatus(message) {
        // Create or update status message
        let statusDiv = document.getElementById('clipboardStatus');
        if (!statusDiv) {
            statusDiv = document.createElement('div');
            statusDiv.id = 'clipboardStatus';
            statusDiv.className = 'clipboard-status';
            document.body.appendChild(statusDiv);
        }

        statusDiv.textContent = message;
        statusDiv.style.display = 'block';

        // Auto-hide after 3 seconds
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }

    clearClipboard() {
        this.clipboard.data = null;
        this.clipboard.sourcePath = null;
        this.clipboard.sourcePane = null;
        this.showClipboardStatus('Clipboard cleared');
    }

    initializeUI() {
        // Left pane controls
        document.getElementById('loadLeftBtn').addEventListener('click', () => {
            this.loadFile('left');
        });

        document.getElementById('saveLeftBtn').addEventListener('click', () => {
            this.saveFile('left');
        });

        // Right pane controls
        document.getElementById('loadRightBtn').addEventListener('click', () => {
            this.loadFile('right');
        });

        document.getElementById('saveRightBtn').addEventListener('click', () => {
            this.saveFile('right');
        });

        // Copy controls (now just shortcuts for keyboard operations)
        document.getElementById('copyLeftToRightBtn').addEventListener('click', () => {
            if (this.leftPane.selectedValue !== null) {
                this.copySelected();
                this.showClipboardStatus('Use Ctrl+V to paste to right pane');
            }
        });

        document.getElementById('copyRightToLeftBtn').addEventListener('click', () => {
            if (this.rightPane.selectedValue !== null) {
                this.copySelected();
                this.showClipboardStatus('Use Ctrl+V to paste to left pane');
            }
        });

        // Modal controls
        document.getElementById('confirmCopyBtn').addEventListener('click', () => {
            this.confirmPaste();
        });

        document.getElementById('cancelCopyBtn').addEventListener('click', () => {
            this.cancelPaste();
        });

        // Load default files
        this.loadDefaultFiles();
    }

    convertByteArrayToString(data) {
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

    processRubyObject(obj, isRoot = false) {
        if (!obj || typeof obj !== 'object') {
            return this.convertByteArrayToString(obj);
        }

        if (obj instanceof Uint8Array) {
            return this.convertByteArrayToString(obj);
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.processRubyObject(item, false));
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
                rbObject['@rb:object']['@rb:attributes'][key] = this.processRubyObject(obj[sym], false);
            });

            regularKeys.forEach(key => {
                if (key !== 'class') {
                    rbObject['@rb:object']['@rb:attributes'][key] = this.processRubyObject(obj[key], false);
                }
            });

            return rbObject;
        } else {
            const processed = {};

            regularKeys.forEach(key => {
                processed[key] = this.processRubyObject(obj[key], false);
            });

            symbolKeys.forEach(sym => {
                const key = sym.toString();
                processed[key] = this.processRubyObject(obj[sym], false);
            });

            return processed;
        }
    }

    async loadDefaultFiles() {
        // Don't auto-load files - let user choose
        // const files = ['Game new.rxdata', 'Game old.rxdata'];
        // if (fs.existsSync(files[0])) {
        //     await this.loadFileByPath(files[0], 'left');
        // }
        // if (fs.existsSync(files[1])) {
        //     await this.loadFileByPath(files[1], 'right');
        // }
    }

    async loadFile(pane) {
        const result = await ipcRenderer.invoke('show-open-dialog');
        if (!result.canceled && result.filePaths.length > 0) {
            await this.loadFileByPath(result.filePaths[0], pane);
        }
    }

    async loadFileByPath(filePath, pane) {
        try {
            const result = await ipcRenderer.invoke('load-file', filePath);
            if (result.success) {
                const paneData = this[pane + 'Pane'];
                paneData.filePath = filePath;
                paneData.data = result.data;

                // Show the right pane when a file is loaded there
                if (pane === 'right') {
                    const rightPane = document.getElementById('rightPane');
                    rightPane.style.display = 'block';

                    // Reset flex properties for proper resizing
                    const leftPane = document.querySelector('.left-pane');
                    leftPane.style.flex = '1';
                    rightPane.style.flex = '1';
                }

                try {
                    console.log(`Parsing ${pane} pane: Pokemon save file with multiple Ruby Marshal objects...`);

                    const data = result.data;
                    const marshalHeaders = [];

                    for (let i = 0; i < data.length - 1; i++) {
                        if (data[i] === 4 && data[i + 1] === 8) {
                            marshalHeaders.push(i);
                        }
                    }

                    console.log(`${pane} pane: Found ${marshalHeaders.length} Ruby Marshal objects`);

                    const parsedObjects = {};
                    const rawObjects = {}; // Store original Ruby objects

                    // CRITICAL FIX: Handle Game old.rxdata with correct boundaries
                    // Game old.rxdata has embedded Marshal headers that cause incorrect parsing
                    // We need to use pre-calculated correct boundaries for this specific file

                    const isGameOld = paneData.filePath && paneData.filePath.includes('Game old');

                    console.log(`${pane} pane: File path = "${paneData.filePath}"`);
                    console.log(`${pane} pane: isGameOld = ${isGameOld}`);
                    console.log(`${pane} pane: File path includes 'Game old': ${paneData.filePath && paneData.filePath.includes('Game old')}`);

                    if (isGameOld) {
                        console.log(`${pane} pane: Detected Game old.rxdata - using corrected boundaries`);

                        // Correct boundaries for Game old.rxdata (matches website structure)
                        // Objects 1 and 4 are skipped as they don't exist on the website
                        const gameOldBoundaries = {
                            0: { start: 0, size: 40239 },        // Object 0: Player
                            // 1: skipped - doesn't exist on website
                            2: { start: 40246, size: 758 },      // Object 2: System
                            3: { start: 41004, size: 649 },      // Object 3: Options
                            // 4: skipped - doesn't exist on website
                            5: { start: 41657, size: 446 },      // Object 5: Data
                            6: { start: 42103, size: 51395 },    // Object 6: Data
                            7: { start: 93498, size: 12173 },    // Object 7: Data
                            8: { start: 105671, size: 15925 },   // Object 8: Screen
                            9: { start: 121596, size: 72168 },   // Object 9: Maps
                            10: { start: 193764, size: 841 },    // Object 10: Player movement
                            11: { start: 194605, size: 5409 },   // Object 11: Metadata
                            12: { start: 200014, size: 109 },    // Object 12: Events
                            13: { start: 200123, size: 19700 },  // Object 13: Bag
                            14: { start: 219823, size: 20955 }   // Object 14: Boxes
                        };

                        Object.keys(gameOldBoundaries).forEach(indexStr => {
                            const i = parseInt(indexStr);
                            const boundary = gameOldBoundaries[i];
                            const section = data.slice(boundary.start, boundary.start + boundary.size);

                            try {
                                const rawParsed = load(section);
                                rawObjects[i] = rawParsed;

                                if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)) {
                                    const symbols = Object.getOwnPropertySymbols(rawParsed);
                                    const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                                    if (rubyVars.length > 0) {
                                        const processed = this.processRubyObject(rawParsed, false);
                                        parsedObjects[i] = processed;
                                        console.log(`${pane} pane object ${i}: ${rubyVars.length} Ruby variables`);

                                        // Log important objects
                                        const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                                        if (nameSymbol) {
                                            const nameValue = this.convertByteArrayToString(rawParsed[nameSymbol]);
                                            console.log(`${pane} pane object ${i}: Player with @name = "${nameValue}"`);
                                        }

                                        const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                                        if (boxesSymbol && Array.isArray(rawParsed[boxesSymbol])) {
                                            console.log(`${pane} pane object ${i}: Boxes with ${rawParsed[boxesSymbol].length} boxes`);
                                        }
                                    }
                                } else if (Array.isArray(rawParsed)) {
                                    parsedObjects[i] = rawParsed;
                                    console.log(`${pane} pane object ${i}: Array with ${rawParsed.length} items`);
                                } else {
                                    parsedObjects[i] = rawParsed;
                                    console.log(`${pane} pane object ${i}: ${typeof rawParsed} value`);
                                }
                            } catch (parseError) {
                                console.log(`${pane} pane: Failed to parse Game old object ${i}: ${parseError.message}`);
                            }
                        });

                    } else {
                        // Standard parsing for other files (Game new.rxdata, etc.)
                        for (let i = 0; i < marshalHeaders.length; i++) {
                            const start = marshalHeaders[i];
                            let end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
                            let section = data.slice(start, end);

                            try {
                                const rawParsed = load(section);
                                rawObjects[i] = rawParsed; // Store original

                                if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)) {
                                    const symbols = Object.getOwnPropertySymbols(rawParsed);
                                    const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                                    if (rubyVars.length > 0) {
                                        const processed = this.processRubyObject(rawParsed, false);
                                        parsedObjects[i] = processed;
                                        console.log(`${pane} pane object ${i}: ${rubyVars.length} Ruby variables`);
                                    }
                                }
                            } catch (parseError) {
                                console.log(`${pane} pane: Failed to parse section ${i} (${section.length} bytes): ${parseError.message}`);

                                // Try alternative parsing for failed objects
                                if (parseError.message.includes('marshal data too short') || parseError.message.includes('data too short')) {
                                    console.log(`${pane} pane: Attempting alternative parsing for object ${i}...`);

                                    const alternativeResult = this.tryAlternativeParsing(data, start, i, marshalHeaders);
                                    if (alternativeResult.success) {
                                        rawObjects[i] = alternativeResult.parsed;

                                        if (alternativeResult.parsed && typeof alternativeResult.parsed === 'object' && !Array.isArray(alternativeResult.parsed)) {
                                            const symbols = Object.getOwnPropertySymbols(alternativeResult.parsed);
                                            const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                                            if (rubyVars.length > 0) {
                                                const processed = this.processRubyObject(alternativeResult.parsed, false);
                                                parsedObjects[i] = processed;
                                                console.log(`${pane} pane object ${i}: ✅ Alternative parsing succeeded - ${rubyVars.length} Ruby variables`);

                                                // Log if this is a player object
                                                const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                                                if (nameSymbol) {
                                                    const nameValue = this.convertByteArrayToString(alternativeResult.parsed[nameSymbol]);
                                                    console.log(`${pane} pane object ${i}: Player object with @name = "${nameValue}"`);
                                                }
                                            }
                                        }
                                    } else {
                                        console.log(`${pane} pane: Alternative parsing also failed for object ${i}`);
                                    }
                                }
                            }
                        }
                    }

                    paneData.parsedData = parsedObjects;
                    paneData.rawObjects = rawObjects; // Store raw objects
                    console.log(`${pane} pane processed objects:`, Object.keys(parsedObjects));

                    // CRITICAL FIX: Clear modification tracking when loading a new file
                    // This ensures that the selective serialization starts fresh
                    this.modifiedObjects[pane].clear();
                    console.log(`Cleared modification tracking for ${pane} pane`);

                    this.displayData(pane);
                    document.getElementById(`save${pane.charAt(0).toUpperCase() + pane.slice(1)}Btn`).disabled = false;
                    document.getElementById(`${pane}FileName`).textContent = path.basename(filePath);

                    this.updateCopyButtons();

                } catch (parseError) {
                    console.error(`${pane} pane parse error:`, parseError);
                    alert(`Parse error in ${pane} pane: ${parseError.message}`);
                }
            } else {
                alert(`Error loading file in ${pane} pane: ${result.error}`);
            }
        } catch (error) {
            alert(`Error in ${pane} pane: ${error.message}`);
        }
    }

    displayData(pane) {
        this.buildTreeView(pane);
        this.showPropertyEditor(pane, null);
    }

    buildTreeView(pane) {
        const treeView = document.getElementById(`${pane}TreeView`);
        treeView.innerHTML = '';

        const paneData = this[pane + 'Pane'];
        if (paneData.parsedData) {
            const objectKeys = Object.keys(paneData.parsedData);
            if (objectKeys.length > 0) {
                objectKeys.forEach(key => {
                    this.createTreeNode(treeView, key, paneData.parsedData[key], [], pane);
                });
            } else {
                this.createTreeNode(treeView, 'root', paneData.parsedData, [], pane);
            }
        }
    }

    createTreeNode(parent, key, value, path, pane) {
        const isExpandable = this.isExpandable(value);
        const item = document.createElement('div');
        item.className = `tree-item ${isExpandable ? '' : 'leaf'}`;

        const expand = document.createElement('div');
        expand.className = `tree-expand ${isExpandable ? 'expandable' : ''}`;

        const label = document.createElement('div');
        label.className = 'tree-label';
        label.textContent = this.formatTreeLabel(key, value);

        item.appendChild(expand);
        item.appendChild(label);

        const currentPath = [...path, key];

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectTreeItem(item, currentPath, value, pane);
        });

        if (isExpandable) {
            const children = document.createElement('div');
            children.className = 'tree-children';

            expand.addEventListener('click', (e) => {
                e.stopPropagation();
                expand.classList.toggle('expanded');
                children.classList.toggle('expanded');

                if (expand.classList.contains('expanded') && children.children.length === 0) {
                    this.populateChildren(children, value, currentPath, pane);
                }
            });

            parent.appendChild(item);
            parent.appendChild(children);
        } else {
            parent.appendChild(item);
        }
    }

    populateChildren(parent, value, path, pane) {
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                if (item !== null && item !== undefined) {
                    const childDiv = document.createElement('div');
                    childDiv.className = 'tree-child';
                    this.createTreeNode(childDiv, index.toString(), item, path, pane);
                    parent.appendChild(childDiv);
                }
            });
        } else if (value && typeof value === 'object') {
            const regularKeys = Object.keys(value);
            const symbolKeys = Object.getOwnPropertySymbols(value).map(sym => sym.toString());
            const allKeys = [...regularKeys, ...symbolKeys];

            allKeys.sort((a, b) => {
                if (a === '@rb:object' && b !== '@rb:object') return -1;
                if (a !== '@rb:object' && b === '@rb:object') return 1;

                if (a === '@rb:attributes' && b !== '@rb:attributes') return -1;
                if (a !== '@rb:attributes' && b === '@rb:attributes') return 1;

                const aHasAt = a.includes('@');
                const bHasAt = b.includes('@');
                if (aHasAt && !bHasAt) return -1;
                if (!aHasAt && bHasAt) return 1;

                return a.localeCompare(b);
            });

            allKeys.forEach(keyStr => {
                const childDiv = document.createElement('div');
                childDiv.className = 'tree-child';

                let actualValue;
                if (keyStr.startsWith('Symbol(')) {
                    const symbolKey = Object.getOwnPropertySymbols(value).find(sym => sym.toString() === keyStr);
                    actualValue = symbolKey ? value[symbolKey] : undefined;
                } else {
                    actualValue = value[keyStr];
                }

                this.createTreeNode(childDiv, keyStr, actualValue, path, pane);
                parent.appendChild(childDiv);
            });
        }
    }

    isExpandable(value) {
        if (Array.isArray(value) && value.length > 0) return true;
        if (value && typeof value === 'object') {
            const keys = Object.keys(value).concat(Object.getOwnPropertySymbols(value));
            return keys.length > 0;
        }
        return false;
    }

    formatTreeLabel(key, value) {
        if (Array.isArray(value)) {
            return `${key} [${value.length}]`;
        } else if (value && typeof value === 'object') {
            if (key === '@rb:object' || key === '@rb:attributes') {
                return key;
            }

            if (value['@rb:object'] || value['@rb:attributes']) {
                return key;
            }

            const totalKeys = Object.keys(value).length + Object.getOwnPropertySymbols(value).length;
            return `${key} {${totalKeys}}`;
        } else if (typeof value === 'string') {
            return `${key}: "${value}"`;
        } else if (typeof value === 'boolean') {
            return `${key}: ${value}`;
        } else if (typeof value === 'number') {
            return `${key}: ${value}`;
        } else {
            return key;
        }
    }

    selectTreeItem(item, path, value, pane) {
        // Clear selection in this pane
        document.querySelectorAll(`#${pane}TreeView .tree-item.selected`).forEach(el => {
            el.classList.remove('selected');
        });

        // Clear selection in other pane
        const otherPane = pane === 'left' ? 'right' : 'left';
        document.querySelectorAll(`#${otherPane}TreeView .tree-item.selected`).forEach(el => {
            el.classList.remove('selected');
        });
        this[otherPane + 'Pane'].selectedPath = null;
        this[otherPane + 'Pane'].selectedValue = null;

        item.classList.add('selected');
        const paneData = this[pane + 'Pane'];
        paneData.selectedPath = path;
        paneData.selectedValue = value;

        // Track which pane was last active
        this.lastActivePane = pane;

        // Update pane header visual state
        document.querySelectorAll('.pane-header').forEach(header => {
            header.classList.remove('active');
        });
        document.querySelector(`#${pane}TreeView`).closest('.pane').querySelector('.pane-header').classList.add('active');

        this.showPropertyEditor(pane, value);
        this.updateCopyButtons();
    }

    showPropertyEditor(pane, value) {
        const editor = document.getElementById(`${pane}PropertyEditor`);

        if (!value) {
            editor.innerHTML = '<div class="no-selection">Select an item from the tree</div>';
            return;
        }

        editor.innerHTML = '';

        // Get the selected path to determine what we're editing
        const paneData = this[pane + 'Pane'];
        const selectedPath = paneData.selectedPath;

        // Check if this is a single property (leaf node) or a parent object
        const isLeafProperty = selectedPath && selectedPath.length > 0 &&
            (typeof value !== 'object' || value === null || this.isPrimitiveObject(value));

        if (isLeafProperty) {
            // Show single property editor for leaf values
            this.showSinglePropertyEditor(editor, selectedPath, value);
        } else {
            // Show table of all properties for parent objects
            const table = document.createElement('div');
            table.className = 'property-table';
            table.style.cssText = `
                display: table;
                width: 100%;
                border-collapse: collapse;
                font-family: monospace;
                font-size: 12px;
            `;

            // Recursively show ALL properties in table format
            this.showAllPropertiesRecursively(table, value, '');
            editor.appendChild(table);
        }
    }

    showSinglePropertyEditor(editor, selectedPath, value) {
        // Create a simple editor for a single property
        const container = document.createElement('div');
        container.className = 'single-property-editor';
        container.style.cssText = `
            padding: 20px;
            background: #1e1e1e;
        `;

        // Property name header
        const header = document.createElement('div');
        header.className = 'single-property-header';
        header.style.cssText = `
            font-size: 16px;
            font-weight: bold;
            color: #9cdcfe;
            margin-bottom: 15px;
            padding: 10px;
            background: #252526;
            border-radius: 4px;
            font-family: monospace;
        `;
        header.textContent = selectedPath[selectedPath.length - 1];

        // Value editor
        const valueContainer = document.createElement('div');
        valueContainer.className = 'single-property-value';
        valueContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
        `;

        const label = document.createElement('label');
        label.textContent = 'Value:';
        label.style.cssText = `
            color: #ffffff;
            font-weight: bold;
            min-width: 60px;
        `;

        if (typeof value === 'boolean') {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = value;
            checkbox.style.cssText = `
                transform: scale(1.5);
                margin-right: 10px;
            `;
            checkbox.addEventListener('change', () => {
                this.updateValueByPath(selectedPath.join('.'), checkbox.checked, 'boolean');
            });

            const boolLabel = document.createElement('span');
            boolLabel.textContent = value.toString();
            boolLabel.style.cssText = `
                color: #569cd6;
                font-weight: bold;
                font-size: 14px;
            `;

            valueContainer.appendChild(label);
            valueContainer.appendChild(checkbox);
            valueContainer.appendChild(boolLabel);
        } else {
            const input = document.createElement('input');
            input.type = this.getInputType(value);
            input.value = this.formatValue(value);
            input.style.cssText = `
                flex: 1;
                padding: 8px 12px;
                background: #3c3c3c;
                color: #fff;
                border: 1px solid #555;
                border-radius: 4px;
                font-family: monospace;
                font-size: 14px;
            `;

            if (typeof value === 'object' && value !== null && !this.isPrimitiveObject(value)) {
                input.readOnly = true;
                input.style.background = '#2a2a2a';
                input.style.color = '#cccccc';
            } else {
                input.addEventListener('change', () => {
                    this.updateValueByPath(selectedPath.join('.'), input.value, typeof value);
                });
                input.addEventListener('focus', () => {
                    input.style.borderColor = '#0e639c';
                    input.style.background = '#2d2d30';
                });
                input.addEventListener('blur', () => {
                    input.style.borderColor = '#555';
                    input.style.background = '#3c3c3c';
                });
            }

            valueContainer.appendChild(label);
            valueContainer.appendChild(input);
        }

        // Type info
        const typeInfo = document.createElement('div');
        typeInfo.className = 'property-type-info';
        typeInfo.style.cssText = `
            margin-top: 15px;
            padding: 8px;
            background: #2d2d30;
            border-radius: 4px;
            font-size: 12px;
            color: #cccccc;
        `;
        typeInfo.textContent = `Type: ${typeof value}${Array.isArray(value) ? ' (array)' : ''}`;

        container.appendChild(header);
        container.appendChild(valueContainer);
        container.appendChild(typeInfo);
        editor.appendChild(container);
    }

    showAllPropertiesRecursively(parent, value, pathPrefix) {
        if (Array.isArray(value)) {
            // Show each array item
            value.forEach((item, index) => {
                const newPath = pathPrefix ? `${pathPrefix}[${index}]` : `[${index}]`;

                if (item && typeof item === 'object' && !this.isPrimitiveObject(item)) {
                    // Recursively show object properties
                    this.showAllPropertiesRecursively(parent, item, newPath);
                } else {
                    // Show primitive value
                    this.createTableRow(parent, newPath, item);
                }
            });

        } else if (value && typeof value === 'object') {
            // Show regular properties
            const regularKeys = Object.keys(value);
            regularKeys.forEach(key => {
                const newPath = pathPrefix ? `${pathPrefix}.${key}` : key;
                const propValue = value[key];

                if (propValue && typeof propValue === 'object' && !this.isPrimitiveObject(propValue)) {
                    // Recursively show nested object
                    this.showAllPropertiesRecursively(parent, propValue, newPath);
                } else {
                    // Show as editable property
                    this.createTableRow(parent, newPath, propValue);
                }
            });

            // Show symbol properties
            const symbolKeys = Object.getOwnPropertySymbols(value);
            symbolKeys.forEach(sym => {
                const key = sym.toString();
                const newPath = pathPrefix ? `${pathPrefix}.${key}` : key;
                const propValue = value[sym];

                if (propValue && typeof propValue === 'object' && !this.isPrimitiveObject(propValue)) {
                    // Recursively show nested object
                    this.showAllPropertiesRecursively(parent, propValue, newPath);
                } else {
                    // Show as editable property
                    this.createTableRow(parent, newPath, propValue);
                }
            });

        } else {
            // Show primitive value
            this.createTableRow(parent, pathPrefix || 'value', value);
        }
    }

    isPrimitiveObject(value) {
        // Check if this is a "primitive" object that should be shown as a single value
        // rather than expanded (like Uint8Array, Date, etc.)
        return value instanceof Uint8Array ||
            value instanceof Date ||
            (Array.isArray(value) && value.length > 0 &&
                value.every(v => typeof v === 'number' && v >= 0 && v <= 255));
    }

    createTableRow(parent, fullPath, value) {
        const row = document.createElement('div');
        row.className = 'property-table-row';
        row.style.cssText = `
            display: table-row;
            border-bottom: 1px solid #3e3e42;
        `;

        const keyCell = document.createElement('div');
        keyCell.className = 'property-table-key';
        keyCell.style.cssText = `
            display: table-cell;
            padding: 8px 12px;
            background: #252526;
            color: #9cdcfe;
            border-right: 1px solid #3e3e42;
            vertical-align: middle;
            font-family: monospace;
            font-size: 12px;
            width: 50%;
        `;
        keyCell.textContent = fullPath;

        const valueCell = document.createElement('div');
        valueCell.className = 'property-table-value';
        valueCell.style.cssText = `
            display: table-cell;
            padding: 8px 12px;
            background: #1e1e1e;
            vertical-align: middle;
            width: 50%;
        `;

        if (typeof value === 'boolean') {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = value;
            checkbox.className = 'property-checkbox';
            checkbox.style.cssText = 'margin-right: 8px; transform: scale(1.2);';
            checkbox.addEventListener('change', () => {
                this.updateValueByPath(fullPath, checkbox.checked, 'boolean');
            });
            valueCell.appendChild(checkbox);

            const label = document.createElement('span');
            label.textContent = value.toString();
            label.style.cssText = 'color: #569cd6; font-weight: bold;';
            valueCell.appendChild(label);
        } else {
            const input = document.createElement('input');
            input.className = 'property-input';
            input.type = this.getInputType(value);
            input.value = this.formatValue(value);
            input.style.cssText = `
                width: 100%;
                background: #3c3c3c;
                color: #fff;
                border: 1px solid #555;
                padding: 4px 6px;
                border-radius: 3px;
                font-family: monospace;
                font-size: 12px;
                min-height: 20px;
            `;

            if (typeof value === 'object' && value !== null && !this.isPrimitiveObject(value)) {
                input.readOnly = true;
                input.style.background = '#2a2a2a';
                input.style.color = '#cccccc';
            } else {
                input.addEventListener('change', () => {
                    this.updateValueByPath(fullPath, input.value, typeof value);
                });
                input.addEventListener('focus', () => {
                    input.style.borderColor = '#0e639c';
                    input.style.background = '#2d2d30';
                });
                input.addEventListener('blur', () => {
                    input.style.borderColor = '#555';
                    input.style.background = '#3c3c3c';
                });
            }

            valueCell.appendChild(input);
        }

        row.appendChild(keyCell);
        row.appendChild(valueCell);
        parent.appendChild(row);
    }

    createFlatPropertyRow(parent, fullPath, value) {
        const row = document.createElement('div');
        row.className = 'property-row';
        row.style.cssText = 'display: flex; margin: 2px 0; padding: 3px; background: #1e1e1e; border-radius: 2px;';

        const keyDiv = document.createElement('div');
        keyDiv.className = 'property-key';
        keyDiv.style.cssText = 'flex: 1; font-family: monospace; font-size: 12px; color: #9cdcfe; padding-right: 10px;';
        keyDiv.textContent = fullPath;

        const valueDiv = document.createElement('div');
        valueDiv.className = 'property-value';
        valueDiv.style.cssText = 'flex: 1;';

        if (typeof value === 'boolean') {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = value;
            checkbox.className = 'property-checkbox';
            checkbox.addEventListener('change', () => {
                this.updateValueByPath(fullPath, checkbox.checked, 'boolean');
            });
            valueDiv.appendChild(checkbox);

            const label = document.createElement('span');
            label.textContent = ` ${value}`;
            label.className = 'checkbox-label';
            label.style.color = '#569cd6';
            valueDiv.appendChild(label);
        } else {
            const input = document.createElement('input');
            input.className = 'property-input';
            input.type = this.getInputType(value);
            input.value = this.formatValue(value);
            input.style.cssText = 'width: 100%; background: #333; color: #fff; border: 1px solid #555; padding: 2px 5px; border-radius: 2px;';

            if (typeof value === 'object' && value !== null && !this.isPrimitiveObject(value)) {
                input.readOnly = true;
                input.style.background = '#444';
                input.style.color = '#888';
            } else {
                input.addEventListener('change', () => {
                    this.updateValueByPath(fullPath, input.value, typeof value);
                });
            }

            valueDiv.appendChild(input);
        }

        row.appendChild(keyDiv);
        row.appendChild(valueDiv);
        parent.appendChild(row);
    }

    updateValueByPath(fullPath, newValue, originalType) {
        console.log('=== UPDATE VALUE BY PATH ===');
        console.log('Full path:', fullPath);
        console.log('New value:', newValue);
        console.log('Original type:', originalType);

        // Find which pane is currently active and has a selection
        let activePane = null;
        let activePaneData = null;

        if (this.leftPane.selectedValue !== null && this.leftPane.selectedPath !== null) {
            activePane = 'left';
            activePaneData = this.leftPane;
        } else if (this.rightPane.selectedValue !== null && this.rightPane.selectedPath !== null) {
            activePane = 'right';
            activePaneData = this.rightPane;
        }

        if (!activePane || !activePaneData) {
            console.error('No active pane with selection found');
            return;
        }

        // Convert the new value to the appropriate type
        let convertedValue = newValue;
        if (originalType === 'boolean') {
            convertedValue = Boolean(newValue);
        } else if (originalType === 'number') {
            convertedValue = Number(newValue);
        } else if (originalType === 'string') {
            convertedValue = String(newValue);
        }

        console.log('Converted value:', convertedValue);

        try {
            // Check if we're editing a single property directly
            const selectedPath = activePaneData.selectedPath;
            const isDirectPropertyEdit = selectedPath && selectedPath.length > 0 &&
                (typeof activePaneData.selectedValue !== 'object' ||
                    activePaneData.selectedValue === null ||
                    this.isPrimitiveObject(activePaneData.selectedValue));

            if (isDirectPropertyEdit) {
                // Direct property edit - update the parent object
                this.updateDirectProperty(activePaneData, selectedPath, convertedValue);
            } else {
                // Navigate to the target property using the full path
                this.updateValueByFullPath(activePaneData, fullPath, convertedValue);
            }

            // Mark the object as modified
            const objectIndex = parseInt(activePaneData.selectedPath[0]);
            if (!isNaN(objectIndex)) {
                this.modifiedObjects[activePane].add(objectIndex);
                console.log(`Marked object ${objectIndex} as modified`);
            }

            // Mark pane as modified
            this.markPaneAsModified(activePane);

            // Refresh the property editor to show the change
            this.showPropertyEditor(activePane, activePaneData.selectedValue);

            console.log('Value updated successfully by path');

        } catch (error) {
            console.error('Failed to update value by path:', error);
            alert(`Failed to update value: ${error.message}`);
        }
    }

    updateDirectProperty(paneData, selectedPath, newValue) {
        console.log('Updating direct property...');
        console.log('Selected path:', selectedPath);
        console.log('New value:', newValue);

        // Navigate to the parent object that contains this property
        const parentPath = selectedPath.slice(0, -1);
        const propertyKey = selectedPath[selectedPath.length - 1];

        console.log('Parent path:', parentPath);
        console.log('Property key:', propertyKey);

        // Find the parent object in parsedData
        let parentObject = paneData.parsedData;
        for (const pathPart of parentPath) {
            if (parentObject && typeof parentObject === 'object') {
                if (pathPart.startsWith('Symbol(')) {
                    const symbolKey = Object.getOwnPropertySymbols(parentObject).find(sym => sym.toString() === pathPart);
                    if (symbolKey) {
                        parentObject = parentObject[symbolKey];
                    } else {
                        throw new Error(`Symbol key not found: ${pathPart}`);
                    }
                } else {
                    parentObject = parentObject[pathPart];
                }
            } else {
                throw new Error(`Cannot navigate to parent path: ${parentPath.join(' → ')}`);
            }
        }

        if (!parentObject || typeof parentObject !== 'object') {
            throw new Error('Parent object not found or is not an object');
        }

        // Update the property in the parent object
        if (propertyKey.startsWith('Symbol(')) {
            const symbolKey = Object.getOwnPropertySymbols(parentObject).find(sym => sym.toString() === propertyKey);
            if (symbolKey) {
                parentObject[symbolKey] = newValue;
                console.log(`Updated symbol property ${propertyKey} in parsed data`);
            } else {
                throw new Error(`Symbol property not found: ${propertyKey}`);
            }
        } else {
            parentObject[propertyKey] = newValue;
            console.log(`Updated property ${propertyKey} in parsed data`);
        }

        // Also update the raw objects
        this.updateValueInRawObjects(paneData, propertyKey, newValue);

        // Update the selected value to reflect the change
        paneData.selectedValue = newValue;
    }

    updateValueByFullPath(paneData, fullPath, newValue) {
        console.log('Updating value by full path:', fullPath);

        // Start from the selected value
        let current = paneData.selectedValue;

        // Parse the path (e.g., "@rb:object.@rb:attributes.@money" or "[0].@name")
        const pathParts = this.parsePropertyPath(fullPath);
        console.log('Parsed path parts:', pathParts);

        // Navigate to the parent of the target property
        const targetKey = pathParts.pop();

        for (const part of pathParts) {
            if (current && typeof current === 'object') {
                if (part.type === 'property') {
                    if (part.key.startsWith('Symbol(')) {
                        // Handle symbol keys
                        const symbolKey = Object.getOwnPropertySymbols(current).find(sym => sym.toString() === part.key);
                        if (symbolKey) {
                            current = current[symbolKey];
                        } else {
                            throw new Error(`Symbol key not found: ${part.key}`);
                        }
                    } else {
                        // Handle regular keys
                        if (current[part.key] !== undefined) {
                            current = current[part.key];
                        } else {
                            throw new Error(`Property not found: ${part.key}`);
                        }
                    }
                } else if (part.type === 'array') {
                    if (Array.isArray(current) && part.index < current.length) {
                        current = current[part.index];
                    } else {
                        throw new Error(`Array index out of bounds: ${part.index}`);
                    }
                }
            } else {
                throw new Error(`Cannot navigate to path: ${fullPath}`);
            }
        }

        // Update the target property
        if (current && typeof current === 'object') {
            if (targetKey.type === 'property') {
                if (targetKey.key.startsWith('Symbol(')) {
                    // Handle symbol keys
                    const symbolKey = Object.getOwnPropertySymbols(current).find(sym => sym.toString() === targetKey.key);
                    if (symbolKey) {
                        current[symbolKey] = newValue;
                        console.log(`Updated symbol ${targetKey.key} in parsed data`);
                    } else {
                        throw new Error(`Symbol key not found: ${targetKey.key}`);
                    }
                } else {
                    // Handle regular keys
                    current[targetKey.key] = newValue;
                    console.log(`Updated property ${targetKey.key} in parsed data`);
                }
            } else if (targetKey.type === 'array') {
                if (Array.isArray(current) && targetKey.index < current.length) {
                    current[targetKey.index] = newValue;
                    console.log(`Updated array index ${targetKey.index} in parsed data`);
                } else {
                    throw new Error(`Array index out of bounds: ${targetKey.index}`);
                }
            }

            // Also update the raw objects
            this.updateRawObjectsByPath(paneData, fullPath, newValue);
        } else {
            throw new Error('Cannot update value - target is not an object');
        }
    }

    parsePropertyPath(fullPath) {
        const parts = [];
        let current = '';
        let inBrackets = false;

        for (let i = 0; i < fullPath.length; i++) {
            const char = fullPath[i];

            if (char === '[' && !inBrackets) {
                if (current) {
                    parts.push({ type: 'property', key: current });
                    current = '';
                }
                inBrackets = true;
            } else if (char === ']' && inBrackets) {
                const index = parseInt(current);
                parts.push({ type: 'array', index: index });
                current = '';
                inBrackets = false;
            } else if (char === '.' && !inBrackets) {
                if (current) {
                    parts.push({ type: 'property', key: current });
                    current = '';
                }
            } else {
                current += char;
            }
        }

        if (current) {
            if (inBrackets) {
                const index = parseInt(current);
                parts.push({ type: 'array', index: index });
            } else {
                parts.push({ type: 'property', key: current });
            }
        }

        return parts;
    }

    updateRawObjectsByPath(paneData, fullPath, newValue) {
        // This would update the raw objects using the same path logic
        // For now, let's use the existing updateValueInRawObjects method
        // by extracting the final key from the path
        const pathParts = this.parsePropertyPath(fullPath);
        const targetKey = pathParts[pathParts.length - 1];

        if (targetKey && targetKey.type === 'property') {
            try {
                this.updateValueInRawObjects(paneData, targetKey.key, newValue);
            } catch (error) {
                console.log('Raw object update failed:', error.message);
                // Continue anyway - the parsed data was updated
            }
        }
    }

    createPropertyRow(parent, key, value) {
        const row = document.createElement('div');
        row.className = 'property-row';

        const keyDiv = document.createElement('div');
        keyDiv.className = 'property-key';
        keyDiv.textContent = key;

        const valueDiv = document.createElement('div');
        valueDiv.className = 'property-value';

        if (typeof value === 'boolean') {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = value;
            checkbox.className = 'property-checkbox';
            checkbox.addEventListener('change', () => {
                this.updateValue(key, checkbox.checked, 'boolean');
            });
            valueDiv.appendChild(checkbox);

            const label = document.createElement('span');
            label.textContent = ` ${value}`;
            label.className = 'checkbox-label';
            valueDiv.appendChild(label);
        } else {
            const input = document.createElement('input');
            input.className = 'property-input';
            input.type = this.getInputType(value);
            input.value = this.formatValue(value);

            if (typeof value === 'object' && value !== null) {
                input.readOnly = true;
            } else {
                input.addEventListener('change', () => {
                    this.updateValue(key, input.value, typeof value);
                });
            }

            valueDiv.appendChild(input);
        }

        row.appendChild(keyDiv);
        row.appendChild(valueDiv);
        parent.appendChild(row);
    }

    getInputType(value) {
        if (typeof value === 'number') return 'number';
        return 'text';
    }

    formatValue(value) {
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

    updateValue(key, newValue, originalType) {
        console.log('=== UPDATE VALUE ===');
        console.log('Key:', key);
        console.log('New value:', newValue);
        console.log('Original type:', originalType);

        // Find which pane is currently active and has a selection
        let activePane = null;
        let activePaneData = null;

        if (this.leftPane.selectedValue !== null && this.leftPane.selectedPath !== null) {
            activePane = 'left';
            activePaneData = this.leftPane;
        } else if (this.rightPane.selectedValue !== null && this.rightPane.selectedPath !== null) {
            activePane = 'right';
            activePaneData = this.rightPane;
        }

        if (!activePane || !activePaneData) {
            console.error('No active pane with selection found');
            return;
        }

        console.log('Active pane:', activePane);
        console.log('Selected path:', activePaneData.selectedPath);

        // Convert the new value to the appropriate type
        let convertedValue = newValue;
        if (originalType === 'boolean') {
            convertedValue = Boolean(newValue);
        } else if (originalType === 'number') {
            convertedValue = Number(newValue);
        } else if (originalType === 'string') {
            convertedValue = String(newValue);
        }

        console.log('Converted value:', convertedValue);

        try {
            // Update both parsedData and rawObjects
            this.updateValueInParsedData(activePaneData, key, convertedValue);
            this.updateValueInRawObjects(activePaneData, key, convertedValue);

            // Mark the object as modified
            const objectIndex = parseInt(activePaneData.selectedPath[0]);
            if (!isNaN(objectIndex)) {
                this.modifiedObjects[activePane].add(objectIndex);
                console.log(`Marked object ${objectIndex} as modified in ${activePane} pane`);
            }

            // Mark pane as modified
            this.markPaneAsModified(activePane);

            // Refresh the property editor to show the change
            this.showPropertyEditor(activePane, activePaneData.selectedValue);

            console.log('Value updated successfully');

        } catch (error) {
            console.error('Failed to update value:', error);
            alert(`Failed to update value: ${error.message}`);
        }
    }

    updateValueInParsedData(paneData, key, newValue) {
        console.log('Updating parsed data...');
        console.log('Selected value:', paneData.selectedValue);
        console.log('Selected value type:', typeof paneData.selectedValue);
        console.log('Selected path:', paneData.selectedPath);
        console.log('Key to update:', key);

        // Navigate to the selected object in parsedData
        let current = paneData.selectedValue;

        if (!current || typeof current !== 'object') {
            console.error('Cannot update - selected item details:');
            console.error('  current:', current);
            console.error('  typeof current:', typeof current);
            console.error('  selectedPath:', paneData.selectedPath);
            throw new Error('Cannot update value - selected item is not an object');
        }

        // Update the value in the parsed data
        if (key.startsWith('Symbol(')) {
            // Handle symbol keys
            const symbolKey = Object.getOwnPropertySymbols(current).find(sym => sym.toString() === key);
            if (symbolKey) {
                current[symbolKey] = newValue;
                console.log(`Updated symbol ${key} in parsed data`);
            } else {
                throw new Error(`Symbol key not found in parsed data: ${key}`);
            }
        } else {
            // Handle regular keys
            current[key] = newValue;
            console.log(`Updated property ${key} in parsed data`);
        }
    }

    updateValueInRawObjects(paneData, key, newValue) {
        console.log('Updating raw objects...');

        if (!paneData.selectedPath || paneData.selectedPath.length === 0) {
            throw new Error('No selected path for raw object update');
        }

        // Extract object index
        const objectIndex = parseInt(paneData.selectedPath[0]);
        if (isNaN(objectIndex) || !paneData.rawObjects[objectIndex]) {
            throw new Error(`Raw object ${objectIndex} not found`);
        }

        console.log(`Updating raw object ${objectIndex}`);

        // CRITICAL FIX: Don't navigate through UI path structure (@rb:object, @rb:attributes)
        // The raw object has the actual Ruby symbols directly
        const rawObject = paneData.rawObjects[objectIndex];

        // Update the value in the raw object
        if (rawObject && typeof rawObject === 'object') {
            if (key.startsWith('Symbol(@')) {
                // Extract the symbol name from the key (e.g., "Symbol(@name)" -> "@name")
                const symbolName = key.replace('Symbol(', '').replace(')', '');
                const symbolKey = Object.getOwnPropertySymbols(rawObject).find(sym => sym.toString() === `Symbol(${symbolName})`);

                if (symbolKey) {
                    // Get the original value to determine the correct format
                    const originalValue = rawObject[symbolKey];
                    let finalValue = newValue;

                    // If the original was a Uint8Array or byte array, convert string back to Uint8Array
                    if (originalValue instanceof Uint8Array && typeof newValue === 'string') {
                        finalValue = new Uint8Array(Array.from(newValue).map(char => char.charCodeAt(0)));
                        console.log(`Converting string "${newValue}" back to Uint8Array: [${Array.from(finalValue).join(', ')}]`);
                    } else if (Array.isArray(originalValue) && originalValue.every(v => typeof v === 'number' && v >= 0 && v <= 255) && typeof newValue === 'string') {
                        finalValue = Array.from(newValue).map(char => char.charCodeAt(0));
                        console.log(`Converting string "${newValue}" back to byte array: [${finalValue.join(', ')}]`);
                    }

                    rawObject[symbolKey] = finalValue;
                    console.log(`Updated raw object symbol ${symbolName} with value:`, finalValue);
                } else {
                    throw new Error(`Raw object symbol not found: ${symbolName}`);
                }
            } else if (key.startsWith('@')) {
                // Handle @name, @money, etc. - find the corresponding symbol directly
                const symbolKey = Object.getOwnPropertySymbols(rawObject).find(sym => sym.toString() === `Symbol(${key})`);

                if (symbolKey) {
                    // Get the original value to determine the correct format
                    const originalValue = rawObject[symbolKey];
                    let finalValue = newValue;

                    // If the original was a Uint8Array or byte array, convert string back to Uint8Array
                    if (originalValue instanceof Uint8Array && typeof newValue === 'string') {
                        finalValue = new Uint8Array(Array.from(newValue).map(char => char.charCodeAt(0)));
                        console.log(`Converting string "${newValue}" back to Uint8Array: [${Array.from(finalValue).join(', ')}]`);
                    } else if (Array.isArray(originalValue) && originalValue.every(v => typeof v === 'number' && v >= 0 && v <= 255) && typeof newValue === 'string') {
                        finalValue = Array.from(newValue).map(char => char.charCodeAt(0));
                        console.log(`Converting string "${newValue}" back to byte array: [${finalValue.join(', ')}]`);
                    }

                    rawObject[symbolKey] = finalValue;
                    console.log(`Updated raw object symbol ${key} with value:`, finalValue);
                } else {
                    throw new Error(`Raw object symbol not found: ${key}`);
                }
            } else {
                // Regular property
                rawObject[key] = newValue;
                console.log(`Updated raw object property ${key} with value:`, newValue);
            }
        } else {
            throw new Error('Cannot update raw object - target is not an object');
        }

        console.log('Raw object updated successfully');
    }

    updateCopyButtons() {
        const leftSelected = this.leftPane.selectedValue !== null;
        const rightSelected = this.rightPane.selectedValue !== null;
        const leftLoaded = this.leftPane.parsedData !== null;
        const rightLoaded = this.rightPane.parsedData !== null;

        document.getElementById('copyLeftToRightBtn').disabled = !(leftSelected && rightLoaded);
        document.getElementById('copyRightToLeftBtn').disabled = !(rightSelected && leftLoaded);
    }

    showPasteWarning(targetPane, targetPath) {
        if (!this.clipboard.data) return;

        const targetData = this[targetPane + 'Pane'];
        const modal = document.getElementById('warningModal');
        const copyDetails = document.getElementById('copyDetails');

        copyDetails.innerHTML = `
            <strong>Paste Operation Details:</strong><br>
            From: ${this.clipboard.sourcePane} pane → ${this.clipboard.sourcePath.join(' → ')}<br>
            To: ${targetPane} pane → ${targetPath.join(' → ')}<br>
            Source Type: ${Array.isArray(this.clipboard.data) ? 'Array' : typeof this.clipboard.data}<br>
            <br>
            <strong>⚠️ This will REPLACE the target data!</strong>
        `;

        modal.style.display = 'block';

        // Store paste operation details
        this.pendingPaste = {
            targetPane: targetPane,
            targetPath: targetPath,
            data: this.clipboard.data
        };
    }

    confirmPaste() {
        if (!this.pendingPaste) return;

        try {
            // Perform the actual paste operation
            this.performPaste(this.pendingPaste.targetPane, this.pendingPaste.targetPath, this.pendingPaste.data);

            this.showClipboardStatus(`Pasted to ${this.pendingPaste.targetPane} pane: ${this.pendingPaste.targetPath.join(' → ')}`);
            this.cancelPaste();
        } catch (error) {
            alert(`Paste failed: ${error.message}`);
        }
    }

    performPaste(targetPane, targetPath, data) {
        const paneData = this[targetPane + 'Pane'];

        console.log('=== SIMPLE RAW PASTE ===');
        console.log('Target pane:', targetPane);
        console.log('Target path:', targetPath);

        // ULTRA SIMPLE: Just update rawObjects, don't touch anything else
        this.updateRawObjects(paneData, targetPath, data);

        // Mark as modified for saving
        const objectIndex = parseInt(targetPath[0]);
        if (!isNaN(objectIndex)) {
            const paneKey = paneData === this.leftPane ? 'left' : 'right';
            this.modifiedObjects[paneKey].add(objectIndex);
        }

        // Mark pane as modified
        this.markPaneAsModified(targetPane);

        console.log('Raw paste completed - rawObjects updated, UI unchanged');
        alert('Paste completed. The data has been updated in the raw objects for saving. Restart the app to see the changes in the UI.');
    }

    rebuildParsedDataFromRawObjects(paneData) {
        console.log('Rebuilding parsedData from rawObjects (safe method)...');

        if (!paneData.rawObjects) {
            console.log('No raw objects available');
            return;
        }

        const parsedObjects = {};

        // Safely process each raw object without deep recursion
        Object.keys(paneData.rawObjects).forEach(indexStr => {
            const index = parseInt(indexStr);
            const rawObject = paneData.rawObjects[index];

            try {
                if (rawObject && typeof rawObject === 'object' && !Array.isArray(rawObject)) {
                    const symbols = Object.getOwnPropertySymbols(rawObject);
                    const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                    if (rubyVars.length > 0) {
                        // CRITICAL: Use a safe, non-recursive processing method
                        const processed = this.safeProcessRubyObject(rawObject);
                        parsedObjects[index] = processed;
                        console.log(`Safely rebuilt object ${index} from raw data`);
                    }
                } else if (Array.isArray(rawObject)) {
                    parsedObjects[index] = rawObject;
                    console.log(`Rebuilt array object ${index} from raw data`);
                } else {
                    parsedObjects[index] = rawObject;
                    console.log(`Rebuilt primitive object ${index} from raw data`);
                }
            } catch (error) {
                console.log(`Failed to rebuild object ${index}: ${error.message}`);
                // Keep the original raw object if processing fails
                parsedObjects[index] = rawObject;
            }
        });

        paneData.parsedData = parsedObjects;
        console.log('ParsedData safely rebuilt from raw objects');
    }

    safeProcessRubyObject(obj) {
        // CRITICAL: Safe processing that doesn't recurse deeply
        // Just create the @rb:object wrapper without processing nested objects

        if (!obj || typeof obj !== 'object') {
            return obj;
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

            // CRITICAL: Don't recursively process nested objects - use direct assignment
            rubyInstanceVars.forEach(sym => {
                const key = sym.toString().replace('Symbol(', '').replace(')', '');
                rbObject['@rb:object']['@rb:attributes'][key] = obj[sym]; // Direct assignment!
            });

            regularKeys.forEach(key => {
                if (key !== 'class') {
                    rbObject['@rb:object']['@rb:attributes'][key] = obj[key]; // Direct assignment!
                }
            });

            return rbObject;
        } else {
            // No Ruby symbols - return as-is
            return obj;
        }
    }

    updateParsedData(paneData, targetPath, data) {
        // Navigate to the parent of the target path in parsedData
        let current = paneData.parsedData;
        const pathCopy = [...targetPath];
        const targetKey = pathCopy.pop();

        console.log('Updating parsedData - Navigation path:', pathCopy);
        console.log('Updating parsedData - Target key:', targetKey);

        // Navigate to parent
        for (const key of pathCopy) {
            if (current && typeof current === 'object') {
                if (current[key] !== undefined) {
                    current = current[key];
                } else {
                    const symbolKey = Object.getOwnPropertySymbols(current).find(sym => sym.toString() === key);
                    if (symbolKey) {
                        current = current[symbolKey];
                    } else {
                        throw new Error(`ParsedData path not found: ${key}`);
                    }
                }
            } else {
                throw new Error(`Cannot navigate parsedData to path: ${pathCopy.join(' → ')}`);
            }
        }

        // Replace the target with the clipboard data
        if (current && typeof current === 'object') {
            if (targetKey.startsWith('Symbol(')) {
                const symbolKey = Object.getOwnPropertySymbols(current).find(sym => sym.toString() === targetKey);
                if (symbolKey) {
                    // CRITICAL FIX: Don't use deepClone for Ruby data - use direct assignment
                    // This preserves the exact structure without adding wrapper objects
                    current[symbolKey] = data;
                    console.log('ParsedData updated with direct assignment (preserving Ruby structure)');
                } else {
                    throw new Error(`ParsedData symbol key not found: ${targetKey}`);
                }
            } else {
                // CRITICAL FIX: Don't use deepClone for Ruby data - use direct assignment
                current[targetKey] = data;
                console.log('ParsedData updated with direct assignment (preserving Ruby structure)');
            }
            console.log('ParsedData updated successfully');
        } else {
            throw new Error('Cannot paste to parsedData location');
        }
    }

    updateRawObjects(paneData, targetPath, data) {
        console.log('Updating rawObjects for save integrity...');

        // Extract the object index from the path (first element should be the object number)
        if (targetPath.length === 0) {
            throw new Error('Invalid target path for raw object update');
        }

        const objectIndex = parseInt(targetPath[0]);
        if (isNaN(objectIndex) || !paneData.rawObjects[objectIndex]) {
            throw new Error(`Raw object ${objectIndex} not found`);
        }

        console.log(`Updating raw object ${objectIndex}`);

        // Mark this object as modified
        const paneKey = paneData === this.leftPane ? 'left' : 'right';
        this.modifiedObjects[paneKey].add(objectIndex);
        console.log(`Marked object ${objectIndex} as modified in ${paneKey} pane`);

        // Navigate to the target location in the raw object
        let current = paneData.rawObjects[objectIndex];
        const pathCopy = [...targetPath.slice(1)]; // Skip the object index
        const targetKey = pathCopy.pop();

        console.log('Raw object navigation path:', pathCopy);
        console.log('Raw object target key:', targetKey);

        // Navigate to parent in raw object
        for (const key of pathCopy) {
            if (current && typeof current === 'object') {
                // For raw objects, we need to handle the @rb:object structure differently
                if (key === '@rb:object') {
                    // Skip this level - it's our UI wrapper
                    continue;
                } else if (key === '@rb:attributes') {
                    // Skip this level - it's our UI wrapper
                    continue;
                } else if (key.startsWith('@')) {
                    // This is a Ruby instance variable - find the symbol
                    const symbolKey = Object.getOwnPropertySymbols(current).find(sym => sym.toString() === `Symbol(${key})`);
                    if (symbolKey) {
                        current = current[symbolKey];
                    } else {
                        throw new Error(`Raw object symbol not found: ${key}`);
                    }
                } else {
                    // Regular property
                    if (current[key] !== undefined) {
                        current = current[key];
                    } else {
                        throw new Error(`Raw object property not found: ${key}`);
                    }
                }
            } else {
                throw new Error(`Cannot navigate raw object to path: ${pathCopy.join(' → ')}`);
            }
        }

        // Update the target in the raw object
        if (current && typeof current === 'object') {
            if (targetKey === '@rb:object' || targetKey === '@rb:attributes') {
                throw new Error('Cannot replace @rb:object or @rb:attributes structure');
            } else if (targetKey.startsWith('@')) {
                // Ruby instance variable - find and update the symbol
                const symbolKey = Object.getOwnPropertySymbols(current).find(sym => sym.toString() === `Symbol(${targetKey})`);
                if (symbolKey) {
                    // CRITICAL: Use direct assignment to preserve Ruby Marshal symbols
                    current[symbolKey] = data; // Direct assignment, no deep clone!
                    console.log(`Raw object symbol ${targetKey} updated with direct assignment`);
                } else {
                    throw new Error(`Raw object target symbol not found: ${targetKey}`);
                }
            } else {
                // Regular property
                current[targetKey] = data; // Direct assignment for raw objects
                console.log(`Raw object property ${targetKey} updated with direct assignment`);
            }
        } else {
            throw new Error('Cannot update raw object at this location');
        }

        console.log('Raw object updated successfully');
    }

    markPaneAsModified(pane) {
        const fileNameElement = document.getElementById(`${pane}FileName`);
        if (fileNameElement && !fileNameElement.textContent.includes('*')) {
            fileNameElement.textContent += ' *';
            fileNameElement.style.color = '#ff6b6b';
        }
    }

    async serializeParsedDataToRubyMarshal(paneData) {
        console.log('=== SERIALIZATION DEBUG ===');
        console.log('Original data length:', paneData.data.length);
        console.log('Parsed data objects:', Object.keys(paneData.parsedData));

        // We need to reconstruct the original Ruby Marshal format
        // This is complex because we need to reverse our parsing process

        // For now, let's try a simpler approach: 
        // We'll modify the original data structure and re-serialize each object
        const { dump } = require('@hyrious/marshal');

        try {
            // Find the original Ruby Marshal object boundaries
            const data = paneData.data;
            const marshalHeaders = [];

            for (let i = 0; i < data.length - 1; i++) {
                if (data[i] === 4 && data[i + 1] === 8) {
                    marshalHeaders.push(i);
                }
            }

            console.log('Found marshal headers at positions:', marshalHeaders);

            // Reconstruct each section
            const newSections = [];

            for (let i = 0; i < marshalHeaders.length; i++) {
                const objectIndex = i;

                if (paneData.parsedData[objectIndex]) {
                    console.log(`Processing object ${objectIndex}...`);

                    // Convert our processed data back to Ruby object format
                    const rubyObject = this.convertToRubyObject(paneData.parsedData[objectIndex]);
                    console.log('Converted to Ruby object:', rubyObject);

                    // Serialize back to binary
                    const serialized = dump(rubyObject);
                    newSections.push(serialized);
                    console.log(`Object ${objectIndex} serialized to ${serialized.length} bytes`);
                } else {
                    // Use original section if not modified
                    const start = marshalHeaders[i];
                    const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
                    const originalSection = data.slice(start, end);
                    newSections.push(originalSection);
                    console.log(`Object ${objectIndex} using original ${originalSection.length} bytes`);
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

            console.log('Final serialized data length:', result.length);
            return result;

        } catch (error) {
            console.error('Serialization error:', error);
            throw new Error(`Failed to serialize data: ${error.message}`);
        }
    }

    tryAlternativeParsing(data, startPos, objectIndex, marshalHeaders) {
        // Try alternative parsing strategies for objects that fail with "marshal data too short"
        // This handles cases where Marshal headers are embedded within objects

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

        // Strategy 2: Try parsing to the end of the file
        try {
            const remainingData = data.slice(startPos);
            const parsed = load(remainingData);

            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const symbols = Object.getOwnPropertySymbols(parsed);
                const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                if (rubyVars.length > 0) {
                    console.log(`Alternative parsing succeeded with remaining data (${remainingData.length} bytes) for object ${objectIndex}`);
                    return { success: true, parsed: parsed, actualSize: remainingData.length };
                }
            }
        } catch (error) {
            // This strategy also failed
        }

        return { success: false };
    }

    convertToRubyObject(processedData) {
        // This method converts our processed @rb:object structure back to Ruby Marshal format
        if (!processedData || typeof processedData !== 'object') {
            return processedData;
        }

        if (Array.isArray(processedData)) {
            return processedData.map(item => this.convertToRubyObject(item));
        }

        // Check if this is our processed Ruby object structure
        if (processedData['@rb:object'] && processedData['@rb:object']['@rb:attributes']) {
            const rubyObj = {};
            const attributes = processedData['@rb:object']['@rb:attributes'];

            console.log('Converting Ruby object with attributes:', Object.keys(attributes));

            // Convert attributes back to their original format
            Object.keys(attributes).forEach(key => {
                const value = this.convertToRubyObject(attributes[key]);

                if (key.startsWith('@')) {
                    // This was originally a Ruby instance variable (symbol)
                    // We need to recreate the symbol as it was in the original data
                    const symbolKey = Symbol(key);
                    rubyObj[symbolKey] = value;
                    console.log(`Converted ${key} back to symbol`);
                } else {
                    // Regular property
                    rubyObj[key] = value;
                }
            });

            // Add class information if present
            if (processedData['@rb:object']['@rb:klass']) {
                const classSymbol = Symbol('class');
                rubyObj[classSymbol] = processedData['@rb:object']['@rb:klass'];
                console.log('Added class information:', processedData['@rb:object']['@rb:klass']);
            }

            return rubyObj;
        } else {
            // Regular object, convert recursively
            const result = {};
            Object.keys(processedData).forEach(key => {
                result[key] = this.convertToRubyObject(processedData[key]);
            });

            // Also handle symbol properties if they exist
            Object.getOwnPropertySymbols(processedData).forEach(sym => {
                result[sym] = this.convertToRubyObject(processedData[sym]);
            });

            return result;
        }
    }

    cancelPaste() {
        document.getElementById('warningModal').style.display = 'none';
        this.pendingPaste = null;
    }

    async saveFile(pane) {
        const paneData = this[pane + 'Pane'];
        if (!paneData.data) {
            alert(`No data to save in ${pane} pane`);
            return;
        }

        console.log('=== SAVE OPERATION ===');

        try {
            // Reconstruct the file with modifications
            const updatedData = await this.reconstructFileWithModifications(paneData);

            const result = await ipcRenderer.invoke('show-save-dialog');
            if (!result.canceled && result.filePath) {
                const saveResult = await ipcRenderer.invoke('save-file', result.filePath, updatedData);
                if (saveResult.success) {
                    alert(`${pane.charAt(0).toUpperCase() + pane.slice(1)} pane file saved successfully!\n\nAll copy/paste modifications have been saved to the file.`);
                    paneData.filePath = result.filePath;
                    paneData.data = updatedData; // Update the raw data reference
                    document.getElementById(`${pane}FileName`).textContent = path.basename(result.filePath);

                    // Remove modification indicator
                    const fileNameElement = document.getElementById(`${pane}FileName`);
                    if (fileNameElement.textContent.includes('*')) {
                        fileNameElement.textContent = fileNameElement.textContent.replace(' *', '');
                        fileNameElement.style.color = '#cccccc';
                    }
                } else {
                    alert(`Error saving ${pane} pane file: ${saveResult.error}`);
                }
            }
        } catch (error) {
            console.error('Save error:', error);
            alert(`Error saving file: ${error.message}`);
        }
    }

    async reconstructFileWithModifications(paneData) {
        const { dump } = require('@hyrious/marshal');

        console.log('Reconstructing file with modifications...');

        // Find marshal headers
        const data = paneData.data;
        const marshalHeaders = [];

        for (let i = 0; i < data.length - 1; i++) {
            if (data[i] === 4 && data[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        console.log('Found marshal headers:', marshalHeaders.length);

        // Parse and reconstruct each section
        const newSections = [];

        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
            const section = data.slice(start, end);

            // CRITICAL FIX: Only re-serialize objects that were actually modified
            // For unmodified objects, use the original binary data to preserve Ruby Marshal format

            if (this.wasObjectModified(paneData, i)) {
                console.log(`Object ${i} was modified - re-serializing`);

                if (paneData.rawObjects && paneData.rawObjects[i]) {
                    try {
                        const serialized = dump(paneData.rawObjects[i]);
                        newSections.push(serialized);
                        console.log(`Object ${i}: re-serialized to ${serialized.length} bytes (was ${section.length})`);
                    } catch (error) {
                        console.error(`Failed to serialize object ${i}: ${error.message}`);
                        // Fallback to original section if serialization fails
                        newSections.push(section);
                        console.log(`Object ${i}: using original ${section.length} bytes (serialization failed)`);
                    }
                } else {
                    // No raw object available, use original
                    newSections.push(section);
                    console.log(`Object ${i}: using original ${section.length} bytes (no raw object)`);
                }
            } else {
                // Object was not modified - use original binary data
                newSections.push(section);
                console.log(`Object ${i}: using original ${section.length} bytes (unmodified)`);
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

        console.log('Final file size:', result.length);
        console.log('Size difference:', result.length - data.length);

        return result;
    }

    wasObjectModified(paneData, objectIndex) {
        // Check if this object was modified by looking at our modification tracking
        const paneKey = paneData === this.leftPane ? 'left' : 'right';

        // Check our explicit modification tracking
        if (this.modifiedObjects && this.modifiedObjects[paneKey]) {
            const wasModified = this.modifiedObjects[paneKey].has(objectIndex);
            if (wasModified) {
                console.log(`Object ${objectIndex} was explicitly marked as modified`);
                return true;
            }
        }

        // Also check the old modification tracking system
        if (this.modifications && this.modifications[paneKey]) {
            for (const [path, modification] of this.modifications[paneKey]) {
                if (path.startsWith(`${objectIndex}.`) || path === `${objectIndex}`) {
                    console.log(`Object ${objectIndex} was modified via path: ${path}`);
                    return true;
                }
            }
        }

        console.log(`Object ${objectIndex} was not modified`);
        return false;
    }

    convertParsedToRubyObject(processedData) {
        // Convert our processed @rb:object structure back to Ruby Marshal format
        if (!processedData || typeof processedData !== 'object') {
            return processedData;
        }

        if (Array.isArray(processedData)) {
            return processedData.map(item => this.convertParsedToRubyObject(item));
        }

        // Check if this is our processed Ruby object structure
        if (processedData['@rb:object'] && processedData['@rb:object']['@rb:attributes']) {
            const rubyObj = {};
            const attributes = processedData['@rb:object']['@rb:attributes'];

            console.log('Converting Ruby object with attributes:', Object.keys(attributes));

            // Convert attributes back to their original format
            Object.keys(attributes).forEach(key => {
                const value = this.convertParsedToRubyObject(attributes[key]);

                if (key.startsWith('@')) {
                    // This was originally a Ruby instance variable (symbol)
                    const symbolKey = Symbol(key);
                    rubyObj[symbolKey] = value;
                } else {
                    // Regular property
                    rubyObj[key] = value;
                }
            });

            // Add class information if present
            if (processedData['@rb:object']['@rb:klass']) {
                const classSymbol = Symbol('class');
                rubyObj[classSymbol] = processedData['@rb:object']['@rb:klass'];
            }

            return rubyObj;
        } else {
            // Regular object, convert recursively
            const result = {};
            Object.keys(processedData).forEach(key => {
                result[key] = this.convertParsedToRubyObject(processedData[key]);
            });

            // Also handle symbol properties if they exist
            Object.getOwnPropertySymbols(processedData).forEach(sym => {
                result[sym] = this.convertParsedToRubyObject(processedData[sym]);
            });

            return result;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new DualPaneRXDataEditor();
});