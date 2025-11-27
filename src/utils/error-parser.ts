/**
 * Parses Rails error messages and formats them nicely.
 */

interface ParsedError {
  type: string;
  message: string;
  file?: string;
  line?: number;
  method?: string;
  stackTrace?: string[];
}

/**
 * Parse a Rails error from console output.
 */
function parseRailsError(output: string): ParsedError | null {
  // Pattern: (ClassName):line:in 'method': message (ErrorType)
  // Example: (NameError):4:in `<main>': undefined local variable or method `a' for main
  const errorPattern = /\(([^)]+)\):(\d+):in\s+['"]([^'"]+)['"]:\s*(.+?)(?:\s+\(([^)]+)\))?/;
  const match = output.match(errorPattern);

  if (!match) {
    // Try simpler patterns
    const simpleErrorPattern = /(NameError|SyntaxError|ArgumentError|NoMethodError|RuntimeError|StandardError):\s*(.+)/;
    const simpleMatch = output.match(simpleErrorPattern);
    
    if (simpleMatch) {
      return {
        type: simpleMatch[1],
        message: simpleMatch[2].trim(),
      };
    }
    
    return null;
  }

  const [, file, lineStr, method, message, errorType] = match;
  const line = parseInt(lineStr, 10);

  // Extract stack trace if available
  const stackTrace: string[] = [];
  const stackLines = output.split('\n');
  let inStackTrace = false;
  
  for (const stackLine of stackLines) {
    if (stackLine.includes('from') || stackLine.match(/^\s+from\s+/)) {
      inStackTrace = true;
      stackTrace.push(stackLine.trim());
    } else if (inStackTrace && stackLine.trim() && !stackLine.match(/^\(/)) {
      stackTrace.push(stackLine.trim());
    }
  }

  return {
    type: errorType || file || 'Error',
    message: message.trim(),
    file,
    line,
    method,
    stackTrace: stackTrace.length > 0 ? stackTrace : undefined,
  };
}

/**
 * Format a parsed error into a readable string.
 */
function formatError(error: ParsedError): string {
  let formatted = `❌ ${error.type}\n\n`;
  
  if (error.message) {
    formatted += `Message: ${error.message}\n`;
  }
  
  if (error.file && error.line) {
    formatted += `Location: ${error.file}:${error.line}`;
    if (error.method) {
      formatted += ` in '${error.method}'`;
    }
    formatted += '\n';
  }
  
  if (error.stackTrace && error.stackTrace.length > 0) {
    formatted += `\nStack Trace:\n${error.stackTrace.map(line => `  ${line}`).join('\n')}`;
  }
  
  return formatted;
}

/**
 * Check if output contains a Rails error and format it nicely.
 */
export function formatRailsError(output: string): string {
  const parsed = parseRailsError(output);
  
  if (parsed) {
    return formatError(parsed);
  }
  
  // If no structured error found, return original output
  return output;
}

