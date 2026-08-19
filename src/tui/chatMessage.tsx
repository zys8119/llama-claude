import React from "react";
import { Box, Text } from "ink";
import { chatMessageLists } from "../openai.ts";
import { effect } from "../effect.ts";
import chalk from "chalk";
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
                        <Box flexDirection="column" key={index}>
                            <Box>
                                <Text>{chalk.gray("思考中...")}</Text>
                            </Box>
                            <Box>
                                <Text>{chalk.gray(e.reasoning_content)}</Text>
                            </Box>
                            <Box>
                                <Text>{e.content}</Text>
                            </Box>
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
