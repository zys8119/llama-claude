import React from "react";
import { Box, Text } from "ink";
import { chatMessageLists } from "../openai.ts";
import { effect } from "../effect.ts";
effect(() => {
    console.log(chatMessageLists.value);
});
export default function ChatMessage() {
    return (
        <Box flexDirection="column">
            {chatMessageLists.value.map((e) => (
                <Text key={e.role}>{e.content}</Text>
            ))}
        </Box>
    );
};
