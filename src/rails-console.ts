import * as pty from 'node-pty';
import { RailsConsoleConfig, ExecutionResult } from './types.js';
import { formatRailsError } from './utils/error-parser.js';

/**
 * Manages a persistent console session (Rails console, IRB, or Racksh) using a pseudo-terminal (PTY).
 * This allows the console to run in TTY mode, which is required for proper output.
 */
export class RailsConsoleManager {
  private process: pty.IPty | null = null;
  private config: RailsConsoleConfig;
  public outputBuffer: string = '';
  private isReady: boolean = false;
  private readonly MAX_BUFFER_SIZE = 1000000; // 1MB limit

  constructor(config: RailsConsoleConfig) {
    this.config = config;
  }

  /**
   * Check if the Rails console is ready to accept commands.
   */
  get ready(): boolean {
    return this.isReady;
  }

  /**
   * Start the console process (Rails console, IRB, or Racksh).
   * Waits for the console to be fully loaded before resolving.
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const commandParts = this.config.command.split(' ');
        const command = commandParts[0];
        const args = commandParts.slice(1);

        // Use PTY to create a pseudo-terminal (Rails needs TTY for output)
        this.process = pty.spawn(command, args, {
          name: 'xterm-color',
          cols: 80,
          rows: 30,
          cwd: this.config.appPath,
          env: process.env,
        });

        this.process.onData((data: string) => {
          this.outputBuffer += data;
          // Prevent buffer from growing too large
          if (this.outputBuffer.length > this.MAX_BUFFER_SIZE) {
            // Keep only the last 500KB
            this.outputBuffer = this.outputBuffer.slice(-500000);
          }
        });

        this.process.onExit(({ exitCode, signal }) => {
          this.isReady = false;
        });

        // Wait for the console to be ready (check for startup messages or prompts)
        const checkReady = setInterval(() => {
          // Check for Rails environment loading message
          if (this.outputBuffer.includes('Loading ') && 
              this.outputBuffer.includes(' environment')) {
            clearInterval(checkReady);
            this.isReady = true;
            this.outputBuffer = ''; // Clear startup output
            resolve();
            return;
          }
          
          // Check for IRB prompt (irb(main):001:0> or irb(main):001>)
          if (/irb\([^)]+\):\d+[*:]?>/.test(this.outputBuffer)) {
            clearInterval(checkReady);
            this.isReady = true;
            this.outputBuffer = ''; // Clear startup output
            resolve();
            return;
          }
          
          // Check for Racksh prompt (>> or similar)
          if (this.outputBuffer.includes('>>') && this.outputBuffer.length > 10) {
            clearInterval(checkReady);
            this.isReady = true;
            this.outputBuffer = ''; // Clear startup output
            resolve();
            return;
          }
        }, 100);

        // Timeout for startup
        setTimeout(() => {
          clearInterval(checkReady);
          if (!this.isReady) {
            this.stop();
            reject(new Error('Console startup timeout'));
          }
        }, 30000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Clean terminal output by removing ANSI escape codes, prompts, and excessive newlines.
   */
  private cleanTerminalOutput(output: string): string {
    // Remove ANSI escape codes
    output = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
    output = output.replace(/\x1B\[\?[0-9]*[a-zA-Z]/g, '');
    output = output.replace(/\x1B\[[0-9]*[A-G]/g, '');
    
    // Remove prompt lines (Rails 8: app-name(env)>, IRB: irb(main):001>, Racksh: >>)
    const lines = output.split('\n');
    const cleanedLines = lines.filter(line => {
      const trimmed = line.trim();
      // Skip Rails console prompts (app-name(env)>)
      if (/^[\w-]+\([^)]+\)>\s*$/.test(trimmed)) return false;
      // Skip IRB prompts (irb(main):001:0> or irb(main):001>)
      if (/^irb\([^)]+\):\d+[*:]?>?\s*$/.test(trimmed)) return false;
      // Skip simple IRB prompts (:001>)
      if (/^:\d+\s*>?\s*$/.test(trimmed)) return false;
      // Skip Racksh prompts (>>)
      if (/^>>\s*$/.test(trimmed)) return false;
      // Skip empty lines with just control characters
      if (/^[\s\u0000-\u001F]*$/.test(trimmed)) return false;
      return true;
    });
    
    output = cleanedLines.join('\n');
    
    // Remove excessive newlines
    output = output.replace(/\n{3,}/g, '\n\n');
    return output.trim();
  }

