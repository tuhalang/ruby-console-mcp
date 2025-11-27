#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { RailsConsoleManager } from './rails-console.js';
import { RailsConsoleConfig } from './types.js';

// Load configuration from environment variables
const config: RailsConsoleConfig = {
  appPath: process.env.RAILS_APP_PATH || process.cwd(), // Defaults to current directory
  command: process.env.RAILS_CONSOLE_COMMAND || 'bundle exec rails c',
  timeout: parseInt(process.env.COMMAND_TIMEOUT || '30000', 10),
};

// Initialize Rails console manager
const consoleManager = new RailsConsoleManager(config);

// Create MCP server
const server = new Server(
  {
    name: 'rails-console-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'execute_rails_command',
        description:
          'Execute a command in the Rails console. The Rails console allows you to interact with ' +
          'your Rails application, query models, inspect data, and execute Ruby code in the ' +
          'context of your application. Commands are executed in a persistent session, so ' +
          'variables and state are preserved between commands.',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description:
                'The Rails console command to execute (e.g., "User.count", "Post.first", "a = 1 + 2").',
            },
          },
          required: ['command'],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== 'execute_rails_command') {
    throw new Error(`Unknown tool: ${name}`);
  }

  const command = args?.command as string;

  if (!command) {
    throw new Error('Command is required');
  }

  // Ensure Rails console is started
  try {
    if (!consoleManager.ready) {
      await consoleManager.start();
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to start Rails console: ${error instanceof Error ? error.message : String(error)}\n\n` +
                `Make sure:\n` +
                `1. RAILS_APP_PATH is set correctly (current: ${config.appPath})\n` +
                `2. Rails application exists at that path\n` +
                `3. Bundle is installed (run 'bundle install' in the Rails app)\n` +
                `4. RAILS_CONSOLE_COMMAND is correct (current: ${config.command})`,
        },
      ],
      isError: true,
    };
  }

  // Execute the command directly
  try {
    const result = await consoleManager.execute(command);

    if (!result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${result.error}\n\nOutput: ${result.output}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: result.output || '(No output)',
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Cleanup on exit
process.on('SIGINT', async () => {
  await consoleManager.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await consoleManager.stop();
  process.exit(0);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Rails Console MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

