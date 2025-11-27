# Rails Console MCP Server

A Model Context Protocol (MCP) server that provides access to Rails console functionality for AI assistants. Execute Rails commands, query models, and interact with your Rails application through natural language with persistent session support.

## Features

- 🚀 Execute Rails console commands through MCP
- 💾 Persistent session - variables and state are preserved between commands
- ⚙️ Configurable Rails console command
- 🔌 Easy integration with MCP-compatible AI assistants (Claude, Cursor, etc.)
- 📝 Clear error messages and helpful diagnostics
- 🎯 Uses PTY for proper TTY support (works with Rails 8+)

## Installation

```bash
# Clone or navigate to the project directory
cd rails-console-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Create a configuration file or set environment variables:

### Environment Variables

- `RAILS_APP_PATH`: Path to your Rails application (default: current directory). Optional if using Docker/remote commands.
- `RAILS_CONSOLE_COMMAND`: Command to start Rails console (default: `bundle exec rails c`)
- `COMMAND_TIMEOUT`: Timeout for command execution in milliseconds (default: 30000)

### Example Configuration

**Local Rails app:**
```bash
export RAILS_APP_PATH=/path/to/your/rails/app
export RAILS_CONSOLE_COMMAND="bundle exec rails c"
```

**Docker (no RAILS_APP_PATH needed):**
```bash
export RAILS_CONSOLE_COMMAND="docker-compose exec -T web bundle exec rails c"
```

**Running from Rails directory (no RAILS_APP_PATH needed):**
```bash
# Just use default command, it will use current directory
export RAILS_CONSOLE_COMMAND="bundle exec rails c"
```

### Custom Rails Console Commands

You can customize the command used to start the Rails console. Examples:

```bash
# Production environment
RAILS_CONSOLE_COMMAND="bundle exec rails c production"

# Sandbox mode (changes are rolled back)
RAILS_CONSOLE_COMMAND="bundle exec rails c --sandbox"

# Using Docker (no RAILS_APP_PATH needed)
RAILS_CONSOLE_COMMAND="docker-compose exec -T web bundle exec rails c"

# Using Kubernetes (no RAILS_APP_PATH needed)
RAILS_CONSOLE_COMMAND="kubectl exec -it rails-pod -- bundle exec rails c"

# Using specific Ruby version
RAILS_CONSOLE_COMMAND="rbenv exec bundle exec rails c"

# Remote server via SSH (no RAILS_APP_PATH needed)
RAILS_CONSOLE_COMMAND="ssh user@server 'cd /app && bundle exec rails c'"
```

**Note**: When using Docker, Kubernetes, or remote commands, you typically don't need to set `RAILS_APP_PATH` since the command itself handles the context.

## Usage with MCP Clients

### Claude Desktop

Add to your Claude Desktop configuration file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

**Local Rails app:**
```json
{
  "mcpServers": {
    "rails-console": {
      "command": "node",
      "args": ["/path/to/rails-console-mcp/build/index.js"],
      "env": {
        "RAILS_APP_PATH": "/path/to/your/rails/app"
      }
    }
  }
}
```

**Docker (no RAILS_APP_PATH needed):**
```json
{
  "mcpServers": {
    "rails-console": {
      "command": "node",
      "args": ["/path/to/rails-console-mcp/build/index.js"],
      "env": {
        "RAILS_CONSOLE_COMMAND": "docker-compose exec -T web bundle exec rails c"
      }
    }
  }
}
```

### Other MCP Clients

Use the stdio transport with the following command:

```bash
node /path/to/rails-console-mcp/build/index.js
```

## How It Works

### Command Execution

The server spawns a persistent Rails console process using a pseudo-terminal (PTY) and communicates with it via stdin/stdout. Commands are sent to the console, and responses are captured and returned to the AI assistant.

### Persistent Session

The Rails console runs in a persistent session, which means:

- **Variables persist**: Variables defined in one command are available in subsequent commands
- **State is maintained**: ActiveRecord connections, loaded classes, and other state persist
- **Efficient**: No need to reload the Rails environment for each command

### Example Interactions

**Simple query**:
```
Command: User.count
Result: 42
```

**Using variables across commands**:
```
Command: a = User.first
Result: => #<User id: 1...>

Command: a.email
Result: => "user@example.com"
```

**Complex operations**:
```
Command: users = User.where('created_at > ?', 1.week.ago)
Result: => #<ActiveRecord::Relation...>

Command: users.count
Result: => 15
```

## Available Tools

### execute_rails_command

Execute a command in the Rails console.

**Parameters:**
- `command` (string, required): The Rails console command to execute

**Examples:**

```typescript
// Query a model
{
  "command": "User.count"
}

// Complex query
{
  "command": "User.where('created_at > ?', 1.week.ago).group(:role).count"
}

// Using variables (persists across commands)
{
  "command": "user = User.first"
}

// Accessing previous variable
{
  "command": "user.email"
}
```

## Features & Safety

1. **Persistent Session**: Variables and state persist between commands for efficient workflow
2. **Timeout Protection**: Commands timeout after 30 seconds (configurable via `COMMAND_TIMEOUT`)
3. **Error Handling**: Clear error messages for common issues
4. **Process Management**: Automatic cleanup on server shutdown
5. **PTY Support**: Uses pseudo-terminal for proper Rails console output (compatible with Rails 8+)

## Troubleshooting

### Rails Console Won't Start

**Problem**: "Failed to start Rails console"

**Solutions**:
- Verify `RAILS_APP_PATH` points to a valid Rails application
- Run `bundle install` in your Rails application directory
- Check that `RAILS_CONSOLE_COMMAND` is correct for your setup
- Ensure all dependencies are installed

### Commands Timeout

**Problem**: Commands return timeout message

**Solutions**:
- Increase `COMMAND_TIMEOUT` for long-running queries
- Check if the Rails console is hanging (test manually)
- Optimize the query or command

### Output Not Captured

**Problem**: Command executes but returns "(No output)"

**Solutions**:
- Some operations may not return output (this is normal)
- Try adding `.inspect` or `pp` to the command for better output
- Check for errors in the Rails application logs

### Connection Lost

**Problem**: Rails console disconnects unexpectedly

**Solutions**:
- Check Rails application logs for errors
- Verify database connection is stable
- Restart the MCP server

## Development

```bash
# Watch mode for development
npm run dev

# Build
npm run build

# Start the server
npm start
```

## Architecture

```
┌─────────────────┐
│   MCP Client    │
│  (Claude, etc)  │
└────────┬────────┘
         │ stdio
         │
┌────────▼────────┐
│   MCP Server    │
│   (index.ts)    │
└────────┬────────┘
         │
┌────────▼────────┐
│ Rails Console   │
│    Manager      │
│ (rails-console) │
└────────┬────────┘
         │ PTY (pseudo-terminal)
┌────────▼────────┐
│ Rails Console   │
│  (rails c)      │
└─────────────────┘
```

## Security Considerations

- This tool provides powerful access to your Rails application
- All commands are executed immediately without confirmation
- Consider running in sandbox mode for testing: `RAILS_CONSOLE_COMMAND="bundle exec rails c --sandbox"`
- Be cautious in production environments
- Review commands carefully before execution
- Consider implementing additional access controls based on your needs

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

