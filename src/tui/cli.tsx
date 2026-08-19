import Textarea from "./textarea.tsx";
import React from "react";
import { render, Box } from "ink";
import ChatMessage from "./chatMessage.tsx";
function App() {
  return (
    <Box flexDirection="column">
      <ChatMessage />
      <Box flexDirection="column">
        <Textarea />
      </Box>
    </Box>
  );
}
export default function run() {
  render(<App />);
}
