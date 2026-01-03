# Collapsed Item Descriptions

A Foundry VTT v13 module that collapses item descriptions by default when items are posted to chat.

## Features

- Automatically collapses item descriptions in chat messages
- Click "Description ▶" to expand and view the full description
- Click "Description ▼" to collapse it again
- Clean, unobtrusive interface

## Docker Testing Setup

### Prerequisites

1. Docker and Docker Compose installed
2. A Foundry VTT account with valid credentials from [https://foundryvtt.com](https://foundryvtt.com)

### Setup Instructions

1. **Create environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` file** with your Foundry credentials:
   - `FOUNDRY_USERNAME`: Your Foundry account username
   - `FOUNDRY_PASSWORD`: Your Foundry account password
   - `FOUNDRY_ADMIN_KEY`: Admin password for setup (default: `admin`)

3. **Start Foundry**:
   ```bash
   docker-compose up -d
   ```

4. **Wait for Foundry to initialize** (check logs):
   ```bash
   docker-compose logs -f foundry
   ```
   Wait until you see "Server started and listening on port 30000"

5. **Install the module** (copy files into the container):
   ```bash
   docker cp ./module.json foundry-test:/data/Data/modules/collapsed-item-descriptions/module.json
   docker cp ./scripts foundry-test:/data/Data/modules/collapsed-item-descriptions/scripts
   docker cp ./styles foundry-test:/data/Data/modules/collapsed-item-descriptions/styles
   ```

6. **Access Foundry**:
   - Open your browser to [http://localhost:30000](http://localhost:30000)
   - Use the admin key from your `.env` file to access the setup

7. **Create/Launch a World**:
   - Create a new world or use an existing one
   - Go to **Settings → Manage Modules**
   - Enable "Collapsed Item Descriptions"
   - Save and reload

8. **Test the Module**:
   - Create or open an item (weapon, spell, equipment, etc.)
   - Drag it to chat or use it
   - The description should be collapsed with a "Description ▶" toggle
   - Click the toggle to expand/collapse

### Stopping Foundry

```bash
docker-compose down
```

### Viewing Logs

```bash
docker-compose logs -f foundry
```

## Manual Installation

1. Copy this folder to your Foundry `Data/modules/` directory
2. Rename to `collapsed-item-descriptions`
3. Restart Foundry VTT
4. Enable the module in your world's module settings

## Development

The module automatically mounts into the Docker container at `/data/Data/modules/collapsed-item-descriptions`. Any changes you make to the files will be reflected immediately - just refresh your browser.

## Files

- `module.json` - Module manifest
- `scripts/main.js` - Main module logic
- `styles/collapsed-descriptions.css` - Styling for collapsed descriptions
- `docker-compose.yml` - Docker setup for testing

## License

Feel free to use and modify as needed.
