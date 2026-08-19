import React from "react";
import { Box, Text } from "ink";
import { chatMessageLists } from "../openai.ts";
import { effect } from "../effect.ts";
let forceUpdate = () => { };
effect(() => {
    chatMessageLists.value;
    forceUpdate();
});
export default function ChatMessage() {
    const [, _forceUpdate] = React.useReducer(
        x => x + 1,
        0
    );
    forceUpdate = _forceUpdate;

    return (
        <Box flexDirection="column">
            <Text>聊天记录</Text>
            <Box flexDirection="column">
                {chatMessageLists.value.map((e, index) => (
                    e.type === "assistant" ? (
                        <Box key={index}>
                            <Text>{e.reasoning_content}</Text>
                            <Text>{e.content}</Text>
                        </Box>
                    ) : (
                        <Box key={index}>
                            <Text>{e.content}</Text>
                        </Box>
                    )
                ))}
            </Box>
        </Box>
    );
};
