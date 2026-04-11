#!/usr/bin/env python3
"""Thin MCP HTTP client for calling claude-of-alexandria tools."""
import json
import requests

DEFAULT_MCP_URL = "https://coa.davebream.com/mcp"


def _parse_sse_body(text: str) -> dict:
    """Extract the JSON payload from an SSE response body.

    The server returns Streamable HTTP (SSE) even when the client accepts
    application/json, because it requires Accept to include text/event-stream.
    The response format is:

        event: message
        data: <json>

    We extract the last ``data:`` line and parse it as JSON.
    """
    data_payload = None
    for line in text.splitlines():
        if line.startswith("data:"):
            data_payload = line[len("data:"):].strip()
    if data_payload is None:
        raise RuntimeError(f"No SSE data line found in response: {text[:200]!r}")
    return json.loads(data_payload)


class MCPClient:
    """Minimal MCP JSON-RPC client over Streamable HTTP (SSE transport)."""

    def __init__(self, url: str = DEFAULT_MCP_URL):
        self.url = url
        self._id = 0

    def call_tool(self, tool_name: str, arguments: dict) -> dict:
        """Call an MCP tool and return the parsed result.

        Raises RuntimeError on MCP errors.
        Returns the parsed JSON from the first text content block.
        """
        self._id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._id,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments,
            },
        }
        resp = requests.post(
            self.url,
            json=payload,
            headers={
                "Content-Type": "application/json",
                # Server requires both types; otherwise returns 406 Not Acceptable
                "Accept": "application/json, text/event-stream",
            },
            timeout=30,
            # stream=True is required: the server uses chunked transfer encoding
            # (text/event-stream). Without it, requests truncates the response body.
            stream=True,
        )
        resp.raise_for_status()

        # Read the full chunked body before parsing
        raw = resp.content.decode("utf-8")

        # The server always responds in SSE format (event: message / data: <json>)
        body = _parse_sse_body(raw)

        if "error" in body:
            raise RuntimeError(f"MCP error: {body['error']}")

        result = body.get("result", {})
        if result.get("isError"):
            content = result.get("content", [{}])
            text = content[0].get("text", "") if content else ""
            raise RuntimeError(f"Tool error: {text}")

        content = result.get("content", [])
        if content and content[0].get("type") == "text":
            return json.loads(content[0]["text"])
        return result

    def query_lexicon(self, *, strongs_ids: list[str] | None = None,
                      lemmas: list[str] | None = None,
                      compact: bool = False) -> dict:
        args: dict = {"compact": compact}
        if strongs_ids:
            args["strongs_ids"] = json.dumps(strongs_ids)
        if lemmas:
            args["lemmas"] = json.dumps(lemmas)
        return self.call_tool("query_lexicon", args)

    def query_vocabulary(self, book: str, testament: str,
                         theme: str | None = None,
                         min_frequency: int = 1,
                         limit: int = 200) -> dict:
        args: dict = {"book": book, "testament": testament,
                      "min_frequency": min_frequency, "limit": limit}
        if theme:
            args["theme"] = theme
        return self.call_tool("query_vocabulary", args)

    def resolve_themes(self, lemmas: list[str], testament: str) -> dict:
        args = {"lemmas": json.dumps(lemmas), "testament": testament}
        return self.call_tool("query_themes_for_lemmas", args)

    def query_theme(self, theme: str, testament: str) -> dict:
        """Query cross-book distribution for a theme. MCP tool: query_theme."""
        return self.call_tool("query_theme", {"theme": theme, "testament": testament})

    def list_books(self, include_themes: bool = True) -> dict:
        return self.call_tool("list_books", {"include_themes": include_themes})
