// Talks to the coa MCP server with plain JSON-RPC over HTTP. The desk does not
// declare the server itself: that would give Claude a second copy of every
// tool. The server is stateless, so tools/call needs no session.

export const MCP_URL = 'https://coa.davebream.com/mcp'
export const MCP_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
}

export type RpcResponse =
  | { isError: false; payload: any }
  | { isError: true; message: string }

export function rpcBody(tool: string, args: Record<string, unknown>, id = 1): string {
  return JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: tool, arguments: args } })
}

function lastMessage(text: string): any {
  const data = text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
  return JSON.parse(data.length > 0 ? data[data.length - 1] : text)
}

function errorText(content: unknown): string {
  const text = Array.isArray(content) ? content.find((block) => block?.type === 'text')?.text : undefined
  if (typeof text !== 'string') return 'The server returned an error'
  try {
    return JSON.parse(text)?.error?.message ?? text
  } catch {
    return text
  }
}

export function parseRpcResponse(text: string): RpcResponse {
  let message: any
  try {
    message = lastMessage(text)
  } catch {
    return { isError: true, message: 'The server sent a response that is not JSON' }
  }
  if (message?.error) return { isError: true, message: String(message.error.message ?? 'Request failed') }
  const result = message?.result
  if (!result) return { isError: true, message: 'The server sent no result' }
  if (result.isError) return { isError: true, message: errorText(result.content) }
  if (result.structuredContent) return { isError: false, payload: result.structuredContent }
  try {
    return { isError: false, payload: JSON.parse(result.content?.[0]?.text ?? '') }
  } catch {
    return { isError: true, message: 'The server sent a result without data' }
  }
}
