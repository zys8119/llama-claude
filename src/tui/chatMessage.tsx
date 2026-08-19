import React from "react";
import { Box, Text } from "ink";
import { chatMessageLists } from "../openai.ts";
import { effect } from "../effect.ts";
effect(() => {
    console.log(chatMessageLists.value);
    // if (v1 !== v2) {
    // setLists(chatMessageLists.value);
    // }
});
export default function ChatMessage() {
    const [lists, setLists] = React.useState([]);

    return (
        <Box flexDirection="column">
            <Text>聊天记录</Text>
            {lists.map((e) => (
                <Text key={e.role}>{e.content}</Text>
            ))}
        </Box>
    );
};
