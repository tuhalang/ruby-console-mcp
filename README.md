# Ruby Console MCP Server

A Model Context Protocol (MCP) server that provides access to Ruby console functionality for AI assistants. Execute Rails console, IRB, or Racksh commands, query models, and interact with your Ruby/Rails application through natural language with persistent session support.

## Features

- 🚀 Execute Rails console, IRB, or Racksh commands through MCP
- 💾 Persistent session - variables and state are preserved between commands
- ⚙️ Configurable console command (supports Rails, IRB, Racksh, or any Ruby REPL)
- 🔌 Easy integration with MCP-compatible AI assistants (Claude, Cursor, etc.)
- 📝 Clear error messages and helpful diagnostics
- 🎯 Uses PTY for proper TTY support (works with Rails 8+, IRB, Racksh)

## Installation

### Option 1: Install via npm (Recommended)

```bash
# Install globally
npm install -g ruby-console-mcp

# Or use with npx (no installation needed)
npx ruby-console-mcp
```

### Option 2: Install from source

```bash
# Clone or navigate to the project directory
git clone https://github.com/tuhalang/ruby-console-mcp.git
cd ruby-console-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

Create a configuration file or set environment variables:

### Environment Variables

- `RUBY_APP_PATH`: Path to your Rails/Rack application (default: current directory). Optional if using Docker/remote commands or IRB.
- `RUBY_CONSOLE_COMMAND`: Command to start console (default: `bundle exec rails c`). Can be Rails console, IRB, Racksh, or any Ruby REPL.
- `COMMAND_TIMEOUT`: Timeout for command execution in milliseconds (default: 30000)

### Example Configuration

**Local Rails app:**
```bash
export RUBY_APP_PATH=/path/to/your/rails/app
export RUBY_CONSOLE_COMMAND="bundle exec rails c"
```

**Docker (no RUBY_APP_PATH needed):**
```bash
export RUBY_CONSOLE_COMMAND="docker-compose exec -T web bundle exec rails c"
```

**Running from Rails directory (no RUBY_APP_PATH needed):**
```bash
# Just use default command, it will use current directory
export RUBY_CONSOLE_COMMAND="bundle exec rails c"
```

### Custom Console Commands

You can customize the command used to start the console. Examples for Rails, IRB, and Racksh:

```bash
# Production environment
RUBY_CONSOLE_COMMAND="bundle exec rails c production"

# Sandbox mode (changes are rolled back)
RUBY_CONSOLE_COMMAND="bundle exec rails c --sandbox"

# Using Docker (no RUBY_APP_PATH needed)
RUBY_CONSOLE_COMMAND="docker-compose exec -T web bundle exec rails c"

# Using Kubernetes (no RUBY_APP_PATH needed)
RUBY_CONSOLE_COMMAND="kubectl exec -it rails-pod -- bundle exec rails c"

# Using specific Ruby version
RUBY_CONSOLE_COMMAND="rbenv exec bundle exec rails c"

# Remote server via SSH (no RUBY_APP_PATH needed)
RUBY_CONSOLE_COMMAND="ssh user@server 'cd /app && bundle exec rails c'"

# IRB (standalone Ruby)
RUBY_CONSOLE_COMMAND="irb"

