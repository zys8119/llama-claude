import Textarea from "./textarea.tsx";
import React from "react";
import { render, Box } from "ink";



export default function App() {
  const ref = React.useRef<any>(null);
  React.useEffect(() => {
    console.log(ref.current.lines, 666);
  }, []);
  console.log(ref.current?.lines, 7777);
  return (
    <Box flexDirection="column">
      <Textarea ref={ref} />
    </Box>
  );
}
render(<App />);