  /**
   * Execute a command in the console.
   * Uses output stabilization detection to determine when the command has finished.
   *
   * @param command - The console command to execute
   * @returns Promise resolving to the execution result
   */
  async execute(command: string): Promise<ExecutionResult> {
    if (!this.isReady || !this.process) {
      return {
        success: false,
        output: '',
        error: 'Console is not ready',
      };
    }

    try {
      const originalBufferLength = this.outputBuffer.length;
      
      // Send command
      this.process.write(command + '\n');

      // Wait for output with stabilization detection
      const maxWaitTime = this.config.timeout;
      const checkInterval = 100;
      const warningThreshold = maxWaitTime * 0.5; // Warn at 50% of timeout
      let elapsed = 0;
      let outputStarted = false;
      let lastBufferLength = originalBufferLength;
      let warningShown = false;

      while (elapsed < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        elapsed += checkInterval;
        
        // Track if command is taking longer than expected
        if (!warningShown && elapsed > warningThreshold) {
          warningShown = true;
        }
        
        const currentBufferLength = this.outputBuffer.length;
        if (currentBufferLength > lastBufferLength) {
          outputStarted = true;
          lastBufferLength = currentBufferLength;
        }
        
        // After output starts and we've waited at least 1 second, check for stabilization
        if (outputStarted && elapsed > 1000) {
          const beforeLength = this.outputBuffer.length;
          await new Promise(resolve => setTimeout(resolve, 500));
          // If no new data in 500ms, output is complete
          if (this.outputBuffer.length === beforeLength) {
            break;
          }
        }
      }

      // Check if we timed out
      const timedOut = elapsed >= maxWaitTime;

      // Extract just the command output
      let commandOutput = this.outputBuffer.slice(originalBufferLength);
      
      // Remove the echoed command line (more robust detection)
      const commandLines = command.split('\n');
      const lines = commandOutput.split('\n');
      commandOutput = lines
        .filter(line => {
          // Skip if line exactly matches the command or is a prompt
          const trimmed = line.trim();
          if (commandLines.some(cmd => trimmed === cmd.trim())) return false;
          if (/^[\w-]+\([^)]+\)>\s*$/.test(trimmed)) return false;
          return true;
        })
        .join('\n');

      let cleanOutput = this.cleanTerminalOutput(commandOutput);
      
      // Detect Rails errors in output
      const hasError = /\(.*\):\d+:in.*:.*\(.*Error\)/.test(cleanOutput) ||
                      /NameError|SyntaxError|ArgumentError|NoMethodError/.test(cleanOutput);

      // Format error nicely if detected
      if (hasError) {
        cleanOutput = formatRailsError(cleanOutput);
      }
      
      // Add timeout warning if command took too long
      if (timedOut) {
        cleanOutput = `⚠️ Command execution exceeded timeout (${maxWaitTime}ms). Partial output:\n\n${cleanOutput}`;
      } else if (warningShown) {
        cleanOutput = `⏱️ Command took ${elapsed}ms to complete (timeout: ${maxWaitTime}ms)\n\n${cleanOutput}`;
      }

      return {
        success: !hasError && !timedOut,
        output: cleanOutput || '(no output)',
        error: hasError ? 'Rails error detected in output' : timedOut ? 'Command execution timeout' : undefined,
      };

    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Stop the console process.
   */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.isReady = false;
    }
  }

  /**
   * Restart the console process.
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }
}

