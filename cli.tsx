import React, { useState } from "react";
import { render, Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useMouse } from "ink-mouse";
function App() {

  const [input, setInput] = useState("");
  console.log(3333);
  return (
    <Box
      flexDirection="column"
      height={process.stdout.rows}
    >
      <Text onClick={() => setInput("hello")}>{input}</Text>
      <Box
        borderStyle="round"
        borderColor="cyan"
      >

        <Text>
          &gt;
        </Text>

        <TextInput
          value={input}
          onChange={setInput}
        />

      </Box>

    </Box>
  );
}


render(<App />);