# RXData Editor

A powerful dual-pane save file editor for **Pokemon Empyrean** (.rxdata files) built with Electron.

![RXData Editor Screenshot](https://via.placeholder.com/800x500/1e1e1e/ffffff?text=RXData+Editor+Screenshot)

## ✨ Features

### 🔄 Dual-Pane Interface
- **Side-by-side editing** - Load two save files simultaneously
- **Copy/paste between files** - Transfer Pokemon, items, and data safely
- **Resizable panels** - Customize your workspace layout

### 🔍 Advanced Search
- **Global search** across all attributes and values
- **Smart grouping** - Pokemon names, attributes, numbers organized separately
- **Click-to-navigate** - Jump directly to any search result in the tree

### 📝 Property Editing
- **Table view** - Clean two-column layout for easy editing
- **Single property focus** - Click individual values for focused editing
- **Type-aware inputs** - Checkboxes for booleans, proper input types

### 🛡️ Safe Save System
- **Selective serialization** - Only re-saves modified objects
- **Ruby Marshal preservation** - Maintains original file structure
- **Corruption prevention** - Protects against save file damage

### 🎮 Pokemon Empyrean Support
- **Complete compatibility** with both old and new save formats
- **Proper object boundaries** - Correctly parses all 15 Ruby Marshal objects
- **Pokemon data editing** - Modify party, boxes, stats, moves, and more

## 🚀 Quick Start

### Download & Run
1. Download `RXData Editor 1.0.0.exe` from [Releases](../../releases)
2. Double-click to run - **no installation required!**
3. Load your Pokemon Empyrean save files and start editing

### Basic Usage
1. **Load Files**: Click "Load Left File" and "Load Right File"
2. **Navigate**: Use the tree view to browse save data
3. **Search**: Type in the search box to find specific Pokemon or attributes
4. **Edit**: Click on values to edit them directly
5. **Copy/Paste**: Select items and use Ctrl+C / Ctrl+V to transfer between files
6. **Save**: Click "Save Left" or "Save Right" to save your changes

## 🎯 Common Use Cases

### Transfer Pokemon Between Saves
1. Load your main save in the left pane
2. Load your secondary save in the right pane
3. Navigate to the Pokemon you want to transfer
4. Select the Pokemon and press Ctrl+C
5. Navigate to the destination in the other pane
6. Press Ctrl+V to paste

### Find Specific Pokemon
1. Use the search box to search for Pokemon names (e.g., "Charizard")
2. Click on any search result to jump to that Pokemon
3. Edit stats, moves, or other properties directly

### Edit Player Data
1. Navigate to object "0" in the tree
2. Expand "@rb:object" → "@rb:attributes"
3. Edit money, name, badges, or other player attributes

## 🛠️ Development

### Prerequisites
- Node.js 16+ 
- npm or yarn

### Setup
```bash
git clone https://github.com/yourusername/rxdata-editor.git
cd rxdata-editor
npm install
```

### Run Development Version
```bash
npm start
```

### Build Portable Executable
```bash
# Windows portable .exe
npm run build-win

# macOS
npm run build-mac

# Linux
npm run build-linux
```

### Run Tests
```bash
npm test
```

## 📁 File Structure

```
rxdata-editor/
├── main.js              # Electron main process
├── renderer.js          # Main application logic
├── index.html           # UI layout
├── style.css            # Styling
├── package.json         # Dependencies and build config
├── tests/               # Test suite
│   ├── run-tests.js     # Test runner
│   └── *.js             # Individual test files
└── dist/                # Build output (created after building)
```

## 🔧 Technical Details

### Ruby Marshal Parsing
- Uses `@hyrious/marshal` library for Ruby object deserialization
- Handles 15 separate Ruby Marshal objects in Pokemon Empyrean saves
- Preserves original binary structure for unmodified objects

### Save File Structure
Pokemon Empyrean save files contain these objects:
- **Object 0**: Player data (name, money, badges, etc.)
- **Object 2**: System settings
- **Object 3**: Game options
- **Objects 5-7**: Various game data
- **Object 8**: Screen/UI state
- **Object 9**: Maps and events
- **Objects 10-13**: Player progress and metadata
- **Object 14**: Pokemon boxes

### Supported Formats
- ✅ Game new.rxdata (standard format)
- ✅ Game old.rxdata (legacy format with different boundaries)
- ✅ All Pokemon Empyrean save versions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📋 Requirements

- **Windows**: Windows 7+ (64-bit)
- **macOS**: macOS 10.10+ 
- **Linux**: Ubuntu 14.04+ or equivalent

## ⚠️ Important Notes

- **Always backup your save files** before editing
- The editor preserves original file structure to prevent corruption
- Only modified objects are re-serialized when saving
- Compatible with Pokemon Empyrean v1.0+ save files

## 🐛 Troubleshooting

### Save File Won't Load
- Ensure the file is a valid .rxdata file from Pokemon Empyrean
- Check that the file isn't corrupted or in use by the game

### Changes Not Saving
- Make sure you have write permissions to the save file location
- Close Pokemon Empyrean before editing save files
- Verify the file isn't read-only

### Search Not Finding Results
- Search is case-insensitive but requires exact partial matches
- Try searching for shorter terms (e.g., "char" instead of "charizard")

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **@hyrious/marshal** - Ruby Marshal parsing library
- **Electron** - Cross-platform desktop app framework
- **Pokemon Empyrean** - The amazing ROM hack this editor supports

---

**Made with ❤️ for the Pokemon Empyrean community**