# Symmetry6 Level Editor Help

Welcome to the Symmetry6 Level Editor! This tool allows you to create, test, and share custom hex-grid puzzle levels with the community.

## Top Menu & Level Management

- **Level Dropdown**: Switch between the different levels in your current pack.
- **New Level**: Appends a brand new blank level to the end of your pack.
- **Insert New**: Inserts a new blank level immediately after the one you are currently viewing.
- **Duplicate**: Makes an exact copy of the current level.
- **Delete**: Deletes the current level entirely.
- **Clean**: Cleans/resets elements of the current level without deleting the whole map.
- **Copy to Objective**: Copies the current board's layout directly into the "Target Map" (Solution state).
- **Undo / Redo**: Revert or re-apply changes (Ctrl+Z / Ctrl+Y).
- **Test Mode**: Click to instantly playtest your current level exactly as a player would. Click again to stop testing.

## Saving & Loading
- **Export JSON**: Downloads your levels as a `.json` file to your local computer.
- **Import JSON**: Loads levels from a `.json` file saved on your computer.
- **Save to Host**: Saves your level pack directly to the cloud database. You will be prompted for an Author Name and Level Name. **Note:** You can only overwrite files that were originally created from your current device!
- **Load from Host**: Browses and loads level packs created by you or other community members from the cloud.

## Drawing the Map (Tools Panel)

The map editor uses a combination of **Colors** and **Tools**. First, select a color from the **Colors Palette** (Red, Blue, Yellow, Green, Purple, Orange, Cyan, or Empty/Grey):
- **Left-Click a Color**: Selects the primary foreground color.
- **Right-Click a Color**: Selects the secondary background color.

Then select a tool to apply your chosen color(s) to the grid:

- **Set Tile Color**: Click on any hex to paint it the currently selected primary color. Right-click to paint it the secondary background color.
- **Set Multi Color**: Click a hex to open a modal that allows you to configure a "cycling" multi-color tile.
- **Place Target**: Click a hex to mark it as the target/objective tile.
- **Flip Tile**: Click or drag between two adjacent tiles to swap/flip them.
- **Draw Path (Drag)**: Click and drag across the hexes to draw colored paths between them. The path will use your currently selected color.
- **Clear Path**: Click a hex to erase all paths drawn on it.
- **Toggle Wall**: Click a hex to turn it into an immovable wall/obstacle. Click again to remove the wall.
- **Toggle Color Gate**: Click a hex to place a Color Gate using your currently selected color.
- **Erase Tile**: Click a hex to completely remove it from the board grid.

## Advanced Painting (Objective & Initial Layers)
- **Set Zone (Obj)**: Enter a zone number and click hexes to paint zones for the objective layer.
- **Set Freeze (Init)**: Enter a freeze value and click hexes to apply freeze states to the initial layer.
- **Clear Entire Board**: Completely wipes all hexes, paths, and walls from the current board.

## Objectives & Settings
Configure the overall level rules using the fields at the top:
1. **Target Moves**: Specify the exact number of moves the player has to solve the level.
2. **Level Objective**: Type a custom text string (e.g. "Connect the paths!") to display to the player when the level starts.
