import Textarea from "./textarea.tsx";
import React from "react";
import { render, Box } from "ink";
function App() {
  return (
    <Box flexDirection="column">
      <Textarea />
    </Box>
  );
}
export default function run() {
  render(<App />);
}