# Racksh (Rack console)
RUBY_CONSOLE_COMMAND="bundle exec racksh"
```

**Note**: When using Docker, Kubernetes, or remote commands, you typically don't need to set `RUBY_APP_PATH` since the command itself handles the context.

## Usage with MCP Clients

### Claude Desktop

Add to your Claude Desktop configuration file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

**Using npm package (Recommended):**
```json
{
  "mcpServers": {
    "ruby-console": {
      "command": "npx",
      "args": ["-y", "ruby-console-mcp"],
      "env": {
        "RUBY_APP_PATH": "/path/to/your/rails/app"
      }
    }
  }
}
```

**Or using globally installed package:**
```json
{
  "mcpServers": {
    "ruby-console": {
      "command": "ruby-console-mcp",
      "env": {
        "RUBY_APP_PATH": "/path/to/your/rails/app"
      }
    }
  }
}
```

**Local Rails app (from source):**
```json
{
  "mcpServers": {
    "ruby-console": {
      "command": "node",
      "args": ["/path/to/ruby-console-mcp/build/index.js"],
      "env": {
        "RUBY_APP_PATH": "/path/to/your/rails/app"
      }
    }
  }
}
```

**Docker (no RUBY_APP_PATH needed):**
```json
{
  "mcpServers": {
    "ruby-console": {
      "command": "npx",
      "args": ["-y", "ruby-console-mcp"],
      "env": {
        "RUBY_CONSOLE_COMMAND": "docker-compose exec -T web bundle exec rails c"
      }
    }
  }
}
```

### Other MCP Clients

**Using npm package:**
```bash
npx -y ruby-console-mcp
```

**Or if installed globally:**
```bash
ruby-console-mcp
```

**From source:**
```bash
node /path/to/ruby-console-mcp/build/index.js
```

## How It Works

### Command Execution

The server spawns a persistent console process (Rails console, IRB, or Racksh) using a pseudo-terminal (PTY) and communicates with it via stdin/stdout. Commands are sent to the console, and responses are captured and returned to the AI assistant.

### Persistent Session

The console runs in a persistent session, which means:

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

### execute_ruby_command

Execute a single-line command in the console (Rails console, IRB, or Racksh).

**Parameters:**
- `command` (string, required): The console command to execute

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

### execute_ruby_script

Execute a multi-line Ruby script in the console. Useful for complex operations, method definitions, or blocks of code.

**Parameters:**
- `script` (string, required): Multi-line Ruby script to execute

**Examples:**

```typescript
// Multi-line script
{
  "script": "user = User.first\nputs user.email\nuser.update(name: 'New Name')"
}

// Method definition
{
  "script": "def greet(name)\n  puts \"Hello, #{name}!\"\nend\ngreet('World')"
}
```

### check_ruby_console_health

Check if the console is healthy and responsive. Executes a simple test command and measures response time.

**Returns:**
- `HEALTHY`: Console responds quickly (< 5s)
- `DEGRADED`: Console responds but slowly (5-10s)
- `UNHEALTHY`: Console fails or very slow (> 10s)

**Examples:**

```typescript
// Check health
{}
```

### connect_ruby_console

Connect to the Ruby console. Starts the console if it is not already running. Returns the connection status and console information.

**Parameters:**
- None

**Examples:**

```typescript
// Connect to console
{}
```

### disconnect_ruby_console

Disconnect from the Ruby console. Stops the console process and releases resources. All variables and state will be lost after disconnecting.

**Parameters:**
- None

**Examples:**

```typescript
// Disconnect from console
{}
```

## Features & Safety

1. **Persistent Session**: Variables and state persist between commands for efficient workflow
2. **Multi-line Script Support**: Execute complex Ruby scripts with multiple lines
3. **Health Monitoring**: Check console health and responsiveness
4. **Connection Management**: Connect and disconnect from console manually
5. **Timeout Protection**: Commands timeout after 30 seconds (configurable via `COMMAND_TIMEOUT`) with progress feedback
6. **Error Parsing**: Beautifully formatted error messages with stack traces
7. **Error Handling**: Clear error messages for common issues
8. **Process Management**: Automatic cleanup on server shutdown
9. **PTY Support**: Uses pseudo-terminal for proper Rails console output (compatible with Rails 8+)

## Troubleshooting

### Console Won't Start

**Problem**: "Failed to start console"

**Solutions**:
- Verify `RUBY_APP_PATH` points to a valid Rails application
- Run `bundle install` in your Rails application directory
- Check that `RUBY_CONSOLE_COMMAND` is correct for your setup
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
# Clone the repository
git clone https://github.com/tuhalang/ruby-console-mcp.git
cd ruby-console-mcp

# Install dependencies
npm install

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
│ Ruby Console    │
│    Manager      │
│ (ruby-console)  │
└────────┬────────┘
         │ PTY (pseudo-terminal)
┌────────▼────────┐
│ Ruby Console    │
│  (rails c/irb)  │
└─────────────────┘
```

## Security Considerations

- This tool provides powerful access to your Rails application
- All commands are executed immediately without confirmation
- Consider running in sandbox mode for testing: `RUBY_CONSOLE_COMMAND="bundle exec rails c --sandbox"`
- Be cautious in production environments
- Review commands carefully before execution
- Consider implementing additional access controls based on your needs

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

