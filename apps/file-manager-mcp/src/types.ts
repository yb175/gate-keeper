export interface Tool {
  name: string;
  description: string;
  inputSchema: any;
  execute(args: any): Promise<any>;
}
