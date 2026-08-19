import React from "react";
import { Box, Text } from "ink";
import { chatMessageLists } from "../openai.ts";
import { computed, effect } from "../effect.ts";

export default function ChatMessage() {
    const lists = computed(() => {
        return chatMessageLists.value
    });
    effect(() => {
        console.log(lists.value, 666);
    });
    return (
        <Box flexDirection="column">
            <Text>聊天记录</Text>
            {/* {lists.value.map((e) => (
                <Text key={e.role}>{e.content}</Text>
            ))} */}
        </Box>
    );
};
