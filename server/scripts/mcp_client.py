#!/usr/bin/env python3
"""Thin MCP HTTP client for calling claude-of-alexandria tools."""
import json
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

DEFAULT_MCP_URL = "https://coa.davebream.com/mcp"


def _parse_sse_body(text: str) -> dict:
    """Extract the JSON payload from an SSE response body.

    The server returns Streamable HTTP (SSE) even when the client accepts
    application/json, because it requires Accept to include text/event-stream.
    The response format is:

        event: message
        data: <json>

    We collect all ``data:`` lines and concatenate them per the SSE spec,
    then parse the result as JSON.
    """
    data_lines = []
    for line in text.splitlines():
        if line.startswith("data:"):
            data_lines.append(line[len("data:"):].strip())
    if not data_lines:
        raise RuntimeError(f"No SSE data line found in response: {text[:200]!r}")
    data_payload = "\n".join(data_lines)
    try:
        return json.loads(data_payload)
    except json.JSONDecodeError as e:
        raise RuntimeError(
            f"Invalid JSON in SSE data: {e}; payload: {data_payload[:200]!r}"
        ) from e


class MCPClient:
    """Minimal MCP JSON-RPC client over Streamable HTTP (SSE transport)."""

    def __init__(self, url: str = DEFAULT_MCP_URL):
        self.url = url
        self._id = 0
        session = requests.Session()
        retry = Retry(total=3, backoff_factor=1.0, status_forcelist=[502, 503, 504])
        session.mount("https://", HTTPAdapter(max_retries=retry))
        self._session = session

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
        resp = self._session.post(
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
            try:
                return json.loads(content[0]["text"])
            except json.JSONDecodeError:
                # Tool returned non-JSON text content; return raw
                return {"raw_text": content[0]["text"]}
        return result

    def query_lexicon(self, *, strongs_ids: list[str] | None = None,
                      lemmas: list[str] | None = None,
                      search: str | None = None,
                      compact: bool = False) -> dict:
        selectors = [strongs_ids is not None, lemmas is not None, search is not None]
        if sum(selectors) != 1:
            raise ValueError("Provide exactly one of strongs_ids, lemmas, or search")
        args: dict = {"compact": compact}
        if strongs_ids is not None:
            args.update({"mode": "strongs", "strongs_ids": strongs_ids})
        elif lemmas is not None:
            args.update({"mode": "lemmas", "lemmas": lemmas})
        else:
            args.update({"mode": "search", "search": search})
        return self.call_tool("query_lexicon", args)

    def query_vocabulary(self, book: str, testament: str,
                         theme: str | None = None,
                         min_frequency: int = 1) -> dict:
        args: dict = {"mode": "theme" if theme else "frequency",
                      "book": book, "testament": testament,
                      "min_frequency": min_frequency}
        if theme:
            args["theme"] = theme
        return self.call_tool("query_vocabulary", args)

    def resolve_themes(self, lemmas: list[str], testament: str) -> dict:
        args = {"lemmas": lemmas, "testament": testament}
        return self.call_tool("query_themes_for_lemmas", args)

    def query_theme_distribution(self, theme: str, testament: str) -> dict:
        """Query the cross-book distribution for a theme."""
        return self.call_tool(
            "query_theme_distribution",
            {"theme": theme, "testament": testament},
        )

    def iter_pages(self, tool_name: str, arguments: dict):
        """Yield complete MCP pages, preserving filters across cursors."""
        cursor = None
        while True:
            page_args = {**arguments, **({"cursor": cursor} if cursor else {})}
            result = self.call_tool(tool_name, page_args)
            yield result
            cursor = result.get("page", {}).get("next_cursor")
            if not cursor:
                return

    def list_books(self, include_themes: bool = True) -> dict:
        return self.call_tool("list_books", {"include_themes": include_themes})
