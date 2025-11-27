export interface RailsConsoleConfig {
  appPath: string;
  command: string;
  timeout: number;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
}

