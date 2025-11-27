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
  appPath: process.env.RUBY_APP_PATH || process.cwd(), // Defaults to current directory
  command: process.env.RUBY_CONSOLE_COMMAND || 'bundle exec rails c',
  timeout: parseInt(process.env.COMMAND_TIMEOUT || '30000', 10),
};

// Initialize Rails console manager
const consoleManager = new RailsConsoleManager(config);

// Create MCP server
const server = new Server(
  {
    name: 'ruby-console-mcp',
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
          'Execute a single-line command in the Rails console. The Rails console allows you to interact with ' +
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
      {
        name: 'execute_rails_script',
        description:
          'Execute a multi-line Ruby script in the Rails console. Useful for complex operations, ' +
          'method definitions, or blocks of code. The script is executed as a single unit in the ' +
          'persistent session, so variables and state are preserved.',
        inputSchema: {
          type: 'object',
          properties: {
            script: {
              type: 'string',
              description:
                'Multi-line Ruby script to execute. Each line will be sent to the Rails console. ' +
                'Example: "user = User.first\nputs user.email\nuser.update(name: \'New Name\')"',
            },
          },
          required: ['script'],
        },
      },
      {
        name: 'check_rails_console_health',
        description:
          'Check if the Rails console is healthy and responsive. Executes a simple test command ' +
          'and measures response time. Returns health status: healthy, degraded, or unhealthy.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Ensure Rails console is started (shared logic)
  const ensureConsoleReady = async () => {
    try {
      if (!consoleManager.ready) {
        await consoleManager.start();
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to start console: ${error instanceof Error ? error.message : String(error)}\n\n` +
                  `Make sure:\n` +
                  `1. RAILS_APP_PATH is set correctly (current: ${config.appPath})\n` +
                  `2. Application exists at that path (if needed)\n` +
                  `3. Dependencies are installed (run 'bundle install' for Rails/Rack apps)\n` +
                  `4. RAILS_CONSOLE_COMMAND is correct (current: ${config.command})`,
          },
        ],
        isError: true,
      };
    }
    return null;
  };

  // Execute command and return result (shared logic)
  const executeAndReturn = async (command: string) => {
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
  };

  if (name === 'execute_rails_command') {
    const command = args?.command as string;

    if (!command) {
      throw new Error('Command is required');
    }

    const readyError = await ensureConsoleReady();
    if (readyError) return readyError;

    return await executeAndReturn(command);
  }

  if (name === 'execute_rails_script') {
    const script = args?.script as string;

    if (!script) {
      throw new Error('Script is required');
    }

    const readyError = await ensureConsoleReady();
    if (readyError) return readyError;

    // For multi-line scripts, execute as-is (Rails console handles multi-line input)
    return await executeAndReturn(script);
  }

  if (name === 'check_rails_console_health') {
    const startTime = Date.now();
    
    // Check if console is ready
    if (!consoleManager.ready) {
      try {
        await consoleManager.start();
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Health Check: UNHEALTHY\n\n` +
                    `Console failed to start: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }

    // Execute simple test command
    const testCommand = '1 + 1';
    const testStartTime = Date.now();
    const result = await consoleManager.execute(testCommand);
    const responseTime = Date.now() - testStartTime;

    let status: string;
    let isError = false;

    if (!result.success) {
      status = 'UNHEALTHY';
      isError = true;
    } else if (responseTime > 5000) {
      status = 'DEGRADED';
    } else if (responseTime > 10000) {
      status = 'UNHEALTHY';
      isError = true;
    } else {
      status = 'HEALTHY';
    }

    const totalTime = Date.now() - startTime;

    return {
      content: [
        {
          type: 'text',
          text: `Health Check: ${status}\n\n` +
                `Response Time: ${responseTime}ms\n` +
                `Total Time: ${totalTime}ms\n` +
                `Console Ready: ${consoleManager.ready ? 'Yes' : 'No'}\n` +
                `Test Command: ${testCommand}\n` +
                `Test Result: ${result.output}`,
        },
      ],
      isError,
    };
  }

  throw new Error(`Unknown tool: ${name}`);
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
  console.error('Ruby Console MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

