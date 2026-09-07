export const meta = {
  name: "wrong-name",
  description: "Invalid workflow fixture.",
  phases: ["declared"],
};

await import("unsupported-module");
phase("undeclared");
await agent("invalid reference", { agentType: "fixture:missing-leaf" });
return null;
